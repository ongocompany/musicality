'use client';

import type { ChatRoom, ChatRoomMember } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

interface Props {
  room: ChatRoom;
  members: ChatRoomMember[];
  onBack: () => void;
  onMembersClick?: () => void;
}

export function RoomHeader({ room, members, onBack, onMembersClick }: Props) {
  // Generate room display name from members if no custom name
  const displayName = (room.name
    ?? members
        .filter((m) => m.profile)
        .map((m) => m.profile!.displayName)
        .join(', '))
    || '그룹 채팅';

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </Button>

      <button
        className="flex items-center gap-2 cursor-pointer min-w-0 flex-1"
        onClick={onMembersClick}
      >
        {/* Avatar stack — show up to 3 */}
        <div className="flex -space-x-2 shrink-0">
          {members.slice(0, 3).map((m) => (
            <Avatar key={m.userId} className="h-7 w-7 border-2 border-background">
              <AvatarImage src={m.profile?.avatarUrl ?? undefined} />
              <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                {(m.profile?.displayName ?? '?')[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>

        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{displayName}</p>
          <p className="text-[10px] text-muted-foreground">{members.length}명</p>
        </div>
      </button>
    </div>
  );
}
