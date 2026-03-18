/**
 * AudioFormEditScreen — 👥 롱프레스 (Form Edit)
 * 헤더(S● + ⚙️) + 스테이지(드래그) + [🎯 배치] + PhraseGrid(편집) + 컨트롤바(↩)
 */

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
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
import { SettingsModal } from '../../components/player/SettingsModal';

import { Colors, Spacing } from '../../constants/theme';

const RATES = [0.5, 0.75, 1.0, 1.25, 1.5];

interface AudioFormEditScreenProps {
  playerCore: ReturnType<typeof usePlayerCore>;
  playerMode: ReturnType<typeof usePlayerMode>;
}

export function AudioFormEditScreen({ playerCore, playerMode }: AudioFormEditScreenProps) {
  const { t } = useTranslation();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const focus = useFocusMode();

  const {
    currentTrack, isPlaying, position, duration, playbackRate,
    analysis, countInfo, phraseMap, effectiveBeats,
    currentBpm, beatTimeOffset, bpmOverride,
    loopStart, loopEnd, loopEnabled, gridScrollMode,
    cueEnabled, currentCellNotes, currentBeatNote,
    togglePlay, seekTo, setPlaybackRate,
    toggleCue, setBeatTimeOffset, clearBpmOverride,
    handleGridTapBeat, handleSeekAndPlay, handleSeekOnly,
    handleSkipBack, handleSkipForward,
    handleSetLoopPoint, clearLoop,
    handleReArrangePhrase, handleSplitPhraseHere, handleMergeWithPrevious,
    handleSetCellNote, handleClearCellNote,
    handleSharePhraseNote, runAnalysis,
  } = playerCore;

  const formation = useFormationEditor({
    effectiveBeats, countInfo, isPlaying, position, seekTo, editMode: 'formation',
  });

  if (!currentTrack || !formation.activeFormationData) return null;

  const displayBpm = bpmOverride ?? currentBpm ?? (analysis?.bpm ? Math.round(analysis.bpm) : 0);

  return (
    <View style={styles.container}>
      <View style={styles.scrollArea}>
        {/* ① Header — S● + BPM + ⚙️ */}
        <View style={styles.header}>
          <Ionicons name="musical-notes" size={18} color={Colors.primary} style={{ marginRight: Spacing.xs }} />
          <MarqueeTitle text={currentTrack.title} style={styles.headerTitle} />
          <View style={styles.headerMeta}>
            <View style={styles.slotBadge}>
              <Text style={styles.slotText}>S</Text>
              <View style={styles.autoDot} />
            </View>
            {displayBpm > 0 && (
              <View style={styles.bpmBadge}>
                <Text style={styles.bpmText}>{displayBpm} BPM</Text>
              </View>
            )}
            <TouchableOpacity style={styles.settingsBtn} onPress={() => setSettingsVisible(true)}>
              <Ionicons name="settings-outline" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ② Stage (editable) + toolbar + Grid */}
        {currentTrack.analysisStatus === 'done' && (
          <View style={styles.countSection} {...focus.focusSwipeResponder.panHandlers}>
            <FormationStageView
              formationData={formation.activeFormationData}
              currentBeatIndex={isPlaying ? formation.fractionalBeatIndex : formation.formationEditBeatIndex}
              totalBeats={effectiveBeats.length}
              stageConfig={formation.stageConfig}
              isPlaying={isPlaying}
              isEditing={true}
              onUpdate={formation.handleFormationUpdate}
              onBeatChange={formation.handleFormationBeatChange}
              onStageConfigChange={formation.handleStageConfigChange}
              onTogglePlay={togglePlay}
            />

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
                rows={focus.focusMode ? 5 : 3}
                scrollMode={gridScrollMode}
                cellNotes={currentCellNotes}
                onSetCellNote={handleSetCellNote}
                onClearCellNote={handleClearCellNote}
                currentBeatNote={currentBeatNote}
                formationData={formation.activeFormationData}
                onEditFormation={formation.handleEditFormation}
                onCopyPrevKeyframe={formation.handleCopyPrevKeyframe}
                onNewFormation={formation.handleNewFormation}
                editMode="formation"
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
        <Animated.View style={{
          maxHeight: focus.focusAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 500] }),
          opacity: focus.focusAnim, overflow: 'hidden',
        }}>
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
        </Animated.View>
      </View>

      {/* ④ Bottom bar — with undo */}
      <Animated.View style={[styles.bottomBar, {
        maxHeight: focus.focusAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 60] }),
        opacity: focus.focusAnim, overflow: 'hidden',
      }]}>
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
          <TouchableOpacity onPress={toggleCue}>
            <Ionicons
              name={cueEnabled ? 'volume-high' : 'volume-mute'} size={20}
              color={cueEnabled ? Colors.accent : Colors.textMuted}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={formation.handleFormationUndo}
            disabled={!formation.canUndoFormation}
            style={{ opacity: formation.canUndoFormation ? 1 : 0.3 }}
          >
            <Ionicons name="arrow-undo" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* ⚙️ Settings modal */}
      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        beatTimeOffset={beatTimeOffset}
        bpm={displayBpm}
        onAdjustOffset={(delta) => currentTrack && setBeatTimeOffset(currentTrack.id, beatTimeOffset + delta)}
        onResetOffset={() => currentTrack && setBeatTimeOffset(currentTrack.id, 0)}
        onExport={() => { setSettingsVisible(false); handleSharePhraseNote(formation.activeFormationData); }}
        onImport={() => { setSettingsVisible(false); playerCore.handleImportPhraseNote(); }}
        onReanalyze={() => { setSettingsVisible(false); runAnalysis(); }}
        onEditBpm={() => {}}
        onResetAll={() => {
          setSettingsVisible(false);
          if (currentTrack) {
            clearBpmOverride(currentTrack.id);
            setBeatTimeOffset(currentTrack.id, 0);
            playerCore.clearDraft(currentTrack.id);
            formation.clearFormationDraft(currentTrack.id);
          }
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
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  slotBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
    borderWidth: 1.5, borderColor: 'rgba(187,134,252,0.5)',
    backgroundColor: 'rgba(187,134,252,0.08)',
  },
  slotText: { fontSize: 10, fontWeight: '800', color: Colors.primary },
  autoDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.success },
  bpmBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10,
    backgroundColor: 'rgba(187,134,252,0.2)',
  },
  bpmText: { fontSize: 10, fontWeight: '700', color: Colors.primary },
  settingsBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  countSection: { flex: 1, alignItems: 'center' },
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
