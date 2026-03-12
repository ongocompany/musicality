'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase-client';
import { fetchUnreadMessageCount } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';

const POLL_INTERVAL = 30_000; // 30 seconds

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
      const count = await fetchUnreadMessageCount(supabase);
      setUnreadCount(count);
    } catch {
      // ignore
    }
  }, [user, supabase]);

  useEffect(() => {
    refreshUnread();

    intervalRef.current = setInterval(refreshUnread, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refreshUnread]);

  return { unreadCount, refreshUnread };
}
