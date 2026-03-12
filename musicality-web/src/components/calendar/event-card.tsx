'use client';

import type { CalendarEvent } from '@/lib/types';
import { Button } from '@/components/ui/button';

interface EventCardProps {
  event: CalendarEvent;
  canEdit?: boolean;
  isSaved?: boolean;
  onEdit?: (event: CalendarEvent) => void;
  onDelete?: (eventId: string) => void;
  onToggleSave?: (eventId: string) => void;
}

function formatTime(time: string | null): string {
  if (!time) return '';
  // 'HH:MM:SS' → 'HH:MM'
  return time.slice(0, 5);
}

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})`;
}

export function EventCard({
  event,
  canEdit = false,
  isSaved = false,
  onEdit,
  onDelete,
  onToggleSave,
}: EventCardProps) {
  const isCrewEvent = !!event.crewId;

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm truncate">{event.title}</h4>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
            <span>{formatEventDate(event.eventDate)}</span>
            {event.eventTime && (
              <>
                <span>·</span>
                <span>{formatTime(event.eventTime)}</span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {isCrewEvent && onToggleSave && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onToggleSave(event.id)}
              title={isSaved ? '저장 취소' : '내 캘린더에 저장'}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill={isSaved ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={isSaved ? 'text-yellow-500' : 'text-muted-foreground'}
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </Button>
          )}
          {canEdit && onEdit && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(event)}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
            </Button>
          )}
          {canEdit && onDelete && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(event.id)}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </Button>
          )}
        </div>
      </div>

      {/* Location */}
      {event.location && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>{event.location}</span>
        </div>
      )}

      {/* Description */}
      {event.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{event.description}</p>
      )}

      {/* Crew badge */}
      {event.crewName && (
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium">
            {event.crewName}
          </span>
        </div>
      )}

      {/* Creator */}
      {event.profile && (
        <div className="text-[10px] text-muted-foreground">
          {event.profile.displayName}
        </div>
      )}
    </div>
  );
}
