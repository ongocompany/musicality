/**
 * Calendar API — Direct Supabase queries for events.
 * Personal events use RLS; crew events use RPC functions.
 */
import { supabase } from '../lib/supabase';
import { mapProfile, fetchProfilesByIds } from './communityApi';
import type { CalendarEvent, CreateEventInput } from '../types/calendar';

// ─── Helpers ────────────────────────────────────────────

function mapCalendarEvent(row: any): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    eventDate: row.event_date,
    eventTime: row.event_time ?? null,
    location: row.location ?? '',
    description: row.description ?? '',
    crewId: row.crew_id ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    crewName: row.crews?.name ?? undefined,
    saved: row.saved ?? undefined,
  };
}

/** Attach profiles to events via batch fetch (avoids FK join issues) */
async function attachProfilesToEvents(events: CalendarEvent[]): Promise<CalendarEvent[]> {
  if (events.length === 0) return events;
  const userIds = [...new Set(events.map((e) => e.createdBy).filter(Boolean))];
  const profileMap = await fetchProfilesByIds(userIds);
  return events.map((e) => ({ ...e, profile: profileMap.get(e.createdBy) }));
}

/** Get first/last day for a month range query */
function monthRange(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { from, to };
}

// ─── Personal Events ────────────────────────────────────

export async function fetchPersonalEvents(year: number, month: number): Promise<CalendarEvent[]> {
  const { from, to } = monthRange(year, month);
  const { data, error } = await supabase
    .from('events')
    .select('*, crews:crew_id(name)')
    .is('crew_id', null)
    .gte('event_date', from)
    .lt('event_date', to)
    .order('event_date', { ascending: true })
    .order('event_time', { ascending: true });

  if (error) throw new Error(error.message);
  const events = (data ?? []).map(mapCalendarEvent);
  return attachProfilesToEvents(events);
}

export async function createPersonalEvent(input: CreateEventInput): Promise<CalendarEvent> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('events')
    .insert({
      title: input.title,
      event_date: input.eventDate,
      event_time: input.eventTime || null,
      location: input.location || '',
      description: input.description || '',
      crew_id: null,
      created_by: user.id,
    })
    .select('*, crews:crew_id(name)')
    .single();

  if (error) throw new Error(error.message);
  const event = mapCalendarEvent(data);
  const profileMap = await fetchProfilesByIds([event.createdBy]);
  event.profile = profileMap.get(event.createdBy);
  return event;
}

export async function updatePersonalEvent(eventId: string, input: Partial<CreateEventInput>): Promise<void> {
  const updates: any = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) updates.title = input.title;
  if (input.eventDate !== undefined) updates.event_date = input.eventDate;
  if (input.eventTime !== undefined) updates.event_time = input.eventTime || null;
  if (input.location !== undefined) updates.location = input.location;
  if (input.description !== undefined) updates.description = input.description;

  const { error } = await supabase
    .from('events')
    .update(updates)
    .eq('id', eventId);

  if (error) throw new Error(error.message);
}

export async function deletePersonalEvent(eventId: string): Promise<void> {
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId);

  if (error) throw new Error(error.message);
}

// ─── Crew Events ────────────────────────────────────────

export async function fetchCrewEvents(crewId: string, year: number, month: number): Promise<CalendarEvent[]> {
  const { from, to } = monthRange(year, month);
  const { data, error } = await supabase
    .from('events')
    .select('*, crews:crew_id(name)')
    .eq('crew_id', crewId)
    .gte('event_date', from)
    .lt('event_date', to)
    .order('event_date', { ascending: true })
    .order('event_time', { ascending: true });

  if (error) throw new Error(error.message);
  const events = (data ?? []).map(mapCalendarEvent);
  return attachProfilesToEvents(events);
}

export async function createCrewEvent(crewId: string, input: CreateEventInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_crew_event', {
    p_crew_id: crewId,
    p_title: input.title,
    p_event_date: input.eventDate,
    p_event_time: input.eventTime || null,
    p_location: input.location || '',
    p_description: input.description || '',
  });

  if (error) throw new Error(error.message);
  return data as string;
}

export async function updateCrewEvent(eventId: string, input: Partial<CreateEventInput>): Promise<void> {
  const { error } = await supabase.rpc('update_crew_event', {
    p_event_id: eventId,
    p_title: input.title ?? null,
    p_event_date: input.eventDate ?? null,
    p_event_time: input.eventTime ?? null,
    p_location: input.location ?? null,
    p_description: input.description ?? null,
  });

  if (error) throw new Error(error.message);
}

export async function deleteCrewEvent(eventId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_crew_event', {
    p_event_id: eventId,
  });

  if (error) throw new Error(error.message);
}

// ─── Saved Events ───────────────────────────────────────

export async function fetchSavedEvents(year: number, month: number): Promise<CalendarEvent[]> {
  const { from, to } = monthRange(year, month);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('user_saved_events')
    .select('event_id, events:event_id(*, crews:crew_id(name))')
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  if (!data) return [];

  const events = data
    .map((row: any) => {
      if (!row.events) return null;
      const evt = mapCalendarEvent(row.events);
      evt.saved = true;
      return evt;
    })
    .filter((e: CalendarEvent | null): e is CalendarEvent =>
      e !== null && e.eventDate >= from && e.eventDate < to
    );

  return attachProfilesToEvents(events);
}

export async function fetchSavedEventIds(): Promise<Set<string>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data, error } = await supabase
    .from('user_saved_events')
    .select('event_id')
    .eq('user_id', user.id);

  if (error) return new Set();
  return new Set((data ?? []).map((r: any) => r.event_id));
}

export async function toggleSaveEvent(eventId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_save_event', {
    p_event_id: eventId,
  });

  if (error) throw new Error(error.message);
  return data as boolean;
}
