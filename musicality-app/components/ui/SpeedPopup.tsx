import { View, Text, TouchableOpacity, Modal, StyleSheet, Pressable } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize } from '../../constants/theme';

interface SpeedPopupProps {
  currentRate: number;
  rates: number[];
  onSelectRate: (rate: number) => void;
}

/**
 * Compact speed selector button that opens a popup modal.
 * Shows the current playback rate; tapping opens a vertical list of rate options.
 */
export function SpeedPopup({ currentRate, rates, onSelectRate }: SpeedPopupProps) {
  const [visible, setVisible] = useState(false);

  const handleSelect = (rate: number) => {
    onSelectRate(rate);
    setVisible(false);
  };

  return (
    <>
      {/* Trigger button */}
      <TouchableOpacity style={styles.trigger} onPress={() => setVisible(true)}>
        <Ionicons name="speedometer-outline" size={14} color={Colors.textSecondary} />
        <Text style={[
          styles.triggerText,
          currentRate !== 1.0 && styles.triggerTextActive,
        ]}>
          {currentRate}x
        </Text>
      </TouchableOpacity>

      {/* Popup modal */}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <View style={styles.popupContainer}>
            <View style={styles.popup}>
              <Text style={styles.popupTitle}>Speed</Text>
              {rates.map((rate) => (
                <TouchableOpacity
                  key={rate}
                  style={[styles.option, currentRate === rate && styles.optionActive]}
                  onPress={() => handleSelect(rate)}
                >
                  <Text style={[
                    styles.optionText,
                    currentRate === rate && styles.optionTextActive,
                  ]}>
                    {rate}x
                  </Text>
                  {currentRate === rate && (
                    <Ionicons name="checkmark" size={18} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
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
    justifyContent: 'flex-end',
    paddingBottom: 140, // position above bottom bar + tab bar
  },
  popupContainer: {
    alignItems: 'center',
  },
  popup: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    minWidth: 180,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  popupTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: 8,
  },
  optionActive: {
    backgroundColor: Colors.surfaceLight,
  },
  optionText: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '600',
  },
  optionTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
});
