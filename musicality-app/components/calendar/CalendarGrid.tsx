import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Spacing } from '../../constants/theme';

interface Props {
  year: number;
  month: number;
  selectedDate: string | null;
  eventDates: Set<string>;
  onSelectDate: (date: string) => void;
  onChangeMonth: (year: number, month: number) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function CalendarGrid({
  year,
  month,
  selectedDate,
  eventDates,
  onSelectDate,
  onChangeMonth,
}: Props) {
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const cells = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const result: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) result.push(null);
    for (let d = 1; d <= daysInMonth; d++) result.push(d);
    return result;
  }, [year, month]);

  const prevMonth = () => {
    const m = month === 1 ? 12 : month - 1;
    const y = month === 1 ? year - 1 : year;
    onChangeMonth(y, m);
  };

  const nextMonth = () => {
    const m = month === 12 ? 1 : month + 1;
    const y = month === 12 ? year + 1 : year;
    onChangeMonth(y, m);
  };

  const goToday = () => {
    const d = new Date();
    onChangeMonth(d.getFullYear(), d.getMonth() + 1);
    onSelectDate(today);
  };

  return (
    <View style={styles.container}>
      {/* Header: month navigation */}
      <View style={styles.header}>
        <TouchableOpacity onPress={prevMonth} style={styles.navButton}>
          <Ionicons name="chevron-back" size={20} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={goToday} style={styles.monthLabel}>
          <Text style={styles.monthText}>
            {year}년 {month}월
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={nextMonth} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={20} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {/* Weekday header */}
      <View style={styles.weekRow}>
        {WEEKDAYS.map((day, i) => (
          <View key={day} style={styles.weekCell}>
            <Text
              style={[
                styles.weekText,
                i === 0 && { color: Colors.error },
                i === 6 && { color: '#4A90D9' },
              ]}
            >
              {day}
            </Text>
          </View>
        ))}
      </View>

      {/* Day cells */}
      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (day === null) {
            return <View key={`empty-${i}`} style={styles.dayCell} />;
          }
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          const hasEvent = eventDates.has(dateStr);
          const dayOfWeek = (new Date(year, month - 1, day).getDay());

          return (
            <TouchableOpacity
              key={dateStr}
              style={[
                styles.dayCell,
                isSelected && styles.dayCellSelected,
                isToday && !isSelected && styles.dayCellToday,
              ]}
              onPress={() => onSelectDate(dateStr)}
              activeOpacity={0.6}
            >
              <Text
                style={[
                  styles.dayText,
                  dayOfWeek === 0 && { color: Colors.error },
                  dayOfWeek === 6 && { color: '#4A90D9' },
                  isSelected && styles.dayTextSelected,
                ]}
              >
                {day}
              </Text>
              {hasEvent && (
                <View style={[styles.dot, isSelected && styles.dotSelected]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  navButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  monthText: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  weekRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 6,
  },
  weekCell: {
    flex: 1,
    alignItems: 'center',
  },
  weekText: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    color: Colors.textMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.285%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellSelected: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 20,
  },
  dayText: {
    fontSize: FontSize.md,
    color: Colors.text,
  },
  dayTextSelected: {
    color: '#FFF',
    fontWeight: '700',
  },
  dot: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  dotSelected: {
    backgroundColor: '#FFF',
  },
});
