import * as DocumentPicker from 'expo-document-picker';
import { Track } from '../types/track';

const AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/mp4', 'audio/x-m4a', 'audio/aac'];

function getFormat(mimeType: string | undefined, name: string): string {
  if (mimeType) {
    const map: Record<string, string> = {
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/flac': 'flac',
      'audio/mp4': 'm4a',
      'audio/x-m4a': 'm4a',
      'audio/aac': 'aac',
    };
    if (map[mimeType]) return map[mimeType];
  }
  const ext = name.split('.').pop()?.toLowerCase();
  return ext || 'unknown';
}

export async function pickAudioFile(): Promise<Track | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: AUDIO_TYPES,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const track: Track = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: asset.name.replace(/\.[^/.]+$/, ''),
    uri: asset.uri,
    fileSize: asset.size ?? 0,
    format: getFormat(asset.mimeType, asset.name),
    importedAt: Date.now(),
  };

  return track;
}
