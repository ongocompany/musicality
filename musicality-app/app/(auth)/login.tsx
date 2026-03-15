import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform, ScrollView, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, FontSize } from '../../constants/theme';

const __DEV_MODE__ = __DEV__; // true in Expo Go dev

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { signInWithGoogle, signInWithApple, enterGuestMode } = useAuthStore();
  const [signingIn, setSigningIn] = useState<string | null>(null);
  const contentMaxWidth = Math.min(width - Spacing.xl * 2, 400);

  const handleSignIn = async (provider: string, signInFn: () => Promise<void>) => {
    try {
      setSigningIn(provider);
      await signInFn();
    } catch (error: any) {
      Alert.alert('로그인 실패', error.message || '다시 시도해주세요.');
    } finally {
      setSigningIn(null);
    }
  };

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
        <Text style={styles.subtitle}>Latin Dance Count Practice</Text>
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
              <Text style={styles.socialButtonText}>Google로 계속하기</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Apple (iOS only) — 개발자 계정 등록 대기 중 */}
        {Platform.OS === 'ios' && (
          <TouchableOpacity
            style={[styles.socialButton, styles.appleButton, { opacity: 0.5 }]}
            onPress={() => Alert.alert('준비 중', 'Apple 로그인은 곧 지원될 예정입니다.')}
            activeOpacity={0.8}
          >
            <Ionicons name="logo-apple" size={22} color="#FFF" />
            <Text style={styles.socialButtonText}>Apple로 계속하기</Text>
            <Text style={styles.comingSoonBadge}>준비중</Text>
          </TouchableOpacity>
        )}

      </View>

      {/* Guest Mode */}
      <TouchableOpacity
        style={styles.guestButton}
        onPress={enterGuestMode}
        activeOpacity={0.6}
      >
        <Text style={styles.guestButtonText}>비회원으로 계속하기</Text>
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
              <Text style={styles.socialButtonText}>Dev Login (테스트)</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Footer */}
      <Text style={styles.footer}>
        로그인하면 클라우드 동기화 등{'\n'}추가 기능을 이용할 수 있습니다.
      </Text>
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
  footer: {
    textAlign: 'center',
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: Spacing.xl,
    lineHeight: 18,
  },
});
