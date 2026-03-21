import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../stores/authStore';
import { useCommunityStore } from '../../stores/communityStore';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import {
  fetchMyProfile,
  updateProfile,
  uploadProfileAvatar,
} from '../../services/communityApi';

export default function MemberSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id: crewId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const { crewCache, leaveCrew } = useCommunityStore();

  const crew = crewId ? crewCache[crewId] : undefined;

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [originalName, setOriginalName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Load current profile
  useEffect(() => {
    (async () => {
      try {
        const profile = await fetchMyProfile();
        if (profile) {
          setDisplayName(profile.displayName);
          setOriginalName(profile.displayName);
          setAvatarUrl(profile.avatarUrl);
        }
      } catch (err) {
        console.warn('Failed to load profile:', err);
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, []);

  const hasChanges = displayName.trim() !== originalName;

  const handlePickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled || !result.assets[0]) return;

    setUploadingAvatar(true);
    try {
      const url = await uploadProfileAvatar(result.assets[0].uri);
      await updateProfile({ avatarUrl: url });
      setAvatarUrl(url);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('crew.avatarFailed'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    try {
      await updateProfile({ displayName: displayName.trim() });
      setOriginalName(displayName.trim());
      Alert.alert(t('common.done'), t('crew.profileSaved'));
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('crew.profileSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleLeave = () => {
    if (!crewId || !crew) return;
    Alert.alert(
      t('crew.leaveCrew'),
      t('crew.leaveCrewConfirm', { name: crew.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('crew.leave'),
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveCrew(crewId);
              // Go back to community list
              router.dismissAll();
            } catch (err: any) {
              Alert.alert(t('common.error'), err.message || t('crew.leaveCrewFailed'));
            }
          },
        },
      ],
    );
  };

  const isCaptain = crew?.captainId === user?.id;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Custom Header */}
      <View style={[styles.customHeader, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('crew.mySettings')}</Text>
        <View style={styles.headerButton} />
      </View>

      <View style={styles.container}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {loadingProfile ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <>
              {/* Avatar Section */}
              <View style={styles.avatarSection}>
                <TouchableOpacity
                  onPress={handlePickAvatar}
                  style={styles.avatarPicker}
                  activeOpacity={0.7}
                  disabled={uploadingAvatar}
                >
                  {uploadingAvatar ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <Ionicons name="person" size={36} color={Colors.textMuted} />
                  )}
                  <View style={styles.cameraIcon}>
                    <Ionicons name="camera" size={14} color="#FFF" />
                  </View>
                </TouchableOpacity>
                <Text style={styles.avatarHint}>{t('crew.tapChangePhoto')}</Text>
              </View>

              {/* Display Name */}
              <View style={styles.field}>
                <Text style={styles.label}>{t('profile.displayName')}</Text>
                <TextInput
                  style={styles.input}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder={t('crew.displayNamePlaceholder')}
                  placeholderTextColor={Colors.textMuted}
                  maxLength={30}
                />
                <Text style={styles.charCount}>{displayName.length}/30</Text>
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={[styles.saveButton, !hasChanges && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={!hasChanges || saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.saveButtonText}>{t('crew.saveChanges')}</Text>
                )}
              </TouchableOpacity>

              {/* Crew Info */}
              {crew && (
                <View style={styles.crewInfoSection}>
                  <Text style={styles.sectionTitle}>{t('crew.crewSection')}</Text>
                  <View style={styles.crewInfoCard}>
                    <Ionicons name="people" size={20} color={Colors.primary} />
                    <View style={styles.crewInfoText}>
                      <Text style={styles.crewName}>{crew.name}</Text>
                      <Text style={styles.crewMeta}>
                        {crew.memberCount} {t('community.members').toLowerCase()} · {crew.danceStyle}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Leave Crew — only for non-captain members */}
              {!isCaptain && crewId && (
                <View style={styles.dangerSection}>
                  <TouchableOpacity
                    style={styles.leaveButton}
                    onPress={handleLeave}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="exit-outline" size={18} color={Colors.error} />
                    <Text style={styles.leaveButtonText}>{t('crew.leaveCrew')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 4,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  loadingContainer: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
  },

  // Avatar
  avatarSection: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: Spacing.sm,
  },
  avatarPicker: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 44,
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  avatarHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },

  // Field
  field: {
    gap: 6,
  },
  label: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    fontSize: FontSize.md,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  charCount: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    alignSelf: 'flex-end',
  },

  // Save
  saveButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    height: 44,
    borderRadius: 10,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: '#FFF',
  },

  // Crew Info
  crewInfoSection: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  crewInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.sm,
    borderRadius: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  crewInfoText: {
    flex: 1,
    gap: 2,
  },
  crewName: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  crewMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },

  // Danger zone
  dangerSection: {
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  leaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.error + '40',
    backgroundColor: Colors.error + '10',
  },
  leaveButtonText: {
    fontSize: FontSize.md,
    fontWeight: '500',
    color: Colors.error,
  },
});
