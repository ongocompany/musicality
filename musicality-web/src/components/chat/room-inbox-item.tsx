'use client';

import Link from 'next/link';
import type { InboxItem } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface Props {
  item: InboxItem;
  formatTime: (dateStr: string) => string;
}

export function RoomInboxItem({ item, formatTime }: Props) {
  if (!item.room) return null;

  const members = item.roomMembers ?? [];
  const displayName = (item.room.name
    ?? members
        .filter((m) => m.profile)
        .map((m) => m.profile!.displayName)
        .slice(0, 3)
        .join(', '))
    || '그룹 채팅';

  const lastMsg = item.lastRoomMessage;
  const preview = lastMsg
    ? lastMsg.messageType === 'system'
      ? lastMsg.content
      : lastMsg.content
    : '새 그룹 채팅';

  return (
    <Link
      href={`/messages/room/${item.room.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
    >
      {/* Avatar stack */}
      <div className="relative h-12 w-12 shrink-0">
        {members.length === 1 ? (
          <Avatar className="h-12 w-12">
            <AvatarImage src={members[0].profile?.avatarUrl ?? undefined} />
            <AvatarFallback className="bg-primary/20 text-primary">
              {(members[0].profile?.displayName ?? '?')[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ) : (
          <>
            <Avatar className="h-8 w-8 absolute top-0 left-0 border-2 border-background">
              <AvatarImage src={members[0]?.profile?.avatarUrl ?? undefined} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs">
                {(members[0]?.profile?.displayName ?? '?')[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <Avatar className="h-8 w-8 absolute bottom-0 right-0 border-2 border-background">
              <AvatarImage src={members[1]?.profile?.avatarUrl ?? undefined} />
              <AvatarFallback className="bg-blue-500/20 text-blue-400 text-xs">
                {members.length > 2
                  ? `+${members.length - 1}`
                  : (members[1]?.profile?.displayName ?? '?')[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-sm font-semibold truncate">{displayName}</p>
            <span className="text-[10px] text-muted-foreground shrink-0">
              ({members.length})
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground shrink-0 ml-2">
            {formatTime(item.lastActivityAt)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {preview}
        </p>
      </div>

      {item.unreadCount > 0 && (
        <span className="shrink-0 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-primary text-[10px] font-bold text-primary-foreground px-1.5">
          {item.unreadCount > 99 ? '99+' : item.unreadCount}
        </span>
      )}
    </Link>
  );
}
