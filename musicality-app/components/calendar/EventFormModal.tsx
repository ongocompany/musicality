import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Spacing } from '../../constants/theme';
import type { CalendarEvent, CreateEventInput } from '../../types/calendar';

interface Props {
  visible: boolean;
  initialDate?: string;
  editEvent?: CalendarEvent | null;
  onSubmit: (input: CreateEventInput) => Promise<void>;
  onClose: () => void;
}

export default function EventFormModal({
  visible,
  initialDate,
  editEvent,
  onSubmit,
  onClose,
}: Props) {
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isEdit = !!editEvent;

  useEffect(() => {
    if (visible) {
      if (editEvent) {
        setTitle(editEvent.title);
        setEventDate(editEvent.eventDate);
        setEventTime(editEvent.eventTime?.substring(0, 5) ?? '');
        setLocation(editEvent.location);
        setDescription(editEvent.description);
      } else {
        setTitle('');
        setEventDate(initialDate || todayStr());
        setEventTime('');
        setLocation('');
        setDescription('');
      }
    }
  }, [visible, editEvent, initialDate]);

  const handleSubmit = async () => {
    if (!title.trim() || !eventDate) return;
    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        eventDate,
        eventTime: eventTime || undefined,
        location: location.trim() || undefined,
        description: description.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      console.error('EventFormModal submit error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = title.trim().length > 0 && eventDate.length === 10;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
              <Text style={styles.cancelText}>취소</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {isEdit ? '일정 수정' : '새 일정'}
            </Text>
            <TouchableOpacity
              onPress={handleSubmit}
              style={styles.headerBtn}
              disabled={!canSubmit || submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Text style={[styles.saveText, !canSubmit && { opacity: 0.4 }]}>
                  {isEdit ? '수정' : '저장'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
            {/* Title */}
            <View style={styles.field}>
              <Text style={styles.label}>제목 *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="일정 제목"
                placeholderTextColor={Colors.textMuted}
                maxLength={100}
                autoFocus
              />
            </View>

            {/* Date */}
            <View style={styles.field}>
              <Text style={styles.label}>날짜 *</Text>
              <TextInput
                style={styles.input}
                value={eventDate}
                onChangeText={(t) => setEventDate(formatDateInput(t))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                maxLength={10}
              />
            </View>

            {/* Time */}
            <View style={styles.field}>
              <Text style={styles.label}>시간</Text>
              <TextInput
                style={styles.input}
                value={eventTime}
                onChangeText={(t) => setEventTime(formatTimeInput(t))}
                placeholder="HH:MM (선택)"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                maxLength={5}
              />
            </View>

            {/* Location */}
            <View style={styles.field}>
              <Text style={styles.label}>장소</Text>
              <TextInput
                style={styles.input}
                value={location}
                onChangeText={setLocation}
                placeholder="장소 (선택)"
                placeholderTextColor={Colors.textMuted}
                maxLength={200}
              />
            </View>

            {/* Description */}
            <View style={styles.field}>
              <Text style={styles.label}>설명</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="설명 (선택)"
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
                maxLength={500}
                textAlignVertical="top"
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Helpers ────────────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Auto-format date input: 2024 → 2024- → 2024-03 → 2024-03- → 2024-03-12 */
function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/** Auto-format time input: 14 → 14: → 14:30 */
function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerBtn: {
    minWidth: 50,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  cancelText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  saveText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.primary,
  },
  form: {
    padding: Spacing.md,
  },
  field: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    fontSize: FontSize.md,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textArea: {
    minHeight: 72,
    paddingTop: 10,
  },
});
