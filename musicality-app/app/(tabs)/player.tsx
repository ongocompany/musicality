import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { SeekBar } from '../../components/ui/SeekBar';
import { CountDisplay } from '../../components/ui/CountDisplay';
import { VideoOverlay } from '../../components/ui/VideoOverlay';
import { SectionTimeline } from '../../components/ui/SectionTimeline';
import { usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useVideoPlayer } from '../../hooks/useVideoPlayer';
import { useCuePlayer } from '../../hooks/useCuePlayer';
import { analyzeTrack } from '../../services/analysisApi';
import { getCountInfo, findNearestBeatIndex, findCurrentSection } from '../../utils/beatCounter';
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
  const audioPlayer = useAudioPlayer();
  const videoPlayer = useVideoPlayer();

  // Use the appropriate player based on media type
  const togglePlay = isVideo ? videoPlayer.togglePlay : audioPlayer.togglePlay;
  const seekTo = isVideo ? videoPlayer.seekTo : audioPlayer.seekTo;

  useCuePlayer(); // fires cue sounds on each beat

  const danceStyle = useSettingsStore((s) => s.danceStyle);
  const cueEnabled = useSettingsStore((s) => s.cueEnabled);
  const toggleCue = useSettingsStore((s) => s.toggleCue);
  const lookAheadMs = useSettingsStore((s) => s.lookAheadMs);
  const downbeatOffsets = useSettingsStore((s) => s.downbeatOffsets);
  const setDownbeatOffset = useSettingsStore((s) => s.setDownbeatOffset);

  // Compute current count from position + analysis data
  // Apply lookAheadMs to compensate for audio output latency
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
    if (!currentTrack || !analysis) return;
    const nearestIdx = findNearestBeatIndex(position, analysis.beats);
    if (nearestIdx >= 0) {
      setDownbeatOffset(currentTrack.id, nearestIdx);
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
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Track Info */}
      <View style={styles.trackHeader}>
        <Ionicons name={isVideo ? 'videocam' : 'musical-notes'} size={40} color={Colors.primary} />
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
        {/* Analyze Button */}
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

      {/* Video Player (video tracks only) */}
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
                sectionLabel={currentSection?.label?.toUpperCase()}
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
      {!isVideo && currentTrack.analysisStatus === 'done' && (
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

      {/* Seek Bar */}
      <View style={styles.seekSection}>
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
        {/* Section Timeline */}
        {analysis?.sections && analysis.sections.length > 0 && (
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
      <View style={styles.speedSection}>
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
      <View style={styles.loopSection}>
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
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  emptyTitle: { color: Colors.text, fontSize: FontSize.xl, fontWeight: '600', marginTop: Spacing.md },
  emptySubtitle: { color: Colors.textSecondary, fontSize: FontSize.md },

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
    marginTop: Spacing.lg,
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
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
