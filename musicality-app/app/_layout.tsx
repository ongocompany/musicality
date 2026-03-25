import { useEffect } from 'react';
import { LogBox } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useFonts } from 'expo-font';
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue/400Regular';

// Suppress noisy network errors in dev mode (Supabase token refresh, sync)
// These are transient and handled gracefully — no impact on production
LogBox.ignoreLogs(['TypeError: Network request failed']);
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Linking from 'expo-linking';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { usePlayerStore } from '../stores/playerStore';
import { parseYouTubeUrl, createYouTubeTrack } from '../services/fileImport';
import { Colors } from '../constants/theme';
import { AnnouncementPopup } from '../components/ui/AnnouncementPopup';
import i18next, { detectDeviceLanguage } from '../i18n';
import { decryptPhraseNote } from '../services/phraseNoteService';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, guestMode, initialize } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    initialize();

    // Cleanup orphaned settings data (tracks deleted or app reinstalled)
    const validIds = new Set(usePlayerStore.getState().tracks.map(t => t.id));
    useSettingsStore.getState().cleanupTrackData(validIds);

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

      // Handle .pnote / .cnote import
      if (parsed.hostname === 'import' && parsed.queryParams?.file) {
        const fileUri = decodeURIComponent(parsed.queryParams.file as string);
        try {
          const content = await readAsStringAsync(fileUri);
          const phraseNote = decryptPhraseNote(content);
          if (phraseNote?.metadata?.title) {
            const tracks = usePlayerStore.getState().tracks;
            const match = tracks.find(t =>
              t.title === phraseNote.metadata.title ||
              (phraseNote.analysis.fingerprint && t.analysis?.fingerprint === phraseNote.analysis.fingerprint)
            );
            useSettingsStore.getState().addImportedNote({
              id: `imported-${Date.now()}`,
              trackId: match?.id ?? '',
              phraseNote,
              importedAt: Date.now(),
              isActive: false,
            });
            const noteType = fileUri.endsWith('.cnote') ? 'ChoreoNote' : 'PhraseNote';
            Alert.alert(`${noteType} 가져오기 완료`, `"${phraseNote.metadata.title}"`);
            if (match) {
              usePlayerStore.getState().setCurrentTrack(match);
              setTimeout(() => router.replace('/(tabs)/player'), 300);
            }
          }
        } catch (err: any) {
          console.warn('[Import] Failed:', err.message);
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

  const isLoggedIn = user !== null || guestMode;

  return (
    <>
      {children}
      {isLoggedIn && <AnnouncementPopup />}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BebasNeue: BebasNeue_400Regular,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

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
