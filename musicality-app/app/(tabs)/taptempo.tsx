import { useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Animated, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
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
  const setManualBpm = useTapTempoStore((s) => s.setManualBpm);
  const startCounting = useTapTempoStore((s) => s.startCounting);
  const stopCounting = useTapTempoStore((s) => s.stopCounting);
  const reset = useTapTempoStore((s) => s.reset);

  // BPM input modal state
  const [showBpmModal, setShowBpmModal] = useState(false);
  const [bpmInput, setBpmInput] = useState('');
  const [bpmError, setBpmError] = useState('');

  const openBpmModal = () => {
    setBpmInput(bpm > 0 ? String(bpm) : '');
    setBpmError('');
    setShowBpmModal(true);
  };

  const confirmBpmInput = () => {
    const value = parseInt(bpmInput, 10);
    if (isNaN(value) || value < 60 || value > 220) {
      setBpmError('60 ~ 220 범위로 입력하세요');
      return;
    }
    setManualBpm(value);
    setShowBpmModal(false);
  };

  // Fire cue sounds via timer
  useTapTempoCue();

  // Tap button pulse animation
  const tapScale = useRef(new Animated.Value(1)).current;
  const tapRing = useRef(new Animated.Value(0)).current;

  const fireTapPulse = () => {
    tapScale.setValue(0.9);
    tapRing.setValue(0);
    Animated.parallel([
      Animated.spring(tapScale, {
        toValue: 1,
        friction: 3,
        tension: 200,
        useNativeDriver: true,
      }),
      Animated.timing(tapRing, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Beat pulse animation (fires on each count change during counting)
  const beatScale = useRef(new Animated.Value(1)).current;
  const prevBeatIndex = useRef(-1);

  useEffect(() => {
    if (phase !== 'counting' || currentBeatIndex === prevBeatIndex.current) return;
    prevBeatIndex.current = currentBeatIndex;

    beatScale.setValue(1.15);
    Animated.spring(beatScale, {
      toValue: 1,
      friction: 4,
      tension: 300,
      useNativeDriver: true,
    }).start();
  }, [currentBeatIndex, phase]);

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
      <Animated.View style={[styles.countSection, { transform: [{ scale: beatScale }] }]}>
        <CountDisplay countInfo={countInfo} hasAnalysis={showCount} />
      </Animated.View>

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
            <Pressable onPress={openBpmModal} style={styles.bpmDisplay}>
              <Text style={styles.bpmNumber}>{bpm}</Text>
              <Text style={styles.bpmLabel}>BPM</Text>
            </Pressable>
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
          <Pressable onPress={openBpmModal} style={styles.bpmDisplay}>
            <Text style={[styles.bpmNumber, styles.bpmMuted]}>---</Text>
            <Text style={styles.bpmLabel}>BPM</Text>
            <Text style={styles.bpmHint}>탭하여 직접 입력</Text>
          </Pressable>
        )}
      </View>

      {/* TAP button — visible in all phases except idle-with-no-action */}
      {(phase === 'idle' || phase === 'tapping' || phase === 'bpmSet' || phase === 'counting') && (
        <View style={styles.tapSection}>
          <View style={styles.tapButtonWrapper}>
            {/* Expanding ring */}
            <Animated.View
              style={[
                styles.tapRing,
                phase === 'bpmSet' && { borderColor: Colors.accent },
                phase === 'counting' && { borderColor: Colors.tapAccent, width: 100, height: 100, borderRadius: 50 },
                {
                  opacity: tapRing.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                  transform: [{ scale: tapRing.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
                },
              ]}
            />
            <Animated.View style={{ transform: [{ scale: tapScale }] }}>
              <Pressable
                onPressIn={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  fireTapPulse();
                  recordTap();
                }}
                style={({ pressed }) => [
                  styles.tapButton,
                  phase === 'counting' && styles.tapButtonSmall,
                  pressed && styles.tapButtonPressed,
                  phase === 'bpmSet' && styles.tapButtonReady,
                  phase === 'counting' && styles.tapButtonCounting,
                ]}
              >
                <Ionicons name="hand-left" size={phase === 'counting' ? 32 : 48} color={Colors.text} />
                <Text style={[styles.tapButtonText, phase === 'counting' && styles.tapButtonTextSmall]}>TAP</Text>
              </Pressable>
            </Animated.View>
          </View>

          <Text style={styles.statusText}>
            {phase === 'idle' && '박자에 맞춰 탭하세요'}
            {phase === 'tapping' && `${tapTimestamps.length}회 탭 — 4회 이상 탭하세요`}
            {phase === 'bpmSet' && 'BPM 설정 완료! Start를 누르세요'}
            {phase === 'counting' && '탭하면 BPM 조정 + 1박 재동기화'}
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
          <Pressable style={styles.stopButton} onPress={stopCounting}>
            <Ionicons name="pause" size={22} color={Colors.text} />
            <Text style={styles.stopButtonText}>Stop</Text>
          </Pressable>
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

      {/* BPM manual input modal */}
      <Modal
        visible={showBpmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBpmModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowBpmModal(false)}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>BPM 입력</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="number-pad"
              value={bpmInput}
              onChangeText={(t) => { setBpmInput(t); setBpmError(''); }}
              onSubmitEditing={confirmBpmInput}
              placeholder="예: 130"
              placeholderTextColor={Colors.textMuted}
              autoFocus
              maxLength={3}
              selectTextOnFocus
            />
            <Text style={styles.modalRange}>60 ~ 220 범위</Text>
            {bpmError !== '' && <Text style={styles.modalError}>{bpmError}</Text>}
            <View style={styles.modalButtons}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setShowBpmModal(false)}>
                <Text style={styles.modalCancelText}>취소</Text>
              </Pressable>
              <Pressable style={styles.modalConfirmBtn} onPress={confirmBpmInput}>
                <Text style={styles.modalConfirmText}>확인</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  bpmHint: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    marginTop: 2,
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
  tapButtonWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  tapRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 3,
    borderColor: Colors.primary,
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
  tapButtonSmall: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  tapButtonCounting: {
    borderColor: Colors.tapAccent,
    borderWidth: 2,
  },
  tapButtonTextSmall: {
    fontSize: FontSize.sm,
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

  // BPM input modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.xl,
    width: 260,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  modalInput: {
    width: '100%',
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 32,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  modalRange: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  modalError: {
    fontSize: FontSize.sm,
    color: Colors.error,
    marginTop: Spacing.xs,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: FontSize.md,
    color: '#121212',
    fontWeight: '700',
  },
});
