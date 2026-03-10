import * as DocumentPicker from 'expo-document-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
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

export async function pickMediaFile(filterType?: 'audio' | 'video'): Promise<Track | null> {
  const types = filterType === 'audio' ? AUDIO_TYPES
    : filterType === 'video' ? ['video/*']
    : ALL_MEDIA_TYPES;

  const result = await DocumentPicker.getDocumentAsync({
    type: types,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const mediaType = getMediaType(asset.mimeType, asset.name);

  // Generate thumbnail for video files
  let thumbnailUri: string | undefined;
  if (mediaType === 'video') {
    try {
      const thumb = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 1000 });
      thumbnailUri = thumb.uri;
    } catch {}
  }

  const track: Track = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: asset.name.replace(/\.[^/.]+$/, ''),
    uri: asset.uri,
    fileSize: asset.size ?? 0,
    format: getFormat(asset.mimeType, asset.name),
    mediaType,
    importedAt: Date.now(),
    thumbnailUri,
    analysisStatus: 'idle',
  };

  return track;
}

// ─── YouTube helpers ───────────────────────────────────────────

/**
 * Extract YouTube video ID from various URL formats:
 *  - https://www.youtube.com/watch?v=ID
 *  - https://youtu.be/ID
 *  - https://youtube.com/shorts/ID
 *  - https://m.youtube.com/watch?v=ID
 *  - https://www.youtube.com/embed/ID
 * Returns null if no valid ID found.
 */
export function parseYouTubeUrl(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();

  // youtu.be/ID
  const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  // youtube.com/watch?v=ID  or  youtube.com/shorts/ID  or  youtube.com/embed/ID
  const longMatch = trimmed.match(
    /youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/)([a-zA-Z0-9_-]{11})/,
  );
  if (longMatch) return longMatch[1];

  // Bare video ID (exactly 11 chars)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  return null;
}

/**
 * Create a Track object for a YouTube video.
 */
export function createYouTubeTrack(videoId: string, title?: string): Track {
  return {
    id: `yt-${videoId}-${Date.now()}`,
    title: title || `YouTube: ${videoId}`,
    uri: videoId, // store videoId, not full URL
    fileSize: 0,
    format: 'youtube',
    mediaType: 'youtube',
    importedAt: Date.now(),
    analysisStatus: 'idle',
  };
}

/** @deprecated Use pickMediaFile instead */
export const pickAudioFile = pickMediaFile;
