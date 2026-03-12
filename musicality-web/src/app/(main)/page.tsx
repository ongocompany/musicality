'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { fetchMyCrews, fetchDiscoverCrews } from '@/lib/api';
import { CrewCard } from '@/components/crew/crew-card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/use-auth';
import type { Crew } from '@/lib/types';

export default function HomePage() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const [myCrews, setMyCrews] = useState<Crew[]>([]);
  const [allCrews, setAllCrews] = useState<Crew[]>([]);
  const [loadingMy, setLoadingMy] = useState(true);
  const [loadingAll, setLoadingAll] = useState(true);
  const { user } = useAuth();
  const supabase = createClient();
  const searchParams = useSearchParams();
  const search = searchParams.get('q') ?? '';

  const loadMyCrews = useCallback(async () => {
    if (!user) {
      setMyCrews([]);
      setLoadingMy(false);
      return;
    }
    setLoadingMy(true);
    try {
      const data = await fetchMyCrews(supabase);
      setMyCrews(data);
    } catch (err) {
      console.error('Failed to load my crews:', err);
    } finally {
      setLoadingMy(false);
    }
  }, [supabase, user]);

  const loadAllCrews = useCallback(
    async (q?: string) => {
      setLoadingAll(true);
      try {
        const data = await fetchDiscoverCrews(supabase, q);
        setAllCrews(data);
      } catch (err) {
        console.error('Failed to load crews:', err);
      } finally {
        setLoadingAll(false);
      }
    },
    [supabase],
  );

  useEffect(() => {
    loadMyCrews();
    loadAllCrews();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // React to search query changes from header
  useEffect(() => {
    const timer = setTimeout(() => {
      loadAllCrews(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Exclude my crews from "all crews" to avoid duplicates
  const myCrewIds = new Set(myCrews.map((c) => c.id));
  const otherCrews = allCrews.filter((c) => !myCrewIds.has(c.id));

  return (
    <div className="space-y-6">
      {/* My Crews Section */}
      {user && (
        <>
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-foreground">My Crews</h2>
              <Link href="/crews/create">
                <Button size="sm" variant="ghost" className="text-primary hover:text-primary/80 gap-1">
                  <span>+</span> Create
                </Button>
              </Link>
            </div>

            {loadingMy ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : myCrews.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <p>No crews yet. Create or join one!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {myCrews.map((crew) => (
                  <CrewCard
                    key={crew.id}
                    crew={crew}
                    isCaptain={crew.captainId === user?.id}
                  />
                ))}
              </div>
            )}
          </section>

          <Separator className="bg-border/50" />
        </>
      )}

      {/* All Crews Section */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-3">
          {search ? 'Search Results' : 'Discover Crews'}
        </h2>

        {loadingAll ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : otherCrews.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {search
              ? 'No crews found matching your search'
              : 'No other crews yet'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {otherCrews.map((crew) => (
              <CrewCard key={crew.id} crew={crew} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
