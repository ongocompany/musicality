'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase-client';
import { fetchFollowers, fetchFollowing } from '@/lib/api';
import type { UserFollow } from '@/lib/types';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UserProfilePopover } from './user-profile-popover';

interface Props {
  userId: string;
  type: 'followers' | 'following';
  count: number;
  children: React.ReactNode;
}

export function FollowListDialog({ userId, type, count, children }: Props) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UserFollow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data =
        type === 'followers'
          ? await fetchFollowers(supabase, userId)
          : await fetchFollowing(supabase, userId);
      setItems(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [supabase, userId, type]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      loadList();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className="cursor-pointer">
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {type === 'followers' ? 'Followers' : 'Following'} ({count})
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              {type === 'followers' ? '아직 팔로워가 없습니다' : '아직 팔로우한 사용자가 없습니다'}
            </p>
          ) : (
            <div className="space-y-1">
              {items.map((item) => {
                const p = item.profile;
                if (!p) return null;
                return (
                  <UserProfilePopover key={item.id} userId={p.id} profile={p}>
                    <div className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50 cursor-pointer transition-colors">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={p.avatarUrl ?? undefined} />
                        <AvatarFallback className="bg-primary/20 text-primary text-xs">
                          {(p.displayName ?? '?')[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{p.displayName}</p>
                        {p.nickname && (
                          <p className="text-xs text-muted-foreground truncate">@{p.nickname}</p>
                        )}
                      </div>
                    </div>
                  </UserProfilePopover>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
