'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import {
  fetchCrewById,
  fetchCrewMembers,
  fetchSongThreads,
  fetchGeneralPosts,
  joinCrew,
  leaveCrew,
  requestJoinCrew,
} from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { countryToFlag, timeAgo } from '@/lib/utils';
import type { Crew, CrewMember, SongThread, GeneralPost } from '@/lib/types';

export default function CrewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = createClient();
  const { user } = useAuth();
  const [crew, setCrew] = useState<Crew | null>(null);
  const [members, setMembers] = useState<CrewMember[]>([]);
  const [threads, setThreads] = useState<SongThread[]>([]);
  const [posts, setPosts] = useState<GeneralPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  const myMember = members.find((m) => m.userId === user?.id);
  const isCaptain = crew?.captainId === user?.id;
  const isMember = !!myMember;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, m, t, p] = await Promise.all([
        fetchCrewById(supabase, id),
        fetchCrewMembers(supabase, id),
        fetchSongThreads(supabase, id),
        fetchGeneralPosts(supabase, id),
      ]);
      setCrew(c);
      setMembers(m);
      setThreads(t);
      setPosts(p);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [supabase, id]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleJoin() {
    if (!user) { toast.error('Please sign in first'); return; }
    setJoining(true);
    try {
      if (crew?.crewType === 'open') {
        await joinCrew(supabase, id);
        toast.success('Joined crew!');
      } else {
        await requestJoinCrew(supabase, id);
        toast.success('Join request sent!');
      }
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setJoining(false);
    }
  }

  async function handleLeave() {
    setJoining(true);
    try {
      await leaveCrew(supabase, id);
      toast.success('Left crew');
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!crew) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Crew not found
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16 rounded-lg">
              <AvatarImage src={crew.thumbnailUrl ?? undefined} />
              <AvatarFallback className="rounded-lg bg-primary/20 text-primary text-2xl">
                {crew.name[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{crew.name}</h1>
                {isCaptain && (
                  <Badge className="bg-primary/80">Captain</Badge>
                )}
              </div>
              <p className="text-muted-foreground mt-1">
                {crew.description || 'No description'}
              </p>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <Badge variant="secondary">
                  {crew.crewType === 'open' ? '🔓 Open' : '🔒 Closed'}
                </Badge>
                <Badge variant="secondary">
                  👥 {crew.memberCount}/{crew.memberLimit}
                </Badge>
                <Badge variant="secondary" className="capitalize">
                  💃 {crew.danceStyle}
                </Badge>
                <Badge variant="secondary">
                  {countryToFlag(crew.region)} {crew.region}
                </Badge>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {isCaptain ? (
                <Link href={`/crews/${id}/manage`}>
                  <Button variant="outline" size="sm">⚙️ Manage</Button>
                </Link>
              ) : isMember ? (
                <Button variant="outline" size="sm" onClick={handleLeave} disabled={joining}>
                  Leave
                </Button>
              ) : (
                <Button size="sm" onClick={handleJoin} disabled={joining}>
                  {crew.crewType === 'open' ? 'Join' : 'Request to Join'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="songs">
        <TabsList>
          <TabsTrigger value="songs">Songs ({threads.length})</TabsTrigger>
          <TabsTrigger value="board">Board ({posts.length})</TabsTrigger>
          <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
        </TabsList>

        {/* Songs tab */}
        <TabsContent value="songs" className="space-y-3 mt-4">
          {threads.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No song threads yet</p>
          ) : (
            threads.map((t) => (
              <Link key={t.id} href={`/crews/${id}/threads/${t.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer mb-3">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">{t.title}</h3>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          {t.bpm && <span>{t.bpm} BPM</span>}
                          <span className="capitalize">{t.danceStyle}</span>
                          <span>·</span>
                          <span>{t.postCount} notes</span>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {timeAgo(t.lastActivityAt)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </TabsContent>

        {/* Board tab */}
        <TabsContent value="board" className="space-y-3 mt-4">
          {posts.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No posts yet</p>
          ) : (
            posts.map((p) => (
              <Card key={p.id} className="mb-3">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={p.profile?.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-xs bg-primary/20 text-primary">
                        {(p.profile?.displayName ?? '?')[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {p.profile?.displayName ?? 'Unknown'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(p.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{p.content}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Members tab */}
        <TabsContent value="members" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Members</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {members.map((m) => (
                <div key={m.id}>
                  <div className="flex items-center gap-3 py-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={m.profile?.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-xs bg-primary/20 text-primary">
                        {(m.profile?.displayName ?? '?')[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium flex-1">
                      {m.profile?.displayName ?? 'Unknown'}
                    </span>
                    {m.role === 'captain' && (
                      <Badge variant="default" className="text-xs bg-primary/80">
                        Captain
                      </Badge>
                    )}
                  </div>
                  <Separator />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
