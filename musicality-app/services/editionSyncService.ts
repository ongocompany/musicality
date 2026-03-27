/**
 * editionSyncService — 개인 에디션 서버 동기화
 *
 * 로컬 실시간 저장 + 서버 트리거 저장 (곡 변경, 앱 백그라운드, 플레이어 나갈 때)
 * 매칭 키: audio → fingerprint, youtube → video_id
 *
 * Supabase 테이블: user_editions
 * - id (uuid, PK)
 * - user_id (uuid, FK → auth.users)
 * - fingerprint (text, nullable) — 오디오 곡 식별
 * - video_id (text, nullable) — YouTube 곡 식별
 * - edition_type ('phrase' | 'formation')
 * - slot_id ('1' | '2' | '3')
 * - edition_data (jsonb) — boundaries[] 또는 FormationData
 * - cell_notes (jsonb, nullable) — 셀 노트 (phrase only)
 * - updated_at (timestamptz)
 * - created_at (timestamptz)
 *
 * UNIQUE constraints:
 *   (user_id, fingerprint, edition_type, slot_id) — audio
 *   (user_id, video_id, edition_type, slot_id)    — youtube
 */

import { supabase } from '../lib/supabase';
import { useSettingsStore } from '../stores/settingsStore';
import { usePlayerStore } from '../stores/playerStore';
import { EditionId } from '../types/analysis';
import { FormationEditionId, FormationData } from '../types/formation';
import { Track } from '../types/track';

interface EditionRow {
  user_id: string;
  fingerprint: string | null;
  video_id: string | null;
  edition_type: 'phrase' | 'formation';
  slot_id: string;
  edition_data: any;
  cell_notes?: Record<string, string> | null;
  updated_at: string;
}

/** Get the match key for a track: fingerprint for audio, video_id for YouTube */
function getMatchKey(track: Track): { fingerprint?: string; video_id?: string } | null {
  if (track.mediaType === 'youtube' && track.uri) {
    return { video_id: track.uri };  // uri stores video_id for YouTube
  }
  if (track.analysis?.fingerprint) {
    return { fingerprint: track.analysis.fingerprint };
  }
  return null;
}

// ─── 서버에 에디션 저장 (upsert) ───

export async function syncEditionToServer(
  matchKey: { fingerprint?: string; video_id?: string },
  editionType: 'phrase' | 'formation',
  slotId: string,
  editionData: any,
  cellNotes?: Record<string, string> | null,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const onConflict = matchKey.video_id
    ? 'user_id,video_id,edition_type,slot_id'
    : 'user_id,fingerprint,edition_type,slot_id';

  console.log(`[EditionSync] upsert: ${editionType}/${slotId}, key=${JSON.stringify(matchKey).slice(0, 50)}, conflict=${onConflict}`);

  const { error } = await supabase
    .from('user_editions')
    .upsert({
      user_id: user.id,
      fingerprint: matchKey.fingerprint ?? null,
      video_id: matchKey.video_id ?? null,
      edition_type: editionType,
      slot_id: slotId,
      edition_data: editionData,
      cell_notes: cellNotes ?? null,
      updated_at: new Date().toISOString(),
    }, {
      onConflict,
    });

  if (error) {
    console.warn('[EditionSync] save failed:', error.message);
  } else {
    console.log(`[EditionSync] saved OK: ${editionType}/${slotId}`);
  }
}

// ─── 서버에서 에디션 불러오기 ───

export async function fetchEditionsFromServer(
  matchKey: { fingerprint?: string; video_id?: string },
): Promise<EditionRow[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from('user_editions')
    .select('*')
    .eq('user_id', user.id);

  if (matchKey.video_id) {
    query = query.eq('video_id', matchKey.video_id);
  } else if (matchKey.fingerprint) {
    query = query.eq('fingerprint', matchKey.fingerprint);
  } else {
    return [];
  }

  const { data, error } = await query;

  if (error) {
    console.warn('[EditionSync] fetch failed:', error.message);
    return [];
  }

  return data ?? [];
}

// ─── 현재 트랙의 모든 에디션을 서버에 동기화 ───

export async function syncAllEditionsForTrack(trackId: string): Promise<void> {
  const playerState = usePlayerStore.getState();
  const settingsState = useSettingsStore.getState();

  const track = playerState.tracks.find(t => t.id === trackId) ?? playerState.currentTrack;
  if (!track) { console.log('[EditionSync] syncAll: track not found', trackId); return; }

  const matchKey = getMatchKey(track);
  if (!matchKey) { console.log('[EditionSync] syncAll: no matchKey', track.mediaType, track.uri?.slice(-20)); return; }

  console.log('[EditionSync] syncAll:', track.mediaType, JSON.stringify(matchKey).slice(0, 60));

  // Phrase editions
  const editions = settingsState.trackEditions[trackId];
  if (editions) {
    console.log(`[EditionSync] phrase editions: server=${!!editions.server}, user=${editions.userEditions.length}`);
    for (const edition of editions.userEditions) {
      if (edition.id === 'S') continue;
      const cellNotes = settingsState.cellNotes[trackId] ?? null;
      await syncEditionToServer(matchKey, 'phrase', edition.id, edition.boundaries, cellNotes);
    }
  } else {
    console.log('[EditionSync] no trackEditions for', trackId.slice(0, 20));
  }

  // Formation editions
  const formations = settingsState.trackFormations[trackId];
  if (formations) {
    for (const edition of formations.userEditions) {
      if (edition.id === 'S') continue;
      await syncEditionToServer(matchKey, 'formation', edition.id, edition.data);
    }
  }

  // Draft boundaries (활성 편집 중인 것도 저장)
  const draftBoundaries = settingsState.draftBoundaries[trackId];
  if (draftBoundaries && draftBoundaries.length > 0) {
    const activeSlot = editions?.activeEditionId ?? '1';
    if (activeSlot !== 'S') {
      const cellNotes = settingsState.cellNotes[trackId] ?? null;
      await syncEditionToServer(matchKey, 'phrase', activeSlot, draftBoundaries, cellNotes);
    }
  }

  // Draft formation
  const draftFormation = settingsState.draftFormation[trackId];
  if (draftFormation) {
    const activeSlot = formations?.activeEditionId ?? '1';
    if (activeSlot !== 'S') {
      await syncEditionToServer(matchKey, 'formation', activeSlot, draftFormation);
    }
  }
}

// ─── 서버에서 에디션 복원 → 로컬 store에 적용 ───

export async function restoreEditionsFromServer(
  trackId: string,
  fingerprint: string,
): Promise<boolean>;
export async function restoreEditionsFromServer(
  trackId: string,
  fingerprint: string,
  videoId?: string,
): Promise<boolean>;
export async function restoreEditionsFromServer(
  trackId: string,
  fingerprint: string,
  videoId?: string,
): Promise<boolean> {
  const matchKey = videoId ? { video_id: videoId } : { fingerprint };
  console.log(`[EditionSync] restore: trackId=${trackId.slice(0, 20)}, key=${JSON.stringify(matchKey).slice(0, 50)}`);
  const rows = await fetchEditionsFromServer(matchKey);
  console.log(`[EditionSync] restore: ${rows.length} rows found`);
  if (rows.length === 0) return false;

  const settingsState = useSettingsStore.getState();

  for (const row of rows) {
    if (row.edition_type === 'phrase') {
      settingsState.setEditionBoundaries(
        trackId,
        row.slot_id as EditionId,
        row.edition_data as number[],
      );
      // Restore cell notes
      if (row.cell_notes) {
        for (const [beatIdx, note] of Object.entries(row.cell_notes)) {
          settingsState.setCellNote(trackId, Number(beatIdx), note);
        }
      }
    } else if (row.edition_type === 'formation') {
      settingsState.setFormationEdition(
        trackId,
        row.slot_id as FormationEditionId,
        row.edition_data as FormationData,
      );
    }
  }

  return true;
}
