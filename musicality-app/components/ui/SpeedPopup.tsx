import { View, Text, TouchableOpacity, Modal, StyleSheet, Pressable, PanResponder } from 'react-native';
import { useState, useRef, useMemo } from 'react';
import { useTutorialStore } from '../../stores/tutorialStore';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize } from '../../constants/theme';

interface SpeedPopupProps {
  currentRate: number;
  rates: number[];
  onSelectRate: (rate: number) => void;
}

const MIN_RATE = 0.25;
const MAX_RATE = 2.0;
const STEP = 0.01;
const DIAL_HEIGHT = 240;

/**
 * Speed selector with dial-style vertical slider + preset buttons.
 * Drag up/down for fine control (0.05x steps), tap presets for quick jumps.
 */
export function SpeedPopup({ currentRate, rates, onSelectRate }: SpeedPopupProps) {
  const [visible, setVisible] = useState(false);
  const [dialRate, setDialRate] = useState(currentRate);
  const dialRateRef = useRef(currentRate);
  const startRateRef = useRef(currentRate);
  const onSelectRateRef = useRef(onSelectRate);
  onSelectRateRef.current = onSelectRate;

  const updateDialRate = (rate: number) => {
    dialRateRef.current = rate;
    setDialRate(rate);
  };

  const openDial = () => {
    updateDialRate(currentRate);
    setVisible(true);
  };

  const handlePreset = (rate: number) => {
    updateDialRate(rate);
    onSelectRate(rate);
  };

  const handleClose = () => {
    onSelectRate(dialRateRef.current);
    setVisible(false);
  };

  const dialResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRateRef.current = dialRateRef.current;
      },
      onPanResponderMove: (_, gs) => {
        const delta = -gs.dy / DIAL_HEIGHT * (MAX_RATE - MIN_RATE);
        const newRate = Math.round((startRateRef.current + delta) / STEP) * STEP;
        const clamped = Math.max(MIN_RATE, Math.min(MAX_RATE, newRate));
        dialRateRef.current = clamped;
        setDialRate(clamped);
      },
      onPanResponderRelease: () => {
        onSelectRateRef.current(dialRateRef.current);
      },
    })
  ).current;

  // Dial fill percentage
  const fillPct = ((dialRate - MIN_RATE) / (MAX_RATE - MIN_RATE)) * 100;

  return (
    <>
      {/* Trigger button */}
      <TouchableOpacity
        style={styles.trigger}
        onPress={openDial}
        onLayout={(e) => {
          e.target.measureInWindow((x: number, y: number, w: number, h: number) => {
            if (w > 0 && h > 0) {
              useTutorialStore.getState().setElementRect('speedTrigger', { x, y, width: w, height: h });
            }
          });
        }}
      >
        <Ionicons name="speedometer-outline" size={14} color={Colors.textSecondary} />
        <Text style={[
          styles.triggerText,
          currentRate !== 1.0 && styles.triggerTextActive,
        ]}>
          {currentRate.toFixed(2).replace(/\.?0+$/, '')}x
        </Text>
      </TouchableOpacity>

      {/* Dial modal */}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
      >
        <Pressable style={styles.backdrop} onPress={handleClose}>
          <Pressable style={styles.popupContainer} onPress={() => {}}>
            <View style={styles.popup}>
              {/* Current rate display */}
              <Text style={styles.dialRateText}>{dialRate.toFixed(2)}x</Text>

              <View style={styles.dialRow}>
                {/* Preset buttons */}
                <View style={styles.presetColumn}>
                  {rates.map((rate) => (
                    <TouchableOpacity
                      key={rate}
                      style={[styles.presetBtn, Math.abs(dialRate - rate) < 0.01 && styles.presetBtnActive]}
                      onPress={() => handlePreset(rate)}
                    >
                      <Text style={[
                        styles.presetText,
                        Math.abs(dialRate - rate) < 0.01 && styles.presetTextActive,
                      ]}>
                        {rate}x
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Vertical dial slider */}
                <View style={styles.dialContainer} {...dialResponder.panHandlers} collapsable={false}>
                  <Text style={styles.dialLabel}>2.0</Text>
                  <View style={styles.dialTrack}>
                    <View style={[styles.dialFill, { height: `${fillPct}%` }]} />
                    <View style={[styles.dialThumb, { bottom: `${fillPct}%` }]} />
                  </View>
                  <Text style={styles.dialLabel}>0.25</Text>
                </View>
              </View>

              {/* Fine adjust buttons */}
              <View style={styles.fineRow}>
                <TouchableOpacity
                  style={styles.fineBtn}
                  onPress={() => {
                    const r = Math.max(MIN_RATE, Math.round((dialRateRef.current - STEP) / STEP) * STEP);
                    updateDialRate(r);
                    onSelectRate(r);
                  }}
                >
                  <Ionicons name="remove" size={20} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.fineLabel}>0.01x</Text>
                <TouchableOpacity
                  style={styles.fineBtn}
                  onPress={() => {
                    const r = Math.min(MAX_RATE, Math.round((dialRateRef.current + STEP) / STEP) * STEP);
                    updateDialRate(r);
                    onSelectRate(r);
                  }}
                >
                  <Ionicons name="add" size={20} color={Colors.text} />
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 52,
    justifyContent: 'center',
  },
  triggerText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  triggerTextActive: {
    color: Colors.primary,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupContainer: {
    alignItems: 'center',
  },
  popup: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    minWidth: 220,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  dialRateText: {
    color: Colors.primary,
    fontSize: 32,
    fontWeight: '800',
    marginBottom: Spacing.md,
  },
  dialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  presetColumn: {
    gap: 4,
  },
  presetBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  presetBtnActive: {
    backgroundColor: Colors.surfaceLight,
  },
  presetText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  presetTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  dialContainer: {
    alignItems: 'center',
    height: DIAL_HEIGHT,
    justifyContent: 'space-between',
    width: 50,
  },
  dialLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  dialTrack: {
    width: 6,
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 3,
    marginVertical: 6,
    position: 'relative',
    overflow: 'visible',
  },
  dialFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  dialThumb: {
    position: 'absolute',
    left: -9,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    marginBottom: -12,
  },
  fineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  fineBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fineLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});
