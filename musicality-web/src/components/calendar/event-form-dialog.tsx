'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { CalendarEvent, CreateEventInput } from '@/lib/types';

interface EventFormDialogProps {
  initialDate?: string; // 'YYYY-MM-DD'
  editEvent?: CalendarEvent | null;
  onSubmit: (input: CreateEventInput) => Promise<void>;
  onClose: () => void;
}

export function EventFormDialog({
  initialDate,
  editEvent,
  onSubmit,
  onClose,
}: EventFormDialogProps) {
  const [title, setTitle] = useState(editEvent?.title ?? '');
  const [eventDate, setEventDate] = useState(editEvent?.eventDate ?? initialDate ?? '');
  const [eventTime, setEventTime] = useState(editEvent?.eventTime?.slice(0, 5) ?? '');
  const [location, setLocation] = useState(editEvent?.location ?? '');
  const [description, setDescription] = useState(editEvent?.description ?? '');
  const [submitting, setSubmitting] = useState(false);

  const isEdit = !!editEvent;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !eventDate) return;

    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        eventDate,
        eventTime: eventTime || undefined,
        location: location.trim() || undefined,
        description: description.trim() || undefined,
      });
      onClose();
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-background border border-border rounded-xl w-full max-w-md p-5 space-y-4 shadow-xl">
        <h3 className="font-semibold text-base">
          {isEdit ? '일정 수정' : '새 일정'}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">제목 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="댄스파티, 공연, 연습 등..."
              className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              required
              autoFocus
            />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">날짜 *</label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">시간</label>
              <input
                type="time"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">장소</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Club X, 연습실 등..."
              className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">설명</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="일정에 대한 설명..."
              rows={2}
              className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" size="sm" disabled={!title.trim() || !eventDate || submitting}>
              {submitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                isEdit ? '수정' : '추가'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
