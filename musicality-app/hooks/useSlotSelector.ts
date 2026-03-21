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

  // ─── 슬롯 선택에 필요한 store 값 (selectSlot보다 먼저 선언) ───
  const clearDraft = useSettingsStore((s) => s.clearDraft);
  const clearFormationDraft = useSettingsStore((s) => s.clearFormationDraft);
  const draftBoundaries = useSettingsStore((s) => s.draftBoundaries);
  const draftFormation = useSettingsStore((s) => s.draftFormation);
  const setEditionBoundaries = useSettingsStore((s) => s.setEditionBoundaries);
  const setFormationEdition = useSettingsStore((s) => s.setFormationEdition);

  const currentDraft = trackId
    ? (mode === 'phrase' ? draftBoundaries[trackId] : draftFormation[trackId])
    : undefined;

  const selectSlot = useCallback((slotId: string) => {
    if (!trackId) return;

    // Auto-save current draft before switching
    if (!isReadOnly && currentDraft) {
      const curSlot = activeSlot as EditionId;
      if (curSlot !== 'S' && !curSlot.startsWith('imported')) {
        if (mode === 'phrase' && Array.isArray(currentDraft)) {
          setEditionBoundaries(trackId, curSlot, currentDraft as number[]);
        } else if (mode === 'formation' && !Array.isArray(currentDraft)) {
          setFormationEdition(trackId, curSlot as FormationEditionId, currentDraft as any);
        }
      }
    }

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
  }, [trackId, mode, activeSlot, isReadOnly, currentDraft,
      setActiveEdition, setActiveFormationEdition, setActiveImportedNote,
      setEditionBoundaries, setFormationEdition, clearDraft, clearFormationDraft]);

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

  // R 데이터를 지정(또는 빈) 슬롯에 복제 → 그 슬롯으로 전환
  const createSlotFromServer = useCallback((targetSlot?: string): boolean => {
    if (!trackId) return false;

    // Auto-save current draft before switching
    if (!isReadOnly && currentDraft) {
      const slotId = activeSlot as EditionId;
      if (slotId !== 'S' && !slotId.startsWith('imported')) {
        if (mode === 'phrase' && Array.isArray(currentDraft)) {
          setEditionBoundaries(trackId, slotId, currentDraft as number[]);
        } else if (mode === 'formation' && !Array.isArray(currentDraft)) {
          setFormationEdition(trackId, slotId as FormationEditionId, currentDraft as any);
        }
      }
    }

    // Clear draft before switching
    if (mode === 'phrase') clearDraft(trackId);
    else clearFormationDraft(trackId);

    if (mode === 'phrase') {
      const serverBoundaries = editions?.server?.boundaries ?? [];
      const target = targetSlot as EditionId | undefined;
      const usedIds = new Set(editions?.userEditions.map(e => e.id) ?? []);
      const slotToUse = target && !usedIds.has(target)
        ? target
        : (['1', '2', '3'] as EditionId[]).find(id => !usedIds.has(id));

      if (slotToUse) {
        setEditionBoundaries(trackId, slotToUse, [...serverBoundaries]);
        setActiveEdition(trackId, slotToUse);
        return true;
      } else {
        Alert.alert('슬롯이 가득 찼습니다', '기존 슬롯을 삭제한 후 다시 시도해주세요.');
        return false;
      }
    } else {
      const serverData = formations?.server?.data;
      if (!serverData) return false;
      const target = targetSlot as FormationEditionId | undefined;
      const usedIds = new Set(formations?.userEditions.map(e => e.id) ?? []);
      const slotToUse = target && !usedIds.has(target)
        ? target
        : (['1', '2', '3'] as FormationEditionId[]).find(id => !usedIds.has(id));

      if (slotToUse) {
        setFormationEdition(trackId, slotToUse, JSON.parse(JSON.stringify(serverData)));
        setActiveFormationEdition(trackId, slotToUse);
        return true;
      } else {
        Alert.alert('슬롯이 가득 찼습니다', '기존 슬롯을 삭제한 후 다시 시도해주세요.');
        return false;
      }
    }
  }, [trackId, mode, editions, formations, activeSlot, isReadOnly, currentDraft,
      setEditionBoundaries, setFormationEdition, setActiveEdition, setActiveFormationEdition, clearDraft, clearFormationDraft]);

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

