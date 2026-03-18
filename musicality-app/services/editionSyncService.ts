/**
 * editionSyncService — 개인 에디션 서버 동기화
 *
 * 로컬 실시간 저장 + 서버 트리거 저장 (곡 변경, 앱 백그라운드, 플레이어 나갈 때)
 * fingerprint 기반 매칭 — 기기 바꿔도 자동 복원
 *
 * Supabase 테이블: user_editions
 * - id (uuid, PK)
 * - user_id (uuid, FK → auth.users)
 * - fingerprint (text) — 곡 식별
 * - edition_type ('phrase' | 'formation')
 * - slot_id ('1' | '2' | '3')
 * - edition_data (jsonb) — boundaries[] 또는 FormationData
 * - cell_notes (jsonb, nullable) — 셀 노트 (phrase only)
 * - updated_at (timestamptz)
 * - created_at (timestamptz)
 *
 * UNIQUE constraint: (user_id, fingerprint, edition_type, slot_id)
 * → upsert로 덮어쓰기
 */

import { supabase } from '../lib/supabase';
import { useSettingsStore } from '../stores/settingsStore';
import { usePlayerStore } from '../stores/playerStore';
import { EditionId } from '../types/analysis';
import { FormationEditionId, FormationData } from '../types/formation';

interface EditionRow {
  user_id: string;
  fingerprint: string;
  edition_type: 'phrase' | 'formation';
  slot_id: string;
  edition_data: any;
  cell_notes?: Record<string, string> | null;
  updated_at: string;
}

// ─── 서버에 에디션 저장 (upsert) ───

export async function syncEditionToServer(
  fingerprint: string,
  editionType: 'phrase' | 'formation',
  slotId: string,
  editionData: any,
  cellNotes?: Record<string, string> | null,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return; // 비로그인 → 스킵

  const { error } = await supabase
    .from('user_editions')
    .upsert({
      user_id: user.id,
      fingerprint,
      edition_type: editionType,
      slot_id: slotId,
      edition_data: editionData,
      cell_notes: cellNotes ?? null,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,fingerprint,edition_type,slot_id',
    });

  if (error) {
    console.warn('[EditionSync] save failed:', error.message);
  }
}

// ─── 서버에서 에디션 불러오기 ───

export async function fetchEditionsFromServer(
  fingerprint: string,
): Promise<EditionRow[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('user_editions')
    .select('*')
    .eq('user_id', user.id)
    .eq('fingerprint', fingerprint);

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
  if (!track?.analysis?.fingerprint) return;

  const fingerprint = track.analysis.fingerprint;

  // Phrase editions
  const editions = settingsState.trackEditions[trackId];
  if (editions) {
    for (const edition of editions.userEditions) {
      if (edition.id === 'S') continue; // 서버 에디션은 동기화 불필요
      const cellNotes = settingsState.cellNotes[trackId] ?? null;
      await syncEditionToServer(fingerprint, 'phrase', edition.id, edition.boundaries, cellNotes);
    }
  }

  // Formation editions
  const formations = settingsState.trackFormations[trackId];
  if (formations) {
    for (const edition of formations.userEditions) {
      if (edition.id === 'S') continue;
      await syncEditionToServer(fingerprint, 'formation', edition.id, edition.data);
    }
  }

  // Draft boundaries (활성 편집 중인 것도 저장)
  const draftBoundaries = settingsState.draftBoundaries[trackId];
  if (draftBoundaries && draftBoundaries.length > 0) {
    const activeSlot = editions?.activeEditionId ?? '1';
    if (activeSlot !== 'S') {
      const cellNotes = settingsState.cellNotes[trackId] ?? null;
      await syncEditionToServer(fingerprint, 'phrase', activeSlot, draftBoundaries, cellNotes);
    }
  }

  // Draft formation
  const draftFormation = settingsState.draftFormation[trackId];
  if (draftFormation) {
    const activeSlot = formations?.activeEditionId ?? '1';
    if (activeSlot !== 'S') {
      await syncEditionToServer(fingerprint, 'formation', activeSlot, draftFormation);
    }
  }
}

// ─── 서버에서 에디션 복원 → 로컬 store에 적용 ───

export async function restoreEditionsFromServer(
  trackId: string,
  fingerprint: string,
): Promise<boolean> {
  const rows = await fetchEditionsFromServer(fingerprint);
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
