import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import { checkServerHealth } from '../../services/analysisApi';
import { API_BASE_URL } from '../../constants/config';
import { useSettingsStore } from '../../stores/settingsStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useAuthStore } from '../../stores/authStore';
import { LANGUAGES, LanguageCode } from '../../i18n';
import { exportLibraryBackup, importLibraryBackup, LibraryBackup } from '../../services/libraryBackupService';
import { extractMetadata } from '../../modules/my-module';
import { File, Directory, Paths } from 'expo-file-system/next';

const LOOK_AHEAD_STEP = 25; // ms per tap

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const {
    lookAheadMs, setLookAheadMs,
    language, setLanguage,
    showAlbumArt, setShowAlbumArt,
    autoHideMs, setAutoHideMs,
  } = useSettingsStore();
  const { user, guestMode, signOut } = useAuthStore();
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [reloadingArt, setReloadingArt] = useState(false);

  const checkServer = useCallback(async () => {
    setChecking(true);
    const online = await checkServerHealth();
    setServerOnline(online);
    setChecking(false);
  }, []);

  useEffect(() => {
    checkServer();
  }, [checkServer]);

  const handleLanguageChange = (code: LanguageCode) => {
    setLanguage(code);
    i18n.changeLanguage(code);
    setShowLangPicker(false);
  };


  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Account */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
        {user ? (
          <>
            <View style={styles.row}>
              <Ionicons name="mail-outline" size={20} color={Colors.textSecondary} />
              <Text style={styles.label}>{user.email || t('settings.noEmail')}</Text>
            </View>
            <TouchableOpacity
              style={styles.row}
              onPress={() => {
                Alert.alert(t('settings.logout'), t('settings.logoutConfirm'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('settings.logout'), style: 'destructive', onPress: signOut },
                ]);
              }}
            >
              <Ionicons name="log-out-outline" size={20} color={Colors.error} />
              <Text style={[styles.label, { color: Colors.error }]}>{t('settings.logout')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.row}>
            <Ionicons name="person-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.label}>{t('settings.guestMode')}</Text>
            <Text style={styles.value}>{t('settings.guestHint')}</Text>
          </View>
        )}
      </View>

      {/* Server Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.analysisServer')}</Text>
        <View style={styles.row}>
          <View style={[styles.statusDot, serverOnline === true && styles.statusOnline, serverOnline === false && styles.statusOffline]} />
          <Text style={styles.label}>
            {serverOnline === null ? t('settings.checking') : serverOnline ? t('settings.connected') : t('settings.disconnected')}
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
        <Text style={styles.sectionTitle}>{t('settings.app')}</Text>
        <View style={styles.row}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.label}>{t('settings.version')}</Text>
          <Text style={styles.value}>0.9.1 (Beta 2)</Text>
        </View>
        <TouchableOpacity
          style={styles.row}
          onPress={() => useSettingsStore.getState().setHasSeenOnboarding(false)}
        >
          <Ionicons name="help-circle-outline" size={20} color={Colors.primary} />
          <Text style={[styles.label, { color: Colors.primary }]}>{t('settings.tutorial')}</Text>
        </TouchableOpacity>

        {/* Language */}
        <TouchableOpacity
          style={styles.row}
          onPress={() => setShowLangPicker(!showLangPicker)}
        >
          <Ionicons name="globe-outline" size={20} color={Colors.primary} />
          <Text style={[styles.label, { color: Colors.primary }]}>{t('settings.language')}</Text>
          <Text style={styles.value}>
            {LANGUAGES.find(l => l.code === i18n.language)?.flag}{' '}
            {LANGUAGES.find(l => l.code === i18n.language)?.label}
          </Text>
        </TouchableOpacity>
        {showLangPicker && (
          <View style={styles.langGrid}>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.langOption,
                  i18n.language === lang.code && styles.langOptionActive,
                ]}
                onPress={() => handleLanguageChange(lang.code)}
              >
                <Text style={styles.langFlag}>{lang.flag}</Text>
                <Text style={[
                  styles.langLabel,
                  i18n.language === lang.code && styles.langLabelActive,
                ]}>{lang.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Dance Style — hidden (auto-detected, kept for internal use) */}

      {/* Phrase Detection — hidden (managed in player via grid long-press) */}

      {/* Player */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.countTiming')}</Text>

        {/* Album art toggle */}
        <TouchableOpacity
          style={styles.row}
          onPress={() => setShowAlbumArt(!showAlbumArt)}
        >
          <Ionicons name="image-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.label}>{t('settings.showAlbumArt', { defaultValue: '앨범아트 표시' })}</Text>
          <Ionicons
            name={showAlbumArt ? 'toggle' : 'toggle-outline'}
            size={32}
            color={showAlbumArt ? Colors.primary : Colors.textMuted}
          />
        </TouchableOpacity>
        <View style={styles.row}>
          <Ionicons name="timer-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.label}>{t('settings.lookAhead')}</Text>
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
          {t('settings.lookAheadHint')}
        </Text>

        {/* Auto-hide controls */}
        <View style={[styles.row, { marginTop: Spacing.sm }]}>
          <Ionicons name="eye-off-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.label}>{t('settings.autoHide', { defaultValue: '컨트롤 자동숨김' })}</Text>
          <View style={styles.lookAheadControls}>
            <TouchableOpacity
              style={styles.lookAheadBtn}
              onPress={() => setAutoHideMs(autoHideMs <= 0 ? 0 : autoHideMs - 1000)}
            >
              <Ionicons name="remove" size={18} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.lookAheadValue}>
              {autoHideMs <= 0 ? t('common.off', { defaultValue: 'OFF' }) : `${autoHideMs / 1000}s`}
            </Text>
            <TouchableOpacity
              style={styles.lookAheadBtn}
              onPress={() => setAutoHideMs(autoHideMs + 1000)}
            >
              <Ionicons name="add" size={18} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.lookAheadHint}>
          {t('settings.autoHideHint', { defaultValue: '재생 중 하단 컨트롤바를 자동으로 숨깁니다' })}
        </Text>
      </View>

      {/* Library Management */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.libraryManagement', { defaultValue: '라이브러리 관리' })}</Text>
        <TouchableOpacity
          style={styles.row}
          onPress={async () => {
            try {
              const playerState = usePlayerStore.getState();
              const settingsState = useSettingsStore.getState();
              const backup: LibraryBackup = {
                version: 1,
                createdAt: Date.now(),
                player: {
                  tracks: playerState.tracks,
                  folders: playerState.folders,
                  sortBy: playerState.sortBy,
                  sortOrder: playerState.sortOrder,
                },
                settings: {
                  downbeatOffsets: settingsState.downbeatOffsets,
                  beatTimeOffsets: settingsState.beatTimeOffsets,
                  bpmOverrides: settingsState.bpmOverrides,
                  phraseMarks: settingsState.phraseMarks,
                  trackEditions: settingsState.trackEditions,
                  cellNotes: settingsState.cellNotes,
                  importedNotes: settingsState.importedNotes,
                  trackFormations: settingsState.trackFormations,
                  stageConfig: settingsState.stageConfig,
                },
              };
              await exportLibraryBackup(backup);
            } catch (e: any) {
              Alert.alert(t('common.error'), e?.message || 'Export failed');
            }
          }}
        >
          <Ionicons name="cloud-upload-outline" size={20} color={Colors.primary} />
          <Text style={[styles.label, { color: Colors.primary }]}>
            {t('settings.exportLibrary', { defaultValue: '라이브러리 백업 (내보내기)' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.row}
          onPress={async () => {
            Alert.alert(
              t('settings.importLibrary', { defaultValue: '라이브러리 복원' }),
              t('settings.importLibraryConfirm', { defaultValue: '현재 라이브러리 설정이 백업 파일의 내용으로 덮어씌워집니다. 계속하시겠습니까?' }),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('settings.restore', { defaultValue: '복원' }),
                  onPress: async () => {
                    try {
                      const backup = await importLibraryBackup();
                      if (!backup) return;
                      // Restore player state (bulk replace)
                      usePlayerStore.setState({
                        tracks: backup.player.tracks,
                        folders: backup.player.folders || [],
                        sortBy: backup.player.sortBy as any,
                        sortOrder: backup.player.sortOrder as any,
                      });
                      // Restore settings (bulk set via Zustand setState)
                      useSettingsStore.setState({
                        ...backup.settings,
                      });
                      Alert.alert(
                        t('common.done', { defaultValue: '완료' }),
                        t('settings.importSuccess', { defaultValue: `${backup.player.tracks.length}곡이 복원되었습니다.` }),
                      );
                    } catch (e: any) {
                      Alert.alert(t('common.error'), e?.message || 'Import failed');
                    }
                  },
                },
              ],
            );
          }}
        >
          <Ionicons name="cloud-download-outline" size={20} color={Colors.primary} />
          <Text style={[styles.label, { color: Colors.primary }]}>
            {t('settings.importLibrary', { defaultValue: '라이브러리 복원 (가져오기)' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.row}
          onPress={async () => {
            if (reloadingArt) return;
            setReloadingArt(true);
            try {
              const tracks = usePlayerStore.getState().tracks;
              const audioTracks = tracks.filter(t => t.mediaType === 'audio' && t.uri);
              let updated = 0;
              const mediaDir = new Directory(Paths.document, 'media');
              if (!mediaDir.exists) mediaDir.create();

              for (const track of audioTracks) {
                try {
                  const meta = await extractMetadata(track.uri);
                  if (meta?.albumArt) {
                    const artFile = new File(mediaDir, `art-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`);
                    new File(meta.albumArt.startsWith('/') ? `file://${meta.albumArt}` : meta.albumArt).copy(artFile);
                    usePlayerStore.getState().setTrackThumbnail(track.id, artFile.uri);
                    updated++;
                  }
                } catch {}
              }
              Alert.alert(
                t('common.done', { defaultValue: '완료' }),
                `${updated}/${audioTracks.length} ${t('settings.albumArtUpdated', { defaultValue: '곡의 앨범아트를 갱신했습니다.' })}`,
              );
            } catch (e: any) {
              Alert.alert(t('common.error'), e?.message || 'Failed');
            } finally {
              setReloadingArt(false);
            }
          }}
          disabled={reloadingArt}
        >
          <Ionicons name="images-outline" size={20} color={reloadingArt ? Colors.textMuted : Colors.primary} />
          <Text style={[styles.label, { color: reloadingArt ? Colors.textMuted : Colors.primary }]}>
            {reloadingArt
              ? t('settings.reloadingAlbumArt', { defaultValue: '앨범아트 검색 중...' })
              : t('settings.reloadAlbumArt', { defaultValue: '앨범아트 재검색' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.row, { marginTop: Spacing.md }]}
          onPress={() => {
            const trackCount = usePlayerStore.getState().tracks.length;
            const folderCount = usePlayerStore.getState().folders.length;
            Alert.alert(
              t('settings.resetLibrary', { defaultValue: '라이브러리 초기화' }),
              t('settings.resetLibraryConfirm', {
                defaultValue: `트랙 ${trackCount}곡, 폴더 ${folderCount}개가 모두 삭제됩니다. 계속하시겠습니까?`,
                trackCount,
                folderCount,
              }),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.reset', { defaultValue: '초기화' }),
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
                    Alert.alert(
                      t('common.done', { defaultValue: '완료' }),
                      t('settings.resetLibraryDone', { defaultValue: '라이브러리가 초기화되었습니다.' }),
                    );
                  },
                },
              ],
            );
          }}
        >
          <Ionicons name="trash-outline" size={20} color={Colors.error} />
          <Text style={[styles.label, { color: Colors.error }]}>
            {t('settings.resetLibrary', { defaultValue: '라이브러리 초기화' })}
          </Text>
        </TouchableOpacity>
        <Text style={styles.lookAheadHint}>
          {t('settings.libraryHint', { defaultValue: '기기 변경 시 백업 파일(.ritmo-backup)로 라이브러리를 이전할 수 있습니다' })}
        </Text>
      </View>

      {/* Account */}
      {user && !guestMode && (
        <View style={[styles.section, { marginTop: Spacing.xl }]}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => {
              Alert.alert(
                t('settings.deleteAccount'),
                t('settings.deleteAccountConfirm'),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('settings.withdraw'),
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        const { supabase } = await import('../../lib/supabase');
                        // Delete user data
                        const userId = user.id;
                        await supabase.from('profiles').delete().eq('id', userId);
                        await supabase.from('crew_members').delete().eq('user_id', userId);
                        await supabase.from('thread_phrase_notes').delete().eq('user_id', userId);
                        await supabase.from('board_posts').delete().eq('user_id', userId);
                        // Clear local data
                        await AsyncStorage.clear();
                        // Sign out
                        await signOut();
                        Alert.alert(t('common.done'), t('settings.deleteAccountDone'));
                      } catch (err: any) {
                        Alert.alert(t('common.error'), err?.message || t('settings.deleteAccountFailed'));
                      }
                    },
                  },
                ],
              );
            }}
          >
            <Ionicons name="person-remove-outline" size={20} color={Colors.error} />
            <Text style={[styles.label, { color: Colors.error }]}>{t('settings.deleteAccount')}</Text>
          </TouchableOpacity>
        </View>
      )}
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
  // Language picker inline
  langGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: Spacing.md,
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  langOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceLight,
  },
  langFlag: {
    fontSize: 18,
  },
  langLabel: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  langLabelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
});
