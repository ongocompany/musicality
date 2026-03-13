import type { Profile } from './community';

export interface CalendarEvent {
  id: string;
  title: string;
  eventDate: string;        // 'YYYY-MM-DD'
  eventTime: string | null;  // 'HH:MM:SS' or null
  location: string;
  description: string;
  crewId: string | null;     // null = personal event
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  profile?: Profile;         // Creator's profile
  crewName?: string;
  saved?: boolean;           // User has saved this crew event
}

export interface CreateEventInput {
  title: string;
  eventDate: string;         // 'YYYY-MM-DD'
  eventTime?: string;        // 'HH:MM'
  location?: string;
  description?: string;
}
