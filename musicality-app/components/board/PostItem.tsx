import React, { useState } from 'react';
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
import { Colors, FontSize, Spacing } from '../../constants/theme';
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

  const isAuthor = post.userId === currentUserId;
  const timeAgo = formatTimeAgo(post.createdAt);

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
      Alert.alert('오류', err.message);
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('게시글 삭제', '이 게시글을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => onDelete(post.id) },
    ]);
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          {post.profile?.avatarUrl ? (
            <Image source={{ uri: post.profile.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="person-circle" size={36} color={Colors.textMuted} />
          )}
        </View>
        <View style={styles.headerText}>
          <Text style={styles.authorName}>
            {post.profile?.displayName || '알 수 없음'}
          </Text>
          <Text style={styles.timeAgo}>{timeAgo}</Text>
        </View>
        {isAuthor && (
          <TouchableOpacity onPress={handleDelete} style={styles.moreBtn}>
            <Ionicons name="trash-outline" size={18} color={Colors.error} />
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <Text style={styles.content}>{post.content}</Text>

      {/* Media */}
      {Array.isArray(post.mediaUrls) && post.mediaUrls.length > 0 && (
        <View style={styles.mediaGrid}>
          {post.mediaUrls.map((url, idx) => {
            const w = mediaImageWidth(post.mediaUrls.length);
            console.log('[PostItem] rendering image:', w, 'x', w, url.slice(0, 60));
            return (
              <Image
                key={`${url}-${idx}`}
                source={{ uri: url }}
                style={{ width: w, height: w, borderRadius: 8, backgroundColor: Colors.border }}
                resizeMode="cover"
                onError={(e) => console.warn('[PostItem] Image load error:', url, e.nativeEvent.error)}
                onLoad={() => console.log('[PostItem] Image loaded OK:', url.slice(0, 60))}
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
              답글 {post.replyCount}개 보기
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
                <Text style={styles.replyAuthor}>
                  {reply.profile?.displayName || '알 수 없음'}
                </Text>
                <Text style={styles.replyTime}>{formatTimeAgo(reply.createdAt)}</Text>
              </View>
              <Text style={styles.replyContent}>{reply.content}</Text>
            </View>
          ))}
          <TouchableOpacity onPress={() => setShowReplies(false)}>
            <Text style={styles.showRepliesText}>답글 접기</Text>
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
            placeholder="답글 작성..."
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

const SCREEN_WIDTH = Dimensions.get('window').width;
// Calculate image width: single image = full width, 2+ = half width minus gap/padding
function mediaImageWidth(count: number): number {
  const cardPadding = Spacing.sm * 2; // left + right
  const containerWidth = SCREEN_WIDTH - 32 - cardPadding; // 32 for outer padding
  if (count === 1) return containerWidth;
  return (containerWidth - 4) / 2; // 4 = gap
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
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
});
