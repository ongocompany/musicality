'use client';

import { useEffect, useState, useCallback, useRef, use } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import {
  fetchCrewById,
  fetchCrewMembers,
  fetchSongThreads,
  fetchGeneralPosts,
  fetchPostReplies,
  fetchUserLikes,
  createGeneralPost,
  deleteGeneralPost,
  togglePostLike,
  uploadPostMedia,
  joinCrew,
  leaveCrew,
  requestJoinCrew,
  fetchCrewEvents,
  fetchUserSavedEventIds,
  createCrewEvent,
  updateCrewEvent,
  deleteCrewEvent,
  toggleSaveEvent,
} from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserProfilePopover } from '@/components/social/user-profile-popover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn, countryToFlag, timeAgo } from '@/lib/utils';
import type { Crew, CrewMember, SongThread, GeneralPost, MemberRole, CalendarEvent, CreateEventInput } from '@/lib/types';
import { MEDIA_LIMITS, ROLE_CONFIG, ROLE_LEVELS } from '@/lib/types';
import { CalendarGrid } from '@/components/calendar/calendar-grid';
import { EventCard } from '@/components/calendar/event-card';
import { EventFormDialog } from '@/components/calendar/event-form-dialog';

// ─── YouTube Helpers ────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractYouTubeIds(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+/g;
  const urls = text.match(urlRegex) ?? [];
  const ids: string[] = [];
  for (const url of urls) {
    const id = extractYouTubeId(url);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Remove YouTube URLs from displayed text (they render as iframes instead) */
function stripYouTubeUrls(text: string): string {
  return text
    .replace(/https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?[^\s]*|embed\/[^\s]*|shorts\/[^\s]*)|youtu\.be\/[^\s]*)/g, '')
    .replace(/\n{3,}/g, '\n\n') // collapse excess blank lines
    .trim();
}

function YouTubeEmbed({ videoId }: { videoId: string }) {
  return (
    <div className="mt-2 rounded-lg overflow-hidden aspect-video max-w-md">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}

// ─── Media Preview ──────────────────────────────────────

function MediaGallery({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;

  const isVideo = (url: string) =>
    /\.(mp4|mov|webm)(\?|$)/i.test(url);

  return (
    <div className={cn(
      "mt-2 gap-2",
      urls.length === 1 ? "flex" : "grid grid-cols-2",
    )}>
      {urls.map((url, i) =>
        isVideo(url) ? (
          <video
            key={i}
            src={url}
            controls
            className="rounded-lg max-h-72 w-full object-cover bg-black"
            preload="metadata"
          />
        ) : (
          <img
            key={i}
            src={url}
            alt=""
            className="rounded-lg max-h-72 w-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
            loading="lazy"
            onClick={() => window.open(url, '_blank')}
          />
        )
      )}
    </div>
  );
}

// ─── File Picker Button ─────────────────────────────────

function MediaPicker({
  onFiles,
  disabled,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const allTypes = [...MEDIA_LIMITS.ALLOWED_IMAGE_TYPES, ...MEDIA_LIMITS.ALLOWED_VIDEO_TYPES];

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    // Validate
    const errors: string[] = [];
    const valid: File[] = [];

    for (const f of files.slice(0, MEDIA_LIMITS.MAX_FILES)) {
      const isImage = MEDIA_LIMITS.ALLOWED_IMAGE_TYPES.includes(f.type as typeof MEDIA_LIMITS.ALLOWED_IMAGE_TYPES[number]);
      const isVideo = MEDIA_LIMITS.ALLOWED_VIDEO_TYPES.includes(f.type as typeof MEDIA_LIMITS.ALLOWED_VIDEO_TYPES[number]);

      if (!isImage && !isVideo) {
        errors.push(`${f.name}: unsupported format`);
        continue;
      }
      if (isImage && f.size > MEDIA_LIMITS.IMAGE_MAX_SIZE) {
        errors.push(`${f.name}: image must be under 5MB`);
        continue;
      }
      if (isVideo && f.size > MEDIA_LIMITS.VIDEO_MAX_SIZE) {
        errors.push(`${f.name}: video must be under 50MB`);
        continue;
      }
      valid.push(f);
    }

    if (files.length > MEDIA_LIMITS.MAX_FILES) {
      errors.push(`Max ${MEDIA_LIMITS.MAX_FILES} files allowed`);
    }
    if (errors.length > 0) {
      toast.error(errors.join('\n'));
    }
    if (valid.length > 0) {
      onFiles(valid);
    }

    // Reset input
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={allTypes.join(',')}
        multiple
        className="hidden"
        onChange={handleChange}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        title="Attach image or video"
      >
        {/* Image icon */}
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
          <circle cx="9" cy="9" r="2"/>
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
        </svg>
      </button>
    </>
  );
}

// ─── Staged File Preview ────────────────────────────────

function StagedFiles({
  files,
  onRemove,
}: {
  files: File[];
  onRemove: (index: number) => void;
}) {
  if (files.length === 0) return null;

  return (
    <div className="flex gap-2 mt-2 flex-wrap">
      {files.map((f, i) => {
        const isVideo = f.type.startsWith('video/');
        const preview = isVideo ? null : URL.createObjectURL(f);
        const sizeMB = (f.size / 1024 / 1024).toFixed(1);
        return (
          <div key={i} className="relative group">
            {preview ? (
              <img
                src={preview}
                alt=""
                className="h-16 w-16 rounded-lg object-cover border border-border"
              />
            ) : (
              <div className="h-16 w-16 rounded-lg border border-border bg-muted flex flex-col items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect width="15" height="14" x="1" y="5" rx="2" ry="2"/></svg>
                <span className="text-[10px] text-muted-foreground mt-0.5">{sizeMB}MB</span>
              </div>
            )}
            <button
              onClick={() => onRemove(i)}
              className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              x
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Thread-style Post Item ─────────────────────────────

function PostItem({
  post,
  crewId,
  currentUserId,
  myRole,
  members,
  onReplyPosted,
  onDeleted,
  likedSet,
  onToggleLike,
  depth = 0,
}: {
  post: GeneralPost;
  crewId: string;
  currentUserId?: string;
  myRole?: MemberRole;
  members: CrewMember[];
  onReplyPosted: () => void;
  onDeleted: () => void;
  likedSet: Set<string>;
  onToggleLike: (postId: string) => void;
  depth?: number;
}) {
  const supabase = createClient();
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [replies, setReplies] = useState<GeneralPost[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [localReplyCount, setLocalReplyCount] = useState(post.replyCount);
  const [localLikeCount, setLocalLikeCount] = useState(post.likeCount);
  const isLiked = likedSet.has(post.id);
  const isOwnPost = currentUserId === post.userId;
  const postMember = members.find((m) => m.userId === post.userId);
  const postRole = postMember?.role as MemberRole | undefined;
  const myLevel = ROLE_LEVELS[myRole ?? 'seedling'] ?? 0;
  const postLevel = ROLE_LEVELS[postRole ?? 'seedling'] ?? 0;
  // Can delete: own post, OR captain/moderator deleting lower-ranked member's post
  const canDelete = isOwnPost || (myLevel >= 3 && myLevel > postLevel);

  const loadReplies = useCallback(async () => {
    setLoadingReplies(true);
    try {
      const data = await fetchPostReplies(supabase, post.id);
      setReplies(data);
      setLocalReplyCount(data.length);
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
      await loadReplies();
      setShowReplies(true);
      onReplyPosted();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setPosting(false);
    }
  }

  function handleLike() {
    if (!currentUserId) {
      toast.error('Please sign in first');
      return;
    }
    // Optimistic update
    setLocalLikeCount((c) => isLiked ? Math.max(0, c - 1) : c + 1);
    onToggleLike(post.id);
  }

  async function handleDelete() {
    if (!confirm('Delete this post?')) return;
    setDeleting(true);
    try {
      await deleteGeneralPost(supabase, post.id);
      toast.success('Post deleted');
      onDeleted();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
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
  const hasReplies = localReplyCount > 0;
  const maxDepth = 3;
  const youtubeIds = extractYouTubeIds(post.content);

  return (
    <div className={cn("group", depth > 0 && "ml-12")}>
      <div className="flex gap-3">
        {/* Avatar + vertical line */}
        <div className="flex flex-col items-center">
          <UserProfilePopover userId={post.userId} profile={post.profile}>
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarImage src={avatarUrl} />
              <AvatarFallback className="text-xs bg-primary/20 text-primary">
                {initial}
              </AvatarFallback>
            </Avatar>
          </UserProfilePopover>
          {(hasReplies || showReplyInput) && (
            <div className="w-0.5 flex-1 bg-border mt-1.5 min-h-[16px]" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pb-4">
          {/* Author + role badge + time */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {displayName}
            </span>
            {postRole && postRole !== 'seedling' && (
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                ROLE_CONFIG[postRole].color,
              )}>
                {ROLE_CONFIG[postRole].emoji} {ROLE_CONFIG[postRole].label}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {timeAgo(post.createdAt)}
            </span>
          </div>

          {/* Body — hide YouTube URLs when embeds are shown */}
          {(() => {
            const displayText = youtubeIds.length > 0 ? stripYouTubeUrls(post.content) : post.content;
            return displayText ? (
              <p className="text-sm text-foreground/90 mt-1 whitespace-pre-wrap leading-relaxed">
                {displayText}
              </p>
            ) : null;
          })()}

          {/* Media gallery */}
          <MediaGallery urls={post.mediaUrls} />

          {/* YouTube embeds */}
          {youtubeIds.map((vid) => (
            <YouTubeEmbed key={vid} videoId={vid} />
          ))}

          {/* ─── Action bar: Like · Reply · Views ─── */}
          <div className="flex items-center gap-5 mt-3">
            {/* Like */}
            <button
              onClick={handleLike}
              className={cn(
                "flex items-center gap-1.5 text-xs transition-colors",
                isLiked
                  ? "text-red-400 hover:text-red-300"
                  : "text-muted-foreground hover:text-red-400"
              )}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill={isLiked ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
              </svg>
              {localLikeCount > 0 && <span>{localLikeCount}</span>}
            </button>

            {/* Reply */}
            {depth < maxDepth && (
              <button
                onClick={() => currentUserId ? setShowReplyInput(!showReplyInput) : toast.error('Please sign in first')}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                {localReplyCount > 0 && <span>{localReplyCount}</span>}
              </button>
            )}

            {/* Views */}
            {post.viewCount > 0 && depth === 0 && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                {post.viewCount}
              </span>
            )}

            {/* Delete */}
            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto disabled:opacity-50"
                title={isOwnPost ? 'Delete my post' : 'Delete as ' + (myRole ?? 'moderator')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18"/>
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
              </button>
            )}
          </div>

          {/* Reply thread toggle */}
          {hasReplies && !showReplies && (
            <button
              onClick={toggleReplies}
              className="mt-1 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
            >
              {localReplyCount} {localReplyCount === 1 ? 'reply' : 'replies'}
            </button>
          )}
          {showReplies && hasReplies && (
            <button
              onClick={toggleReplies}
              className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Hide replies
            </button>
          )}

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
                myRole={myRole}
                members={members}
                onReplyPosted={loadReplies}
                onDeleted={loadReplies}
                likedSet={likedSet}
                onToggleLike={onToggleLike}
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
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  async function handlePost() {
    if (!content.trim() && stagedFiles.length === 0) return;
    setPosting(true);
    try {
      // Upload media files first
      let mediaUrls: string[] = [];
      if (stagedFiles.length > 0) {
        setUploadProgress(`Uploading ${stagedFiles.length} file(s)...`);
        const uploads = await Promise.all(
          stagedFiles.map((f) => uploadPostMedia(supabase, f)),
        );
        mediaUrls = uploads;
      }

      setUploadProgress('');
      await createGeneralPost(supabase, crewId, content, undefined, mediaUrls);
      setContent('');
      setStagedFiles([]);
      onPosted();
      toast.success('Posted!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      setPosting(false);
      setUploadProgress('');
    }
  }

  function addFiles(files: File[]) {
    setStagedFiles((prev) => {
      const combined = [...prev, ...files];
      return combined.slice(0, MEDIA_LIMITS.MAX_FILES);
    });
  }

  function removeFile(index: number) {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
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
              if (e.key === 'Enter' && !e.shiftKey && stagedFiles.length === 0) {
                e.preventDefault();
                handlePost();
              }
            }}
          />
          <StagedFiles files={stagedFiles} onRemove={removeFile} />
        </div>
      </div>

      {/* Bottom bar: media picker + post button */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
        <div className="flex items-center gap-2">
          <MediaPicker onFiles={addFiles} disabled={posting || stagedFiles.length >= MEDIA_LIMITS.MAX_FILES} />
          <span className="text-[11px] text-muted-foreground">
            IMG 5MB · VID 50MB
          </span>
        </div>
        <div className="flex items-center gap-2">
          {uploadProgress && (
            <span className="text-xs text-muted-foreground animate-pulse">
              {uploadProgress}
            </span>
          )}
          <Button
            size="sm"
            onClick={handlePost}
            disabled={posting || (!content.trim() && stagedFiles.length === 0)}
            className="rounded-full px-5"
          >
            {posting ? 'Posting...' : 'Post'}
          </Button>
        </div>
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
  const [likedSet, setLikedSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  // Calendar state
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const [calSelectedDate, setCalSelectedDate] = useState<string | null>(null);
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([]);
  const [savedEventIds, setSavedEventIds] = useState<Set<string>>(new Set());
  const [calLoading, setCalLoading] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  const myMember = members.find((m) => m.userId === user?.id);
  const isCaptain = crew?.captainId === user?.id;
  const isModerator = myMember?.role === 'moderator';
  const canManage = isCaptain || isModerator;
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

      // Fetch likes for posts
      if (p.length > 0) {
        const likes = await fetchUserLikes(supabase, p.map((x) => x.id));
        setLikedSet(likes);
      }
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
      if (p.length > 0) {
        const likes = await fetchUserLikes(supabase, p.map((x) => x.id));
        setLikedSet(likes);
      }
    } catch (err) {
      console.error(err);
    }
  }, [supabase, id]);

  const loadCalendar = useCallback(async (y: number, m: number) => {
    setCalLoading(true);
    try {
      const [eventsResult, savedIdsResult] = await Promise.allSettled([
        fetchCrewEvents(supabase, id, y, m),
        fetchUserSavedEventIds(supabase),
      ]);
      setCalEvents(eventsResult.status === 'fulfilled' ? eventsResult.value : []);
      setSavedEventIds(savedIdsResult.status === 'fulfilled' ? savedIdsResult.value : new Set());
    } catch (err) {
      console.error(err);
    } finally {
      setCalLoading(false);
    }
  }, [supabase, id]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggleLike(postId: string) {
    try {
      const nowLiked = await togglePostLike(supabase, postId);
      setLikedSet((prev) => {
        const next = new Set(prev);
        if (nowLiked) next.add(postId);
        else next.delete(postId);
        return next;
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function handleJoin() {
    if (!user) { toast.error('Please sign in first'); return; }
    if (crew?.crewType === 'open') {
      if (!confirm(`${crew.name} 크루에 가입하시겠습니까?`)) return;
    }
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
              {canManage ? (
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
          <TabsTrigger value="calendar" onClick={() => { if (calEvents.length === 0) loadCalendar(calYear, calMonth); }}>일정</TabsTrigger>
          <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
        </TabsList>

        {/* Board tab — Threads.com style */}
        <TabsContent value="board" className="mt-4 space-y-4">
          {isMember && (
            <PostComposer crewId={id} profile={profile} onPosted={reloadPosts} />
          )}

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
                    myRole={myMember?.role as MemberRole | undefined}
                    members={members}
                    onReplyPosted={reloadPosts}
                    onDeleted={reloadPosts}
                    likedSet={likedSet}
                    onToggleLike={handleToggleLike}
                  />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Songs tab — read-only */}
        <TabsContent value="songs" className="space-y-3 mt-4">
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

        {/* Calendar tab */}
        <TabsContent value="calendar" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">크루 일정</h3>
            {canManage && (
              <Button size="sm" variant="outline" onClick={() => { setEditingEvent(null); setShowEventForm(true); }}>
                + 일정 추가
              </Button>
            )}
          </div>

          <CalendarGrid
            year={calYear}
            month={calMonth}
            selectedDate={calSelectedDate}
            eventDates={new Set(calEvents.map((e) => e.eventDate))}
            onSelectDate={setCalSelectedDate}
            onChangeMonth={(y, m) => {
              setCalYear(y);
              setCalMonth(m);
              loadCalendar(y, m);
            }}
          />

          {/* Events for selected date */}
          {calSelectedDate && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">
                {(() => {
                  const d = new Date(calSelectedDate + 'T00:00:00');
                  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
                  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})`;
                })()}
              </h4>
              {calEvents
                .filter((e) => e.eventDate === calSelectedDate)
                .map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    canEdit={canManage}
                    isSaved={savedEventIds.has(event.id)}
                    onEdit={(ev) => { setEditingEvent(ev); setShowEventForm(true); }}
                    onDelete={async (eventId) => {
                      if (!confirm('이 일정을 삭제하시겠습니까?')) return;
                      try {
                        await deleteCrewEvent(supabase, eventId);
                        toast.success('일정 삭제됨');
                        loadCalendar(calYear, calMonth);
                      } catch (err: unknown) {
                        toast.error(err instanceof Error ? err.message : '삭제 실패');
                      }
                    }}
                    onToggleSave={async (eventId) => {
                      try {
                        const saved = await toggleSaveEvent(supabase, eventId);
                        setSavedEventIds((prev) => {
                          const next = new Set(prev);
                          if (saved) next.add(eventId);
                          else next.delete(eventId);
                          return next;
                        });
                        toast.success(saved ? '내 캘린더에 저장됨' : '저장 취소됨');
                      } catch (err: unknown) {
                        toast.error(err instanceof Error ? err.message : '실패');
                      }
                    }}
                  />
                ))}
              {calEvents.filter((e) => e.eventDate === calSelectedDate).length === 0 && (
                <p className="text-center py-4 text-muted-foreground text-xs">일정 없음</p>
              )}
            </div>
          )}

          {calLoading && (
            <div className="flex items-center justify-center py-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}

          {/* Event form dialog */}
          {showEventForm && (
            <EventFormDialog
              initialDate={calSelectedDate ?? undefined}
              editEvent={editingEvent}
              onSubmit={async (input: CreateEventInput) => {
                if (editingEvent) {
                  await updateCrewEvent(supabase, editingEvent.id, input);
                  toast.success('일정 수정됨');
                } else {
                  await createCrewEvent(supabase, id, input);
                  toast.success('일정 추가됨');
                }
                setShowEventForm(false);
                setEditingEvent(null);
                loadCalendar(calYear, calMonth);
              }}
              onClose={() => { setShowEventForm(false); setEditingEvent(null); }}
            />
          )}
        </TabsContent>

        {/* Members tab */}
        <TabsContent value="members" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Members</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {members
                .sort((a, b) => (ROLE_LEVELS[b.role as MemberRole] ?? 0) - (ROLE_LEVELS[a.role as MemberRole] ?? 0))
                .map((m) => {
                const roleKey = m.role as MemberRole;
                const rc = ROLE_CONFIG[roleKey];
                return (
                  <div key={m.id}>
                    <div className="flex items-center gap-3 py-2">
                      <UserProfilePopover userId={m.userId} profile={m.profile}>
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={m.profile?.avatarUrl ?? undefined} />
                          <AvatarFallback className="text-xs bg-primary/20 text-primary">
                            {(m.profile?.displayName ?? '?')[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </UserProfilePopover>
                      <span className="text-sm font-medium flex-1">
                        {m.profile?.displayName ?? 'Unknown'}
                      </span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                        rc.color,
                      )}>
                        {rc.emoji} {rc.label}
                      </span>
                    </div>
                    <Separator />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
