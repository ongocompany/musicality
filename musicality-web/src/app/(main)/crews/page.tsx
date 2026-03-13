'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { fetchMyCrews } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { CrewCard } from '@/components/crew/crew-card';
import { Button } from '@/components/ui/button';
import type { Crew, MemberRole } from '@/lib/types';

export default function MyCrewsPage() {
  const [crews, setCrews] = useState<(Crew & { myRole: MemberRole })[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMyCrews(supabase);
      setCrews(data);
    } catch (err) {
      console.error('Failed to load crews:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (user) load();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Crews</h1>
          <p className="text-muted-foreground mt-1">
            Crews you&apos;ve joined
          </p>
        </div>
        <Link href="/crews/create">
          <Button>+ Create Crew</Button>
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : crews.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>You haven&apos;t joined any crews yet.</p>
          <Link href="/" className="text-primary hover:underline mt-2 inline-block">
            Discover crews →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {crews.map((crew) => (
            <CrewCard
              key={crew.id}
              crew={crew}
              memberRole={crew.myRole}
            />
          ))}
        </div>
      )}
    </div>
  );
}
