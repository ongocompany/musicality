/**
 * AudioFormViewScreen — 👥 탭 (Form View)
 * 스테이지 애니메이션(읽기전용) + PhraseGrid(읽기전용)
 * 댄서가 비트에 따라 자동 이동하는 것을 감상
 */

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { usePlayerCore } from '../../hooks/usePlayerCore';
import { usePlayerMode } from '../../hooks/usePlayerMode';
import { useFormationEditor } from '../../hooks/useFormationEditor';
import { useFocusMode } from '../../hooks/useFocusMode';

import { PhraseGrid } from '../../components/ui/PhraseGrid';
import { FormationStageView } from '../../components/ui/FormationStageView';
import { SectionTimeline } from '../../components/ui/SectionTimeline';
import { SpeedPopup } from '../../components/ui/SpeedPopup';
import { ModeSegment } from '../../components/player/ModeSegment';
import { MarqueeTitle } from '../../components/player/MarqueeTitle';
import { FormationSetupModal } from '../../components/player/FormationSetupModal';

import { useSettingsStore } from '../../stores/settingsStore';
import { Colors, Spacing } from '../../constants/theme';

const RATES = [0.5, 0.75, 1.0, 1.25, 1.5];

interface AudioFormViewScreenProps {
  playerCore: ReturnType<typeof usePlayerCore>;
  playerMode: ReturnType<typeof usePlayerMode>;
}

export function AudioFormViewScreen({ playerCore, playerMode }: AudioFormViewScreenProps) {
  const { t } = useTranslation();
  const autoHideMs = useSettingsStore((s) => s.autoHideMs);
  const focus = useFocusMode(autoHideMs > 0 ? autoHideMs : undefined);
  const [setupVisible, setSetupVisible] = useState(false);
  const setDraftFormation = useSettingsStore((s) => s.setDraftFormation);

  const {
    currentTrack, isPlaying, position, duration, playbackRate,
    analysis, countInfo, phraseMap, effectiveBeats,
    currentBpm, loopStart, loopEnd, loopEnabled,
    gridScrollMode, currentCellNotes, currentBeatNote,
    togglePlay, seekTo, setPlaybackRate,
    handleGridTapBeat, handleSeekAndPlay, handleSeekOnly,
    handleSkipBack, handleSkipForward,
    handleSetLoopPoint, clearLoop,
    handleReArrangePhrase, handleSplitPhraseHere, handleMergeWithPrevious,
  } = playerCore;

  const formation = useFormationEditor({
    effectiveBeats, countInfo, isPlaying, position, seekTo, editMode: 'none',
  });

  if (!currentTrack) return null;

  const hasFormation = !!formation.activeFormationData;

  return (
    <View style={styles.container}>
      <View style={styles.scrollArea}>
        {/* ① Header */}
        <View style={styles.header}>
          <Ionicons name="musical-notes" size={18} color={Colors.primary} style={{ marginRight: Spacing.xs }} />
          <MarqueeTitle text={currentTrack.title} style={styles.headerTitle} />
          {currentBpm && (
            <View style={styles.bpmBadge}>
              <Text style={styles.bpmText}>{currentBpm} BPM</Text>
            </View>
          )}
        </View>

        {/* ② Stage + Grid OR empty state */}
        {currentTrack.analysisStatus === 'done' && (
          <View style={styles.countSection}>
            {hasFormation ? (
              <View style={{ maxHeight: 220 }}>
                <FormationStageView
                  formationData={formation.activeFormationData!}
                  currentBeatIndex={formation.fractionalBeatIndex}
                  totalBeats={effectiveBeats.length}
                  stageConfig={formation.stageConfig}
                  isPlaying={isPlaying}
                  isEditing={false}
                  onUpdate={() => {}}
                  onBeatChange={() => {}}
                  onStageConfigChange={() => {}}
                  onTogglePlay={togglePlay}
                />
              </View>
            ) : (
              <View style={styles.emptyFormation}>
                <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyText}>{t('player.noFormation', { defaultValue: '포메이션이 없습니다' })}</Text>
                <TouchableOpacity style={styles.createBtn} onPress={() => setSetupVisible(true)}>
                  <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
                  <Text style={styles.createBtnText}>{t('player.startFormation', { defaultValue: '포메이션 만들기' })}</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={{ flex: 1, width: '100%' }}>
              <PhraseGrid
                countInfo={countInfo}
                phraseMap={phraseMap ?? null}
                hasAnalysis={!!analysis}
                beats={effectiveBeats}
                isPlaying={isPlaying}
                onTapBeat={handleGridTapBeat}
                onReArrangePhrase={handleReArrangePhrase}
                onSplitPhraseHere={handleSplitPhraseHere}
                onSetLoopPoint={handleSetLoopPoint}
                onClearLoop={clearLoop}
                onSeekAndPlay={handleSeekAndPlay}
                onSeekOnly={handleSeekOnly}
                onMergeWithPrevious={handleMergeWithPrevious}
                loopStart={loopStart}
                loopEnd={loopEnd}
                scrollMode={true}
                cellNotes={currentCellNotes}
                currentBeatNote={currentBeatNote}
                formationData={formation.activeFormationData}
                editMode="none"
              />
            </View>
          </View>
        )}

        {/* Focus handle */}
        <TouchableOpacity
          style={[styles.focusHandle, focus.focusMode && styles.focusHandleActive]}
          onPress={focus.focusMode ? focus.exitFocusMode : focus.enterFocusMode}
          activeOpacity={0.7}
        >
          <Ionicons
            name={focus.focusMode ? 'chevron-up' : 'chevron-down'}
            size={focus.focusMode ? 20 : 16}
            color={focus.focusMode ? Colors.primary : Colors.textMuted}
          />
        </TouchableOpacity>

        {/* ③ Seek — hidden in focus mode */}
        {!focus.focusMode && (
          <View style={styles.seekSection}>
            {phraseMap && analysis && (
              <SectionTimeline
                phrases={phraseMap.phrases}
                duration={duration > 0 ? duration / 1000 : analysis.duration}
                currentTimeMs={position}
                waveformPeaks={analysis.waveformPeaks}
                onSeek={seekTo}
                onSeekStart={() => playerCore.setIsSeeking(true)}
                onSeekEnd={() => playerCore.setIsSeeking(false)}
                loopStart={loopStart}
                loopEnd={loopEnd}
                loopEnabled={loopEnabled}
              />
            )}
          </View>
        )}
      </View>

      {/* ④ Bottom bar */}
      {!focus.focusMode && (<View style={styles.bottomBar}>
        <View style={[styles.bottomBarSide, { justifyContent: 'flex-end' }]}>
          <ModeSegment
            gridState={playerMode.gridSegState}
            formState={playerMode.formSegState}
            onGridTap={playerMode.onGridTap}
            onGridLongPress={playerMode.onGridLongPress}
            onFormTap={playerMode.onFormTap}
            onFormLongPress={playerMode.onFormLongPress}
          />
          <SpeedPopup currentRate={playbackRate} rates={RATES} onSelectRate={setPlaybackRate} />
          <TouchableOpacity onPress={handleSkipBack} onLongPress={() => seekTo(0)} delayLongPress={400}>
            <Ionicons name="play-back" size={22} color={Colors.text} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.playButton} onPress={togglePlay}>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={[styles.bottomBarSide, { justifyContent: 'flex-start' }]}>
          <TouchableOpacity onPress={handleSkipForward}>
            <Ionicons name="play-forward" size={22} color={Colors.text} />
          </TouchableOpacity>
        </View>
      </View>)}

      {/* Formation setup modal */}
      <FormationSetupModal
        visible={setupVisible}
        onClose={() => setSetupVisible(false)}
        onCreated={(data) => {
          if (currentTrack) setDraftFormation(currentTrack.id, data);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollArea: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 6,
  },
  headerTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  bpmBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10,
    backgroundColor: 'rgba(187,134,252,0.2)',
  },
  bpmText: { fontSize: 10, fontWeight: '700', color: Colors.primary },
  countSection: { flex: 1, alignItems: 'center' },
  emptyFormation: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 32, gap: 12,
  },
  emptyText: { fontSize: 14, color: Colors.textMuted },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
    backgroundColor: 'rgba(187,134,252,0.15)',
  },
  createBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  seekSection: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  focusHandle: {
    alignItems: 'center', paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  focusHandleActive: { backgroundColor: 'rgba(187,134,252,0.1)' },
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    borderTopWidth: 1, borderTopColor: Colors.surface,
    backgroundColor: Colors.background, height: 56,
  },
  bottomBarSide: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
  },
  playButton: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    marginHorizontal: Spacing.md,
  },
});
