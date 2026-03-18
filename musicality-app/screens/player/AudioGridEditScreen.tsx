/**
 * AudioGridEditScreen — 🔢 롱프레스 (Grid Edit)
 * 헤더(S● + ⚙️) + 카운트(小) + PhraseGrid(편집) + 시크바 + 컨트롤바(↩ undo)
 */

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { usePlayerCore } from '../../hooks/usePlayerCore';
import { usePlayerMode } from '../../hooks/usePlayerMode';
import { useFocusMode } from '../../hooks/useFocusMode';
import { useSlotSelector } from '../../hooks/useSlotSelector';

import { PhraseGrid } from '../../components/ui/PhraseGrid';
import { SectionTimeline } from '../../components/ui/SectionTimeline';
import { SpeedPopup } from '../../components/ui/SpeedPopup';
import { MarqueeTitle } from '../../components/player/MarqueeTitle';
import { CountDisplay } from '../../components/player/CountDisplay';
import { SettingsModal } from '../../components/player/SettingsModal';
import { SlotBar } from '../../components/player/SlotBar';

import { Colors, Spacing, getPhraseColor, blendColors } from '../../constants/theme';

const RATES = [0.5, 0.75, 1.0, 1.25, 1.5];

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  return `${Math.floor(totalSec / 60)}:${(totalSec % 60).toString().padStart(2, '0')}`;
}

interface AudioGridEditScreenProps {
  playerCore: ReturnType<typeof usePlayerCore>;
  playerMode: ReturnType<typeof usePlayerMode>;
}

export function AudioGridEditScreen({ playerCore, playerMode }: AudioGridEditScreenProps) {
  const { t } = useTranslation();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const focus = useFocusMode();
  const slot = useSlotSelector('phrase');

  const {
    currentTrack, isPlaying, position, duration, playbackRate,
    analysis, countInfo, phraseMap, effectiveBeats,
    currentBpm, beatTimeOffset, bpmOverride,
    loopStart, loopEnd, loopEnabled, gridScrollMode,
    cueEnabled, currentCellNotes, currentBeatNote, canUndo,
    togglePlay, seekTo, setPlaybackRate,
    toggleCue,
    setBeatTimeOffset, setBpmOverride, clearBpmOverride,
    handleGridTapBeat, handleSeekAndPlay, handleSeekOnly,
    handleSkipBack, handleSkipForward, handleUndo,
    handleSetLoopPoint, clearLoop,
    handleReArrangePhrase, handleSplitPhraseHere, handleMergeWithPrevious,
    handleSetCellNote, handleClearCellNote,
    handleSharePhraseNote, runAnalysis,
  } = playerCore;

  if (!currentTrack) return null;

  const countColor = countInfo && countInfo.totalPhrases > 0
    ? (countInfo.isTransitionHint
      ? blendColors(getPhraseColor(countInfo.phraseIndex), getPhraseColor(countInfo.phraseIndex + 1), 0.5)
      : getPhraseColor(countInfo.phraseIndex))
    : Colors.textMuted;

  const displayBpm = bpmOverride ?? currentBpm ?? (analysis?.bpm ? Math.round(analysis.bpm) : 0);

  return (
    <View style={styles.container}>
      <View style={styles.scrollArea}>
        {/* ① Header — S● + BPM + ⚙️ */}
        <View style={styles.header}>
          <Ionicons name="musical-notes" size={18} color={Colors.primary} style={{ marginRight: Spacing.xs }} />
          <MarqueeTitle text={currentTrack.title} style={styles.headerTitle} />
          <View style={styles.headerMeta}>
            <TouchableOpacity style={[styles.slotBadge, { borderColor: slot.slotColor + '80' }]} onPress={slot.toggleSlotBar}>
              <Text style={[styles.slotText, { color: slot.slotColor }]}>{slot.slotLabel}</Text>
              {!slot.isReadOnly && <View style={[styles.autoDot, { backgroundColor: slot.slotColor }]} />}
            </TouchableOpacity>
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

        {/* ② Slot bar (펼침/접힘) */}
        {slot.slotBarVisible && (
          <SlotBar
            mode="phrase"
            activeSlot={slot.activeSlot}
            hasServerEdition={slot.hasServerEdition}
            userSlotCount={slot.userSlotCount}
            importedNotes={slot.trackImportedNotes}
            onSelectSlot={slot.selectSlot}
            onClose={slot.toggleSlotBar}
          />
        )}

        {/* ③ Count + Grid (editable) */}
        {currentTrack.analysisStatus === 'done' && (
          <View style={styles.countSection} {...focus.focusSwipeResponder.panHandlers}>
            <CountDisplay count={countInfo?.count ?? '--'} color={countColor} size="large" />

            <View style={{ flex: 1, width: '100%' }}>
              <PhraseGrid
                countInfo={countInfo}
                phraseMap={phraseMap ?? null}
                hasAnalysis={!!analysis}
                beats={effectiveBeats}
                isPlaying={isPlaying}
                onTapBeat={handleGridTapBeat}
                onReArrangePhrase={slot.isReadOnly ? () => {} : handleReArrangePhrase}
                onSplitPhraseHere={slot.isReadOnly ? () => {} : handleSplitPhraseHere}
                onSetLoopPoint={handleSetLoopPoint}
                onClearLoop={clearLoop}
                onSeekAndPlay={handleSeekAndPlay}
                onSeekOnly={handleSeekOnly}
                onMergeWithPrevious={slot.isReadOnly ? () => {} : handleMergeWithPrevious}
                loopStart={loopStart}
                loopEnd={loopEnd}
                scrollMode={gridScrollMode}
                cellNotes={currentCellNotes}
                onSetCellNote={slot.isReadOnly ? undefined : handleSetCellNote}
                onClearCellNote={slot.isReadOnly ? undefined : handleClearCellNote}
                currentBeatNote={currentBeatNote}
                editMode={slot.isReadOnly ? 'none' : 'note'}
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
          <TouchableOpacity onPress={playerMode.onGridPress} style={[styles.modeBtn, playerMode.isGrid && styles.modeBtnActive]}>
            <Ionicons name="grid-outline" size={18} color={playerMode.isGrid ? Colors.primary : Colors.textMuted} />
          </TouchableOpacity>
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
          <TouchableOpacity onPress={playerMode.onFormPress} style={[styles.modeBtn, playerMode.isFormation && styles.modeBtnActive]}>
            <Ionicons name="people-outline" size={18} color={playerMode.isFormation ? Colors.primary : Colors.textMuted} />
          </TouchableOpacity>
          {!slot.isReadOnly && (
            <TouchableOpacity onPress={handleUndo} disabled={!canUndo} style={{ opacity: canUndo ? 1 : 0.3 }}>
              <Ionicons name="arrow-undo" size={20} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* Focus mode mini controls */}
      {focus.focusMode && (
        <>
          <TouchableOpacity style={styles.focusPlayButton} onPress={togglePlay} activeOpacity={0.7}>
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.focusExitHandle} onPress={focus.exitFocusMode} activeOpacity={0.7}>
            <Ionicons name="chevron-up" size={16} color={Colors.primary} />
          </TouchableOpacity>
        </>
      )}

      {/* ⚙️ Settings modal */}
      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        beatTimeOffset={beatTimeOffset}
        bpm={displayBpm}
        onAdjustOffset={(delta) => currentTrack && setBeatTimeOffset(currentTrack.id, beatTimeOffset + delta)}
        onResetOffset={() => currentTrack && setBeatTimeOffset(currentTrack.id, 0)}
        onExport={() => { setSettingsVisible(false); handleSharePhraseNote(null); }}
        onImport={() => { setSettingsVisible(false); playerCore.handleImportPhraseNote(); }}
        onReanalyze={() => { setSettingsVisible(false); runAnalysis(); }}
        onEditBpm={() => { /* TODO: BPM edit modal */ }}
        onResetAll={() => {
          setSettingsVisible(false);
          if (currentTrack) {
            clearBpmOverride(currentTrack.id);
            setBeatTimeOffset(currentTrack.id, 0);
            playerCore.clearDraft(currentTrack.id);
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
  modeBtn: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  modeBtnActive: {
    backgroundColor: 'rgba(187,134,252,0.2)',
  },
  focusPlayButton: {
    position: 'absolute', bottom: 12, right: 12,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(187,134,252,0.8)',
    alignItems: 'center', justifyContent: 'center',
  },
  focusExitHandle: {
    position: 'absolute', bottom: 0, alignSelf: 'center',
    paddingHorizontal: 24, paddingVertical: 4,
    backgroundColor: 'rgba(187,134,252,0.15)', borderTopLeftRadius: 12, borderTopRightRadius: 12,
  },
});
