/**
 * useSlotSelector — 슬롯 선택 바 상태 관리
 *
 * - slotBarVisible: 바 펼침/접힘
 * - activeSlot: 현재 활성 슬롯 ID
 * - isReadOnly: R/커뮤니티 슬롯이면 true
 * - 자동닫기: 플레이 시작, 3초 타임아웃
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { usePlayerStore } from '../stores/playerStore';
import { Colors } from '../constants/theme';
import { EditionId } from '../types/analysis';
import { FormationEditionId } from '../types/formation';
import { ImportedPhraseNote } from '../types/phraseNote';

type SlotMode = 'phrase' | 'formation';

const AUTO_HIDE_MS = 3000;

export function useSlotSelector(mode: SlotMode) {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const trackId = currentTrack?.id;

  // ─── Store 구독 ───
  const trackEditions = useSettingsStore((s) => s.trackEditions);
  const trackFormations = useSettingsStore((s) => s.trackFormations);
  const setActiveEdition = useSettingsStore((s) => s.setActiveEdition);
  const setActiveFormationEdition = useSettingsStore((s) => s.setActiveFormationEdition);

  const importedNotes = useSettingsStore((s) => s.importedNotes);
  const setActiveImportedNote = useSettingsStore((s) => s.setActiveImportedNote);

  // ─── 현재 트랙의 에디션 정보 ───
  const editions = trackId ? trackEditions[trackId] : undefined;
  const formations = trackId ? trackFormations[trackId] : undefined;

  const hasServerEdition = mode === 'phrase' && !!editions?.server;

  const userSlotCount = mode === 'phrase'
    ? (editions?.userEditions.length ?? 0)
    : (formations?.userEditions.length ?? 0);

  const trackImportedNotes = useMemo(() => {
    if (!trackId) return [];
    return importedNotes.filter(n => n.trackId === trackId);
  }, [trackId, importedNotes]);

  // ─── 활성 슬롯 ───
  const activeImported = trackImportedNotes.find(n => n.isActive);

  const activeSlot = useMemo((): string => {
    if (activeImported) return `imported-${activeImported.id}`;
    if (mode === 'phrase') return editions?.activeEditionId ?? 'S';
    return formations?.activeEditionId ?? '1';
  }, [mode, editions?.activeEditionId, formations?.activeEditionId, activeImported]);

  const isReadOnly = activeSlot === 'S' || activeSlot.startsWith('imported-');

  // ─── 슬롯 바 표시/숨김 ───
  const [slotBarVisible, setSlotBarVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const toggleSlotBar = useCallback(() => {
    setSlotBarVisible(prev => {
      if (!prev) {
        // 열 때 → 3초 후 자동 닫기
        clearTimer();
        hideTimerRef.current = setTimeout(() => setSlotBarVisible(false), AUTO_HIDE_MS);
      } else {
        clearTimer();
      }
      return !prev;
    });
  }, [clearTimer]);

  // 플레이 시작 → 자동 닫기
  useEffect(() => {
    if (isPlaying && slotBarVisible) {
      setSlotBarVisible(false);
      clearTimer();
    }
  }, [isPlaying]);

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => clearTimer();
  }, []);

  // ─── 슬롯 선택 ───
  const selectSlot = useCallback((slotId: string) => {
    if (!trackId) return;

    // imported note 선택
    if (slotId.startsWith('imported-')) {
      const noteId = slotId.replace('imported-', '');
      setActiveImportedNote(trackId, noteId);
      return;
    }

    // 내 슬롯 또는 R 선택 → imported 비활성
    setActiveImportedNote(trackId, null);

    if (mode === 'phrase') {
      setActiveEdition(trackId, slotId as EditionId);
    } else {
      setActiveFormationEdition(trackId, slotId as FormationEditionId);
    }
  }, [trackId, mode, setActiveEdition, setActiveFormationEdition, setActiveImportedNote]);

  // ─── 헤더 배지용 라벨 ───
  const slotLabel = useMemo((): string => {
    if (activeSlot === 'S') return 'R';
    if (activeSlot.startsWith('imported-')) {
      const note = trackImportedNotes.find(n => `imported-${n.id}` === activeSlot);
      return note?.phraseNote.metadata.author?.charAt(0) || '?';
    }
    return activeSlot; // '1', '2', '3'
  }, [activeSlot, trackImportedNotes]);

  const slotColor = mode === 'phrase' ? Colors.primary : '#FFB300';

  return {
    // 상태
    slotBarVisible,
    activeSlot,
    slotLabel,
    slotColor,
    isReadOnly,
    hasServerEdition,
    userSlotCount,
    trackImportedNotes,

    // 액션
    toggleSlotBar,
    selectSlot,
  };
}

