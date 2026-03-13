import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Spacing } from '../../constants/theme';

interface Props {
  onSend: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function MessageInput({ onSend, placeholder = '메시지 입력...', disabled }: Props) {
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0 && !disabled;

  const handleSend = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        multiline
        maxLength={2000}
        editable={!disabled}
      />
      <TouchableOpacity
        style={[styles.sendBtn, canSend && styles.sendBtnActive]}
        onPress={handleSend}
        disabled={!canSend}
      >
        <Ionicons
          name="send"
          size={20}
          color={canSend ? '#FFFFFF' : Colors.textMuted}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 20,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text,
    fontSize: FontSize.md,
    maxHeight: 100,
    marginRight: Spacing.sm,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive: {
    backgroundColor: Colors.primary,
  },
});
