'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import {
  fetchCrewById,
  fetchCrewMembers,
  fetchSongThreads,
  fetchGeneralPosts,
  fetchPostReplies,
  createGeneralPost,
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn, countryToFlag, timeAgo } from '@/lib/utils';
import type { Crew, CrewMember, SongThread, GeneralPost } from '@/lib/types';

// ─── Thread-style Post Item ─────────────────────────────

function PostItem({
  post,
  crewId,
  currentUserId,
  onReplyPosted,
  depth = 0,
}: {
  post: GeneralPost;
  crewId: string;
  currentUserId?: string;
  onReplyPosted: () => void;
  depth?: number;
}) {
  const supabase = createClient();
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [replies, setReplies] = useState<GeneralPost[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [replyCount, setReplyCount] = useState(post.replies?.length ?? 0);

  const loadReplies = useCallback(async () => {
    setLoadingReplies(true);
    try {
      const data = await fetchPostReplies(supabase, post.id);
      setReplies(data);
      setReplyCount(data.length);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingReplies(false);
    }
  }, [supabase, post.id]);

  async function handleReply() {
    if (!replyContent.trim()) return;
    setPosting(true);
    try {
      await createGeneralPost(supabase, crewId, replyContent, post.id);
      setReplyContent('');
      setShowReplyInput(false);
      // Reload replies
      await loadReplies();
      setShowReplies(true);
      onReplyPosted();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setPosting(false);
    }
  }

  function toggleReplies() {
    if (!showReplies && replies.length === 0) {
      loadReplies();
    }
    setShowReplies(!showReplies);
  }

  const displayName = post.profile?.displayName || 'Unknown';
  const avatarUrl = post.profile?.avatarUrl ?? undefined;
  const initial = displayName[0]?.toUpperCase() ?? '?';
  const hasReplies = replyCount > 0;
  const maxDepth = 3; // Limit nesting depth

  return (
    <div className={cn("group", depth > 0 && "ml-12")}>
      <div className="flex gap-3">
        {/* Avatar + vertical line */}
        <div className="flex flex-col items-center">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarImage src={avatarUrl} />
            <AvatarFallback className="text-xs bg-primary/20 text-primary">
              {initial}
            </AvatarFallback>
          </Avatar>
          {/* Vertical connecting line */}
          {(hasReplies || showReplyInput) && (
            <div className="w-0.5 flex-1 bg-border mt-1.5 min-h-[16px]" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pb-4">
          {/* Author + time */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {displayName}
            </span>
            <span className="text-xs text-muted-foreground">
              {timeAgo(post.createdAt)}
            </span>
          </div>

          {/* Body */}
          <p className="text-sm text-foreground/90 mt-1 whitespace-pre-wrap leading-relaxed">
            {post.content}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-4 mt-2">
            {/* Reply button */}
            {currentUserId && depth < maxDepth && (
              <button
                onClick={() => setShowReplyInput(!showReplyInput)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Reply
              </button>
            )}
            {/* Show replies toggle */}
            {hasReplies && (
              <button
                onClick={toggleReplies}
                className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
              >
                {showReplies ? 'Hide replies' : `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}
              </button>
            )}
          </div>

          {/* Reply input */}
          {showReplyInput && (
            <div className="flex gap-2 mt-3 items-start">
              <Textarea
                placeholder="Write a reply..."
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                className="min-h-[40px] text-sm bg-card border-border resize-none"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleReply();
                  }
                }}
              />
              <Button
                size="sm"
                onClick={handleReply}
                disabled={posting || !replyContent.trim()}
                className="shrink-0"
              >
                {posting ? '...' : 'Reply'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Replies */}
      {showReplies && (
        <div>
          {loadingReplies ? (
            <div className="ml-12 py-2">
              <div className="h-12 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            replies.map((reply) => (
              <PostItem
                key={reply.id}
                post={reply}
                crewId={crewId}
                currentUserId={currentUserId}
                onReplyPosted={loadReplies}
                depth={depth + 1}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Post Composer (Threads.com style) ──────────────────

function PostComposer({
  crewId,
  profile,
  onPosted,
}: {
  crewId: string;
  profile?: { displayName: string; avatarUrl: string | null } | null;
  onPosted: () => void;
}) {
  const supabase = createClient();
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);

  async function handlePost() {
    if (!content.trim()) return;
    setPosting(true);
    try {
      await createGeneralPost(supabase, crewId, content);
      setContent('');
      onPosted();
      toast.success('Posted!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      setPosting(false);
    }
  }

  const displayName = profile?.displayName || 'You';
  const avatarUrl = profile?.avatarUrl ?? undefined;
  const initial = displayName[0]?.toUpperCase() ?? '?';

  return (
    <div className="border border-border rounded-xl p-4 bg-card/50">
      <div className="flex gap-3">
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={avatarUrl} />
          <AvatarFallback className="text-xs bg-primary/20 text-primary">
            {initial}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-foreground">
            {displayName}
          </span>
          <Textarea
            placeholder="Start a thread..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mt-2 min-h-[44px] text-sm bg-transparent border-none shadow-none p-0 focus-visible:ring-0 focus-visible:border-none resize-none"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handlePost();
              }
            }}
          />
        </div>
      </div>
      <div className="flex justify-end mt-2">
        <Button
          size="sm"
          onClick={handlePost}
          disabled={posting || !content.trim()}
          className="rounded-full px-5"
        >
          {posting ? 'Posting...' : 'Post'}
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────

export default function CrewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = createClient();
  const { user, profile } = useAuth();
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

  const reloadPosts = useCallback(async () => {
    try {
      const p = await fetchGeneralPosts(supabase, id);
      setPosts(p);
    } catch (err) {
      console.error(err);
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
      <div className="space-y-4">
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
    <div className="space-y-6">
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
                  {crew.danceStyle}
                </Badge>
                <Badge variant="secondary">
                  {countryToFlag(crew.region)} {crew.region}
                </Badge>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {isCaptain ? (
                <Link href={`/crews/${id}/manage`}>
                  <Button variant="outline" size="sm">Manage</Button>
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
      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">Board ({posts.length})</TabsTrigger>
          <TabsTrigger value="songs">Songs ({threads.length})</TabsTrigger>
          <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
        </TabsList>

        {/* Board tab — Threads.com style */}
        <TabsContent value="board" className="mt-4 space-y-4">
          {/* Composer — only for members */}
          {isMember && (
            <PostComposer
              crewId={id}
              profile={profile}
              onPosted={reloadPosts}
            />
          )}

          {/* Posts */}
          {posts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <p>No posts yet. Start a conversation!</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {posts.map((p) => (
                <div key={p.id} className="pt-4 first:pt-0">
                  <PostItem
                    post={p}
                    crewId={id}
                    currentUserId={user?.id}
                    onReplyPosted={reloadPosts}
                  />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Songs tab — read-only */}
        <TabsContent value="songs" className="space-y-3 mt-4">
          {/* App-only notice */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-sm text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            Song threads are created in the Ritmo app. You can browse them here.
          </div>

          {threads.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">No song threads yet</p>
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
