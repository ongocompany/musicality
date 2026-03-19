import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import * as Linking from 'expo-linking';
import { parseYouTubeUrl, createYouTubeTrack } from '../services/fileImport';
import { usePlayerStore } from '../stores/playerStore';
import { Colors } from '../constants/theme';

export default function NotFoundScreen() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Handle share deep links that expo-router can't match
    Linking.getInitialURL().then(async (url) => {
      if (!url) {
        router.replace('/(tabs)');
        return;
      }

      const parsed = Linking.parse(url);
      if (parsed.hostname === 'share' && parsed.queryParams?.url) {
        const sharedUrl = decodeURIComponent(parsed.queryParams.url as string);
        const videoId = parseYouTubeUrl(sharedUrl);
        if (videoId) {
          let title = `YouTube: ${videoId}`;
          try {
            const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
            if (res.ok) {
              const data = await res.json();
              if (data.title) title = data.title;
            }
          } catch {}

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
          router.replace('/(tabs)/player');
          return;
        }
      }

      router.replace('/(tabs)');
    });
  }, []);

  return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
}
