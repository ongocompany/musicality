'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { fetchUnifiedInbox } from '@/lib/api';
import type { InboxItem } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserProfilePopover } from '@/components/social/user-profile-popover';
import { RoomInboxItem } from '@/components/chat/room-inbox-item';

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export default function MessagesPage() {
  const supabase = createClient();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchUnifiedInbox(supabase);
        setItems(data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-xl font-bold mb-6">메시지</h1>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="h-12 w-12 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="h-3 w-48 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold mb-6">메시지</h1>

      {items.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-4xl">💬</p>
          <p className="text-muted-foreground">아직 메시지가 없습니다</p>
          <p className="text-xs text-muted-foreground">
            다른 사용자의 프로필에서 메시지를 보내보세요
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
          {items.map((item) => {
            // Group room
            if (item.type === 'room') {
              return (
                <RoomInboxItem
                  key={`room-${item.room!.id}`}
                  item={item}
                  formatTime={formatTime}
                />
              );
            }

            // 1:1 DM
            const p = item.otherProfile!;
            const msg = item.lastMessage;
            const isOwnMsg = msg ? msg.senderId !== item.otherUserId : false;

            return (
              <Link
                key={`dm-${item.otherUserId}`}
                href={`/messages/${item.otherUserId}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <UserProfilePopover userId={p.id} profile={p}>
                  <div onClick={(e) => e.preventDefault()}>
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={p.avatarUrl ?? undefined} />
                      <AvatarFallback className="bg-primary/20 text-primary">
                        {(p.displayName ?? '?')[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </UserProfilePopover>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold truncate">{p.displayName}</p>
                    <span className="text-[11px] text-muted-foreground shrink-0 ml-2">
                      {formatTime(item.lastActivityAt)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {msg ? (
                      <>
                        {isOwnMsg ? '나: ' : ''}
                        {msg.content}
                      </>
                    ) : (
                      '새 대화'
                    )}
                  </p>
                </div>

                {item.unreadCount > 0 && (
                  <span className="shrink-0 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-primary text-[10px] font-bold text-primary-foreground px-1.5">
                    {item.unreadCount > 99 ? '99+' : item.unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
