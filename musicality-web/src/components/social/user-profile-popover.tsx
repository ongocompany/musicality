'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase-client';
import {
  fetchUserSocialContext,
  toggleFollow,
  toggleBlock,
  upsertUserNote,
  deleteUserNote,
} from '@/lib/api';
import type { Profile, UserSocialContext } from '@/lib/types';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

interface Props {
  userId: string;
  profile?: Profile | null;
  children: React.ReactNode;
}

export function UserProfilePopover({ userId, profile, children }: Props) {
  const { user } = useAuth();
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<UserSocialContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [noteText, setNoteText] = useState('');

  const loadContext = useCallback(async () => {
    if (ctx) return; // already loaded
    setLoading(true);
    try {
      const data = await fetchUserSocialContext(supabase, userId);
      setCtx(data);
      setNoteText(data.note?.content ?? '');
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [ctx, supabase, userId]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      loadContext();
    } else {
      setShowNote(false);
    }
  };

  const handleFollow = async () => {
    setActionLoading('follow');
    try {
      const isNowFollowing = await toggleFollow(supabase, userId);
      setCtx((prev) =>
        prev
          ? {
              ...prev,
              isFollowing: isNowFollowing,
              followerCount: prev.followerCount + (isNowFollowing ? 1 : -1),
            }
          : prev,
      );
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleBlock = async () => {
    setActionLoading('block');
    try {
      const isNowBlocked = await toggleBlock(supabase, userId);
      setCtx((prev) =>
        prev
          ? {
              ...prev,
              isBlocked: isNowBlocked,
              isFollowing: isNowBlocked ? false : prev.isFollowing,
            }
          : prev,
      );
      if (isNowBlocked) setOpen(false);
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveNote = async () => {
    setActionLoading('note');
    try {
      const trimmed = noteText.trim();
      if (trimmed) {
        const note = await upsertUserNote(supabase, userId, trimmed);
        setCtx((prev) => (prev ? { ...prev, note } : prev));
      } else {
        await deleteUserNote(supabase, userId);
        setCtx((prev) => (prev ? { ...prev, note: null } : prev));
      }
      setShowNote(false);
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  // Not logged in or own profile → no popover
  if (!user) return <>{children}</>;
  if (user.id === userId) {
    return <Link href="/profile" className="cursor-pointer">{children}</Link>;
  }

  const displayName = profile?.displayName ?? '사용자';
  const nickname = profile?.nickname;
  const avatarUrl = profile?.avatarUrl;
  const danceStyle = profile?.danceStyle;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger className="cursor-pointer">
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" side="bottom" sideOffset={6}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-0">
            {/* Profile card */}
            <div className="flex items-start gap-3 p-4 pb-2">
              <Avatar className="h-12 w-12 shrink-0">
                <AvatarImage src={avatarUrl ?? undefined} />
                <AvatarFallback className="bg-primary/20 text-primary text-sm">
                  {displayName[0]?.toUpperCase() ?? '?'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate">{displayName}</p>
                {nickname && (
                  <p className="text-xs text-muted-foreground truncate">@{nickname}</p>
                )}
                {danceStyle && (
                  <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/80">
                    {danceStyle}
                  </span>
                )}
              </div>
            </div>

            {/* Stats */}
            {ctx && (
              <div className="px-4 pb-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{ctx.followerCount}</span> followers
                <span className="mx-2">·</span>
                <span className="font-medium text-foreground">{ctx.followingCount}</span> following
              </div>
            )}

            {/* Separator */}
            <div className="h-px bg-border" />

            {/* Actions */}
            {ctx && (
              <div className="p-2 space-y-1">
                {/* Follow / Unfollow */}
                <Button
                  variant={ctx.isFollowing ? 'outline' : 'default'}
                  size="sm"
                  className="w-full h-8 text-xs"
                  disabled={actionLoading !== null}
                  onClick={handleFollow}
                >
                  {actionLoading === 'follow' ? (
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent mr-1" />
                  ) : null}
                  {ctx.isFollowing ? '언팔로우' : '팔로우'}
                </Button>

                {/* Message */}
                <Link href={`/messages/${userId}`} onClick={() => setOpen(false)}>
                  <Button variant="outline" size="sm" className="w-full h-8 text-xs mt-1">
                    💬 메시지
                  </Button>
                </Link>

                {/* Note toggle */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={() => setShowNote(!showNote)}
                >
                  📝 {ctx.note ? '메모 수정' : '메모 추가'}
                </Button>

                {/* Note editor */}
                {showNote && (
                  <div className="space-y-2 pt-1">
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="이 사용자에 대한 메모 (나만 볼 수 있음)"
                      className="w-full h-16 text-xs p-2 rounded-md border border-border bg-muted/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                      maxLength={500}
                    />
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        className="flex-1 h-7 text-xs"
                        disabled={actionLoading === 'note'}
                        onClick={handleSaveNote}
                      >
                        저장
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setShowNote(false)}
                      >
                        취소
                      </Button>
                    </div>
                  </div>
                )}

                {/* Existing note display */}
                {!showNote && ctx.note && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground bg-muted/30 rounded-md">
                    📝 {ctx.note.content}
                  </div>
                )}

                {/* Separator */}
                <div className="h-px bg-border my-1" />

                {/* Block */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  disabled={actionLoading !== null}
                  onClick={handleBlock}
                >
                  {actionLoading === 'block' ? (
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent mr-1" />
                  ) : null}
                  {ctx.isBlocked ? '🚫 차단 해제' : '🚫 차단'}
                </Button>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
