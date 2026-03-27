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

  const { user } = useAuthStore.getState();
  if (!user) { console.log('[CloudSync] Skip: not logged in'); return; }

  const settings = useSettingsStore.getState();
  if (!settings.cloudSyncEnabled) { console.log('[CloudSync] Skip: sync disabled'); return; }

  // Network check — simple connectivity test (no native module needed)
  try {
    const probe = await fetch(`${API_BASE_URL}/health`, { method: 'GET' });
    if (!probe.ok) return;
  } catch {
    return; // offline
  }
  // Wi-Fi-only check is deferred to native build (expo-network)
  // For now, sync runs on any connection

  _isSyncing = true;
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
    if (!cloudByFp.has(fp) && lt.analysisStatus === 'done') {
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

    // Check if already in cloud_tracks by querying the analyze endpoint
    // (the server auto-registers to cloud_tracks on analysis)
    // Just need to register in user_library
    const cloudTrackId = track.analysis?.cloudTrackId;
    if (!cloudTrackId) {
      // Track was analyzed before cloud feature — need to find cloud_track by fingerprint
      // The server already has this track in cloud_tracks from migration
      // We can call register with a fingerprint-based lookup
      console.log(`[CloudSync] Skip register (no cloud_track_id): ${track.title}`);
      return;
    }

    // Get folder name
    const { folders } = usePlayerStore.getState();
    const folder = track.folderId ? folders.find(f => f.id === track.folderId) : null;

    const resp = await fetch(`${API_BASE_URL}/cloud/register`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cloud_track_id: cloudTrackId,
        custom_title: track.title,
        dance_style: 'bachata',
        folder_name: folder?.name || null,
      }),
    });

    if (resp.ok) {
      console.log(`[CloudSync] Registered: ${track.title}`);
    } else {
      console.warn(`[CloudSync] Register failed for ${track.title}: ${resp.status}`);
    }
  } catch (e: any) {
    if (e.name === 'AbortError') throw e;
    console.warn(`[CloudSync] Register error for ${track.title}:`, e.message);
  }
}
