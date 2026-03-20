import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  TextInput,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import YoutubePlayer from 'react-native-youtube-iframe';
import { Colors, FontSize, Spacing } from '../../constants/theme';
import { parseYouTubeUrl, createYouTubeTrack } from '../../services/fileImport';
import { usePlayerStore } from '../../stores/playerStore';
import { GHOST_AVATAR, getDeletedUserName } from '../../utils/deletedUser';
import type { GeneralPost } from '../../types/community';

interface Props {
  post: GeneralPost;
  currentUserId?: string;
  onLike: (postId: string) => void;
  onDelete: (postId: string) => void;
  onReply: (postId: string, content: string) => Promise<void>;
  onFetchReplies: (parentId: string) => Promise<GeneralPost[]>;
}

export default function PostItem({
  post,
  currentUserId,
  onLike,
  onDelete,
  onReply,
  onFetchReplies,
}: Props) {
  const [showReplies, setShowReplies] = useState(false);
  const [replies, setReplies] = useState<GeneralPost[]>([]);
  const [replyText, setReplyText] = useState('');
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [showReplyInput, setShowReplyInput] = useState(false);
  const { t } = useTranslation();

  const isAuthor = post.userId === currentUserId;
  const timeAgo = formatTimeAgo(post.createdAt, t);

  const handleToggleReplies = async () => {
    if (showReplies) {
      setShowReplies(false);
      return;
    }
    setLoadingReplies(true);
    try {
      const data = await onFetchReplies(post.id);
      setReplies(data);
      setShowReplies(true);
    } catch {
      // ignore
    } finally {
      setLoadingReplies(false);
    }
  };

  const handleSubmitReply = async () => {
    if (!replyText.trim() || submittingReply) return;
    setSubmittingReply(true);
    try {
      await onReply(post.id, replyText.trim());
      setReplyText('');
      setShowReplyInput(false);
      // Refresh replies
      const data = await onFetchReplies(post.id);
      setReplies(data);
      setShowReplies(true);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(t('board.deletePost'), t('board.deletePostConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => onDelete(post.id) },
    ]);
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          {!post.profile ? (
            <Image source={GHOST_AVATAR} style={styles.avatarImage} />
          ) : post.profile.avatarUrl ? (
            <Image source={{ uri: post.profile.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="person-circle" size={36} color={Colors.textMuted} />
          )}
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.authorName, !post.profile && styles.authorNameDeleted]}>
            {post.profile?.displayName || getDeletedUserName()}
          </Text>
          <Text style={styles.timeAgo}>{timeAgo}</Text>
        </View>
        {isAuthor && (
          <TouchableOpacity onPress={handleDelete} style={styles.moreBtn}>
            <Ionicons name="trash-outline" size={18} color={Colors.error} />
          </TouchableOpacity>
        )}
      </View>

      {/* Content + YouTube embeds */}
      <PostContent content={post.content} />

      {/* Media */}
      {Array.isArray(post.mediaUrls) && post.mediaUrls.length > 0 && (
        <View style={styles.mediaGrid}>
          {post.mediaUrls.map((url, idx) => {
            const w = mediaImageWidth(post.mediaUrls.length);
            return (
              <Image
                key={`${url}-${idx}`}
                source={{ uri: url }}
                style={{ width: w, height: w, borderRadius: 8, backgroundColor: Colors.border }}
                resizeMode="contain"
              />
            );
          })}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onLike(post.id)}>
          <Ionicons
            name={post.liked ? 'heart' : 'heart-outline'}
            size={18}
            color={post.liked ? Colors.error : Colors.textMuted}
          />
          {post.likeCount > 0 && (
            <Text style={[styles.actionText, post.liked && { color: Colors.error }]}>
              {post.likeCount}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => {
            if (post.replyCount > 0) handleToggleReplies();
            setShowReplyInput(!showReplyInput);
          }}
        >
          <Ionicons name="chatbubble-outline" size={16} color={Colors.textMuted} />
          {post.replyCount > 0 && (
            <Text style={styles.actionText}>{post.replyCount}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Reply count toggle */}
      {post.replyCount > 0 && !showReplies && (
        <TouchableOpacity onPress={handleToggleReplies} style={styles.showRepliesBtn}>
          {loadingReplies ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={styles.showRepliesText}>
              {t('board.viewReplies', { count: post.replyCount })}
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* Replies */}
      {showReplies && replies.length > 0 && (
        <View style={styles.repliesSection}>
          {replies.map((reply) => (
            <View key={reply.id} style={styles.replyItem}>
              <View style={styles.replyHeader}>
                <Text style={[styles.replyAuthor, !reply.profile && styles.authorNameDeleted]}>
                  {reply.profile?.displayName || getDeletedUserName()}
                </Text>
                <Text style={styles.replyTime}>{formatTimeAgo(reply.createdAt, t)}</Text>
              </View>
              <Text style={styles.replyContent}>{reply.content}</Text>
            </View>
          ))}
          <TouchableOpacity onPress={() => setShowReplies(false)}>
            <Text style={styles.showRepliesText}>{t('board.collapseReplies')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Reply input */}
      {showReplyInput && (
        <View style={styles.replyInputRow}>
          <TextInput
            style={styles.replyInput}
            value={replyText}
            onChangeText={setReplyText}
            placeholder={t('board.replyPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            maxLength={500}
          />
          <TouchableOpacity
            onPress={handleSubmitReply}
            disabled={!replyText.trim() || submittingReply}
            style={styles.replySendBtn}
          >
            {submittingReply ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons
                name="send"
                size={18}
                color={replyText.trim() ? Colors.primary : Colors.textMuted}
              />
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/** Render post content with inline YouTube players */
function PostContent({ content }: { content: string }) {
  const ytUrlRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?[^\s]*|youtu\.be\/[^\s]*|youtube\.com\/shorts\/[^\s]*))/g;
  const parts = content.split(ytUrlRegex);

  if (parts.length === 1) {
    return <Text style={styles.content}>{content}</Text>;
  }

  return (
    <View style={{ gap: 8 }}>
      {parts.map((part, i) => {
        const videoId = parseYouTubeUrl(part);
        if (videoId) {
          return <InlineYouTube key={i} videoId={videoId} />;
        }
        if (!part.trim()) return null;
        return <Text key={i} style={styles.content}>{part}</Text>;
      })}
    </View>
  );
}

/** Inline YouTube player — shows thumbnail first, taps to play, long-press to save */
function InlineYouTube({ videoId }: { videoId: string }) {
  const [playing, setPlaying] = useState(false);
  const [activated, setActivated] = useState(false);
  const { t } = useTranslation();
  const addTrack = usePlayerStore((s) => s.addTrack);
  const tracks = usePlayerStore((s) => s.tracks);
  const playerW = SCREEN_WIDTH - 64;
  const playerH = Math.round(playerW * 9 / 16);

  const onStateChange = useCallback((state: string) => {
    if (state === 'ended') setPlaying(false);
  }, []);

  const handleLongPress = useCallback(() => {
    // Check if already in library
    const exists = tracks.some((t) => t.mediaType === 'youtube' && t.uri === videoId);
    if (exists) {
      Alert.alert(t('board.alreadyAdded'), t('board.alreadyInLibrary'));
      return;
    }
    Alert.alert(t('board.addToLibrary'), t('board.addToLibraryConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.save'),
        onPress: () => {
          const track = createYouTubeTrack(videoId);
          addTrack(track);
          Alert.alert(t('board.saved'), t('board.addedToLibrary'));
        },
      },
    ]);
  }, [videoId, tracks, addTrack]);

  if (!activated) {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => { setActivated(true); setPlaying(true); }}
        onLongPress={handleLongPress}
        delayLongPress={500}
        style={styles.ytPreview}
      >
        <Image
          source={{ uri: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` }}
          style={{ width: playerW, height: playerH, borderRadius: 8 }}
          resizeMode="cover"
        />
        <View style={styles.ytPlayOverlay}>
          <Ionicons name="play-circle" size={48} color="rgba(255,255,255,0.9)" />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.ytPreview, { borderRadius: 8, overflow: 'hidden' }]}>
      <YoutubePlayer
        height={playerH}
        width={playerW}
        videoId={videoId}
        play={playing}
        onChangeState={onStateChange}
      />
    </View>
  );
}

const SCREEN_WIDTH = Dimensions.get('window').width;
// Calculate image width: single image = full width, 2+ = half width minus gap/padding
function mediaImageWidth(count: number): number {
  const cardPadding = Spacing.sm * 2; // left + right
  const containerWidth = SCREEN_WIDTH - 32 - cardPadding; // 32 for outer padding
  if (count === 1) return containerWidth;
  return (containerWidth - 4) / 2; // 4 = gap
}

function formatTimeAgo(dateStr: string, t: (key: string, opts?: any) => string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return t('board.justNow');
  if (diff < 3600) return t('board.minutesAgo', { count: Math.floor(diff / 60) });
  if (diff < 86400) return t('board.hoursAgo', { count: Math.floor(diff / 3600) });
  if (diff < 604800) return t('board.daysAgo', { count: Math.floor(diff / 86400) });
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    marginRight: 8,
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  headerText: {
    flex: 1,
  },
  authorName: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  authorNameDeleted: {
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  timeAgo: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  moreBtn: {
    padding: 4,
  },
  content: {
    fontSize: FontSize.md,
    color: Colors.text,
    lineHeight: 20,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  mediaImage: {
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: Colors.border,
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  showRepliesBtn: {
    paddingVertical: 4,
  },
  showRepliesText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '500',
  },
  repliesSection: {
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: Colors.border,
    gap: 8,
  },
  replyItem: {
    gap: 2,
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  replyAuthor: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.text,
  },
  replyTime: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  replyContent: {
    fontSize: FontSize.sm,
    color: Colors.text,
    lineHeight: 18,
  },
  replyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
  },
  replyInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  replySendBtn: {
    padding: 4,
  },
  ytPreview: {
    position: 'relative',
    alignItems: 'center',
  },
  ytPlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
  },
});
