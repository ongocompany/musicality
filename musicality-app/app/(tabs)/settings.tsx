import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import { checkServerHealth } from '../../services/analysisApi';
import { API_BASE_URL } from '../../constants/config';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';
import { LANGUAGES, LanguageCode } from '../../i18n';
import { useTutorialStore } from '../../stores/tutorialStore';
import { ensureDemoTrack } from '../../utils/demoTrack';

const LOOK_AHEAD_STEP = 25; // ms per tap

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const {
    lookAheadMs, setLookAheadMs,
    language, setLanguage,
    showAlbumArt, setShowAlbumArt,
    autoHideMs, setAutoHideMs,
    cloudSyncEnabled, setCloudSyncEnabled,
    cloudSyncWifiOnly, setCloudSyncWifiOnly,
  } = useSettingsStore();
  const { user, guestMode, signOut } = useAuthStore();
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);

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

      {/* Cloud Library (logged-in users only) */}
      {user && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.cloudLibrary', { defaultValue: 'Cloud Library' })}</Text>
          <View style={styles.row}>
            <Ionicons name="cloud-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.label}>{t('settings.cloudSync', { defaultValue: '클라우드 동기화' })}</Text>
            <TouchableOpacity
              onPress={() => setCloudSyncEnabled(!cloudSyncEnabled)}
              style={[styles.toggle, cloudSyncEnabled && styles.toggleActive]}
            >
              <Text style={styles.toggleText}>{cloudSyncEnabled ? 'ON' : 'OFF'}</Text>
            </TouchableOpacity>
          </View>
          {cloudSyncEnabled && (
            <View style={styles.row}>
              <Ionicons name="wifi-outline" size={20} color={Colors.textSecondary} />
              <Text style={styles.label}>{t('settings.wifiOnly', { defaultValue: 'Wi-Fi에서만 동기화' })}</Text>
              <TouchableOpacity
                onPress={() => setCloudSyncWifiOnly(!cloudSyncWifiOnly)}
                style={[styles.toggle, cloudSyncWifiOnly && styles.toggleActive]}
              >
                <Text style={styles.toggleText}>{cloudSyncWifiOnly ? 'ON' : 'OFF'}</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.row}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
            <Text style={[styles.label, { color: Colors.textMuted, fontSize: FontSize.xs }]}>
              {t('settings.cloudNote', { defaultValue: '서버 저장 시 192kbps로 변환됩니다' })}
            </Text>
          </View>
        </View>
      )}

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
          onPress={async () => {
            await ensureDemoTrack();
            useTutorialStore.getState().startTutorial();
          }}
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
                        // Server-side: delete auth.users → CASCADE profiles → all user data
                        const { error: rpcError } = await supabase.rpc('delete_own_account');
                        if (rpcError) {
                          // Captain must transfer crew ownership first
                          if (rpcError.message?.includes('CAPTAIN_MUST_TRANSFER')) {
                            Alert.alert(
                              t('settings.deleteAccount'),
                              t('settings.captainMustTransfer'),
                            );
                            return;
                          }
                          throw rpcError;
                        }
                        // Reset all local stores + clear persisted data, then sign out
                        // (signOut internally calls resetAllStores)
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
  toggle: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  toggleText: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
});
