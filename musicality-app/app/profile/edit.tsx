import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors, FontSize, Spacing } from '../../constants/theme';
import { useSocialStore } from '../../stores/socialStore';
import { checkNicknameAvailable, uploadProfileAvatar } from '../../services/communityApi';

const DANCE_STYLES = [
  { key: 'bachata', label: 'Bachata' },
  { key: 'salsa', label: 'Salsa' },
  { key: 'kizomba', label: 'Kizomba' },
  { key: 'zouk', label: 'Zouk' },
  { key: 'other', label: 'Other' },
];

export default function ProfileEditScreen() {
  const router = useRouter();
  const { myProfile, fetchMyProfile, updateMyProfile } = useSocialStore();

  const [displayName, setDisplayName] = useState('');
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [danceStyle, setDanceStyle] = useState('bachata');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  const [nicknameStatus, setNicknameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!myProfile) {
      fetchMyProfile();
      return;
    }
    setDisplayName(myProfile.displayName);
    setNickname(myProfile.nickname ?? '');
    setPhone(myProfile.phone ?? '');
    setDanceStyle(myProfile.danceStyle);
    setAvatarUri(myProfile.avatarUrl);
  }, [myProfile?.id]);

  // Nickname debounce check
  const checkNickname = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim() || value === myProfile?.nickname) {
      setNicknameStatus('idle');
      return;
    }

    // Validate format: 2-20 chars, alphanumeric + underscore
    if (!/^[a-zA-Z0-9_]{2,20}$/.test(value)) {
      setNicknameStatus('taken');
      return;
    }

    setNicknameStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const available = await checkNicknameAvailable(value);
        setNicknameStatus(available ? 'available' : 'taken');
      } catch {
        setNicknameStatus('idle');
      }
    }, 500);
  }, [myProfile?.nickname]);

  const handleNicknameChange = (value: string) => {
    setNickname(value.toLowerCase());
    checkNickname(value.toLowerCase());
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert('오류', '이름을 입력해주세요');
      return;
    }
    if (nickname && !/^[a-zA-Z0-9_]{2,20}$/.test(nickname)) {
      Alert.alert('오류', '닉네임은 2-20자, 영문/숫자/_ 만 가능합니다');
      return;
    }
    if (nicknameStatus === 'taken') {
      Alert.alert('오류', '이미 사용 중인 닉네임입니다');
      return;
    }

    setSaving(true);
    try {
      let newAvatarUrl = myProfile?.avatarUrl;

      // Upload avatar if changed (local URI)
      if (avatarUri && avatarUri !== myProfile?.avatarUrl && !avatarUri.startsWith('http')) {
        newAvatarUrl = await uploadProfileAvatar(avatarUri);
      }

      await updateMyProfile({
        displayName: displayName.trim(),
        nickname: nickname || undefined,
        avatarUrl: newAvatarUrl ?? undefined,
        phone: phone || undefined,
        danceStyle,
      });

      Alert.alert('완료', '프로필이 업데이트되었습니다');
      router.back();
    } catch (e: any) {
      Alert.alert('오류', e.message ?? '프로필 업데이트에 실패했습니다');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>프로필 편집</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={styles.saveText}>저장</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Avatar */}
      <TouchableOpacity style={styles.avatarSection} onPress={pickAvatar}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={40} color={Colors.textMuted} />
          </View>
        )}
        <View style={styles.cameraIcon}>
          <Ionicons name="camera" size={16} color="#FFF" />
        </View>
      </TouchableOpacity>

      {/* Display Name */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>이름</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="이름을 입력하세요"
          placeholderTextColor={Colors.textMuted}
          maxLength={30}
        />
      </View>

      {/* Nickname */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>닉네임</Text>
        <View style={styles.nicknameRow}>
          <Text style={styles.atSign}>@</Text>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={nickname}
            onChangeText={handleNicknameChange}
            placeholder="nickname"
            placeholderTextColor={Colors.textMuted}
            maxLength={20}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {nicknameStatus === 'checking' && (
            <ActivityIndicator size="small" color={Colors.primary} />
          )}
          {nicknameStatus === 'available' && (
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
          )}
          {nicknameStatus === 'taken' && (
            <Ionicons name="close-circle" size={20} color={Colors.error} />
          )}
        </View>
        <Text style={styles.fieldHint}>영문, 숫자, _ (2-20자)</Text>
      </View>

      {/* Phone */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>전화번호 (선택)</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="010-0000-0000"
          placeholderTextColor={Colors.textMuted}
          keyboardType="phone-pad"
        />
      </View>

      {/* Dance Style */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>댄스 스타일</Text>
        <View style={styles.styleRow}>
          {DANCE_STYLES.map((s) => (
            <TouchableOpacity
              key={s.key}
              style={[styles.styleChip, danceStyle === s.key && styles.styleChipActive]}
              onPress={() => setDanceStyle(s.key)}
            >
              <Text style={[styles.styleChipText, danceStyle === s.key && styles.styleChipTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: Spacing.xxl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  saveText: {
    color: Colors.primary,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  avatarSection: {
    alignSelf: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.surfaceLight,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  fieldLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  fieldHint: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text,
    fontSize: FontSize.md,
  },
  nicknameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  atSign: {
    color: Colors.textMuted,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  styleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  styleChip: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 16,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  styleChipActive: {
    backgroundColor: Colors.primary,
  },
  styleChipText: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  styleChipTextActive: {
    color: '#FFFFFF',
  },
});
