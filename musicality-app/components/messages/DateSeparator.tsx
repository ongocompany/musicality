import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, Spacing } from '../../constants/theme';
import { formatDateSeparator } from '../../utils/timeFormat';

interface Props {
  dateStr: string;
}

export default function DateSeparator({ dateStr }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.pill}>
        <Text style={styles.text}>{formatDateSeparator(dateStr)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  pill: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  text: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
  },
});
