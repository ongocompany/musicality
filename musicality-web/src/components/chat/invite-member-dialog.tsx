'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-client';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchFollowing,
  fetchMyCrews,
  fetchCrewMembers,
} from '@/lib/api';
import type { Profile } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

interface Props {
  /** Already-in-room member user IDs (to exclude from list) */
  existingMemberIds: string[];
  onInvite: (userId: string) => Promise<void>;
  onClose: () => void;
}

type Tab = 'following' | 'crew';

interface CrewOption {
  id: string;
  name: string;
}

export function InviteMemberDialog({ existingMemberIds, onInvite, onClose }: Props) {
  const { user } = useAuth();
  const supabase = createClient();

  const [tab, setTab] = useState<Tab>('following');
  const [candidates, setCandidates] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState<string | null>(null);

  // Crew tab state
  const [crews, setCrews] = useState<CrewOption[]>([]);
  const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null);

  const excludeSet = new Set(existingMemberIds);

  const loadFollowing = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const follows = await fetchFollowing(supabase, user.id);
      const profiles = follows
        .map((f) => f.profile)
        .filter((p): p is Profile => !!p && !excludeSet.has(p.id));
      setCandidates(profiles);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCrews = useCallback(async () => {
    setLoading(true);
    try {
      const myCrews = await fetchMyCrews(supabase);
      const options = myCrews.map((c) => ({ id: c.id, name: c.name }));
      setCrews(options);
      if (options.length > 0 && !selectedCrewId) {
        setSelectedCrewId(options[0].id);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [selectedCrewId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCrewMembers = useCallback(async (crewId: string) => {
    setLoading(true);
    try {
      const members = await fetchCrewMembers(supabase, crewId);
      const profiles = members
        .map((m) => m.profile)
        .filter((p): p is Profile => !!p && !excludeSet.has(p.id) && p.id !== user?.id);
      setCandidates(profiles);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'following') {
      loadFollowing();
    } else {
      loadCrews();
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'crew' && selectedCrewId) {
      loadCrewMembers(selectedCrewId);
    }
  }, [selectedCrewId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInvite = async (userId: string) => {
    setInviting(userId);
    try {
      await onInvite(userId);
      // Remove from list after successful invite
      setCandidates((prev) => prev.filter((p) => p.id !== userId));
    } catch {
      // ignore
    } finally {
      setInviting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-background rounded-xl border border-border shadow-xl w-full max-w-sm mx-4 max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">멤버 초대</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === 'following'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setTab('following')}
          >
            팔로잉
          </button>
          <button
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === 'crew'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setTab('crew')}
          >
            크루 멤버
          </button>
        </div>

        {/* Crew selector */}
        {tab === 'crew' && crews.length > 0 && (
          <div className="px-4 py-2 border-b border-border">
            <select
              value={selectedCrewId ?? ''}
              onChange={(e) => setSelectedCrewId(e.target.value)}
              className="w-full text-xs rounded-md border border-border bg-muted/50 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {crews.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Member list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : candidates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-xs text-muted-foreground">
                {tab === 'following' ? '초대할 수 있는 팔로잉이 없습니다' : '초대할 수 있는 크루 멤버가 없습니다'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {candidates.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={p.avatarUrl ?? undefined} />
                    <AvatarFallback className="bg-primary/20 text-primary text-xs">
                      {(p.displayName ?? '?')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.displayName}</p>
                    {p.nickname && (
                      <p className="text-[10px] text-muted-foreground truncate">@{p.nickname}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-xs px-3"
                    disabled={inviting !== null}
                    onClick={() => handleInvite(p.id)}
                  >
                    {inviting === p.id ? (
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      '초대'
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
