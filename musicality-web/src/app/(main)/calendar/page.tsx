'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import {
  fetchPersonalEvents, fetchSavedEvents, createPersonalEvent, updatePersonalEvent, deletePersonalEvent,
} from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { CalendarEvent, CreateEventInput } from '@/lib/types';
import { CalendarGrid } from '@/components/calendar/calendar-grid';
import { EventCard } from '@/components/calendar/event-card';
import { EventFormDialog } from '@/components/calendar/event-form-dialog';

export default function CalendarPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user, loading: authLoading } = useAuth();

  const calNow = new Date();
  const [calYear, setCalYear] = useState(calNow.getFullYear());
  const [calMonth, setCalMonth] = useState(calNow.getMonth() + 1);
  const [calSelectedDate, setCalSelectedDate] = useState<string | null>(null);
  const [myEvents, setMyEvents] = useState<CalendarEvent[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  const loadCalendar = useCallback(async (y: number, m: number) => {
    setCalLoading(true);
    try {
      const [personalResult, savedResult] = await Promise.allSettled([
        fetchPersonalEvents(supabase, y, m),
        fetchSavedEvents(supabase, y, m),
      ]);
      const personal = personalResult.status === 'fulfilled' ? personalResult.value : [];
      const saved = savedResult.status === 'fulfilled' ? savedResult.value : [];
      setMyEvents([...personal, ...saved].sort((a, b) => {
        if (a.eventDate !== b.eventDate) return a.eventDate.localeCompare(b.eventDate);
        return (a.eventTime ?? '').localeCompare(b.eventTime ?? '');
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setCalLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (user) {
      loadCalendar(calYear, calMonth);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/calendar');
    }
  }, [authLoading, user, router]);

  if (authLoading) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <Button size="sm" variant="outline" onClick={() => { setEditingEvent(null); setShowEventForm(true); }}>
          + 일정 추가
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <CalendarGrid
            year={calYear}
            month={calMonth}
            selectedDate={calSelectedDate}
            eventDates={new Set(myEvents.map((e) => e.eventDate))}
            onSelectDate={setCalSelectedDate}
            onChangeMonth={(y, m) => {
              setCalYear(y);
              setCalMonth(m);
              loadCalendar(y, m);
            }}
          />

          {calSelectedDate && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">
                {(() => {
                  const d = new Date(calSelectedDate + 'T00:00:00');
                  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
                  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})`;
                })()}
              </h4>
              {myEvents
                .filter((e) => e.eventDate === calSelectedDate)
                .map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    canEdit={!event.crewId}
                    isSaved={!!event.crewId}
                    onEdit={(ev) => { setEditingEvent(ev); setShowEventForm(true); }}
                    onDelete={async (eventId) => {
                      if (!confirm('이 일정을 삭제하시겠습니까?')) return;
                      try {
                        await deletePersonalEvent(supabase, eventId);
                        toast.success('일정 삭제됨');
                        loadCalendar(calYear, calMonth);
                      } catch (err: unknown) {
                        toast.error(err instanceof Error ? err.message : '삭제 실패');
                      }
                    }}
                  />
                ))}
              {myEvents.filter((e) => e.eventDate === calSelectedDate).length === 0 && (
                <p className="text-center py-4 text-muted-foreground text-xs">일정 없음</p>
              )}
            </div>
          )}

          {calLoading && (
            <div className="flex items-center justify-center py-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
        </CardContent>
      </Card>

      {showEventForm && (
        <EventFormDialog
          initialDate={calSelectedDate ?? undefined}
          editEvent={editingEvent}
          onSubmit={async (input: CreateEventInput) => {
            if (editingEvent) {
              await updatePersonalEvent(supabase, editingEvent.id, input);
              toast.success('일정 수정됨');
            } else {
              await createPersonalEvent(supabase, input);
              toast.success('일정 추가됨');
            }
            setShowEventForm(false);
            setEditingEvent(null);
            loadCalendar(calYear, calMonth);
          }}
          onClose={() => { setShowEventForm(false); setEditingEvent(null); }}
        />
      )}
    </div>
  );
}
