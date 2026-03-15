import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { Colors } from '../constants/theme';
import i18next, { detectDeviceLanguage } from '../i18n';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, guestMode, initialize } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    initialize();
    // Sync i18n language from persisted settings
    const lang = useSettingsStore.getState().language;
    if (lang) {
      i18next.changeLanguage(lang);
    } else {
      // First launch: detect device language and persist
      const detected = detectDeviceLanguage();
      i18next.changeLanguage(detected);
      useSettingsStore.getState().setLanguage(detected);
    }
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const isAuthenticated = user !== null || guestMode;

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, loading, guestMode, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <AuthGuard>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
          }}
        />
      </AuthGuard>
    </GestureHandlerRootView>
  );
}
