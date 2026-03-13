import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Spacing } from '../../constants/theme';
import type { CalendarEvent } from '../../types/calendar';

interface Props {
  event: CalendarEvent;
  canEdit?: boolean;
  isSaved?: boolean;
  onEdit?: (event: CalendarEvent) => void;
  onDelete?: (eventId: string) => void;
  onToggleSave?: (eventId: string) => void;
}

export default function EventCard({
  event,
  canEdit,
  isSaved,
  onEdit,
  onDelete,
  onToggleSave,
}: Props) {
  const timeStr = event.eventTime
    ? event.eventTime.substring(0, 5) // 'HH:MM'
    : null;

  const dateObj = new Date(event.eventDate + 'T00:00:00');
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const monthDay = `${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일 (${dayNames[dateObj.getDay()]})`;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          {event.crewId && (
            <View style={styles.crewBadge}>
              <Text style={styles.crewBadgeText}>
                {event.crewName || 'Crew'}
              </Text>
            </View>
          )}
          <Text style={styles.title} numberOfLines={1}>
            {event.title}
          </Text>
        </View>

        <View style={styles.actions}>
          {event.crewId && onToggleSave && (
            <TouchableOpacity onPress={() => onToggleSave(event.id)} style={styles.actionBtn}>
              <Ionicons
                name={isSaved ? 'star' : 'star-outline'}
                size={18}
                color={isSaved ? Colors.warning : Colors.textMuted}
              />
            </TouchableOpacity>
          )}
          {canEdit && onEdit && (
            <TouchableOpacity onPress={() => onEdit(event)} style={styles.actionBtn}>
              <Ionicons name="create-outline" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
          {canEdit && onDelete && (
            <TouchableOpacity onPress={() => onDelete(event.id)} style={styles.actionBtn}>
              <Ionicons name="trash-outline" size={18} color={Colors.error} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.meta}>
        <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
        <Text style={styles.metaText}>
          {monthDay}
          {timeStr ? ` · ${timeStr}` : ''}
        </Text>
      </View>

      {event.location ? (
        <View style={styles.meta}>
          <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.metaText} numberOfLines={1}>{event.location}</Text>
        </View>
      ) : null}

      {event.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {event.description}
        </Text>
      ) : null}

      {event.profile && (
        <Text style={styles.creator}>
          {event.profile.displayName}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
  },
  crewBadge: {
    backgroundColor: Colors.primary + '20',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  crewBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
  },
  actions: {
    flexDirection: 'row',
    gap: 2,
  },
  actionBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  description: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  creator: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
