/**
 * useSlotSelector — 슬롯 선택 바 상태 관리
 *
 * - slotBarVisible: 바 펼침/접힘
 * - activeSlot: 현재 활성 슬롯 ID
 * - isReadOnly: R/커뮤니티 슬롯이면 true
 * - 자동닫기: 플레이 시작, 3초 타임아웃
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Alert } from 'react-native';
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
    if (mode === 'phrase') return editions?.activeEditionId ?? '1';
    return formations?.activeEditionId ?? '1';
  }, [mode, editions?.activeEditionId, formations?.activeEditionId, activeImported]);

  const isServerSlot = activeSlot === 'S';
  const isImported = activeSlot.startsWith('imported-');
  const isReadOnly = isServerSlot || isImported;

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
  const clearDraft = useSettingsStore((s) => s.clearDraft);
  const clearFormationDraft = useSettingsStore((s) => s.clearFormationDraft);

  const selectSlot = useCallback((slotId: string) => {
    if (!trackId) return;

    // Clear draft so phraseMap reads from the new slot's edition data
    if (mode === 'phrase') clearDraft(trackId);
    else clearFormationDraft(trackId);

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
  }, [trackId, mode, setActiveEdition, setActiveFormationEdition, setActiveImportedNote, clearDraft, clearFormationDraft]);

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

  // ─── 자동저장: draft 변경 → 활성 슬롯에 디바운스 저장 ───
  const draftBoundaries = useSettingsStore((s) => s.draftBoundaries);
  const draftFormation = useSettingsStore((s) => s.draftFormation);
  const setEditionBoundaries = useSettingsStore((s) => s.setEditionBoundaries);
  const setFormationEdition = useSettingsStore((s) => s.setFormationEdition);

  const currentDraft = trackId
    ? (mode === 'phrase' ? draftBoundaries[trackId] : draftFormation[trackId])
    : undefined;

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstDraftRef = useRef(true);

  useEffect(() => {
    // 첫 렌더 스킵
    if (isFirstDraftRef.current) {
      isFirstDraftRef.current = false;
      return;
    }
    if (!trackId || isReadOnly || !currentDraft) return;

    // 유저 슬롯 (1/2/3)에만 자동저장
    const slotId = activeSlot as EditionId;
    if (slotId === 'S' || slotId.startsWith('imported')) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (mode === 'phrase' && Array.isArray(currentDraft)) {
        setEditionBoundaries(trackId, slotId, currentDraft as number[]);
      } else if (mode === 'formation' && currentDraft && !Array.isArray(currentDraft)) {
        setFormationEdition(trackId, slotId as FormationEditionId, currentDraft as any);
      }
    }, 500);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [currentDraft]);

  // ─── 진입 시: 개인 에디션 있으면 마지막 사용 슬롯 유지, 없으면 R(S) 유지 ───
  // 편집은 tryEdit()에서 처리

  // R 데이터를 빈 슬롯 하나에 복제 → 그 슬롯으로 전환
  const createSlotFromServer = useCallback((): boolean => {
    if (!trackId) return false;

    // Clear draft before switching
    if (mode === 'phrase') clearDraft(trackId);
    else clearFormationDraft(trackId);

    if (mode === 'phrase') {
      const serverBoundaries = editions?.server?.boundaries ?? [];
      const usedIds = new Set(editions?.userEditions.map(e => e.id) ?? []);
      const available = (['1', '2', '3'] as EditionId[]).find(id => !usedIds.has(id));

      if (available) {
        setEditionBoundaries(trackId, available, [...serverBoundaries]);
        setActiveEdition(trackId, available);
        return true;
      } else {
        // 3개 다 찼음 — 슬롯 선택해서 덮어쓰기
        Alert.alert(
          '슬롯이 가득 찼습니다',
          '어느 슬롯에 덮어쓰시겠습니까?',
          [
            { text: '취소', style: 'cancel' },
            ...(['1', '2', '3'] as const).map(s => ({
              text: `슬롯 ${s}`,
              onPress: () => {
                setEditionBoundaries(trackId, s as EditionId, [...serverBoundaries]);
                setActiveEdition(trackId, s as EditionId);
              },
            })),
          ],
        );
        return false;
      }
    } else {
      const serverData = formations?.server?.data;
      if (!serverData) return false;
      const usedIds = new Set(formations?.userEditions.map(e => e.id) ?? []);
      const available = (['1', '2', '3'] as FormationEditionId[]).find(id => !usedIds.has(id));

      if (available) {
        setFormationEdition(trackId, available, JSON.parse(JSON.stringify(serverData)));
        setActiveFormationEdition(trackId, available);
        return true;
      } else {
        Alert.alert(
          '슬롯이 가득 찼습니다',
          '어느 슬롯에 덮어쓰시겠습니까?',
          [
            { text: '취소', style: 'cancel' },
            ...(['1', '2', '3'] as const).map(s => ({
              text: `슬롯 ${s}`,
              onPress: () => {
                setFormationEdition(trackId, s as FormationEditionId, JSON.parse(JSON.stringify(serverData)));
                setActiveFormationEdition(trackId, s as FormationEditionId);
              },
            })),
          ],
        );
        return false;
      }
    }
  }, [trackId, mode, editions, formations, setEditionBoundaries, setFormationEdition, setActiveEdition, setActiveFormationEdition]);

  // ─── R 슬롯에서 편집 시도 시 처리 ───
  const tryEdit = useCallback((): boolean => {
    if (!isReadOnly) return true; // 편집 가능

    if (isImported) {
      Alert.alert('읽기 전용', '커뮤니티 에디션은 수정할 수 없습니다.');
      return false;
    }

    if (isServerSlot) {
      // R에서 편집 시도 → 빈 슬롯에 복사 + 전환
      createSlotFromServer();
      return false; // 이번 액션은 취소, 다음부터 편집 가능
    }

    return false;
  }, [isReadOnly, isImported, isServerSlot, createSlotFromServer]);

  // ─── 초기화: 현재 슬롯을 R 데이터로 복원 ───
  const resetSlotToServer = useCallback(() => {
    if (!trackId || isReadOnly) return;
    const slotId = activeSlot;
    if (slotId === 'S' || slotId.startsWith('imported')) return;

    if (mode === 'phrase') {
      const serverBoundaries = editions?.server?.boundaries ?? [];
      setEditionBoundaries(trackId, slotId as EditionId, [...serverBoundaries]);
    } else {
      const serverData = formations?.server?.data;
      if (serverData) {
        setFormationEdition(trackId, slotId as FormationEditionId, JSON.parse(JSON.stringify(serverData)));
      }
    }
  }, [trackId, activeSlot, isReadOnly, mode, editions, formations, setEditionBoundaries, setFormationEdition]);

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
    tryEdit,
    resetSlotToServer,
    addSlot: createSlotFromServer,
  };
}

