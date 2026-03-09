import { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import YoutubePlayer from 'react-native-youtube-iframe';
import { Ionicons } from '@expo/vector-icons';
import { SeekBar } from '../../components/ui/SeekBar';
import { CountDisplay } from '../../components/ui/CountDisplay';
import { VideoOverlay } from '../../components/ui/VideoOverlay';
import { SectionTimeline } from '../../components/ui/SectionTimeline';
import { usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTapTempoStore } from '../../stores/tapTempoStore';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useVideoPlayer } from '../../hooks/useVideoPlayer';
import { useYouTubePlayer } from '../../hooks/useYouTubePlayer';
import { useCuePlayer } from '../../hooks/useCuePlayer';
import { analyzeTrack } from '../../services/analysisApi';
import { getCountInfo, findNearestBeatIndex, findCurrentSection } from '../../utils/beatCounter';
import { generateSyntheticAnalysis } from '../../utils/beatGenerator';
import { Colors, SectionColors, Spacing, FontSize } from '../../constants/theme';

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
  const isVisual = isVideo || isYouTube; // any visual media (compact header, no section timeline)

  const audioPlayer = useAudioPlayer();
  const videoPlayer = useVideoPlayer();
  const youtubePlayer = useYouTubePlayer();

  // Use the appropriate player based on media type
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

  useCuePlayer(); // fires cue sounds on each beat

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

  // YouTube state change handler
  const onYtStateChange = useCallback((state: string) => {
    youtubePlayer.onStateChange(state);
  }, []);

  // Compute current count from position + analysis data
  const analysis = currentTrack?.analysis;
  const offsetBeatIndex = currentTrack ? (downbeatOffsets[currentTrack.id] ?? null) : null;
  const countInfo = analysis
    ? getCountInfo(position + lookAheadMs, analysis.beats, analysis.downbeats, offsetBeatIndex, danceStyle, analysis.sections)
    : null;

  // Current section for badge display
  const currentSection = analysis?.sections
    ? findCurrentSection(position, analysis.sections)
    : null;

  const handleNowIsOne = () => {
    if (!currentTrack) return;

    if (isYouTube) {
      // For YouTube: generate synthetic beats from tap tempo BPM anchored at current position
      if (tapBpm <= 0) {
        Alert.alert('BPM 필요', '먼저 TAP 버튼으로 BPM을 설정하세요.');
        return;
      }
      const synth = generateSyntheticAnalysis(tapBpm, duration, position);
      setTrackAnalysis(currentTrack.id, synth);
      // Set downbeat offset to the anchor beat
      const anchorIdx = findNearestBeatIndex(position, synth.beats);
      if (anchorIdx >= 0) {
        setDownbeatOffset(currentTrack.id, anchorIdx);
      }
    } else {
      // For audio/video: snap to nearest analyzed beat
      if (!analysis) return;
      const nearestIdx = findNearestBeatIndex(position, analysis.beats);
      if (nearestIdx >= 0) {
        setDownbeatOffset(currentTrack.id, nearestIdx);
      }
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={isVisual ? styles.videoContentContainer : styles.contentContainer}>
      {/* Track Info — compact for visual media, full for audio */}
      {isVisual ? (
        <View style={styles.videoHeader}>
          <Ionicons
            name={isYouTube ? 'logo-youtube' : 'videocam'}
            size={18}
            color={isYouTube ? '#FF0000' : Colors.primary}
            style={{ marginRight: Spacing.xs }}
          />
          <Text style={styles.videoHeaderTitle} numberOfLines={1}>{currentTrack.title}</Text>
          <View style={styles.videoHeaderMeta}>
            {currentTrack.analysis && (
              <View style={styles.bpmBadge}>
                <Text style={styles.bpmText}>{Math.round(currentTrack.analysis.bpm)} BPM</Text>
              </View>
            )}
            {/* Show Analyze button for video (not YouTube — YouTube uses tap tempo) */}
            {!isYouTube && (!currentTrack.analysisStatus || currentTrack.analysisStatus === 'idle' || currentTrack.analysisStatus === 'error') && (
              <TouchableOpacity style={styles.analyzeBtn} onPress={handleAnalyze}>
                <Ionicons name="analytics-outline" size={16} color={Colors.text} />
                <Text style={styles.analyzeBtnText}>Analyze</Text>
              </TouchableOpacity>
            )}
            {currentTrack.analysisStatus === 'analyzing' && (
              <View style={styles.analyzingRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.analyzingText}>Analyzing...</Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.trackHeader}>
          <Ionicons name="musical-notes" size={40} color={Colors.primary} />
          <Text style={styles.trackTitle} numberOfLines={2}>{currentTrack.title}</Text>
          <View style={styles.trackMetaRow}>
            <Text style={styles.trackFormat}>{currentTrack.format.toUpperCase()}</Text>
            {currentTrack.analysis && (
              <View style={styles.bpmBadge}>
                <Text style={styles.bpmText}>{Math.round(currentTrack.analysis.bpm)} BPM</Text>
              </View>
            )}
            {currentTrack.analysis && (
              <Text style={styles.confidenceText}>
                {Math.round(currentTrack.analysis.confidence * 100)}%
              </Text>
            )}
          </View>
          {(!currentTrack.analysisStatus || currentTrack.analysisStatus === 'idle' || currentTrack.analysisStatus === 'error') && (
            <TouchableOpacity style={styles.analyzeBtn} onPress={handleAnalyze}>
              <Ionicons name="analytics-outline" size={18} color={Colors.text} />
              <Text style={styles.analyzeBtnText}>Analyze Beats</Text>
            </TouchableOpacity>
          )}
          {currentTrack.analysisStatus === 'analyzing' && (
            <View style={styles.analyzingRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.analyzingText}>Analyzing...</Text>
            </View>
          )}
        </View>
      )}

      {/* YouTube Player */}
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
                // Bridge: forward document messages to window (RN WebView may dispatch on document)
                injectedJavaScript: `
                  (function(){
                    document.addEventListener('message', function(e) {
                      window.dispatchEvent(new MessageEvent('message', {data: e.data}));
                    });
                  })(); true;
                `,
              }}
            />
            {/* Count overlay on top of YouTube */}
            {analysis && (
              <View style={styles.youtubeOverlay} pointerEvents="none">
                <VideoOverlay
                  countInfo={countInfo}
                  hasAnalysis={!!analysis}
                />
              </View>
            )}
          </View>
        </View>
      )}

      {/* Video Player — full width, edge-to-edge */}
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
              <VideoOverlay
                countInfo={countInfo}
                hasAnalysis={!!analysis}
              />
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

      {/* Count Display (audio tracks only) */}
      {!isVisual && currentTrack.analysisStatus === 'done' && (
        <View style={styles.countSection}>
          {currentSection && (
            <View style={[styles.sectionBadge, { backgroundColor: SectionColors[currentSection.label] || Colors.textMuted }]}>
              <Text style={styles.sectionBadgeText}>{currentSection.label.toUpperCase()}</Text>
            </View>
          )}
          <CountDisplay countInfo={countInfo} hasAnalysis={!!analysis} />
          <TouchableOpacity style={styles.nowIsOneButton} onPress={handleNowIsOne}>
            <Ionicons name="locate-outline" size={18} color={Colors.tapAccent} />
            <Text style={styles.nowIsOneText}>지금이 1</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* YouTube Tap Tempo Section */}
      {isYouTube && (
        <View style={styles.tapTempoSection}>
          <Text style={styles.sectionLabel}>Tap Tempo</Text>
          <View style={styles.tapTempoRow}>
            {/* TAP button */}
            <TouchableOpacity
              style={styles.tapButton}
              onPress={recordTap}
              activeOpacity={0.6}
            >
              <Ionicons name="hand-left" size={24} color={Colors.text} />
              <Text style={styles.tapButtonText}>TAP</Text>
            </TouchableOpacity>

            {/* BPM display + adjust */}
            <View style={styles.tapBpmContainer}>
              <TouchableOpacity onPress={() => adjustBpm(-1)} style={styles.bpmAdjust}>
                <Ionicons name="remove-circle-outline" size={28} color={Colors.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.tapBpmValue}>
                {tapBpm > 0 ? tapBpm : '--'}
              </Text>
              <Text style={styles.tapBpmLabel}>BPM</Text>
              <TouchableOpacity onPress={() => adjustBpm(1)} style={styles.bpmAdjust}>
                <Ionicons name="add-circle-outline" size={28} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* "지금이 1" — anchor + generate beats */}
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

      {/* Seek Bar */}
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
          sections={analysis?.sections}
          durationSec={analysis?.duration}
        />
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>
        {/* Section Timeline (audio only — video/youtube sections are unreliable) */}
        {!isVisual && analysis?.sections && analysis.sections.length > 0 && (
          <SectionTimeline
            sections={analysis.sections}
            duration={analysis.duration}
            currentTimeMs={position}
          />
        )}
      </View>

      {/* Transport Controls */}
      <View style={styles.transport}>
        <TouchableOpacity onPress={() => seekTo(Math.max(0, position - 10000))}>
          <Ionicons name="play-back" size={32} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.playButton} onPress={togglePlay}>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={36} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => seekTo(Math.min(duration, position + 10000))}>
          <Ionicons name="play-forward" size={32} color={Colors.text} />
        </TouchableOpacity>
        {/* Cue toggle */}
        <TouchableOpacity onPress={toggleCue} style={styles.cueToggle}>
          <Ionicons
            name={cueEnabled ? 'volume-high' : 'volume-mute'}
            size={24}
            color={cueEnabled ? Colors.accent : Colors.textMuted}
          />
        </TouchableOpacity>
      </View>

      {/* Speed Control */}
      <View style={[styles.speedSection, isVisual && { paddingHorizontal: Spacing.lg }]}>
        <Text style={styles.sectionLabel}>Speed</Text>
        <View style={styles.speedRow}>
          {RATES.map((rate) => (
            <TouchableOpacity
              key={rate}
              style={[styles.speedButton, playbackRate === rate && styles.speedButtonActive]}
              onPress={() => setPlaybackRate(rate)}
            >
              <Text style={[styles.speedText, playbackRate === rate && styles.speedTextActive]}>
                {rate}x
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Loop Controls (A-B Repeat) */}
      <View style={[styles.loopSection, isVisual && { paddingHorizontal: Spacing.lg }]}>
        <Text style={styles.sectionLabel}>Loop (A-B)</Text>
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
            disabled={loopStart === null && loopEnd === null}
          >
            <Ionicons
              name="close-circle"
              size={28}
              color={loopStart !== null || loopEnd !== null ? Colors.error : Colors.textMuted}
            />
          </TouchableOpacity>
        </View>
        {loopEnabled && (
          <Text style={styles.loopStatus}>
            Looping: {formatTime(loopStart ?? 0)} - {formatTime(loopEnd ?? 0)}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  contentContainer: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  videoContentContainer: { paddingHorizontal: 0, paddingBottom: Spacing.xxl },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  emptyTitle: { color: Colors.text, fontSize: FontSize.xl, fontWeight: '600', marginTop: Spacing.md },
  emptySubtitle: { color: Colors.textSecondary, fontSize: FontSize.md },

  videoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  videoHeaderTitle: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '600',
    flex: 1,
    marginRight: Spacing.sm,
  },
  videoHeaderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  trackHeader: { alignItems: 'center', marginTop: Spacing.xl, gap: Spacing.sm },
  trackTitle: { color: Colors.text, fontSize: FontSize.xxl, fontWeight: '700', textAlign: 'center' },
  trackMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  trackFormat: { color: Colors.textSecondary, fontSize: FontSize.sm },
  bpmBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bpmText: { color: Colors.text, fontSize: FontSize.sm, fontWeight: '700' },
  confidenceText: { color: Colors.textMuted, fontSize: FontSize.xs },
  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  analyzeBtnText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600' },
  analyzingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  analyzingText: { color: Colors.primary, fontSize: FontSize.sm },

  videoSection: {
    alignItems: 'center',
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 480,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  youtubeContainer: {
    width: '100%',
    backgroundColor: '#000',
  },
  youtubeOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },

  countSection: {
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
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
    marginTop: Spacing.sm,
  },
  nowIsOneText: {
    color: Colors.tapAccent,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },

  // ─── Tap Tempo (YouTube inline) ────────────────────
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
  bpmAdjust: {
    padding: Spacing.xs,
  },
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

  seekSection: { marginTop: Spacing.xl },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.xs },
  timeText: { color: Colors.textSecondary, fontSize: FontSize.sm },

  transport: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xl,
    marginTop: Spacing.lg,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cueToggle: {
    position: 'absolute',
    right: 0,
    padding: Spacing.sm,
  },

  speedSection: { marginTop: Spacing.xl },
  sectionLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: Spacing.sm },
  speedRow: { flexDirection: 'row', gap: Spacing.sm },
  speedButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  speedButtonActive: { backgroundColor: Colors.primary },
  speedText: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: '600' },
  speedTextActive: { color: Colors.text },

  loopSection: { marginTop: Spacing.xl },
  loopRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  loopButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  loopButtonActive: { borderColor: Colors.primary, backgroundColor: Colors.surfaceLight },
  loopButtonText: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: '600' },
  loopButtonTextActive: { color: Colors.primary },
  loopClear: { padding: Spacing.xs },
  loopStatus: { color: Colors.primary, fontSize: FontSize.sm, textAlign: 'center', marginTop: Spacing.sm },
});
