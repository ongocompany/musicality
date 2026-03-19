/**
 * AnnouncementPopup — 앱 실행 시 서버 공지사항 표시
 * Supabase announcements 테이블에서 안 읽은 공지를 팝업으로 보여줌
 */

import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, FontSize } from '../../constants/theme';

const DISMISSED_KEY = 'dismissed_announcements';

interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: 'normal' | 'important' | 'critical';
  created_at: string;
}

export function AnnouncementPopup() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    checkAnnouncements();
  }, []);

  async function checkAnnouncements() {
    try {
      // Get dismissed IDs
      const raw = await AsyncStorage.getItem(DISMISSED_KEY);
      const dismissed: string[] = raw ? JSON.parse(raw) : [];

      // Fetch active announcements, newest first
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error || !data || data.length === 0) return;

      // Find first un-dismissed announcement
      const unread = data.find((a: Announcement) => !dismissed.includes(a.id));
      if (unread) {
        setAnnouncement(unread);
        setVisible(true);
      }
    } catch (e) {
      // Silently fail — announcements are non-critical
    }
  }

  async function handleDismiss() {
    if (!announcement) return;
    try {
      const raw = await AsyncStorage.getItem(DISMISSED_KEY);
      const dismissed: string[] = raw ? JSON.parse(raw) : [];
      dismissed.push(announcement.id);
      // Keep only last 50 dismissed IDs
      await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed.slice(-50)));
    } catch {}
    setVisible(false);
  }

  if (!announcement) return null;

  const priorityColor = announcement.priority === 'critical' ? Colors.error
    : announcement.priority === 'important' ? Colors.primary
    : Colors.textSecondary;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        <View style={styles.popup}>
          {/* Header */}
          <View style={styles.header}>
            <Ionicons
              name={announcement.priority === 'critical' ? 'warning' : 'megaphone'}
              size={20}
              color={priorityColor}
            />
            <Text style={[styles.title, { color: priorityColor }]} numberOfLines={2}>
              {announcement.title}
            </Text>
          </View>

          {/* Body */}
          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.body}>{announcement.body}</Text>
          </ScrollView>

          {/* Close button */}
          <TouchableOpacity style={styles.closeBtn} onPress={handleDismiss} activeOpacity={0.7}>
            <Text style={styles.closeBtnText}>확인</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  popup: {
    width: '100%',
    maxHeight: '70%',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  title: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  bodyScroll: {
    maxHeight: 300,
    marginBottom: Spacing.lg,
  },
  body: {
    color: Colors.text,
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: 12,
  },
  closeBtnText: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
