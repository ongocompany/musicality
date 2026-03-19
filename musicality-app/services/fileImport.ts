import * as DocumentPicker from 'expo-document-picker';
import { File, Directory, Paths } from 'expo-file-system/next';
import { getInfoAsync } from 'expo-file-system/legacy';
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

/** Poll until a cloud-downloaded file appears locally (max timeoutMs) */
async function waitForFile(uri: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const info = await getInfoAsync(uri);
    if (info.exists && (info.size ?? 0) > 0) return;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`File not available after ${timeoutMs / 1000}s (cloud download may have failed)`);
}

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

/** Process a single document picker asset into a Track */
async function processAsset(asset: DocumentPicker.DocumentPickerAsset): Promise<Track | null> {
  // Duplicate check: same filename + size = same file
  const { usePlayerStore } = require('../stores/playerStore');
  const existingTracks = usePlayerStore.getState().tracks;
  const fileName = asset.name.replace(/\.[^/.]+$/, '');
  const duplicate = existingTracks.find((t: any) =>
    t.title === fileName && t.fileSize === (asset.size ?? 0) && t.mediaType !== 'youtube'
  );
  if (duplicate) {
    console.log(`[FileImport] Duplicate skipped: ${fileName}`);
    return duplicate;
  }
  const mediaType = getMediaType(asset.mimeType, asset.name);

  // Wait for cloud file to become available (iCloud/Google Drive on-demand downloads)
  let fileUri = asset.uri;
  try {
    const info = await getInfoAsync(asset.uri);
    if (!info.exists) {
      console.log(`[FileImport] Cloud file not yet local, waiting...`);
      await waitForFile(asset.uri, 30000);
    }
  } catch (e: any) {
    console.warn(`[FileImport] File check failed: ${e?.message}`);
  }

  // Copy file to permanent storage (must succeed — cache URI gets evicted by OS)
  const mediaDir = new Directory(Paths.document, 'media');
  if (!mediaDir.exists) mediaDir.create();
  // Sanitize filename: remove spaces, parens, special chars that break URI handling
  const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const destName = `${Date.now()}-${safeName}`;
  const destFile = new File(mediaDir, destName);
  const sourceFile = new File(asset.uri);
  sourceFile.copy(destFile);
  fileUri = destFile.uri;
  console.log(`[FileImport] Copied to permanent: ${fileUri.slice(-50)}`);

  // Extract ID3 metadata (title, artist, album art)
  let metaTitle: string | undefined;
  let artist: string | undefined;
  let album: string | undefined;
  let thumbnailUri: string | undefined;

  if (mediaType === 'audio') {
    try {
      const { extractMetadata } = require('../modules/my-module');
      const meta = await extractMetadata(fileUri);
      if (meta) {
        if (meta.title) metaTitle = meta.title;
        if (meta.artist) artist = meta.artist;
        if (meta.album) album = meta.album;
        if (meta.albumArt) {
          // Copy album art to permanent storage
          const artFile = new File(mediaDir, `art-${Date.now()}.jpg`);
          new File(meta.albumArt.startsWith('/') ? `file://${meta.albumArt}` : meta.albumArt).copy(artFile);
          thumbnailUri = artFile.uri;
        }
        console.log(`[FileImport] ID3: ${meta.artist ?? '?'} - ${meta.title ?? '?'}`);
      }
    } catch (e: any) {
      console.warn('[FileImport] Metadata extraction failed:', e?.message);
    }
  }

  // Generate thumbnail for video files
  if (mediaType === 'video') {
    try {
      const thumb = await VideoThumbnails.getThumbnailAsync(fileUri, { time: 1000 });
      thumbnailUri = thumb.uri;
    } catch {}
  }

  // Title: ID3 tag > filename
  const displayTitle = metaTitle
    ? (artist ? `${artist} - ${metaTitle}` : metaTitle)
    : asset.name.replace(/\.[^/.]+$/, '');

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: displayTitle,
    artist,
    album,
    uri: fileUri,
    sourceUri: asset.uri !== fileUri ? asset.uri : undefined,
    fileSize: asset.size ?? 0,
    format: getFormat(asset.mimeType, asset.name),
    mediaType,
    importedAt: Date.now(),
    thumbnailUri,
    analysisStatus: 'idle',
  };
}

/** Pick multiple media files at once */
export async function pickMediaFiles(filterType?: 'audio' | 'video'): Promise<Track[]> {
  const types = filterType === 'audio' ? AUDIO_TYPES
    : filterType === 'video' ? ['video/*']
    : ALL_MEDIA_TYPES;

  const result = await DocumentPicker.getDocumentAsync({
    type: types,
    copyToCacheDirectory: true,
    multiple: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return [];
  }

  console.log(`[FileImport] Processing ${result.assets.length} file(s)...`);
  const tracks: Track[] = [];
  for (const asset of result.assets) {
    try {
      const track = await processAsset(asset);
      if (track) tracks.push(track);
    } catch (e: any) {
      console.warn(`[FileImport] Failed to import ${asset.name}: ${e?.message}`);
    }
  }
  console.log(`[FileImport] Imported ${tracks.length}/${result.assets.length} files`);
  return tracks;
}

/** Pick a single media file (legacy compat) */
export async function pickMediaFile(filterType?: 'audio' | 'video'): Promise<Track | null> {
  const tracks = await pickMediaFiles(filterType);
  return tracks.length > 0 ? tracks[0] : null;
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

/**
 * Ensure a track's file exists locally. If the local copy was evicted,
 * attempt to re-copy from the original source URI.
 * Returns the valid URI, or null if unrecoverable.
 */
export async function ensureFileAvailable(track: Track): Promise<string | null> {
  // YouTube doesn't have local files
  if (track.mediaType === 'youtube') return track.uri;

  // Check if current URI exists and has content
  try {
    const info = await getInfoAsync(track.uri);
    if (info.exists && (info.size ?? 0) > 0) return track.uri;

    // File exists but 0 bytes — cloud placeholder, wait for download
    if (info.exists && (info.size ?? 0) === 0) {
      console.log(`[FileImport] Cloud placeholder detected (0 bytes), waiting for download: ${track.uri.slice(-50)}`);
      try {
        await waitForFile(track.uri, 30000);
        return track.uri;
      } catch {
        console.warn(`[FileImport] Cloud download timed out for: ${track.uri.slice(-50)}`);
      }
    } else {
      console.log(`[FileImport] File not found: ${track.uri.slice(-60)}`);
    }
  } catch (e: any) {
    console.log(`[FileImport] File check error: ${e?.message}, uri: ${track.uri.slice(-60)}`);
  }

  // Try re-copying from original source
  if (track.sourceUri) {
    console.log(`[FileImport] Attempting recovery from sourceUri: ${track.sourceUri.slice(-50)}`);
    try {
      await waitForFile(track.sourceUri, 30000);
      const mediaDir = new Directory(Paths.document, 'media');
      if (!mediaDir.exists) mediaDir.create();
      const safeTitle = (track.title || 'track').replace(/[^a-zA-Z0-9._-]/g, '_');
      const destName = `${Date.now()}-${safeTitle}.${track.format}`;
      const sourceFile = new File(track.sourceUri);
      const destFile = new File(mediaDir, destName);
      sourceFile.copy(destFile);
      console.log(`[FileImport] Recovered from source: ${destFile.uri.slice(-50)}`);
      return destFile.uri;
    } catch (e: any) {
      console.warn(`[FileImport] Recovery from source failed: ${e?.message}`);
    }
  }

  return null;
}

/** @deprecated Use pickMediaFile instead */
export const pickAudioFile = pickMediaFile;
