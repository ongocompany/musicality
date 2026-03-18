import { View, Pressable, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/theme';
import type { SegmentState } from '../../hooks/usePlayerMode';

const LONG_PRESS_DURATION = 500;

interface ModeSegmentProps {
  gridState: SegmentState;
  formState: SegmentState;
  onGridTap: () => void;
  onGridLongPress: () => void;
  onFormTap: () => void;
  onFormLongPress: () => void;
  formDisabled?: boolean;
}

export function ModeSegment({
  gridState, formState,
  onGridTap, onGridLongPress,
  onFormTap, onFormLongPress,
  formDisabled = false,
}: ModeSegmentProps) {
  return (
    <View style={styles.segment}>
      <Pressable
        onPress={onGridTap}
        onLongPress={onGridLongPress}
        delayLongPress={LONG_PRESS_DURATION}
        style={[styles.segBtn, segBg(gridState)]}
      >
        <Text style={styles.segIcon}>🔢</Text>
        {gridState !== 'inactive' && <View style={[styles.dot, dotBg(gridState)]} />}
      </Pressable>

      <View style={styles.divider} />

      <Pressable
        onPress={onFormTap}
        onLongPress={onFormLongPress}
        delayLongPress={LONG_PRESS_DURATION}
        disabled={formDisabled}
        style={[styles.segBtn, segBg(formState), formDisabled && styles.disabled]}
      >
        <Text style={styles.segIcon}>👥</Text>
        {formState !== 'inactive' && <View style={[styles.dot, dotBg(formState)]} />}
      </Pressable>
    </View>
  );
}

function segBg(state: SegmentState) {
  if (state === 'view') return { backgroundColor: 'rgba(3,218,198,0.2)' };
  if (state === 'edit') return { backgroundColor: 'rgba(187,134,252,0.25)' };
  return {};
}

function dotBg(state: SegmentState) {
  if (state === 'view') return { backgroundColor: Colors.accent };
  if (state === 'edit') return { backgroundColor: Colors.primary };
  return {};
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  segBtn: {
    width: 32,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  segIcon: {
    fontSize: 13,
  },
  dot: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  divider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  disabled: {
    opacity: 0.3,
  },
});
