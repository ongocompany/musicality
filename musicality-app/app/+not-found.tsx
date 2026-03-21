import { useEffect } from 'react';
import { View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { parseYouTubeUrl, createYouTubeTrack } from '../services/fileImport';
import { decryptPhraseNote } from '../services/phraseNoteService';
import { usePlayerStore } from '../stores/playerStore';
import i18next from 'i18next';
import { useSettingsStore } from '../stores/settingsStore';
import { Colors } from '../constants/theme';

export default function NotFoundScreen() {
  const router = useRouter();

  useEffect(() => {
    Linking.getInitialURL().then(async (url) => {
      if (!url) {
        router.replace('/(tabs)');
        return;
      }

      const parsed = Linking.parse(url);

      // ─── YouTube share ───
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

      // ─── PhraseNote / ChoreoNote import ───
      if (parsed.hostname === 'import' && parsed.queryParams?.file) {
        const fileUri = decodeURIComponent(parsed.queryParams.file as string);
        try {
          const content = await readAsStringAsync(fileUri);
          const phraseNote = decryptPhraseNote(content);

          if (phraseNote?.metadata?.title) {
            // Find matching track
            const tracks = usePlayerStore.getState().tracks;
            const match = tracks.find(t =>
              t.title === phraseNote.metadata.title ||
              (phraseNote.analysis.fingerprint && t.analysis?.fingerprint === phraseNote.analysis.fingerprint)
            );

            const importedNote: import('../types/phraseNote').ImportedPhraseNote = {
              id: `imported-${Date.now()}`,
              trackId: match?.id ?? '',
              phraseNote,
              importedAt: Date.now(),
              isActive: false,
            };

            useSettingsStore.getState().addImportedNote(importedNote);
            const noteType = fileUri.endsWith('.cnote') ? 'ChoreoNote' : 'PhraseNote';
            Alert.alert(
              `${noteType} 가져오기 완료`,
              `"${phraseNote.metadata.title}" by ${phraseNote.metadata.author ?? 'Unknown'}`,
            );
            console.log(`[Import] ${noteType}: ${phraseNote.metadata.title}`);

            if (match) {
              usePlayerStore.getState().setCurrentTrack(match);
              router.replace('/(tabs)/player');
              return;
            }
          }
        } catch (err: any) {
          console.warn('[Import] Failed:', err.message);
          Alert.alert(i18next.t('import.importFailed'), i18next.t('import.cannotReadFile'));
        }
      }

      router.replace('/(tabs)');
    });
  }, []);

  return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
}
