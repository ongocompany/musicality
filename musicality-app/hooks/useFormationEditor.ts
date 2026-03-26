/**
 * useFormationEditor — 포메이션 편집 전용 로직
 * AudioFormView / AudioFormEdit 화면에서만 사용
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { useSettingsStore } from '../stores/settingsStore';
import { FormationData, StageConfig } from '../types/formation';

interface UseFormationEditorProps {
  effectiveBeats: number[];
  countInfo: { beatIndex: number } | null;
  isPlaying: boolean;
  position: number;
  seekTo: (ms: number) => void;
  editMode: string;
}

export function useFormationEditor({
  effectiveBeats, countInfo, isPlaying, position, seekTo, editMode,
}: UseFormationEditorProps) {
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  const trackFormations = useSettingsStore((s) => s.trackFormations);
  const setDraftFormation = useSettingsStore((s) => s.setDraftFormation);
  const draftFormation = useSettingsStore((s) => s.draftFormation);
  const saveFormationDraftAsEdition = useSettingsStore((s) => s.saveFormationDraftAsEdition);
  const clearFormationDraft = useSettingsStore((s) => s.clearFormationDraft);
  const stageConfig = useSettingsStore((s) => s.stageConfig);
  const setStageConfig = useSettingsStore((s) => s.setStageConfig);

  const [formationEditBeatIndex, setFormationEditBeatIndex] = useState(0);

  // ─── Active formation data ───
  const activeFormationData = useMemo((): FormationData | null => {
    if (!currentTrack) return null;
    const draft = draftFormation[currentTrack.id];
    if (draft) return draft;
    const tf = trackFormations[currentTrack.id];
    if (!tf) return null;
    const activeId = tf.activeEditionId;
    if (activeId === 'S') return tf.server?.data ?? null;
    const userEd = tf.userEditions.find((e) => e.id === activeId);
    return userEd?.data ?? tf.server?.data ?? null;
  }, [currentTrack, trackFormations, draftFormation]);

  // ─── Undo stack — max 5 per track ───
  const UNDO_MAX = 5;
  const formationUndoRef = useRef<Record<string, FormationData[]>>({});

  const handleFormationUpdate = useCallback((data: FormationData) => {
    if (!currentTrack) return;
    const current = draftFormation[currentTrack.id];
    if (current) {
      if (!formationUndoRef.current[currentTrack.id]) formationUndoRef.current[currentTrack.id] = [];
      const stack = formationUndoRef.current[currentTrack.id];
      stack.push(current);
      if (stack.length > UNDO_MAX) stack.shift();
    }
    setDraftFormation(currentTrack.id, data);
  }, [currentTrack, setDraftFormation, draftFormation]);

  const clearFormationUndo = useCallback(() => {
    formationUndoRef.current = {};
  }, []);

  const handleFormationUndo = useCallback(() => {
    if (!currentTrack) return;
    const stack = formationUndoRef.current[currentTrack.id];
    if (!stack || stack.length === 0) return;
    setDraftFormation(currentTrack.id, stack.pop()!);
  }, [currentTrack, setDraftFormation]);

  const canUndoFormation = currentTrack
    ? (formationUndoRef.current[currentTrack.id]?.length ?? 0) > 0
    : false;

  // ─── Beat navigation ───
  const handleEditFormation = useCallback((beatIndex: number) => {
    setFormationEditBeatIndex(beatIndex);
    if (effectiveBeats[beatIndex] != null) seekTo(effectiveBeats[beatIndex] * 1000);
  }, [effectiveBeats, seekTo]);

  const handleFormationBeatChange = useCallback((beatIndex: number) => {
    setFormationEditBeatIndex(beatIndex);
    if (effectiveBeats[beatIndex] != null) seekTo(effectiveBeats[beatIndex] * 1000);
  }, [effectiveBeats, seekTo]);

  // ─── Sync with playback ───
  useEffect(() => {
    if (!countInfo || countInfo.beatIndex < 0) return;
    if (isPlaying || editMode !== 'formation') {
      setFormationEditBeatIndex(countInfo.beatIndex);
    }
  }, [editMode, countInfo?.beatIndex, isPlaying]);

  // ─── Fractional beat index (smooth animation) ───
  const fractionalBeatIndex = useMemo(() => {
    if (!isPlaying || !effectiveBeats || effectiveBeats.length === 0) return formationEditBeatIndex;
    const posSeconds = position / 1000;
    if (posSeconds <= effectiveBeats[0]) return 0;
    const last = effectiveBeats.length - 1;
    if (posSeconds >= effectiveBeats[last]) return last;
    let lo = 0, hi = last;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (effectiveBeats[mid] <= posSeconds) lo = mid;
      else hi = mid - 1;
    }
    if (lo >= last) return last;
    const span = effectiveBeats[lo + 1] - effectiveBeats[lo];
    if (span <= 0) return lo;
    const fraction = (posSeconds - effectiveBeats[lo]) / span;
    return lo + Math.max(0, Math.min(1, fraction));
  }, [isPlaying, position, effectiveBeats, formationEditBeatIndex]);

  // ─── Copy/New formation ───
  const handleCopyPrevKeyframe = useCallback((beatIndex: number) => {
    if (!activeFormationData) return;
    const { copyKeyframe } = require('../utils/formationInterpolator');
    const prev = activeFormationData.keyframes
      .filter((kf: any) => kf.beatIndex < beatIndex)
      .sort((a: any, b: any) => b.beatIndex - a.beatIndex)[0];
    if (prev) handleFormationUpdate(copyKeyframe(activeFormationData, prev.beatIndex, beatIndex));
  }, [activeFormationData, handleFormationUpdate]);

  const handleNewFormation = useCallback((beatIndex: number, halfWidth: number) => {
    if (!activeFormationData) return;
    const { copyKeyframe, setKeyframe, getFormationAtBeat } = require('../utils/formationInterpolator');
    const prev = activeFormationData.keyframes
      .filter((kf: any) => kf.beatIndex < beatIndex)
      .sort((a: any, b: any) => b.beatIndex - a.beatIndex)[0];
    if (!prev) return;
    let data = activeFormationData;
    const beforeBeat = Math.max(0, beatIndex - halfWidth);
    if (beforeBeat > prev.beatIndex) data = copyKeyframe(data, prev.beatIndex, beforeBeat);
    const currentPositions = getFormationAtBeat(data, beatIndex);
    if (currentPositions) {
      data = setKeyframe(data, { beatIndex, positions: currentPositions.map((p: any) => ({ ...p })) });
    }
    const afterBeat = beatIndex + halfWidth;
    if (afterBeat < effectiveBeats.length) data = copyKeyframe(data, beatIndex, afterBeat);
    handleFormationUpdate(data);
  }, [activeFormationData, handleFormationUpdate, effectiveBeats]);

  const handleStageConfigChange = useCallback((config: Partial<StageConfig>) => {
    setStageConfig(config);
  }, [setStageConfig]);

  return {
    activeFormationData,
    formationEditBeatIndex, setFormationEditBeatIndex,
    fractionalBeatIndex,
    stageConfig,
    canUndoFormation,
    trackFormations, draftFormation,
    saveFormationDraftAsEdition, clearFormationDraft, clearFormationUndo,

    handleFormationUpdate,
    handleFormationUndo,
    handleEditFormation,
    handleFormationBeatChange,
    handleCopyPrevKeyframe,
    handleNewFormation,
    handleStageConfigChange,
  };
}
