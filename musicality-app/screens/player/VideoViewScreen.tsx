/**
 * VideoViewScreen — 🔢 탭 (비디오/유튜브)
 * 비디오 플레이어 + 카운트 오버레이 + PhraseGrid(읽기전용)
 * 👥 세그먼트 비활성 (비디오는 Formation 미지원)
 */

import { View, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { usePlayerCore } from '../../hooks/usePlayerCore';
import { usePlayerMode } from '../../hooks/usePlayerMode';
import { useFocusMode } from '../../hooks/useFocusMode';

import { PhraseGrid } from '../../components/ui/PhraseGrid';
import { SectionTimeline } from '../../components/ui/SectionTimeline';
import { SpeedPopup } from '../../components/ui/SpeedPopup';
import { ModeSegment } from '../../components/player/ModeSegment';
import { MarqueeTitle } from '../../components/player/MarqueeTitle';

import { Colors, Spacing } from '../../constants/theme';

const RATES = [0.5, 0.75, 1.0, 1.25, 1.5];

interface VideoViewScreenProps {
  playerCore: ReturnType<typeof usePlayerCore>;
  playerMode: ReturnType<typeof usePlayerMode>;
  videoElement: React.ReactNode; // Video/YouTube component rendered by parent
}

export function VideoViewScreen({ playerCore, playerMode, videoElement }: VideoViewScreenProps) {
  const focus = useFocusMode();

  const {
    currentTrack, isPlaying, position, duration, playbackRate,
    analysis, countInfo, phraseMap, effectiveBeats, currentBpm,
    loopStart, loopEnd, loopEnabled, gridScrollMode,
    cueEnabled, currentCellNotes, currentBeatNote,
    togglePlay, seekTo, setPlaybackRate, toggleCue,
    handleGridTapBeat, handleSeekAndPlay, handleSeekOnly,
    handleSkipBack, handleSkipForward,
    handleSetLoopPoint, clearLoop,
    handleReArrangePhrase, handleSplitPhraseHere, handleMergeWithPrevious,
  } = playerCore;

  if (!currentTrack) return null;

  return (
    <View style={styles.container}>
      <View style={styles.scrollArea}>
        {/* ① Header */}
        <View style={styles.header}>
          <Ionicons
            name={playerCore.isYouTube ? 'logo-youtube' : 'videocam'}
            size={18}
            color={playerCore.isYouTube ? '#FF0000' : Colors.primary}
            style={{ marginRight: Spacing.xs }}
          />
          <MarqueeTitle text={currentTrack.title} style={styles.headerTitle} />
        </View>

        {/* ② Video */}
        {videoElement}

        {/* ③ Grid (read-only) */}
        {currentTrack.analysisStatus === 'done' && (
          <View style={{ flex: 1, width: '100%' }} {...focus.focusSwipeResponder.panHandlers}>
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
              currentBeatNote={currentBeatNote}
              editMode="none"
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

      {/* ⑤ Bottom bar — 👥 disabled */}
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
        </View>
      </View>
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
