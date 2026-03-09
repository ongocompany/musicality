import * as DocumentPicker from 'expo-document-picker';
import { Track, MediaType } from '../types/track';

const AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/mp4', 'audio/x-m4a', 'audio/aac'];
const ALL_MEDIA_TYPES = [...AUDIO_TYPES, 'video/*'];

const FORMAT_MAP: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'm4v']);

function getFormat(mimeType: string | undefined, name: string): string {
  if (mimeType && FORMAT_MAP[mimeType]) return FORMAT_MAP[mimeType];
  const ext = name.split('.').pop()?.toLowerCase();
  return ext || 'unknown';
}

function getMediaType(mimeType: string | undefined, name: string): MediaType {
  if (mimeType && mimeType.startsWith('video/')) return 'video';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return 'audio';
}

export async function pickMediaFile(): Promise<Track | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ALL_MEDIA_TYPES,
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
    mediaType: getMediaType(asset.mimeType, asset.name),
    importedAt: Date.now(),
    analysisStatus: 'idle',
  };

  return track;
}

/** @deprecated Use pickMediaFile instead */
export const pickAudioFile = pickMediaFile;
