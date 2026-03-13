import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, Spacing } from '../../constants/theme';

interface Props {
  content: string;
}

export default function SystemMessage({ content }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.pill}>
        <Text style={styles.text}>{content}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  pill: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  text: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
});
