'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase-client';
import { fetchTotalUnreadCount } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';

const POLL_INTERVAL = 10_000; // 10 seconds

// Global event for instant refresh across components
const REFRESH_EVENT = 'unread-messages-refresh';

export function triggerUnreadRefresh() {
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

export function useUnreadMessages() {
  const { user } = useAuth();
  const supabase = createClient();
  const [unreadCount, setUnreadCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshUnread = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const count = await fetchTotalUnreadCount(supabase);
      setUnreadCount(count);
    } catch {
      // ignore
    }
  }, [user, supabase]);

  useEffect(() => {
    refreshUnread();

    intervalRef.current = setInterval(refreshUnread, POLL_INTERVAL);

    // Listen for instant refresh events (e.g. after reading messages)
    const handleRefresh = () => refreshUnread();
    window.addEventListener(REFRESH_EVENT, handleRefresh);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      window.removeEventListener(REFRESH_EVENT, handleRefresh);
    };
  }, [refreshUnread]);

  return { unreadCount, refreshUnread };
}
