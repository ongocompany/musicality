'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import {
  fetchRoomMessages,
  fetchRoomMembers,
  sendRoomMessage,
  markRoomMessagesRead,
  inviteToRoom,
  kickFromRoom,
  closeRoom,
  leaveRoom,
} from '@/lib/api';
import type { ChatRoom, ChatRoomMember, ChatRoomMessage } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RoomHeader } from '@/components/chat/room-header';
import { SystemMessage } from '@/components/chat/system-message';
import { InviteMemberDialog } from '@/components/chat/invite-member-dialog';
import { parseSlashCommand } from '@/components/chat/slash-command-handler';
import { triggerUnreadRefresh } from '@/hooks/use-unread-messages';

function formatMessageTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateSeparator(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

function isSameDay(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const { user } = useAuth();
  const supabase = createClient();

  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [members, setMembers] = useState<ChatRoomMember[]>([]);
  const [messages, setMessages] = useState<ChatRoomMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const isOwner = members.find((m) => m.userId === user?.id)?.role === 'owner';

  // Load room data
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [roomMembers, roomMessages] = await Promise.all([
          fetchRoomMembers(supabase, roomId),
          fetchRoomMessages(supabase, roomId),
        ]);

        // Fetch room metadata
        const { data: roomData } = await supabase
          .from('chat_rooms')
          .select('*')
          .eq('id', roomId)
          .single();

        if (roomData) {
          setRoom({
            id: roomData.id,
            name: roomData.name ?? null,
            type: roomData.type,
            createdBy: roomData.created_by,
            isActive: roomData.is_active,
            createdAt: roomData.created_at,
            updatedAt: roomData.updated_at,
          });
        }

        setMembers(roomMembers);
        setMessages(roomMessages);

        await markRoomMessagesRead(supabase, roomId);
        triggerUnreadRefresh();
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [user, roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Poll for new messages
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        const [newMessages, newMembers] = await Promise.all([
          fetchRoomMessages(supabase, roomId),
          fetchRoomMembers(supabase, roomId),
        ]);
        setMessages(newMessages);
        setMembers(newMembers);
        await markRoomMessagesRead(supabase, roomId);
        triggerUnreadRefresh();
      } catch {
        // ignore
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [user, roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    const content = inputText.trim();
    if (!content || sending) return;

    // Check for slash commands
    const cmd = parseSlashCommand(content);
    if (cmd) {
      setInputText('');
      switch (cmd.type) {
        case 'invite':
          setShowInvite(true);
          return;
        case 'kick': {
          if (!isOwner) {
            alert('방장만 멤버를 내보낼 수 있습니다.');
            return;
          }
          const target = members.find(
            (m) =>
              m.profile?.displayName === cmd.targetName ||
              m.profile?.nickname === cmd.targetName,
          );
          if (!target) {
            alert(`"${cmd.targetName}" 멤버를 찾을 수 없습니다.`);
            return;
          }
          if (target.userId === user?.id) {
            alert('자신을 내보낼 수 없습니다.');
            return;
          }
          if (!confirm(`${target.profile?.displayName ?? cmd.targetName}님을 내보내시겠습니까?`)) return;
          try {
            await kickFromRoom(supabase, roomId, target.userId);
            const [newMessages, newMembers] = await Promise.all([
              fetchRoomMessages(supabase, roomId),
              fetchRoomMembers(supabase, roomId),
            ]);
            setMessages(newMessages);
            setMembers(newMembers);
          } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            alert(err.message ?? '오류가 발생했습니다.');
          }
          return;
        }
        case 'close': {
          const confirmMsg = isOwner
            ? '채팅방을 종료하시겠습니까? 모든 멤버가 접근할 수 없게 됩니다.'
            : '채팅방을 나가시겠습니까?';
          if (!confirm(confirmMsg)) return;
          try {
            if (isOwner) {
              await closeRoom(supabase, roomId);
            } else {
              await leaveRoom(supabase, roomId);
            }
            router.push('/messages');
          } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            alert(err.message ?? '오류가 발생했습니다.');
          }
          return;
        }
      }
    }

    // Normal message
    setSending(true);
    try {
      await sendRoomMessage(supabase, roomId, content);
      setInputText('');

      const msgs = await fetchRoomMessages(supabase, roomId);
      setMessages(msgs);
    } catch {
      // ignore
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInvite = async (userId: string) => {
    await inviteToRoom(supabase, roomId, userId);
    // Refresh members and messages
    const [newMessages, newMembers] = await Promise.all([
      fetchRoomMessages(supabase, roomId),
      fetchRoomMembers(supabase, roomId),
    ]);
    setMessages(newMessages);
    setMembers(newMembers);
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <p className="text-muted-foreground">채팅방을 찾을 수 없습니다</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push('/messages')}>
          돌아가기
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <RoomHeader
        room={room}
        members={members}
        onBack={() => router.push('/messages')}
        onMembersClick={() => setShowMembers(!showMembers)}
      />

      {/* Members panel (toggle) */}
      {showMembers && (
        <div className="border-b border-border px-4 py-2 bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground">멤버 ({members.length})</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => setShowInvite(true)}
            >
              + 초대
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center gap-1.5 text-xs">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={m.profile?.avatarUrl ?? undefined} />
                  <AvatarFallback className="bg-primary/20 text-primary text-[8px]">
                    {(m.profile?.displayName ?? '?')[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate max-w-[80px]">{m.profile?.displayName ?? '사용자'}</span>
                {m.role === 'owner' && <span className="text-[9px] text-primary">👑</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-sm">대화를 시작하세요</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isOwn = msg.senderId === user?.id;
            const showDate = i === 0 || !isSameDay(messages[i - 1].createdAt, msg.createdAt);

            // System message
            if (msg.messageType === 'system') {
              return (
                <div key={msg.id}>
                  {showDate && (
                    <div className="flex items-center justify-center my-4">
                      <span className="text-[11px] text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                        {formatDateSeparator(msg.createdAt)}
                      </span>
                    </div>
                  )}
                  <SystemMessage content={msg.content} />
                </div>
              );
            }

            // Show sender name for non-own messages (group needs this)
            const showSenderName = !isOwn && (
              i === 0 ||
              messages[i - 1].senderId !== msg.senderId ||
              messages[i - 1].messageType === 'system'
            );

            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="flex items-center justify-center my-4">
                    <span className="text-[11px] text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                      {formatDateSeparator(msg.createdAt)}
                    </span>
                  </div>
                )}
                <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1`}>
                  <div className={`flex items-end gap-1.5 max-w-[75%] ${isOwn ? 'flex-row-reverse' : ''}`}>
                    {/* Avatar for other users */}
                    {!isOwn && showSenderName && (
                      <Avatar className="h-7 w-7 shrink-0 mb-0.5">
                        <AvatarImage src={msg.senderProfile?.avatarUrl ?? undefined} />
                        <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                          {(msg.senderProfile?.displayName ?? '?')[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    {!isOwn && !showSenderName && <div className="w-7 shrink-0" />}

                    <div>
                      {showSenderName && !isOwn && (
                        <p className="text-[10px] text-muted-foreground mb-0.5 ml-1">
                          {msg.senderProfile?.displayName ?? '사용자'}
                        </p>
                      )}
                      <div className={`flex items-end gap-1.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
                        <div
                          className={`rounded-2xl px-3 py-2 text-sm break-words ${
                            isOwn
                              ? 'bg-primary text-primary-foreground rounded-br-md'
                              : 'bg-muted rounded-bl-md'
                          }`}
                        >
                          {msg.content}
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0 pb-0.5">
                          {formatMessageTime(msg.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      {room.isActive ? (
        <div className="border-t border-border px-4 py-3 shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="메시지를 입력하세요... (/invite, /kick @이름, /close)"
              rows={1}
              className="flex-1 resize-none rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary max-h-24"
              style={{ minHeight: '40px' }}
            />
            <Button
              size="sm"
              className="h-10 px-4"
              disabled={!inputText.trim() || sending}
              onClick={handleSend}
            >
              {sending ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m22 2-7 20-4-9-9-4Z" />
                  <path d="M22 2 11 13" />
                </svg>
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Enter로 전송 · Shift+Enter로 줄바꿈
          </p>
        </div>
      ) : (
        <div className="border-t border-border px-4 py-4 text-center">
          <p className="text-xs text-muted-foreground">이 채팅방은 종료되었습니다</p>
        </div>
      )}

      {/* Invite dialog */}
      {showInvite && (
        <InviteMemberDialog
          existingMemberIds={members.map((m) => m.userId)}
          onInvite={handleInvite}
          onClose={() => setShowInvite(false)}
        />
      )}
    </div>
  );
}
