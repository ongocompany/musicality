/**
 * AudioViewScreen — 🔢 탭 (Grid View)
 * 카운트(大) + PhraseGrid(읽기전용) + 시크바 + 컨트롤바
 * 가장 기본적인 플레이어 화면
 */

import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ImageBackground } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { usePlayerCore } from '../../hooks/usePlayerCore';
import { usePlayerMode } from '../../hooks/usePlayerMode';
import { useFocusMode } from '../../hooks/useFocusMode';
import { useSettingsStore } from '../../stores/settingsStore';

import { PhraseGrid } from '../../components/ui/PhraseGrid';
import { SectionTimeline } from '../../components/ui/SectionTimeline';
import { SpeedPopup } from '../../components/ui/SpeedPopup';
import { ModeSegment } from '../../components/player/ModeSegment';
import { MarqueeTitle } from '../../components/player/MarqueeTitle';
import { CountDisplay } from '../../components/player/CountDisplay';

import { Colors, Spacing, getPhraseColor, blendColors } from '../../constants/theme';

const RATES = [0.5, 0.75, 1.0, 1.25, 1.5];

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

interface AudioViewScreenProps {
  playerCore: ReturnType<typeof usePlayerCore>;
  playerMode: ReturnType<typeof usePlayerMode>;
}

export function AudioViewScreen({ playerCore, playerMode }: AudioViewScreenProps) {
  const { t } = useTranslation();
  const {
    currentTrack, isPlaying, position, duration, playbackRate,
    analysis, countInfo, phraseMap, effectiveBeats,
    currentBpm, loopStart, loopEnd, loopEnabled,
    gridScrollMode, currentCellNotes, currentBeatNote,
    togglePlay, seekTo, setPlaybackRate, setIsSeeking,
    handleGridTapBeat, handleSeekAndPlay, handleSeekOnly,
    handleSkipBack, handleSkipForward,
    handleSetLoopPoint, clearLoop, setLoopStart, setLoopEnd,
    handleReArrangePhrase, handleSplitPhraseHere, handleMergeWithPrevious,
  } = playerCore;

  const autoHideMs = useSettingsStore((s) => s.autoHideMs);
  const showAlbumArt = useSettingsStore((s) => s.showAlbumArt);
  const hasDoneAnalysis = currentTrack?.analysisStatus === 'done';
  const focus = useFocusMode(hasDoneAnalysis && autoHideMs > 0 ? autoHideMs : undefined);

  if (!currentTrack) return null;

  const countColor = countInfo && countInfo.totalPhrases > 0
    ? (countInfo.isTransitionHint
      ? blendColors(getPhraseColor(countInfo.phraseIndex), getPhraseColor(countInfo.phraseIndex + 1), 0.5)
      : getPhraseColor(countInfo.phraseIndex))
    : Colors.textMuted;

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

        {/* ② Count (large) — album art behind count */}
        {currentTrack.analysisStatus === 'done' && (
          <View style={styles.countSection}>
            {showAlbumArt && currentTrack.thumbnailUri ? (
              <View style={styles.countWithArt}>
                <Image
                  source={{ uri: currentTrack.thumbnailUri }}
                  style={styles.countArt}
                  resizeMode="contain"
                />
                <CountDisplay
                  count={countInfo?.count ?? '--'}
                  color={countColor}
                  size="large"
                />
              </View>
            ) : (
              <CountDisplay
                count={countInfo?.count ?? '--'}
                color={countColor}
                size="large"
              />
            )}

            {/* PhraseGrid (read-only) */}
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

        {/* ③ Seek + Controls — hidden in focus mode */}
        {!focus.focusMode && (
          <View style={styles.seekSection}>
            {phraseMap && phraseMap.phrases.length > 0 && analysis && (
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
            {(!phraseMap || !analysis) && duration > 0 && (
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatTime(position)}</Text>
                <Text style={styles.timeText}>{formatTime(duration)}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* ④ Bottom control bar */}
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
  countWithArt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  countArt: {
    width: 120,
    height: 120,
    borderRadius: 16,
  },
  seekSection: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  timeText: { fontSize: 10, color: Colors.textMuted, fontVariant: ['tabular-nums'] },
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
