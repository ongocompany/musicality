import { useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import YoutubePlayer from 'react-native-youtube-iframe';
import { Ionicons } from '@expo/vector-icons';
import { SeekBar } from '../../components/ui/SeekBar';
import { CountDisplay } from '../../components/ui/CountDisplay';
import { VideoOverlay } from '../../components/ui/VideoOverlay';
import { SectionTimeline } from '../../components/ui/SectionTimeline';
import { SpeedPopup } from '../../components/ui/SpeedPopup';
import { usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTapTempoStore } from '../../stores/tapTempoStore';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useVideoPlayer } from '../../hooks/useVideoPlayer';
import { useYouTubePlayer } from '../../hooks/useYouTubePlayer';
import { useCuePlayer } from '../../hooks/useCuePlayer';
import { analyzeTrack } from '../../services/analysisApi';
import { getPhraseCountInfo, computeReferenceIndex, findNearestBeatIndex, findCurrentBeatIndex } from '../../utils/beatCounter';
import { detectPhrasesRuleBased, detectPhrasesFromUserMark, phrasesFromBoundaries } from '../../utils/phraseDetector';
import { generateSyntheticAnalysis } from '../../utils/beatGenerator';
import { Colors, Spacing, FontSize, getPhraseColor } from '../../constants/theme';

const RATES = [0.5, 0.75, 1.0, 1.25, 1.5];

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default function PlayerScreen() {
  const {
    currentTrack,
    isPlaying,
    position,
    duration,
    playbackRate,
    setPlaybackRate,
    loopEnabled,
    loopStart,
    loopEnd,
    setLoopStart,
    setLoopEnd,
    clearLoop,
    setIsSeeking,
    setTrackAnalysisStatus,
    setTrackAnalysis,
  } = usePlayerStore();

  const isVideo = currentTrack?.mediaType === 'video';
  const isYouTube = currentTrack?.mediaType === 'youtube';
  const isVisual = isVideo || isYouTube;

  const audioPlayer = useAudioPlayer();
  const videoPlayer = useVideoPlayer();
  const youtubePlayer = useYouTubePlayer();

  const togglePlay = isYouTube
    ? youtubePlayer.togglePlay
    : isVideo
      ? videoPlayer.togglePlay
      : audioPlayer.togglePlay;
  const seekTo = isYouTube
    ? youtubePlayer.seekTo
    : isVideo
      ? videoPlayer.seekTo
      : audioPlayer.seekTo;

  useCuePlayer();

  // Tap tempo store (for YouTube inline tap tempo)
  const tapBpm = useTapTempoStore((s) => s.bpm);
  const tapPhase = useTapTempoStore((s) => s.phase);
  const recordTap = useTapTempoStore((s) => s.recordTap);
  const adjustBpm = useTapTempoStore((s) => s.adjustBpm);
  const resetTapTempo = useTapTempoStore((s) => s.reset);

  const danceStyle = useSettingsStore((s) => s.danceStyle);
  const cueEnabled = useSettingsStore((s) => s.cueEnabled);
  const toggleCue = useSettingsStore((s) => s.toggleCue);
  const lookAheadMs = useSettingsStore((s) => s.lookAheadMs);
  const downbeatOffsets = useSettingsStore((s) => s.downbeatOffsets);
  const setDownbeatOffset = useSettingsStore((s) => s.setDownbeatOffset);
  const phraseDetectionMode = useSettingsStore((s) => s.phraseDetectionMode);
  const defaultBeatsPerPhrase = useSettingsStore((s) => s.defaultBeatsPerPhrase);
  const phraseMarks = useSettingsStore((s) => s.phraseMarks);
  const setPhraseMark = useSettingsStore((s) => s.setPhraseMark);

  const onYtStateChange = useCallback((state: string) => {
    youtubePlayer.onStateChange(state);
  }, []);

  const analysis = currentTrack?.analysis;
  const offsetBeatIndex = currentTrack ? (downbeatOffsets[currentTrack.id] ?? null) : null;

  const phraseMap = useMemo(() => {
    if (!analysis || analysis.beats.length === 0) return undefined;
    const refIdx = computeReferenceIndex(analysis.beats, analysis.downbeats, offsetBeatIndex, analysis.sections);
    switch (phraseDetectionMode) {
      case 'rule-based':
        return detectPhrasesRuleBased(analysis.beats, refIdx, defaultBeatsPerPhrase, analysis.duration);
      case 'user-marked': {
        const mark = currentTrack ? phraseMarks[currentTrack.id] : undefined;
        return mark != null
          ? detectPhrasesFromUserMark(analysis.beats, refIdx, mark, analysis.duration)
          : detectPhrasesRuleBased(analysis.beats, refIdx, defaultBeatsPerPhrase, analysis.duration);
      }
      case 'server':
        return analysis.phraseBoundaries?.length
          ? phrasesFromBoundaries(analysis.beats, analysis.phraseBoundaries, analysis.duration)
          : detectPhrasesRuleBased(analysis.beats, refIdx, defaultBeatsPerPhrase, analysis.duration);
    }
  }, [analysis, offsetBeatIndex, phraseDetectionMode, defaultBeatsPerPhrase, phraseMarks, currentTrack?.id]);

  const countInfo = analysis
    ? getPhraseCountInfo(position + lookAheadMs, analysis.beats, analysis.downbeats, offsetBeatIndex, danceStyle, phraseMap)
    : null;

  const handleNowIsOne = () => {
    if (!currentTrack) return;
    if (isYouTube) {
      if (tapBpm <= 0) {
        Alert.alert('BPM 필요', '먼저 TAP 버튼으로 BPM을 설정하세요.');
        return;
      }
      const synth = generateSyntheticAnalysis(tapBpm, duration, position);
      setTrackAnalysis(currentTrack.id, synth);
      const anchorIdx = findNearestBeatIndex(position, synth.beats);
      if (anchorIdx >= 0) setDownbeatOffset(currentTrack.id, anchorIdx);
    } else {
      if (!analysis) return;
      const nearestIdx = findNearestBeatIndex(position, analysis.beats);
      if (nearestIdx >= 0) setDownbeatOffset(currentTrack.id, nearestIdx);
    }
  };

  const handleAnalyze = async () => {
    if (!currentTrack || currentTrack.analysisStatus === 'analyzing') return;
    setTrackAnalysisStatus(currentTrack.id, 'analyzing');
    try {
      const result = await analyzeTrack(currentTrack.uri, currentTrack.title, currentTrack.format);
      setTrackAnalysis(currentTrack.id, result);
    } catch (e: any) {
      setTrackAnalysisStatus(currentTrack.id, 'error');
      Alert.alert('Analysis Failed', e.message || 'Could not connect to analysis server.');
    }
  };

  // ─── Empty state ───────────────────────────────────
  if (!currentTrack) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <Ionicons name="disc-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No track selected</Text>
          <Text style={styles.emptySubtitle}>Choose a track from the Library</Text>
        </View>
      </View>
    );
  }

  // ─── Header icon based on media type ───────────────
  const headerIcon = isYouTube ? 'logo-youtube' : isVideo ? 'videocam' : 'musical-notes';
  const headerIconColor = isYouTube ? '#FF0000' : Colors.primary;

  return (
    <View style={styles.container}>
      {/* ─── Scrollable Content ─── */}
      <ScrollView style={styles.scrollArea} contentContainerStyle={isVisual ? styles.videoScrollContent : styles.audioScrollContent}>

        {/* ① Compact Header (unified for all media types) */}
        <View style={styles.compactHeader}>
          <Ionicons name={headerIcon} size={18} color={headerIconColor} style={{ marginRight: Spacing.xs }} />
          <Text style={styles.compactTitle} numberOfLines={1}>{currentTrack.title}</Text>
          <View style={styles.headerMeta}>
            {analysis && (
              <View style={styles.bpmBadge}>
                <Text style={styles.bpmText}>
                  {Math.round(analysis.bpm)} BPM
                </Text>
              </View>
            )}
            {!isYouTube && (!currentTrack.analysisStatus || currentTrack.analysisStatus === 'idle' || currentTrack.analysisStatus === 'error') && (
              <TouchableOpacity style={styles.analyzeBtn} onPress={handleAnalyze}>
                <Ionicons name="analytics-outline" size={16} color={Colors.text} />
                <Text style={styles.analyzeBtnText}>Analyze</Text>
              </TouchableOpacity>
            )}
            {currentTrack.analysisStatus === 'analyzing' && (
              <View style={styles.analyzingRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.analyzingText}>...</Text>
              </View>
            )}
          </View>
        </View>

        {/* ② YouTube Player */}
        {isYouTube && (
          <View style={styles.videoSection}>
            <View style={styles.youtubeContainer}>
              <YoutubePlayer
                ref={youtubePlayer.playerRef}
                height={240}
                videoId={currentTrack.uri}
                play={isPlaying}
                onReady={youtubePlayer.onReady}
                onChangeState={onYtStateChange}
                webViewProps={{
                  allowsInlineMediaPlayback: true,
                  injectedJavaScript: `
                    (function(){
                      document.addEventListener('message', function(e) {
                        window.dispatchEvent(new MessageEvent('message', {data: e.data}));
                      });
                    })(); true;
                  `,
                }}
              />
              {analysis && (
                <View style={styles.youtubeOverlay} pointerEvents="none">
                  <VideoOverlay countInfo={countInfo} hasAnalysis={!!analysis} />
                </View>
              )}
            </View>
          </View>
        )}

        {/* ② Video Player */}
        {isVideo && (
          <View style={styles.videoSection}>
            <View style={styles.videoContainer}>
              <Video
                ref={videoPlayer.videoRef}
                source={{ uri: currentTrack.uri }}
                style={styles.video}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={false}
                progressUpdateIntervalMillis={50}
                onPlaybackStatusUpdate={videoPlayer.onPlaybackStatusUpdate}
              />
              {currentTrack.analysisStatus === 'done' && (
                <VideoOverlay countInfo={countInfo} hasAnalysis={!!analysis} />
              )}
            </View>
            {currentTrack.analysisStatus === 'done' && (
              <TouchableOpacity style={styles.nowIsOneButton} onPress={handleNowIsOne}>
                <Ionicons name="locate-outline" size={18} color={Colors.tapAccent} />
                <Text style={styles.nowIsOneText}>지금이 1</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ③ Count Display (audio only) */}
        {!isVisual && currentTrack.analysisStatus === 'done' && (
          <View style={styles.countSection}>
            {countInfo && countInfo.totalPhrases > 0 && (
              <View style={[styles.sectionBadge, { backgroundColor: getPhraseColor(countInfo.phraseIndex) }]}>
                <Text style={styles.sectionBadgeText}>PHRASE {countInfo.phraseIndex + 1}</Text>
              </View>
            )}
            <CountDisplay countInfo={countInfo} hasAnalysis={!!analysis} />
            <View style={styles.countButtonsRow}>
              <TouchableOpacity style={styles.nowIsOneButton} onPress={handleNowIsOne}>
                <Ionicons name="locate-outline" size={18} color={Colors.tapAccent} />
                <Text style={styles.nowIsOneText}>지금이 1</Text>
              </TouchableOpacity>
              {phraseDetectionMode === 'user-marked' && analysis && (
                <TouchableOpacity
                  style={styles.markPhraseButton}
                  onPress={() => {
                    if (!currentTrack || !analysis) return;
                    const beatIdx = findCurrentBeatIndex(position, analysis.beats);
                    if (beatIdx >= 0) setPhraseMark(currentTrack.id, beatIdx);
                  }}
                >
                  <Ionicons name="flag-outline" size={18} color={Colors.accent} />
                  <Text style={styles.markPhraseText}>프레이즈 표시</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ④ YouTube Tap Tempo */}
        {isYouTube && (
          <View style={styles.tapTempoSection}>
            <Text style={styles.sectionLabel}>Tap Tempo</Text>
            <View style={styles.tapTempoRow}>
              <TouchableOpacity style={styles.tapButton} onPress={recordTap} activeOpacity={0.6}>
                <Ionicons name="hand-left" size={24} color={Colors.text} />
                <Text style={styles.tapButtonText}>TAP</Text>
              </TouchableOpacity>
              <View style={styles.tapBpmContainer}>
                <TouchableOpacity onPress={() => adjustBpm(-1)} style={styles.bpmAdjust}>
                  <Ionicons name="remove-circle-outline" size={28} color={Colors.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.tapBpmValue}>{tapBpm > 0 ? tapBpm : '--'}</Text>
                <Text style={styles.tapBpmLabel}>BPM</Text>
                <TouchableOpacity onPress={() => adjustBpm(1)} style={styles.bpmAdjust}>
                  <Ionicons name="add-circle-outline" size={28} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.nowIsOneButtonInline, tapBpm <= 0 && styles.disabledButton]}
                onPress={handleNowIsOne}
                disabled={tapBpm <= 0}
              >
                <Ionicons name="locate" size={20} color={tapBpm > 0 ? Colors.tapAccent : Colors.textMuted} />
                <Text style={[styles.nowIsOneTextInline, tapBpm <= 0 && { color: Colors.textMuted }]}>
                  지금이 1
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.tapTempoHint}>
              {!analysis
                ? 'TAP으로 BPM을 맞추고, 영상의 1박에 "지금이 1"을 누르세요'
                : `${Math.round(analysis.bpm)} BPM · 카운트 활성`}
            </Text>
          </View>
        )}

        {/* ⑤ Seek Bar + Time */}
        <View style={[styles.seekSection, isVisual && { paddingHorizontal: Spacing.lg }]}>
          <SeekBar
            value={position}
            max={duration || 1}
            onSeek={seekTo}
            onSeekStart={() => setIsSeeking(true)}
            onSeekEnd={() => setIsSeeking(false)}
            loopStart={loopStart}
            loopEnd={loopEnd}
            loopEnabled={loopEnabled}
            phrases={phraseMap?.phrases}
            durationSec={analysis?.duration}
          />
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>

          {/* ⑥ Phrase Timeline (enlarged with waveform) */}
          {phraseMap && phraseMap.phrases.length > 0 && analysis && (
            <SectionTimeline
              phrases={phraseMap.phrases}
              duration={analysis.duration}
              currentTimeMs={position}
              waveformPeaks={analysis.waveformPeaks}
            />
          )}
        </View>

        {/* ⑦ Loop A-B inline controls (only visible when loop is being set) */}
        {(loopStart !== null || loopEnd !== null) && (
          <View style={[styles.loopInlineSection, isVisual && { paddingHorizontal: Spacing.lg }]}>
            <View style={styles.loopRow}>
              <TouchableOpacity
                style={[styles.loopButton, loopStart !== null && styles.loopButtonActive]}
                onPress={() => setLoopStart(loopStart !== null ? null : position)}
              >
                <Text style={[styles.loopButtonText, loopStart !== null && styles.loopButtonTextActive]}>
                  A {loopStart !== null ? formatTime(loopStart) : '---'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.loopButton, loopEnd !== null && styles.loopButtonActive]}
                onPress={() => {
                  if (loopEnd !== null) {
                    setLoopEnd(null);
                  } else if (loopStart !== null && position > loopStart) {
                    setLoopEnd(position);
                  }
                }}
              >
                <Text style={[styles.loopButtonText, loopEnd !== null && styles.loopButtonTextActive]}>
                  B {loopEnd !== null ? formatTime(loopEnd) : '---'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.loopClear}
                onPress={clearLoop}
              >
                <Ionicons name="close-circle" size={24} color={Colors.error} />
              </TouchableOpacity>
            </View>
            {loopEnabled && (
              <Text style={styles.loopStatus}>
                Looping: {formatTime(loopStart ?? 0)} - {formatTime(loopEnd ?? 0)}
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* ─── Fixed Bottom Bar (above tab bar) ─── */}
      <View style={styles.bottomBar}>
        <SpeedPopup currentRate={playbackRate} rates={RATES} onSelectRate={setPlaybackRate} />
        <TouchableOpacity onPress={() => seekTo(Math.max(0, position - 10000))}>
          <Ionicons name="play-back" size={28} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.playButton} onPress={togglePlay}>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={32} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => seekTo(Math.min(duration, position + 10000))}>
          <Ionicons name="play-forward" size={28} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleCue} style={styles.cueToggle}>
          <Ionicons
            name={cueEnabled ? 'volume-high' : 'volume-mute'}
            size={22}
            color={cueEnabled ? Colors.accent : Colors.textMuted}
          />
        </TouchableOpacity>
        {/* Compact loop toggle — mirrors speed button on the left */}
        <TouchableOpacity
          style={styles.loopToggle}
          onPress={() => {
            if (loopStart !== null && loopEnd !== null) {
              // Already has A-B: toggle or clear
              clearLoop();
            } else if (loopStart === null) {
              // Set A point
              setLoopStart(position);
            } else {
              // A is set, set B point
              if (position > loopStart) setLoopEnd(position);
            }
          }}
          onLongPress={clearLoop}
        >
          <Ionicons
            name={loopEnabled ? 'repeat' : 'repeat-outline'}
            size={20}
            color={loopEnabled ? Colors.primary : loopStart !== null ? Colors.accent : Colors.textMuted}
          />
          {loopStart !== null && !loopEnd && (
            <View style={styles.loopDot} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollArea: { flex: 1 },
  audioScrollContent: { flexGrow: 1, padding: Spacing.lg, paddingBottom: Spacing.md },
  videoScrollContent: { paddingHorizontal: 0, paddingBottom: Spacing.md },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  emptyTitle: { color: Colors.text, fontSize: FontSize.xl, fontWeight: '600', marginTop: Spacing.md },
  emptySubtitle: { color: Colors.textSecondary, fontSize: FontSize.md },

  // ─── Compact Header (unified) ───────────────────
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  compactTitle: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '600',
    flex: 1,
    marginRight: Spacing.sm,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  bpmBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bpmText: { color: Colors.text, fontSize: FontSize.sm, fontWeight: '700' },
  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  analyzeBtnText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '600' },
  analyzingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  analyzingText: { color: Colors.primary, fontSize: FontSize.xs },

  // ─── Video ──────────────────────────────────────
  videoSection: { alignItems: 'center' },
  videoContainer: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 480,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  video: { width: '100%', height: '100%' },
  youtubeContainer: { width: '100%', backgroundColor: '#000' },
  youtubeOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 10 },

  // ─── Count Display ──────────────────────────────
  countSection: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: Spacing.xs,
  },
  sectionBadgeText: {
    color: Colors.text,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },
  nowIsOneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.tapAccent,
  },
  nowIsOneText: {
    color: Colors.tapAccent,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  countButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  markPhraseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  markPhraseText: {
    color: Colors.accent,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },

  // ─── Tap Tempo (YouTube) ────────────────────────
  tapTempoSection: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.md,
    borderRadius: 12,
  },
  tapTempoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  tapButton: {
    width: 64,
    height: 56,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tapButtonText: {
    color: Colors.text,
    fontSize: FontSize.xs,
    fontWeight: '700',
    marginTop: 2,
  },
  tapBpmContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  bpmAdjust: { padding: Spacing.xs },
  tapBpmValue: {
    color: Colors.text,
    fontSize: 32,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    minWidth: 60,
    textAlign: 'center',
  },
  tapBpmLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  nowIsOneButtonInline: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 56,
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.tapAccent,
  },
  nowIsOneTextInline: {
    color: Colors.tapAccent,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  disabledButton: {
    opacity: 0.4,
    borderColor: Colors.textMuted,
  },
  tapTempoHint: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },

  // ─── Seek / Timeline ───────────────────────────
  seekSection: { marginTop: Spacing.sm },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.xs },
  timeText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  sectionLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: Spacing.sm },

  // ─── Bottom Bar (fixed above tab bar) ──────────
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cueToggle: {
    padding: Spacing.xs,
  },

  // ─── Loop (inline A-B controls + bottom bar toggle) ──
  loopInlineSection: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  loopRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  loopButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  loopButtonActive: { borderColor: Colors.primary, backgroundColor: Colors.surfaceLight },
  loopButtonText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
  loopButtonTextActive: { color: Colors.primary },
  loopClear: { padding: Spacing.xs },
  loopStatus: { color: Colors.primary, fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.xs },
  loopToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  loopDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
});
