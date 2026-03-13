import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';
import { useCalendarStore } from '../../stores/calendarStore';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import CalendarGrid from '../../components/calendar/CalendarGrid';
import EventCard from '../../components/calendar/EventCard';
import EventFormModal from '../../components/calendar/EventFormModal';
import type { CalendarEvent, CreateEventInput } from '../../types/calendar';

export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const {
    personalEvents,
    savedEvents,
    currentYear,
    currentMonth,
    loading,
    setMonth,
    fetchPersonalEvents,
    fetchSavedEvents,
    fetchSavedEventIds,
    savedEventIds,
    createPersonalEvent,
    updatePersonalEvent,
    deletePersonalEvent,
    toggleSaveEvent,
  } = useCalendarStore();

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Load events when month changes
  useEffect(() => {
    fetchPersonalEvents();
    fetchSavedEvents();
    fetchSavedEventIds();
  }, [currentYear, currentMonth]);

  // Merge personal + saved events, sorted
  const allEvents = useMemo(() => {
    const merged = [...personalEvents, ...savedEvents];
    merged.sort((a, b) => {
      if (a.eventDate !== b.eventDate) return a.eventDate.localeCompare(b.eventDate);
      if (a.eventTime && b.eventTime) return a.eventTime.localeCompare(b.eventTime);
      return 0;
    });
    return merged;
  }, [personalEvents, savedEvents]);

  // Events for selected date
  const dateEvents = useMemo(() => {
    if (!selectedDate) return allEvents;
    return allEvents.filter((e) => e.eventDate === selectedDate);
  }, [allEvents, selectedDate]);

  // Dates that have events (for CalendarGrid dots)
  const eventDates = useMemo(() => {
    const set = new Set<string>();
    for (const e of allEvents) set.add(e.eventDate);
    return set;
  }, [allEvents]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchPersonalEvents(), fetchSavedEvents(), fetchSavedEventIds()]);
    setRefreshing(false);
  }, []);

  const handleChangeMonth = (year: number, month: number) => {
    setMonth(year, month);
    setSelectedDate(null);
  };

  const handleCreateEvent = async (input: CreateEventInput) => {
    await createPersonalEvent(input);
  };

  const handleUpdateEvent = async (input: CreateEventInput) => {
    if (!editingEvent) return;
    await updatePersonalEvent(editingEvent.id, input);
    setEditingEvent(null);
  };

  const handleDeleteEvent = (eventId: string) => {
    Alert.alert('일정 삭제', '이 일정을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePersonalEvent(eventId);
          } catch (err: any) {
            Alert.alert('오류', err.message);
          }
        },
      },
    ]);
  };

  const handleToggleSave = async (eventId: string) => {
    try {
      const saved = await toggleSaveEvent(eventId);
      if (!saved) {
        // Removed from saved — re-fetch saved events
        fetchSavedEvents();
      }
    } catch (err: any) {
      Alert.alert('오류', err.message);
    }
  };

  const handleEdit = (event: CalendarEvent) => {
    setEditingEvent(event);
    setShowForm(true);
  };

  const renderEvent = ({ item }: { item: CalendarEvent }) => {
    const isPersonal = !item.crewId;
    const canEdit = isPersonal && item.createdBy === user?.id;

    return (
      <EventCard
        event={item}
        canEdit={canEdit}
        isSaved={savedEventIds.has(item.id)}
        onEdit={canEdit ? handleEdit : undefined}
        onDelete={canEdit ? handleDeleteEvent : undefined}
        onToggleSave={item.crewId ? handleToggleSave : undefined}
      />
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Custom Header */}
      <View style={[styles.customHeader, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>캘린더</Text>
        <TouchableOpacity
          onPress={() => {
            setEditingEvent(null);
            setShowForm(true);
          }}
          style={styles.headerButton}
        >
          <Ionicons name="add" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.container}>
        {/* Calendar Grid */}
        <CalendarGrid
          year={currentYear}
          month={currentMonth}
          selectedDate={selectedDate}
          eventDates={eventDates}
          onSelectDate={setSelectedDate}
          onChangeMonth={handleChangeMonth}
        />

        {/* Divider */}
        <View style={styles.divider} />

        {/* Date label */}
        <View style={styles.dateLabel}>
          <Text style={styles.dateLabelText}>
            {selectedDate
              ? formatDateLabel(selectedDate)
              : `${currentMonth}월 일정`}
          </Text>
          <Text style={styles.eventCount}>
            {dateEvents.length}건
          </Text>
        </View>

        {/* Event list */}
        <FlatList
          data={dateEvents}
          keyExtractor={(item) => item.id}
          renderItem={renderEvent}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>일정이 없습니다</Text>
            </View>
          }
        />
      </View>

      {/* Event Form Modal */}
      <EventFormModal
        visible={showForm}
        initialDate={selectedDate ?? undefined}
        editEvent={editingEvent}
        onSubmit={editingEvent ? handleUpdateEvent : handleCreateEvent}
        onClose={() => {
          setShowForm(false);
          setEditingEvent(null);
        }}
      />
    </>
  );
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${dayNames[d.getDay()]})`;
}

const styles = StyleSheet.create({
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 4,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  dateLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  dateLabelText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  eventCount: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
    gap: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: 8,
  },
  emptyText: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
  },
});
