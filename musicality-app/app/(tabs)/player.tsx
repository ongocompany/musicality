import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SeekBar } from '../../components/ui/SeekBar';
import { usePlayerStore } from '../../stores/playerStore';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { Colors, Spacing, FontSize } from '../../constants/theme';

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
  } = usePlayerStore();
  const { togglePlay, seekTo } = useAudioPlayer();

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
    <View style={styles.container}>
      {/* Track Info */}
      <View style={styles.trackHeader}>
        <Ionicons name="musical-notes" size={40} color={Colors.primary} />
        <Text style={styles.trackTitle} numberOfLines={2}>{currentTrack.title}</Text>
        <Text style={styles.trackFormat}>{currentTrack.format.toUpperCase()}</Text>
      </View>

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
        />
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.lg },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  emptyTitle: { color: Colors.text, fontSize: FontSize.xl, fontWeight: '600', marginTop: Spacing.md },
  emptySubtitle: { color: Colors.textSecondary, fontSize: FontSize.md },

  trackHeader: { alignItems: 'center', marginTop: Spacing.xl, gap: Spacing.sm },
  trackTitle: { color: Colors.text, fontSize: FontSize.xxl, fontWeight: '700', textAlign: 'center' },
  trackFormat: { color: Colors.textSecondary, fontSize: FontSize.sm },

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
