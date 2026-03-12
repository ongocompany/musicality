'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';

interface CalendarGridProps {
  year: number;
  month: number;
  selectedDate: string | null; // 'YYYY-MM-DD'
  eventDates: Set<string>; // dates that have events
  onSelectDate: (date: string) => void;
  onChangeMonth: (year: number, month: number) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function CalendarGrid({
  year,
  month,
  selectedDate,
  eventDates,
  onSelectDate,
  onChangeMonth,
}: CalendarGridProps) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const days = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: (number | null)[] = [];

    // Leading empty cells
    for (let i = 0; i < firstDay; i++) cells.push(null);
    // Day numbers
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    return cells;
  }, [year, month]);

  const handlePrev = () => {
    if (month === 1) onChangeMonth(year - 1, 12);
    else onChangeMonth(year, month - 1);
  };

  const handleNext = () => {
    if (month === 12) onChangeMonth(year + 1, 1);
    else onChangeMonth(year, month + 1);
  };

  const handleToday = () => {
    const now = new Date();
    onChangeMonth(now.getFullYear(), now.getMonth() + 1);
    onSelectDate(todayStr);
  };

  return (
    <div className="w-full">
      {/* Month header */}
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrev}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Button>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">
            {year}년 {month}월
          </span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={handleToday}>
            오늘
          </Button>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNext}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </Button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`text-center text-[11px] font-medium py-1 ${
              i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-muted-foreground'
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="h-10" />;
          }

          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const hasEvent = eventDates.has(dateStr);
          const dayOfWeek = new Date(year, month - 1, day).getDay();

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className={`relative h-10 flex flex-col items-center justify-center rounded-lg text-sm transition-colors
                ${isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}
                ${isToday && !isSelected ? 'font-bold text-primary' : ''}
                ${dayOfWeek === 0 && !isSelected ? 'text-red-400' : ''}
                ${dayOfWeek === 6 && !isSelected ? 'text-blue-400' : ''}
              `}
            >
              {day}
              {hasEvent && (
                <span
                  className={`absolute bottom-1 w-1 h-1 rounded-full ${
                    isSelected ? 'bg-primary-foreground' : 'bg-primary'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
