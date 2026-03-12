import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import { checkServerHealth } from '../../services/analysisApi';
import { API_BASE_URL } from '../../constants/config';
import { usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';
import { DanceStyle } from '../../utils/beatCounter';
import { CueType, CUE_TYPE_LABELS } from '../../types/cue';
import { PhraseDetectionMode } from '../../types/analysis';

const LOOK_AHEAD_STEP = 25; // ms per tap

export default function SettingsScreen() {
  const {
    danceStyle, setDanceStyle, lookAheadMs, setLookAheadMs,
    cueType, setCueType, cueVolume, setCueVolume,
    phraseDetectionMode, setPhraseDetectionMode,
    defaultBeatsPerPhrase, setDefaultBeatsPerPhrase,
  } = useSettingsStore();
  const { user, guestMode, signOut } = useAuthStore();
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const checkServer = useCallback(async () => {
    setChecking(true);
    const online = await checkServerHealth();
    setServerOnline(online);
    setChecking(false);
  }, []);

  useEffect(() => {
    checkServer();
  }, [checkServer]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Account */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        {user ? (
          <>
            <View style={styles.row}>
              {user.user_metadata?.avatar_url ? (
                <Image source={{ uri: user.user_metadata.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Ionicons name="person" size={18} color={Colors.textMuted} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.label} numberOfLines={1}>
                  {user.user_metadata?.full_name || user.user_metadata?.name || '사용자'}
                </Text>
                <Text style={styles.serverUrl}>{user.email || ''}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.row}
              onPress={() => {
                Alert.alert('로그아웃', '정말 로그아웃하시겠습니까?', [
                  { text: '취소', style: 'cancel' },
                  { text: '로그아웃', style: 'destructive', onPress: signOut },
                ]);
              }}
            >
              <Ionicons name="log-out-outline" size={20} color={Colors.error} />
              <Text style={[styles.label, { color: Colors.error }]}>로그아웃</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.row}>
            <Ionicons name="person-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.label}>비회원 모드</Text>
            <Text style={styles.value}>로그인하면 클라우드 동기화 가능</Text>
          </View>
        )}
      </View>

      {/* Server Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Analysis Server</Text>
        <View style={styles.row}>
          <View style={[styles.statusDot, serverOnline === true && styles.statusOnline, serverOnline === false && styles.statusOffline]} />
          <Text style={styles.label}>
            {serverOnline === null ? 'Checking...' : serverOnline ? 'Connected' : 'Disconnected'}
          </Text>
          <TouchableOpacity onPress={checkServer} disabled={checking}>
            <Ionicons name="refresh" size={20} color={checking ? Colors.textMuted : Colors.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.row}>
          <Ionicons name="server-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.serverUrl}>{API_BASE_URL}</Text>
        </View>
      </View>

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App</Text>
        <View style={styles.row}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.label}>Version</Text>
          <Text style={styles.value}>1.0.0 (M7)</Text>
        </View>
      </View>

      {/* Dance Style */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Dance Style</Text>
        {([
          { key: 'bachata' as DanceStyle, label: 'Bachata', desc: '1-2-3-TAP-5-6-7-TAP' },
          { key: 'salsa-on1' as DanceStyle, label: 'Salsa On1', desc: '1-2-3-pause-5-6-7-pause' },
          { key: 'salsa-on2' as DanceStyle, label: 'Salsa On2', desc: '1-2-3-pause-5-6-7-pause' },
        ]).map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.row, danceStyle === item.key && styles.rowActive]}
            onPress={() => setDanceStyle(item.key)}
          >
            <Ionicons
              name={danceStyle === item.key ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={danceStyle === item.key ? Colors.primary : Colors.textSecondary}
            />
            <Text style={[styles.label, danceStyle === item.key && styles.labelActive]}>
              {item.label}
            </Text>
            <Text style={styles.styleDesc}>{item.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Phrase Detection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Phrase Detection</Text>
        {([
          { key: 'rule-based' as PhraseDetectionMode, label: 'Rule-based', desc: '고정 길이 자동 분할' },
          { key: 'user-marked' as PhraseDetectionMode, label: 'User Mark', desc: '직접 프레이즈 경계 표시' },
          { key: 'server' as PhraseDetectionMode, label: 'Server Analysis', desc: '서버 구조 분석 사용' },
        ]).map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.row, phraseDetectionMode === item.key && styles.rowActive]}
            onPress={() => setPhraseDetectionMode(item.key)}
          >
            <Ionicons
              name={phraseDetectionMode === item.key ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={phraseDetectionMode === item.key ? Colors.primary : Colors.textSecondary}
            />
            <Text style={[styles.label, phraseDetectionMode === item.key && styles.labelActive]}>
              {item.label}
            </Text>
            <Text style={styles.styleDesc}>{item.desc}</Text>
          </TouchableOpacity>
        ))}
        {/* Beats per phrase (for rule-based mode) */}
        <View style={styles.row}>
          <Ionicons name="resize-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.label}>Phrase Length</Text>
          <View style={styles.lookAheadControls}>
            <TouchableOpacity
              style={styles.lookAheadBtn}
              onPress={() => setDefaultBeatsPerPhrase(defaultBeatsPerPhrase - 8)}
            >
              <Ionicons name="remove" size={18} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.lookAheadValue}>{defaultBeatsPerPhrase / 8}×8</Text>
            <TouchableOpacity
              style={styles.lookAheadBtn}
              onPress={() => setDefaultBeatsPerPhrase(defaultBeatsPerPhrase + 8)}
            >
              <Ionicons name="add" size={18} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.lookAheadHint}>
          프레이즈 = {defaultBeatsPerPhrase}박 ({defaultBeatsPerPhrase / 8}×에잇카운트)
        </Text>
      </View>

      {/* Count Timing */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Count Timing</Text>
        <View style={styles.row}>
          <Ionicons name="timer-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.label}>Look-ahead</Text>
          <View style={styles.lookAheadControls}>
            <TouchableOpacity
              style={styles.lookAheadBtn}
              onPress={() => setLookAheadMs(lookAheadMs - LOOK_AHEAD_STEP)}
            >
              <Ionicons name="remove" size={18} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.lookAheadValue}>{lookAheadMs}ms</Text>
            <TouchableOpacity
              style={styles.lookAheadBtn}
              onPress={() => setLookAheadMs(lookAheadMs + LOOK_AHEAD_STEP)}
            >
              <Ionicons name="add" size={18} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.lookAheadHint}>
          카운트가 느리면 ↑, 빠르면 ↓ (0~300ms)
        </Text>
      </View>

      {/* Data Reset */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data</Text>
        <TouchableOpacity
          style={styles.row}
          onPress={() => {
            const trackCount = usePlayerStore.getState().tracks.length;
            const folderCount = usePlayerStore.getState().folders.length;
            Alert.alert(
              '라이브러리 초기화',
              `트랙 ${trackCount}개, 폴더 ${folderCount}개가 삭제됩니다.\n이 작업은 되돌릴 수 없습니다.`,
              [
                { text: '취소', style: 'cancel' },
                {
                  text: '초기화',
                  style: 'destructive',
                  onPress: async () => {
                    await AsyncStorage.removeItem('musicality-tracks');
                    usePlayerStore.setState({
                      tracks: [],
                      folders: [],
                      currentTrack: null,
                      isPlaying: false,
                      position: 0,
                      duration: 0,
                    });
                    Alert.alert('완료', '라이브러리가 초기화되었습니다.');
                  },
                },
              ],
            );
          }}
        >
          <Ionicons name="trash-outline" size={20} color={Colors.error} />
          <Text style={[styles.label, { color: Colors.error }]}>라이브러리 초기화</Text>
          <Text style={styles.value}>트랙 + 폴더 삭제</Text>
        </TouchableOpacity>
      </View>

      {/* Cue Sounds */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cue Sounds</Text>
        {(Object.keys(CUE_TYPE_LABELS) as CueType[]).map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.row, cueType === type && styles.rowActive]}
            onPress={() => setCueType(type)}
          >
            <Ionicons
              name={cueType === type ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={cueType === type ? Colors.primary : Colors.textSecondary}
            />
            <Text style={[styles.label, cueType === type && styles.labelActive]}>
              {CUE_TYPE_LABELS[type]}
            </Text>
          </TouchableOpacity>
        ))}
        {/* Volume control (only show when cue is not off) */}
        {cueType !== 'off' && (
          <>
            <View style={styles.row}>
              <Ionicons name="volume-medium-outline" size={20} color={Colors.textSecondary} />
              <Text style={styles.label}>Volume</Text>
              <View style={styles.lookAheadControls}>
                <TouchableOpacity
                  style={styles.lookAheadBtn}
                  onPress={() => setCueVolume(cueVolume - 0.1)}
                >
                  <Ionicons name="remove" size={18} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.lookAheadValue}>{Math.round(cueVolume * 100)}%</Text>
                <TouchableOpacity
                  style={styles.lookAheadBtn}
                  onPress={() => setCueVolume(cueVolume + 0.1)}
                >
                  <Ionicons name="add" size={18} color={Colors.text} />
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  section: { marginBottom: Spacing.xl },
  sectionTitle: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '700', marginBottom: Spacing.md, textTransform: 'uppercase', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  label: { flex: 1, color: Colors.text, fontSize: FontSize.lg },
  value: { color: Colors.textSecondary, fontSize: FontSize.md },
  comingSoon: { color: Colors.textMuted, fontSize: FontSize.lg },
  serverUrl: { flex: 1, color: Colors.textMuted, fontSize: FontSize.sm },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.textMuted,
  },
  statusOnline: { backgroundColor: '#4CAF50' },
  statusOffline: { backgroundColor: Colors.error },
  rowActive: {
    backgroundColor: Colors.surfaceLight,
    borderBottomColor: Colors.primary,
  },
  labelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  styleDesc: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
  lookAheadControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  lookAheadBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  lookAheadValue: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '700',
    minWidth: 56,
    textAlign: 'center',
  },
  lookAheadHint: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
    paddingLeft: Spacing.xl + Spacing.md,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
