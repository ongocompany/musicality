import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Linking from 'expo-linking';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { usePlayerStore } from '../stores/playerStore';
import { parseYouTubeUrl, createYouTubeTrack } from '../services/fileImport';
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
      const detected = detectDeviceLanguage();
      i18next.changeLanguage(detected);
      useSettingsStore.getState().setLanguage(detected);
    }

    // Handle YouTube share intent (musicality://share?url=...)
    async function handleDeepLink(event: { url: string }) {
      const parsed = Linking.parse(event.url);
      if (parsed.hostname === 'share' && parsed.queryParams?.url) {
        const sharedUrl = decodeURIComponent(parsed.queryParams.url as string);
        const videoId = parseYouTubeUrl(sharedUrl);
        if (videoId) {
          // Fetch title from YouTube oEmbed (no API key needed)
          let title = `YouTube: ${videoId}`;
          try {
            const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
            if (res.ok) {
              const data = await res.json();
              if (data.title) title = data.title;
            }
          } catch {}

          // Check duplicate
          const existing = usePlayerStore.getState().tracks.find(
            t => t.mediaType === 'youtube' && t.uri === videoId
          );
          if (existing) {
            usePlayerStore.getState().setCurrentTrack(existing);
          } else {
            const track = createYouTubeTrack(videoId, title);
            usePlayerStore.getState().addTrack(track);
            usePlayerStore.getState().setCurrentTrack(track);
          }
          console.log(`[Share] YouTube: ${title} (${videoId})`);
          setTimeout(() => router.replace('/(tabs)/player'), 300);
        }
      }
    }

    // Listen for URL while app is already running (not initial launch)
    const sub = Linking.addEventListener('url', handleDeepLink);
    return () => sub.remove();
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
