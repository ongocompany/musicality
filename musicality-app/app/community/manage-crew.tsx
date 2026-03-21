import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Image,
  Modal,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { getLocales } from 'expo-localization';
import { useAuthStore } from '../../stores/authStore';
import { useCommunityStore } from '../../stores/communityStore';
import { uploadCrewThumbnail } from '../../services/communityApi';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import type { CrewType } from '../../types/community';

function getDeviceCountry(): string {
  try {
    const locales = getLocales();
    return locales[0]?.regionCode?.toUpperCase() ?? 'US';
  } catch {
    return 'US';
  }
}

function countryToFlag(code: string): string {
  if (code === 'global') return '🌐';
  return code
    .toUpperCase()
    .split('')
    .map((ch) => String.fromCodePoint(ch.charCodeAt(0) + 127397))
    .join('');
}

export default function ManageCrewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const {
    crewCache,
    activeCrewMembers,
    activePendingRequests,
    loading,
    fetchCrewDetail,
    fetchCrewMembers,
    fetchJoinRequests,
    updateCrew,
    kickMember,
    approveRequest,
    rejectRequest,
    changeMemberRole,
    transferCaptain,
    deleteCrew,
  } = useCommunityStore();

  const crew = id ? crewCache[id] : undefined;
  const isCaptain = crew?.captainId === user?.id;

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editType, setEditType] = useState<CrewType>('open');
  const [editLimit, setEditLimit] = useState('50');
  const [editRegion, setEditRegion] = useState('global');
  const [isEditing, setIsEditing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);

  const deviceCountry = getDeviceCountry();

  // Initialize form from crew data
  useEffect(() => {
    if (crew) {
      setEditName(crew.name);
      setEditDesc(crew.description);
      setEditType(crew.crewType);
      setEditLimit(String(crew.memberLimit));
      setEditRegion(crew.region || 'global');
    }
  }, [crew?.id]);

  // Fetch data on mount
  useEffect(() => {
    if (!id) return;
    fetchCrewMembers(id);
    fetchJoinRequests(id);
  }, [id]);

  const onRefresh = useCallback(async () => {
    if (!id) return;
    setRefreshing(true);
    await Promise.all([fetchCrewDetail(id), fetchCrewMembers(id), fetchJoinRequests(id)]);
    setRefreshing(false);
  }, [id]);

  const handleSave = async () => {
    if (!id || !crew) return;
    try {
      await updateCrew(id, {
        name: editName.trim(),
        description: editDesc.trim(),
        crewType: editType,
        memberLimit: Math.max(2, Math.min(200, parseInt(editLimit) || 50)),
        region: editRegion,
      });
      setIsEditing(false);
      Alert.alert(t('common.done'), t('crew.settingsSaved'));
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('crew.updateFailed'));
    }
  };

  const handleKick = (memberId: string, memberName: string) => {
    if (!id) return;
    Alert.alert(t('crew.removeMember'), t('crew.removeMemberConfirm', { name: memberName }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('crew.remove'),
        style: 'destructive',
        onPress: async () => {
          try {
            const member = activeCrewMembers.find((m) => m.id === memberId);
            if (member) {
              await kickMember(id, member.userId);
            }
          } catch (err: any) {
            Alert.alert(t('common.error'), err.message);
          }
        },
      },
    ]);
  };

  const handleMemberAction = (member: typeof activeCrewMembers[0]) => {
    if (!id || member.role === 'captain') return;
    const memberName = member.profile?.displayName || 'Dancer';
    const options: any[] = [];

    if (member.role === 'member') {
      options.push({ text: t('crew.promoteToModerator'), onPress: () => changeMemberRole(id, member.userId, 'moderator').catch((e: any) => Alert.alert(t('common.error'), e.message)) });
    }
    if (member.role === 'moderator') {
      options.push({ text: t('crew.demoteToMember'), onPress: () => changeMemberRole(id, member.userId, 'member').catch((e: any) => Alert.alert(t('common.error'), e.message)) });
    }
    options.push({
      text: t('crew.transferCaptain'),
      onPress: () => {
        Alert.alert(t('crew.transferCaptain'), t('crew.transferCaptainConfirm', { name: memberName }), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('crew.transfer'), style: 'destructive', onPress: () => transferCaptain(id, member.userId).then(() => { Alert.alert(t('common.done'), t('crew.transferDone', { name: memberName })); router.back(); }).catch((e: any) => Alert.alert(t('common.error'), e.message)) },
        ]);
      },
    });
    options.push({ text: t('crew.kickFromCrew'), style: 'destructive', onPress: () => handleKick(member.id, memberName) });
    options.push({ text: t('common.cancel'), style: 'cancel' });

    Alert.alert(memberName, t('crew.role', { role: getRoleLabel(member.role) }), options);
  };

  const handleDeleteCrew = () => {
    if (!id || !crew) return;
    setDeleteInput('');
    setShowDeleteConfirm(true);
  };

  const confirmDeleteCrew = async () => {
    if (!id || !crew) return;
    if (deleteInput.trim() !== crew.name.trim()) {
      Alert.alert(t('common.error'), t('crew.nameMismatch'));
      return;
    }
    try {
      await deleteCrew(id);
      setShowDeleteConfirm(false);
      Alert.alert(t('common.done'), t('crew.crewDeleted'));
      router.replace('/(tabs)/community');
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('crew.deleteCrewFailed'));
    }
  };

  const ROLE_COLORS: Record<string, string> = {
    captain: Colors.warning,
    moderator: '#4FC3F7',
    member: Colors.textMuted,
  };

  const getRoleLabel = (role: string): string => {
    const roleMap: Record<string, string> = {
      captain: t('crew.captain'),
      moderator: t('crew.moderator'),
      member: t('crew.member'),
    };
    return roleMap[role] || role;
  };

  const handleApprove = async (requestId: string) => {
    try {
      await approveRequest(requestId);
      if (id) fetchCrewMembers(id);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      await rejectRequest(requestId);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  const handlePickThumbnail = async () => {
    if (!id) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) return;

      setUploadingThumb(true);
      const publicUrl = await uploadCrewThumbnail(id, result.assets[0].uri);
      await updateCrew(id, { thumbnailUrl: publicUrl });
      Alert.alert(t('common.done'), t('crew.thumbnailUpdated'));
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('crew.thumbnailFailed'));
    } finally {
      setUploadingThumb(false);
    }
  };

  if (!crew || !isCaptain) {
    return (
      <>
        <Stack.Screen options={{ title: t('crew.manageCrew') }} />
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t('crew.notAuthorized')}</Text>
        </View>
      </>
    );
  }

  const pendingCount = activePendingRequests.length;

  return (
    <>
      <Stack.Screen options={{ title: `${t('crew.manageCrew')}: ${crew.name}` }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* ── Thumbnail ── */}
        <View style={styles.thumbSection}>
          <TouchableOpacity style={styles.thumbPicker} onPress={handlePickThumbnail} disabled={uploadingThumb} activeOpacity={0.7}>
            {uploadingThumb ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : crew.thumbnailUrl ? (
              <Image source={{ uri: crew.thumbnailUrl }} style={styles.thumbImage} />
            ) : (
              <Ionicons name="camera-outline" size={28} color={Colors.textMuted} />
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={handlePickThumbnail} disabled={uploadingThumb}>
            <Text style={styles.thumbLabel}>
              {crew.thumbnailUrl ? t('crew.changeThumbnail') : t('crew.addThumbnail')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Crew Settings ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('crew.crewSettings')}</Text>
          {!isEditing ? (
            <TouchableOpacity onPress={() => setIsEditing(true)}>
              <Ionicons name="create-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleSave} disabled={loading.updateCrew}>
              {loading.updateCrew ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Text style={styles.saveText}>{t('common.save')}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {isEditing ? (
          <View style={styles.editForm}>
            <View style={styles.field}>
              <Text style={styles.label}>{t('community.crewName')}</Text>
              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
                maxLength={40}
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>{t('community.descriptionLabel')}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={editDesc}
                onChangeText={setEditDesc}
                maxLength={200}
                multiline
                numberOfLines={3}
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>{t('community.crewType')}</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggleButton, editType === 'open' && styles.toggleActive]}
                  onPress={() => setEditType('open')}
                >
                  <Text style={[styles.toggleText, editType === 'open' && styles.toggleTextActive]}>{t('community.crewTypeOpen')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleButton, editType === 'closed' && styles.toggleActive]}
                  onPress={() => setEditType('closed')}
                >
                  <Text style={[styles.toggleText, editType === 'closed' && styles.toggleTextActive]}>{t('community.crewTypeClosed')}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>{t('community.memberLimitLabel')}</Text>
              <TextInput
                style={[styles.input, { width: 100 }]}
                value={editLimit}
                onChangeText={setEditLimit}
                keyboardType="number-pad"
                maxLength={3}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>{t('community.region')}</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, editRegion === 'global' && styles.chipActive]}
                  onPress={() => setEditRegion('global')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, editRegion === 'global' && styles.chipTextActive]}>
                    🌐 {t('community.regionGlobal')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, editRegion === deviceCountry && styles.chipActive]}
                  onPress={() => setEditRegion(deviceCountry)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, editRegion === deviceCountry && styles.chipTextActive]}>
                    {countryToFlag(deviceCountry)} {deviceCountry}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.infoCard}>
            <InfoRow label={t('crew.type')} value={crew.crewType === 'open' ? t('community.crewTypeOpen') : t('community.crewTypeClosed')} />
            <InfoRow label={t('community.members')} value={`${crew.memberCount}/${crew.memberLimit}`} />
            <InfoRow label={t('community.danceStyle')} value={crew.danceStyle} />
            <InfoRow label={t('community.region')} value={`${countryToFlag(crew.region || 'global')} ${crew.region === 'global' ? t('community.regionGlobal') : crew.region || t('community.regionGlobal')}`} />
            <InfoRow label={t('crew.inviteCode')} value={crew.inviteCode || '—'} />
          </View>
        )}

        {/* ── Pending Requests ── */}
        {crew.crewType === 'closed' && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {t('crew.joinRequests')} {pendingCount > 0 ? `(${pendingCount})` : ''}
              </Text>
            </View>

            {activePendingRequests.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptySubtext}>{t('crew.noPendingRequests')}</Text>
              </View>
            ) : (
              <View style={styles.listBlock}>
                {activePendingRequests.map((req) => (
                  <View key={req.id} style={styles.requestRow}>
                    <View style={styles.avatar}>
                      <Ionicons name="person" size={16} color={Colors.textMuted} />
                    </View>
                    <View style={styles.requestInfo}>
                      <Text style={styles.requestName}>
                        {req.profile?.displayName || 'Dancer'}
                      </Text>
                      {req.message ? (
                        <Text style={styles.requestMessage} numberOfLines={2}>
                          {req.message}
                        </Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      style={styles.approveBtn}
                      onPress={() => handleApprove(req.id)}
                    >
                      <Ionicons name="checkmark" size={18} color="#FFF" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => handleReject(req.id)}
                    >
                      <Ionicons name="close" size={18} color={Colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* ── Members ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('community.members')} ({activeCrewMembers.length})</Text>
        </View>

        <View style={styles.listBlock}>
          {activeCrewMembers
            .sort((a, b) => {
              const order = { captain: 0, moderator: 1, member: 2 };
              return (order[a.role] ?? 2) - (order[b.role] ?? 2);
            })
            .map((member) => {
            const isMe = member.userId === user?.id;
            const roleColor = ROLE_COLORS[member.role] || Colors.textMuted;
            return (
              <TouchableOpacity
                key={member.id}
                style={styles.memberRow}
                onPress={() => !isMe && handleMemberAction(member)}
                activeOpacity={isMe ? 1 : 0.7}
              >
                <View style={[styles.avatar, { borderColor: roleColor }]}>
                  {member.profile?.avatarUrl ? (
                    <Image source={{ uri: member.profile.avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <Ionicons name="person" size={16} color={roleColor} />
                  )}
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>
                    {member.profile?.displayName || 'Dancer'}
                    {isMe ? t('crew.you') : ''}
                  </Text>
                  <View style={[styles.roleBadge, { backgroundColor: roleColor + '25' }]}>
                    <Text style={[styles.roleBadgeText, { color: roleColor }]}>
                      {getRoleLabel(member.role)}
                    </Text>
                  </View>
                </View>
                {!isMe && (
                  <Ionicons name="ellipsis-vertical" size={18} color={Colors.textMuted} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Delete Crew */}
        <View style={styles.dangerSection}>
          <TouchableOpacity style={styles.deleteCrewBtn} onPress={handleDeleteCrew} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={20} color={Colors.error} />
            <Text style={styles.deleteCrewText}>{t('crew.deleteCrew')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Delete Confirmation Modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowDeleteConfirm(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Ionicons name="warning" size={32} color={Colors.error} style={{ alignSelf: 'center' }} />
            <Text style={styles.modalTitle}>{t('crew.deleteCrew')}</Text>
            <Text style={styles.modalDesc}>
              {t('crew.deleteConfirmMessage')}
            </Text>
            <Text style={styles.modalCrewName}>"{crew?.name}"</Text>
            <TextInput
              style={styles.modalInput}
              value={deleteInput}
              onChangeText={setDeleteInput}
              placeholder={t('crew.typeCrewName')}
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowDeleteConfirm(false)}
              >
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalDeleteBtn,
                  deleteInput.trim() !== crew?.name.trim() && { opacity: 0.4 },
                ]}
                onPress={confirmDeleteCrew}
                disabled={deleteInput.trim() !== crew?.name.trim()}
              >
                <Text style={styles.modalDeleteText}>{t('common.delete')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingBottom: Spacing.xxl,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  // Thumbnail
  thumbSection: {
    alignItems: 'center',
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: 8,
  },
  thumbPicker: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  thumbLabel: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '500',
  },
  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  saveText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.primary,
  },
  // Edit form
  editForm: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
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
  textArea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  toggleButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  toggleText: {
    fontSize: FontSize.md,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  toggleTextActive: {
    color: '#FFF',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary + '30',
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  // Info card (read-only)
  infoCard: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  infoValue: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  // Lists
  listBlock: {
    paddingHorizontal: Spacing.md,
    gap: 6,
  },
  emptyBlock: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  // Request row
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.sm,
    borderRadius: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  requestInfo: {
    flex: 1,
    gap: 2,
  },
  requestName: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  requestMessage: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  approveBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  // Member row
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  memberInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberName: {
    fontSize: FontSize.md,
    color: Colors.text,
  },
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  dangerSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  deleteCrewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  deleteCrewText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.error,
  },
  // Delete confirmation modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.lg,
    width: '100%',
    maxWidth: 340,
    gap: 12,
  },
  modalTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.error,
    textAlign: 'center',
  },
  modalDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalCrewName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    fontSize: FontSize.md,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalCancelText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  modalDeleteBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.error,
  },
  modalDeleteText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: '#FFF',
  },
});
