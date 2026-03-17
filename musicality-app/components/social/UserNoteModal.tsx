import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors, FontSize, Spacing } from '../../constants/theme';

interface Props {
  visible: boolean;
  initialContent?: string;
  targetName: string;
  onSave: (content: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

export default function UserNoteModal({
  visible,
  initialContent = '',
  targetName,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setContent(initialContent);
  }, [visible, initialContent]);

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await onSave(content.trim());
      onClose();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message ?? t('profile.noteSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(t('profile.deleteNote'), t('profile.deleteNoteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await onDelete();
            onClose();
          } catch (e: any) {
            Alert.alert(t('common.error'), e.message ?? t('profile.noteDeleteFailed'));
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{t('profile.noteTitle', { name: targetName })}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>{t('profile.noteHint')}</Text>

          <TextInput
            style={styles.input}
            value={content}
            onChangeText={setContent}
            placeholder={t('profile.notePlaceholder')}
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={500}
            autoFocus
          />

          <Text style={styles.charCount}>{content.length}/500</Text>

          {/* Buttons */}
          <View style={styles.buttonRow}>
            {initialContent ? (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={handleDelete}
                disabled={saving}
              >
                <Ionicons name="trash-outline" size={18} color={Colors.error} />
                <Text style={styles.deleteBtnText}>{t('common.delete')}</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
            <TouchableOpacity
              style={[styles.saveBtn, (!content.trim() || saving) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!content.trim() || saving}
            >
              <Text style={styles.saveBtnText}>{saving ? t('profile.saving') : t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  hint: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: Spacing.md,
    color: Colors.text,
    fontSize: FontSize.md,
    minHeight: 120,
    maxHeight: 200,
    textAlignVertical: 'top',
  },
  charCount: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textAlign: 'right',
    marginTop: Spacing.xs,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  deleteBtnText: {
    color: Colors.error,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
