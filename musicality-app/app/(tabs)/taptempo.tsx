import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CountDisplay } from '../../components/ui/CountDisplay';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTapTempoStore } from '../../stores/tapTempoStore';
import { useTapTempoCue } from '../../hooks/useTapTempoCue';
import { getBeatType, CountInfo } from '../../utils/beatCounter';
import { Colors, Spacing, FontSize } from '../../constants/theme';

const DANCE_STYLE_LABELS = {
  bachata: 'BACHATA',
  'salsa-on1': 'SALSA ON1',
  'salsa-on2': 'SALSA ON2',
};

export default function TapTempoScreen() {
  const danceStyle = useSettingsStore((s) => s.danceStyle);
  const cueEnabled = useSettingsStore((s) => s.cueEnabled);
  const toggleCue = useSettingsStore((s) => s.toggleCue);

  const phase = useTapTempoStore((s) => s.phase);
  const bpm = useTapTempoStore((s) => s.bpm);
  const currentBeatIndex = useTapTempoStore((s) => s.currentBeatIndex);
  const tapTimestamps = useTapTempoStore((s) => s.tapTimestamps);
  const recordTap = useTapTempoStore((s) => s.recordTap);
  const adjustBpm = useTapTempoStore((s) => s.adjustBpm);
  const startCounting = useTapTempoStore((s) => s.startCounting);
  const stopCounting = useTapTempoStore((s) => s.stopCounting);
  const reset = useTapTempoStore((s) => s.reset);

  // Fire cue sounds via timer
  useTapTempoCue();

  // Build CountInfo for display
  const countInfo: CountInfo | null =
    phase === 'counting'
      ? {
          count: (currentBeatIndex % 8) + 1,
          beatType: getBeatType((currentBeatIndex % 8) + 1, danceStyle),
          beatIndex: currentBeatIndex,
        }
      : null;

  const showCount = phase === 'counting';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Dance style badge */}
      <View style={styles.styleBadge}>
        <Text style={styles.styleBadgeText}>
          {DANCE_STYLE_LABELS[danceStyle]}
        </Text>
      </View>

      {/* Count display */}
      <View style={styles.countSection}>
        <CountDisplay countInfo={countInfo} hasAnalysis={showCount} />
      </View>

      {/* BPM display + adjust */}
      <View style={styles.bpmSection}>
        {bpm > 0 ? (
          <>
            <Pressable
              style={styles.bpmAdjustBtn}
              onPress={() => adjustBpm(-1)}
              disabled={phase === 'idle' || phase === 'tapping'}
            >
              <Ionicons
                name="remove"
                size={22}
                color={phase === 'bpmSet' || phase === 'counting' ? Colors.text : Colors.textMuted}
              />
            </Pressable>
            <View style={styles.bpmDisplay}>
              <Text style={styles.bpmNumber}>{bpm}</Text>
              <Text style={styles.bpmLabel}>BPM</Text>
            </View>
            <Pressable
              style={styles.bpmAdjustBtn}
              onPress={() => adjustBpm(1)}
              disabled={phase === 'idle' || phase === 'tapping'}
            >
              <Ionicons
                name="add"
                size={22}
                color={phase === 'bpmSet' || phase === 'counting' ? Colors.text : Colors.textMuted}
              />
            </Pressable>
          </>
        ) : (
          <View style={styles.bpmDisplay}>
            <Text style={[styles.bpmNumber, styles.bpmMuted]}>---</Text>
            <Text style={styles.bpmLabel}>BPM</Text>
          </View>
        )}
      </View>

      {/* TAP button */}
      {(phase === 'idle' || phase === 'tapping' || phase === 'bpmSet') && (
        <View style={styles.tapSection}>
          <Pressable
            onPressIn={recordTap}
            style={({ pressed }) => [
              styles.tapButton,
              pressed && styles.tapButtonPressed,
              phase === 'bpmSet' && styles.tapButtonReady,
            ]}
          >
            <Ionicons name="hand-left" size={48} color={Colors.text} />
            <Text style={styles.tapButtonText}>TAP</Text>
          </Pressable>

          <Text style={styles.statusText}>
            {phase === 'idle' && '박자에 맞춰 탭하세요'}
            {phase === 'tapping' && `${tapTimestamps.length}회 탭 — 4회 이상 탭하세요`}
            {phase === 'bpmSet' && 'BPM 설정 완료! Start를 누르세요'}
          </Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actionSection}>
        {phase === 'bpmSet' && (
          <Pressable style={styles.startButton} onPress={startCounting}>
            <Ionicons name="play" size={24} color="#121212" />
            <Text style={styles.startButtonText}>Start</Text>
          </Pressable>
        )}

        {phase === 'counting' && (
          <View style={styles.actionRow}>
            <Pressable style={styles.stopButton} onPress={stopCounting}>
              <Ionicons name="pause" size={22} color={Colors.text} />
              <Text style={styles.stopButtonText}>Stop</Text>
            </Pressable>

            {/* Re-sync: tap to reset beat 1 */}
            <Pressable
              onPressIn={() => {
                // Reset startTime to now, treating this tap as beat 1
                const store = useTapTempoStore.getState();
                store.startCounting(); // resets startTime + beatIndex
              }}
              style={({ pressed }) => [
                styles.resyncButton,
                pressed && styles.resyncButtonPressed,
              ]}
            >
              <Ionicons name="locate-outline" size={20} color={Colors.tapAccent} />
              <Text style={styles.resyncText}>지금이 1</Text>
            </Pressable>
          </View>
        )}

        {phase !== 'idle' && (
          <Pressable style={styles.resetButton} onPress={reset}>
            <Ionicons name="refresh" size={18} color={Colors.error} />
            <Text style={styles.resetButtonText}>Reset</Text>
          </Pressable>
        )}
      </View>

      {/* Cue toggle */}
      <View style={styles.cueSection}>
        <Pressable style={styles.cueToggle} onPress={toggleCue}>
          <Ionicons
            name={cueEnabled ? 'volume-high' : 'volume-mute'}
            size={24}
            color={cueEnabled ? Colors.accent : Colors.textMuted}
          />
          <Text style={[styles.cueText, { color: cueEnabled ? Colors.accent : Colors.textMuted }]}>
            {cueEnabled ? 'Sound ON' : 'Sound OFF'}
          </Text>
        </Pressable>
      </View>

      {/* Keyboard shortcuts hint */}
      <View style={styles.hintSection}>
        <Text style={styles.hintText}>
          외부 앱(YouTube 등)에서 음악을 재생하고{'\n'}
          이 화면에서 박자에 맞춰 탭하세요
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    alignItems: 'center',
  },

  // Dance style badge
  styleBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: Spacing.md,
  },
  styleBadgeText: {
    color: '#121212',
    fontSize: FontSize.sm,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Count display
  countSection: {
    marginTop: Spacing.lg,
    minHeight: 120,
    justifyContent: 'center',
  },

  // BPM display
  bpmSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  bpmDisplay: {
    alignItems: 'center',
  },
  bpmNumber: {
    fontSize: 48,
    fontWeight: '800',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  bpmMuted: {
    color: Colors.textMuted,
  },
  bpmLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
    letterSpacing: 1,
  },
  bpmAdjustBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // TAP button
  tapSection: {
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  tapButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.surface,
    borderWidth: 3,
    borderColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  tapButtonPressed: {
    backgroundColor: Colors.primary,
    transform: [{ scale: 0.95 }],
  },
  tapButtonReady: {
    borderColor: Colors.accent,
  },
  tapButtonText: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: 2,
  },
  statusText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    textAlign: 'center',
  },

  // Action buttons
  actionSection: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    gap: Spacing.md,
    width: '100%',
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 12,
  },
  startButtonText: {
    color: '#121212',
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stopButtonText: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  resyncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.tapAccent,
  },
  resyncButtonPressed: {
    backgroundColor: Colors.tapAccent,
  },
  resyncText: {
    color: Colors.tapAccent,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  resetButtonText: {
    color: Colors.error,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },

  // Cue toggle
  cueSection: {
    marginTop: Spacing.xl,
  },
  cueToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
  },
  cueText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },

  // Hint
  hintSection: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  hintText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
