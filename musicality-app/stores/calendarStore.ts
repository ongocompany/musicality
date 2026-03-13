/**
 * Calendar Store — Personal + crew event state management.
 */
import { create } from 'zustand';
import type { CalendarEvent, CreateEventInput } from '../types/calendar';
import * as api from '../services/calendarApi';

interface CalendarState {
  // State
  personalEvents: CalendarEvent[];
  savedEvents: CalendarEvent[];
  crewEvents: CalendarEvent[];
  savedEventIds: Set<string>;
  currentYear: number;
  currentMonth: number;
  loading: boolean;

  // Actions
  setMonth: (year: number, month: number) => void;
  fetchPersonalEvents: () => Promise<void>;
  fetchSavedEvents: () => Promise<void>;
  fetchCrewEvents: (crewId: string) => Promise<void>;
  fetchSavedEventIds: () => Promise<void>;

  createPersonalEvent: (input: CreateEventInput) => Promise<void>;
  updatePersonalEvent: (eventId: string, input: Partial<CreateEventInput>) => Promise<void>;
  deletePersonalEvent: (eventId: string) => Promise<void>;

  createCrewEvent: (crewId: string, input: CreateEventInput) => Promise<void>;
  updateCrewEvent: (eventId: string, input: Partial<CreateEventInput>) => Promise<void>;
  deleteCrewEvent: (eventId: string) => Promise<void>;

  toggleSaveEvent: (eventId: string) => Promise<boolean>;
}

const now = new Date();

export const useCalendarStore = create<CalendarState>((set, get) => ({
  personalEvents: [],
  savedEvents: [],
  crewEvents: [],
  savedEventIds: new Set(),
  currentYear: now.getFullYear(),
  currentMonth: now.getMonth() + 1,
  loading: false,

  setMonth: (year, month) => {
    set({ currentYear: year, currentMonth: month });
  },

  fetchPersonalEvents: async () => {
    const { currentYear, currentMonth } = get();
    try {
      set({ loading: true });
      const events = await api.fetchPersonalEvents(currentYear, currentMonth);
      set({ personalEvents: events });
    } catch (err) {
      console.error('[CalendarStore] fetchPersonalEvents:', err);
    } finally {
      set({ loading: false });
    }
  },

  fetchSavedEvents: async () => {
    const { currentYear, currentMonth } = get();
    try {
      const events = await api.fetchSavedEvents(currentYear, currentMonth);
      set({ savedEvents: events });
    } catch (err) {
      console.error('[CalendarStore] fetchSavedEvents:', err);
    }
  },

  fetchCrewEvents: async (crewId) => {
    const { currentYear, currentMonth } = get();
    try {
      set({ loading: true });
      const events = await api.fetchCrewEvents(crewId, currentYear, currentMonth);
      set({ crewEvents: events });
    } catch (err) {
      console.error('[CalendarStore] fetchCrewEvents:', err);
    } finally {
      set({ loading: false });
    }
  },

  fetchSavedEventIds: async () => {
    try {
      const ids = await api.fetchSavedEventIds();
      set({ savedEventIds: ids });
    } catch (err) {
      console.error('[CalendarStore] fetchSavedEventIds:', err);
    }
  },

  createPersonalEvent: async (input) => {
    const event = await api.createPersonalEvent(input);
    set((s) => ({ personalEvents: [...s.personalEvents, event].sort(sortEvents) }));
  },

  updatePersonalEvent: async (eventId, input) => {
    await api.updatePersonalEvent(eventId, input);
    // Re-fetch to get updated data
    await get().fetchPersonalEvents();
  },

  deletePersonalEvent: async (eventId) => {
    await api.deletePersonalEvent(eventId);
    set((s) => ({ personalEvents: s.personalEvents.filter((e) => e.id !== eventId) }));
  },

  createCrewEvent: async (crewId, input) => {
    await api.createCrewEvent(crewId, input);
    await get().fetchCrewEvents(crewId);
  },

  updateCrewEvent: async (eventId, input) => {
    await api.updateCrewEvent(eventId, input);
    // Caller should re-fetch crew events
  },

  deleteCrewEvent: async (eventId) => {
    await api.deleteCrewEvent(eventId);
    set((s) => ({ crewEvents: s.crewEvents.filter((e) => e.id !== eventId) }));
  },

  toggleSaveEvent: async (eventId) => {
    const saved = await api.toggleSaveEvent(eventId);
    set((s) => {
      const ids = new Set(s.savedEventIds);
      if (saved) ids.add(eventId);
      else ids.delete(eventId);
      return { savedEventIds: ids };
    });
    return saved;
  },
}));

function sortEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.eventDate !== b.eventDate) return a.eventDate.localeCompare(b.eventDate);
  if (a.eventTime && b.eventTime) return a.eventTime.localeCompare(b.eventTime);
  if (a.eventTime) return -1;
  if (b.eventTime) return 1;
  return 0;
}
