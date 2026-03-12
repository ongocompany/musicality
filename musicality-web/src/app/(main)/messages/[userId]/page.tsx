'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import {
  fetchConversation,
  markMessagesRead,
  sendMessage,
  fetchProfilesByIds,
} from '@/lib/api';
import type { DirectMessage, Profile } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { UserProfilePopover } from '@/components/social/user-profile-popover';

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

export default function ConversationPage() {
  const params = useParams();
  const router = useRouter();
  const otherUserId = params.userId as string;
  const { user } = useAuth();
  const supabase = createClient();

  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [otherProfile, setOtherProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Load conversation
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [msgs, profileMap] = await Promise.all([
          fetchConversation(supabase, otherUserId),
          fetchProfilesByIds(supabase, [otherUserId]),
        ]);
        setMessages(msgs);
        setOtherProfile(profileMap.get(otherUserId) ?? null);

        // Mark as read
        await markMessagesRead(supabase, otherUserId);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [user, otherUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Poll for new messages
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        const msgs = await fetchConversation(supabase, otherUserId);
        setMessages(msgs);
        await markMessagesRead(supabase, otherUserId);
      } catch {
        // ignore
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [user, otherUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    const content = inputText.trim();
    if (!content || sending) return;

    setSending(true);
    try {
      await sendMessage(supabase, otherUserId, content);
      setInputText('');

      // Refetch conversation
      const msgs = await fetchConversation(supabase, otherUserId);
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

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  const displayName = otherProfile?.displayName ?? '사용자';

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/messages')}>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Button>
        <UserProfilePopover userId={otherUserId} profile={otherProfile}>
          <div className="flex items-center gap-2 cursor-pointer">
            <Avatar className="h-8 w-8">
              <AvatarImage src={otherProfile?.avatarUrl ?? undefined} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs">
                {displayName[0]?.toUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>
            <span className="font-semibold text-sm">{displayName}</span>
          </div>
        </UserProfilePopover>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-sm">
              {displayName}님과의 대화를 시작하세요
            </p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isOwn = msg.senderId === user?.id;
            const showDate = i === 0 || !isSameDay(messages[i - 1].createdAt, msg.createdAt);

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
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-border px-4 py-3 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요..."
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
    </div>
  );
}
