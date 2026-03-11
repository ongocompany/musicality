'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase-client';
import { fetchDiscoverCrews } from '@/lib/api';
import { CrewCard } from '@/components/crew/crew-card';
import { Input } from '@/components/ui/input';
import type { Crew } from '@/lib/types';

export default function DiscoverPage() {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const data = await fetchDiscoverCrews(supabase, q);
      setCrews(data);
    } catch (err) {
      console.error('Failed to load crews:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setTimeout(() => {
      load(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Discover Crews</h1>
        <p className="text-muted-foreground mt-1">
          Find dance crews and share PhraseNotes together
        </p>
      </div>

      <Input
        placeholder="Search crews..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      ) : crews.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {search ? 'No crews found matching your search' : 'No crews yet. Be the first to create one!'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {crews.map((crew) => (
            <CrewCard key={crew.id} crew={crew} />
          ))}
        </div>
      )}
    </div>
  );
}
