import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform, ScrollView, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import { LANGUAGES, LanguageCode } from '../../i18n';

const __DEV_MODE__ = __DEV__; // true in Expo Go dev

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t, i18n } = useTranslation();
  const { signInWithGoogle, signInWithApple, enterGuestMode } = useAuthStore();
  const { language, setLanguage } = useSettingsStore();
  const [signingIn, setSigningIn] = useState<string | null>(null);
  const [showLangPicker, setShowLangPicker] = useState(!language); // show if no language set
  const contentMaxWidth = Math.min(width - Spacing.xl * 2, 400);

  const handleSelectLanguage = (code: LanguageCode) => {
    setLanguage(code);
    i18n.changeLanguage(code);
    setShowLangPicker(false);
  };

  const handleSignIn = async (provider: string, signInFn: () => Promise<void>) => {
    try {
      setSigningIn(provider);
      await signInFn();
    } catch (error: any) {
      Alert.alert(t('auth.loginFailed'), error.message || t('auth.tryAgain'));
    } finally {
      setSigningIn(null);
    }
  };

  // Language selection screen
  if (showLangPicker) {
    return (
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.inner, { maxWidth: contentMaxWidth }]}>
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Ionicons name="musical-notes" size={48} color={Colors.primary} />
            </View>
            <Text style={styles.title}>Musicality</Text>
            <Text style={[styles.subtitle, { marginTop: Spacing.lg }]}>
              {t('auth.selectLanguage')}
            </Text>
          </View>

          <View style={styles.langGrid}>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.langButton,
                  i18n.language === lang.code && styles.langButtonActive,
                ]}
                onPress={() => handleSelectLanguage(lang.code)}
                activeOpacity={0.7}
              >
                <Text style={styles.langFlag}>{lang.flag}</Text>
                <Text style={[
                  styles.langLabel,
                  i18n.language === lang.code && styles.langLabelActive,
                ]}>
                  {lang.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 20 }]}
      bounces={false}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.inner, { maxWidth: contentMaxWidth }]}>
      {/* Logo & Title */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Ionicons name="musical-notes" size={48} color={Colors.primary} />
        </View>
        <Text style={styles.title}>Musicality</Text>
        <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>
      </View>

      {/* Social Login Buttons */}
      <View style={styles.buttonGroup}>
        {/* Google */}
        <TouchableOpacity
          style={[styles.socialButton, styles.googleButton]}
          onPress={() => handleSignIn('google', signInWithGoogle)}
          disabled={signingIn !== null}
          activeOpacity={0.8}
        >
          {signingIn === 'google' ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Ionicons name="logo-google" size={20} color="#FFF" />
              <Text style={styles.socialButtonText}>{t('auth.continueWithGoogle')}</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Apple (iOS only) */}
        {Platform.OS === 'ios' && (
          <TouchableOpacity
            style={[styles.socialButton, styles.appleButton, { opacity: 0.5 }]}
            onPress={() => Alert.alert(t('common.comingSoon'), t('auth.appleComing'))}
            activeOpacity={0.8}
          >
            <Ionicons name="logo-apple" size={22} color="#FFF" />
            <Text style={styles.socialButtonText}>{t('auth.continueWithApple')}</Text>
            <Text style={styles.comingSoonBadge}>{t('common.comingSoon')}</Text>
          </TouchableOpacity>
        )}

      </View>

      {/* Guest Mode */}
      <TouchableOpacity
        style={styles.guestButton}
        onPress={enterGuestMode}
        activeOpacity={0.6}
      >
        <Text style={styles.guestButtonText}>{t('auth.continueAsGuest')}</Text>
      </TouchableOpacity>

      {/* Dev Login — only in development */}
      {__DEV_MODE__ && (
        <TouchableOpacity
          style={[styles.socialButton, styles.devButton]}
          onPress={async () => {
            try {
              setSigningIn('dev');
              const { error } = await supabase.auth.signInWithPassword({
                email: 'test@musicality.app',
                password: 'test1234!',
              });
              if (error) throw error;
            } catch (err: any) {
              Alert.alert('Dev Login Failed', err.message);
            } finally {
              setSigningIn(null);
            }
          }}
          disabled={signingIn !== null}
          activeOpacity={0.8}
        >
          {signingIn === 'dev' ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Ionicons name="code-slash" size={18} color="#FFF" />
              <Text style={styles.socialButtonText}>{t('auth.devLogin')}</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Language switcher + Footer */}
      <TouchableOpacity
        style={styles.langSwitcher}
        onPress={() => setShowLangPicker(true)}
      >
        <Ionicons name="globe-outline" size={16} color={Colors.textMuted} />
        <Text style={styles.langSwitcherText}>
          {LANGUAGES.find(l => l.code === i18n.language)?.label ?? 'English'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.footer}>{t('auth.footer')}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  inner: {
    width: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 60,
  },
  logoContainer: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  buttonGroup: {
    gap: 12,
    marginBottom: Spacing.xl,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 12,
    gap: 10,
  },
  googleButton: {
    backgroundColor: '#4285F4',
  },
  appleButton: {
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#333',
  },
  socialButtonText: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: '#FFF',
  },
  comingSoonBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  guestButton: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  guestButtonText: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },
  devButton: {
    backgroundColor: '#FF6B35',
    borderWidth: 2,
    borderColor: '#FF6B35',
    borderStyle: 'dashed',
  },
  langSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  langSwitcherText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textDecorationLine: 'underline',
  },
  footer: {
    textAlign: 'center',
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: Spacing.md,
    lineHeight: 18,
  },
  // Language picker
  langGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  langButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: '45%',
  },
  langButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceLight,
  },
  langFlag: {
    fontSize: 22,
  },
  langLabel: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  langLabelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
});
