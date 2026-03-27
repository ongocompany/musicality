/**
 * Cloud Library Sync Manager
 *
 * 로그인 시 자동 동기화:
 * - 로컬에만 있는 곡 → 서버 업로드 (분석 + cloud 등록)
 * - 클라우드에만 있는 곡 → 다운로드 + 로컬 등록
 * - 양쪽 다 있는 곡 → 스킵
 *
 * 성능: 백그라운드 순차 처리, 앱 메인 스레드 차단 없음
 */

import { AppState, AppStateStatus } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { API_BASE_URL } from '../constants/config';
import { usePlayerStore } from '../stores/playerStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { Track } from '../types/track';

// ─── Types ───────────────────────────────────────────

interface CloudTrackInfo {
  library_id: string;
  cloud_track_id: string;
  title: string;
  artist: string | null;
  album: string | null;
  album_art_url: string | null;
  duration: number;
  bpm: number | null;
  file_size: number | null;
  fingerprint: string;  // prefix (64 chars)
  dance_style: string;
  folder_name: string | null;
  imported_at: string;
}

type SyncStatus = 'idle' | 'syncing' | 'paused' | 'error';

// ─── State ───────────────────────────────────────────

let _syncStatus: SyncStatus = 'idle';
let _isSyncing = false;
let _abortController: AbortController | null = null;
let _appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

// ─── Public API ──────────────────────────────────────

export function getSyncStatus(): SyncStatus {
  return _syncStatus;
}

export async function startCloudSync(): Promise<void> {
  if (_isSyncing) return;
  _isSyncing = true;  // Set immediately to prevent race condition

  const { user } = useAuthStore.getState();
  if (!user) { _isSyncing = false; console.log('[CloudSync] Skip: not logged in'); return; }

  const settings = useSettingsStore.getState();
  if (!settings.cloudSyncEnabled) { _isSyncing = false; console.log('[CloudSync] Skip: sync disabled'); return; }

  // Network check — simple connectivity test (no native module needed)
  try {
    const probe = await fetch(`${API_BASE_URL}/health`, { method: 'GET' });
    if (!probe.ok) { _isSyncing = false; return; }
  } catch {
    _isSyncing = false; return; // offline
  }
  _syncStatus = 'syncing';
  _abortController = new AbortController();
  console.log('[CloudSync] ▶ Sync started');

  try {
    await _runSync(user.id);
    _syncStatus = 'idle';
    console.log('[CloudSync] ✓ Sync completed');
  } catch (e: any) {
    if (e.name === 'AbortError') {
      _syncStatus = 'paused';
    } else {
      console.warn('[CloudSync] Error:', e.message);
      _syncStatus = 'error';
    }
  } finally {
    _isSyncing = false;
    _abortController = null;
  }
}

export function stopCloudSync(): void {
  _abortController?.abort();
  _isSyncing = false;
  _syncStatus = 'idle';
}

/** Call on login to start watching for sync opportunities */
export function initCloudSync(): void {
  // Sync immediately
  startCloudSync();

  // Re-sync on app foreground
  _appStateSubscription?.remove();
  _appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      startCloudSync();
    } else if (state === 'background') {
      stopCloudSync();
    }
  });
}

/** Call on logout */
export function teardownCloudSync(): void {
  stopCloudSync();
  _appStateSubscription?.remove();
  _appStateSubscription = null;
}

// ─── Core Sync Logic ─────────────────────────────────

async function _runSync(userId: string): Promise<void> {
  // 1. Fetch cloud library
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) return;
  const token = session.access_token;

  const cloudResp = await fetch(`${API_BASE_URL}/cloud/library`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!cloudResp.ok) {
    console.warn('[CloudSync] Failed to fetch cloud library:', cloudResp.status);
    return;
  }
  const cloudData = await cloudResp.json();
  const cloudTracks: CloudTrackInfo[] = cloudData.items || [];

  // 2. Get local tracks
  const localTracks = usePlayerStore.getState().tracks;

  // 3. Build fingerprint maps (use first 64 chars for matching)
  const cloudByFp = new Map<string, CloudTrackInfo>();
  for (const ct of cloudTracks) {
    if (ct.fingerprint) {
      cloudByFp.set(ct.fingerprint, ct);
    }
  }

  const localByFp = new Map<string, Track>();
  for (const lt of localTracks) {
    const fp = lt.analysis?.fingerprint;
    if (fp && fp.length >= 64) {
      localByFp.set(fp.substring(0, 64), lt);
    }
  }

  // 4. Determine actions
  const toDownload: CloudTrackInfo[] = [];  // cloud에만 있는 곡
  const toRegister: Track[] = [];           // 로컬에만 있는 곡 (분석 완료된 것)

  for (const [fp, ct] of cloudByFp) {
    if (!localByFp.has(fp)) {
      toDownload.push(ct);
    }
  }

  for (const [fp, lt] of localByFp) {
    if (!cloudByFp.has(fp) && lt.analysisStatus === 'done' && lt.mediaType === 'audio') {
      toRegister.push(lt);
    }
  }

  console.log(`[CloudSync] Download: ${toDownload.length}, Register: ${toRegister.length}`);

  // 5. Download cloud-only tracks (1 at a time)
  for (const ct of toDownload) {
    if (_abortController?.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    await _downloadAndRegisterLocally(ct, token);
  }

  // 6. Register local-only tracks to cloud (1 at a time)
  for (const lt of toRegister) {
    if (_abortController?.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    await _registerToCloud(lt, token);
  }
}

// ─── Download from Cloud ─────────────────────────────

async function _downloadAndRegisterLocally(
  ct: CloudTrackInfo,
  token: string,
): Promise<void> {
  try {
    const mediaDir = `${FileSystem.documentDirectory}media/`;
    await FileSystem.makeDirectoryAsync(mediaDir, { intermediates: true }).catch(() => {});

    const safeName = (ct.title || 'track').replace(/[^a-zA-Z0-9가-힣\-_ ]/g, '_').substring(0, 50);
    const localPath = `${mediaDir}${Date.now()}-${safeName}.mp3`;

    // Download MP3
    const downloadResult = await FileSystem.downloadAsync(
      `${API_BASE_URL}/cloud/download/${ct.cloud_track_id}`,
      localPath,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (downloadResult.status !== 200) {
      console.warn(`[CloudSync] Download failed for ${ct.title}: ${downloadResult.status}`);
      return;
    }

    const fileInfo = await FileSystem.getInfoAsync(localPath);
    if (!fileInfo.exists || fileInfo.size === 0) {
      console.warn(`[CloudSync] Downloaded file empty: ${ct.title}`);
      return;
    }

    // Fetch full analysis data from cloud library RPC
    const { data: fullData } = await supabase.rpc('get_cloud_library');
    const fullTrack = fullData?.find((d: any) => d.cloud_track_id === ct.cloud_track_id);

    // Extract album art from downloaded MP3
    let thumbnailUri: string | undefined;
    if (ct.album_art_url) {
      // Download Spotify album art
      try {
        const artPath = `${mediaDir}art-${Date.now()}.jpg`;
        const artDl = await FileSystem.downloadAsync(ct.album_art_url, artPath);
        if (artDl.status === 200) {
          thumbnailUri = artDl.uri;
        }
      } catch (e: any) {
        console.debug(`[CloudSync] Album art download failed: ${e.message}`);
      }
    }
    if (!thumbnailUri) {
      // Extract from ID3 tags in downloaded MP3
      try {
        const { extractMetadata } = require('../modules/my-module');
        const meta = await extractMetadata(localPath);
        if (meta?.albumArt) {
          const artDest = `${mediaDir}art-${Date.now()}.jpg`;
          const artSrc = meta.albumArt.startsWith('/') ? `file://${meta.albumArt}` : meta.albumArt;
          await FileSystem.copyAsync({ from: artSrc, to: artDest });
          thumbnailUri = artDest;
        }
      } catch (e: any) {
        console.debug(`[CloudSync] Album art extraction failed: ${e.message}`);
      }
    }

    // Create local track
    const track: Track = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: ct.title || 'Unknown',
      uri: localPath,
      fileSize: (fileInfo as any).size || 0,
      format: 'mp3',
      mediaType: 'audio',
      importedAt: Date.now(),
      artist: ct.artist || undefined,
      thumbnailUri,
      folderId: undefined,  // Will be set after folder matching
      analysisStatus: fullTrack ? 'done' : 'idle',
      analysis: fullTrack ? {
        bpm: fullTrack.bpm,
        beats: fullTrack.beats || [],
        downbeats: fullTrack.downbeats || [],
        duration: fullTrack.duration,
        beatsPerBar: fullTrack.beats_per_bar || 4,
        confidence: fullTrack.confidence || 0,
        sections: fullTrack.sections || [],
        phraseBoundaries: fullTrack.phrase_boundaries || [],
        waveformPeaks: fullTrack.waveform_peaks || [],
        fingerprint: ct.fingerprint,
      } : undefined,
    };

    // Add to playerStore
    const { addTrack, folders, createFolder } = usePlayerStore.getState();

    // Handle folder
    if (ct.folder_name) {
      let folder = folders.find(f => f.name === ct.folder_name);
      if (!folder) {
        createFolder(ct.folder_name, 'audio');
        folder = usePlayerStore.getState().folders.find(f => f.name === ct.folder_name);
      }
      if (folder) {
        track.folderId = folder.id;
      }
    }

    addTrack(track);

    // Set server edition (Ⓟ badge) — cloud restore = already server-analyzed
    if (track.analysis) {
      const pb = track.analysis.phraseBoundaries ?? [];
      const boundaryBeatIndices = pb.map(ts => {
        let closest = 0;
        let minDiff = Math.abs(track.analysis!.beats[0] - ts);
        for (let i = 1; i < track.analysis!.beats.length; i++) {
          const diff = Math.abs(track.analysis!.beats[i] - ts);
          if (diff < minDiff) { minDiff = diff; closest = i; }
        }
        return closest;
      });
      useSettingsStore.getState().setServerEdition(track.id, boundaryBeatIndices);
    }

    console.log(`[CloudSync] Downloaded: ${ct.title}`);

  } catch (e: any) {
    if (e.name === 'AbortError') throw e;
    console.warn(`[CloudSync] Download error for ${ct.title}:`, e.message);
  }
}

// ─── Register Local Track to Cloud ───────────────────

async function _registerToCloud(track: Track, token: string): Promise<void> {
  try {
    if (!track.analysis?.fingerprint) return;

    const { folders } = usePlayerStore.getState();
    const folder = track.folderId ? folders.find(f => f.id === track.folderId) : null;
    const folderName = folder?.name || null;

    let resp: Response;

    if (track.cloudTrackId) {
      // Has cloud_track_id → register directly
      resp = await fetch(`${API_BASE_URL}/cloud/register`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cloud_track_id: track.cloudTrackId,
          custom_title: track.title,
          dance_style: 'bachata',
          folder_name: folderName,
        }),
      });
    } else {
      // No cloud_track_id (analyzed before cloud feature) → register by fingerprint
      resp = await fetch(`${API_BASE_URL}/cloud/register-by-fingerprint`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fingerprint: track.analysis.fingerprint,
          custom_title: track.title,
          dance_style: 'bachata',
          folder_name: folderName,
        }),
      });
    }

    if (resp.ok) {
      const data = await resp.json();
      // Save cloud_track_id to local track for future syncs
      if (data.cloud_track_id && !track.cloudTrackId) {
        usePlayerStore.getState().updateTrackData(track.id, { cloudTrackId: data.cloud_track_id });
      }
      console.log(`[CloudSync] Registered: ${track.title} (${data.status})`);
    } else {
      const errText = await resp.text().catch(() => '');
      console.warn(`[CloudSync] Register failed for ${track.title}: ${resp.status} ${errText.slice(0, 100)}`);
    }
  } catch (e: any) {
    if (e.name === 'AbortError') throw e;
    console.warn(`[CloudSync] Register error for ${track.title}:`, e.message);
  }
}
