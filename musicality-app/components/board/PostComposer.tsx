import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { Colors, FontSize, Spacing } from '../../constants/theme';
import * as api from '../../services/communityApi';

interface Props {
  onPost: (content: string, mediaUrls?: string[]) => Promise<void>;
  placeholder?: string;
}

export default function PostComposer({ onPost, placeholder }: Props) {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [mediaUris, setMediaUris] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);

  const canPost = content.trim().length > 0 || mediaUris.length > 0;

  const pickImages = async () => {
    if (mediaUris.length >= 4) {
      Alert.alert(t('board.maxPhotos'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4 - mediaUris.length,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      const newUris = result.assets.map((a) => a.uri);
      setMediaUris((prev) => [...prev, ...newUris].slice(0, 4));
    }
  };

  const removeMedia = (index: number) => {
    setMediaUris((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePost = async () => {
    if (!canPost || posting) return;
    setPosting(true);
    try {
      // Upload media if any (failures are non-fatal — post text anyway)
      let uploadedUrls: string[] | undefined;
      if (mediaUris.length > 0) {
        try {
          const results = await Promise.allSettled(
            mediaUris.map((uri) => api.uploadPostMedia(uri)),
          );
          const succeeded = results
            .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
            .map((r) => r.value);
          if (succeeded.length > 0) uploadedUrls = succeeded;
          if (succeeded.length < mediaUris.length) {
            Alert.alert(t('board.someUploadFailed'), t('board.uploadCount', { succeeded: succeeded.length, total: mediaUris.length }));
          }
        } catch {
          Alert.alert(t('board.photoUploadFailed'), t('board.textOnlyPost'));
        }
      }
      await onPost(content.trim(), uploadedUrls);
      setContent('');
      setMediaUris([]);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={content}
        onChangeText={setContent}
        placeholder={placeholder || t('board.composerPlaceholder')}
        placeholderTextColor={Colors.textMuted}
        multiline
        maxLength={2000}
        textAlignVertical="top"
      />

      {/* Media previews */}
      {mediaUris.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaRow}>
          {mediaUris.map((uri, i) => (
            <View key={uri} style={styles.mediaThumbnail}>
              <Image source={{ uri }} style={styles.mediaImage} />
              <TouchableOpacity style={styles.removeMedia} onPress={() => removeMedia(i)}>
                <Ionicons name="close-circle" size={20} color={Colors.error} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity onPress={pickImages} style={styles.attachBtn}>
          <Ionicons name="image-outline" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handlePost}
          disabled={!canPost || posting}
          style={[styles.postBtn, (!canPost || posting) && styles.postBtnDisabled]}
        >
          {posting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.postBtnText}>{t('board.post')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  input: {
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: 4,
    fontSize: FontSize.md,
    color: Colors.text,
    minHeight: 60,
    maxHeight: 120,
  },
  mediaRow: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: 6,
  },
  mediaThumbnail: {
    width: 64,
    height: 64,
    borderRadius: 8,
    marginRight: 6,
    position: 'relative',
  },
  mediaImage: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  removeMedia: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: Colors.background,
    borderRadius: 10,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  attachBtn: {
    padding: 4,
  },
  postBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 56,
    alignItems: 'center',
  },
  postBtnDisabled: {
    opacity: 0.4,
  },
  postBtnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
