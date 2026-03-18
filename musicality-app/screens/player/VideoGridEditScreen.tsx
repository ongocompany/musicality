/**
 * VideoGridEditScreen — 🔢 롱프레스 (비디오/유튜브 편집)
 * 헤더(S● + ⚙️) + 비디오(축소) + PhraseGrid(편집) + 컨트롤바(↩)
 */

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { usePlayerCore } from '../../hooks/usePlayerCore';
import { usePlayerMode } from '../../hooks/usePlayerMode';

import { PhraseGrid } from '../../components/ui/PhraseGrid';
import { SectionTimeline } from '../../components/ui/SectionTimeline';
import { SpeedPopup } from '../../components/ui/SpeedPopup';
import { ModeSegment } from '../../components/player/ModeSegment';
import { MarqueeTitle } from '../../components/player/MarqueeTitle';
import { SettingsModal } from '../../components/player/SettingsModal';

import { Colors, Spacing } from '../../constants/theme';

const RATES = [0.5, 0.75, 1.0, 1.25, 1.5];

interface VideoGridEditScreenProps {
  playerCore: ReturnType<typeof usePlayerCore>;
  playerMode: ReturnType<typeof usePlayerMode>;
  videoElement: React.ReactNode;
}

export function VideoGridEditScreen({ playerCore, playerMode, videoElement }: VideoGridEditScreenProps) {
  const [settingsVisible, setSettingsVisible] = useState(false);

  const {
    currentTrack, isPlaying, position, duration, playbackRate,
    analysis, countInfo, phraseMap, effectiveBeats,
    currentBpm, beatTimeOffset, bpmOverride,
    loopStart, loopEnd, loopEnabled, gridScrollMode,
    cueEnabled, currentCellNotes, currentBeatNote, canUndo,
    togglePlay, seekTo, setPlaybackRate, toggleCue,
    setBeatTimeOffset, clearBpmOverride,
    handleGridTapBeat, handleSeekAndPlay, handleSeekOnly,
    handleSkipBack, handleSkipForward, handleUndo,
    handleSetLoopPoint, clearLoop,
    handleReArrangePhrase, handleSplitPhraseHere, handleMergeWithPrevious,
    handleSetCellNote, handleClearCellNote,
    handleSharePhraseNote, runAnalysis,
  } = playerCore;

  if (!currentTrack) return null;

  const displayBpm = bpmOverride ?? currentBpm ?? (analysis?.bpm ? Math.round(analysis.bpm) : 0);

  return (
    <View style={styles.container}>
      <View style={styles.scrollArea}>
        {/* ① Header — S● + BPM + ⚙️ */}
        <View style={styles.header}>
          <Ionicons
            name={playerCore.isYouTube ? 'logo-youtube' : 'videocam'}
            size={18}
            color={playerCore.isYouTube ? '#FF0000' : Colors.primary}
            style={{ marginRight: Spacing.xs }}
          />
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

        {/* ② Video (compact) */}
        {videoElement}

        {/* ③ Grid (editable) */}
        {currentTrack.analysisStatus === 'done' && (
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
              scrollMode={gridScrollMode}
              cellNotes={currentCellNotes}
              onSetCellNote={handleSetCellNote}
              onClearCellNote={handleClearCellNote}
              currentBeatNote={currentBeatNote}
              editMode="note"
            />
          </View>
        )}

        {/* ④ Seek */}
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
      </View>

      {/* ⑤ Bottom bar — 👥 disabled + undo */}
      <View style={styles.bottomBar}>
        <View style={[styles.bottomBarSide, { justifyContent: 'flex-end' }]}>
          <ModeSegment
            gridState={playerMode.gridSegState}
            formState={playerMode.formSegState}
            onGridTap={playerMode.onGridTap}
            onGridLongPress={playerMode.onGridLongPress}
            onFormTap={playerMode.onFormTap}
            onFormLongPress={playerMode.onFormLongPress}
            formDisabled={true}
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
          <TouchableOpacity onPress={handleUndo} disabled={!canUndo} style={{ opacity: canUndo ? 1 : 0.3 }}>
            <Ionicons name="arrow-undo" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

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
        onEditBpm={() => {}}
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
  seekSection: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
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
