import * as DocumentPicker from 'expo-document-picker';
import { File, Directory, Paths } from 'expo-file-system/next';
import { getInfoAsync } from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Track, MediaType } from '../types/track';
import { createFileBookmark, resolveFileBookmark, copyFromCloudUri } from '../modules/my-module';

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

// ─── Audio file integrity validation ───────────────────────────
// Detects truncated or corrupted audio files before adding to library.
// MP3: checks MPEG sync header + verifies last bytes aren't padding/silence pattern.
// Other formats: basic size check only.

interface AudioValidationResult {
  valid: boolean;
  reason: string;
}

async function validateAudioFile(uri: string, fileName: string): Promise<AudioValidationResult> {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  try {
    // Get file size — local files (file://) get one check, cloud files poll until stable
    const info = await getInfoAsync(uri);
    let size = (info as any).size ?? 0;

    if (size === 0 && !uri.startsWith('file://')) {
      // Cloud file may still be downloading — poll until stable (max 2s)
      let prevSize = -1;
      for (let attempt = 0; attempt < 4; attempt++) {
        await new Promise(r => setTimeout(r, 500));
        const recheck = await getInfoAsync(uri);
        size = (recheck as any).size ?? 0;
        if (size > 0 && size === prevSize) break;
        prevSize = size;
      }
    }

    // Too small to be a valid audio file (< 50KB)
    if (size < 50 * 1024) {
      return { valid: false, reason: 'File is too small to be a valid audio file.' };
    }

    // MP3-specific validation
    if (ext === 'mp3') {
      const { readAsStringAsync, EncodingType } = require('expo-file-system/legacy');

      // Read beginning of file to verify MPEG sync header
      const headerB64: string = await readAsStringAsync(uri, {
        encoding: EncodingType.Base64,
        length: 4096,
        position: 0,
      });
      const headerBytes = atob(headerB64);

      // Skip ID3v2 header if present to find MPEG frame
      let mpegOffset = 0;
      if (headerBytes.charCodeAt(0) === 0x49 && headerBytes.charCodeAt(1) === 0x44 && headerBytes.charCodeAt(2) === 0x33) {
        const s0 = headerBytes.charCodeAt(6) & 0x7f;
        const s1 = headerBytes.charCodeAt(7) & 0x7f;
        const s2 = headerBytes.charCodeAt(8) & 0x7f;
        const s3 = headerBytes.charCodeAt(9) & 0x7f;
        mpegOffset = 10 + (s0 << 21 | s1 << 14 | s2 << 7 | s3);
      }

      // Verify MPEG sync word exists within readable range
      if (mpegOffset < headerBytes.length - 1) {
        const b0 = headerBytes.charCodeAt(mpegOffset);
        const b1 = headerBytes.charCodeAt(mpegOffset + 1);
        if (b0 !== 0xFF || (b1 & 0xE0) !== 0xE0) {
          return { valid: false, reason: 'Not a valid MP3 file (MPEG sync header not found).' };
        }
      }

      // Read a chunk from near the end of the file to check for truncation
      const tailSize = 1024;
      const tailPos = Math.max(0, size - tailSize);
      const tailHex: string = await readAsStringAsync(uri, {
        encoding: EncodingType.Base64,
        length: tailSize,
        position: tailPos,
      });
      const tailBytes = atob(tailHex);

      // Check if tail is all identical bytes (pattern of truncated download)
      let identicalCount = 0;
      const lastByte = tailBytes.charCodeAt(tailBytes.length - 1);
      for (let i = tailBytes.length - 1; i >= 0; i--) {
        if (tailBytes.charCodeAt(i) === lastByte) identicalCount++;
        else break;
      }

      // If last 512+ bytes are all the same → truncated file
      if (identicalCount >= 512) {
        return { valid: false, reason: 'This file appears to be incomplete (download may have been interrupted).' };
      }
    }

    return { valid: true, reason: '' };
  } catch (e: any) {
    console.warn(`[FileImport] Validation error: ${e?.message}`);
    // Don't block import on validation errors — let it through
    return { valid: true, reason: '' };
  }
}

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
  // Duplicate check: same filename + size, or same fileSize + format
  const { usePlayerStore } = require('../stores/playerStore');
  const existingTracks = usePlayerStore.getState().tracks;
  const fileName = asset.name.replace(/\.[^/.]+$/, '');
  const fileSize = asset.size ?? 0;
  const duplicate = existingTracks.find((t: any) => {
    if (t.mediaType === 'youtube') return false;
    // Match by title (original filename or ID3-modified)
    if (t.title === fileName && t.fileSize === fileSize) return true;
    // Match by fileSize + format (same file, different title due to ID3)
    if (t.fileSize === fileSize && t.fileSize > 0 && t.format === getFormat(asset.mimeType, asset.name)) return true;
    return false;
  });
  if (duplicate) {
    console.log(`[FileImport] Duplicate skipped: ${fileName} (matched: ${duplicate.title})`);
    return duplicate;
  }
  const mediaType = getMediaType(asset.mimeType, asset.name);

  // Verify source file exists (copyToCacheDirectory should have it ready)
  let fileUri = asset.uri;
  try {
    const srcInfo = await getInfoAsync(asset.uri);
    if (!srcInfo.exists || (srcInfo.size ?? 0) === 0) {
      console.warn(`[FileImport] Source file missing or empty: ${asset.uri.slice(-50)}`);
      return null;
    }
  } catch (e: any) {
    console.warn(`[FileImport] File check failed: ${e?.message}`);
    return null;
  }

  // Copy file to permanent storage (must succeed — cache URI gets evicted by OS)
  const mediaDir = new Directory(Paths.document, 'media');
  if (!mediaDir.exists) mediaDir.create();
  // Sanitize filename: remove spaces, parens, special chars that break URI handling
  const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const destName = `${Date.now()}-${safeName}`;
  const destFile = new File(mediaDir, destName);
  const sourceFile = new File(asset.uri);
  try {
    sourceFile.copy(destFile);
  } catch (e: any) {
    console.warn(`[FileImport] Copy failed: ${e?.message}`);
    return null;
  }

  // Verify copy succeeded — don't save broken files to library
  try {
    const destInfo = await getInfoAsync(destFile.uri);
    if (!destInfo.exists || (destInfo.size ?? 0) === 0) {
      console.warn(`[FileImport] Copy verification failed — file empty or missing: ${destFile.uri.slice(-50)}`);
      try { new File(destFile.uri).delete(); } catch {}
      return null;
    }
    console.log(`[FileImport] Copied to permanent (${((destInfo as any).size / 1024 / 1024).toFixed(1)}MB): ${destFile.uri.slice(-50)}`);
  } catch (e: any) {
    console.warn(`[FileImport] Copy verify error: ${e?.message}`);
    return null;
  }
  fileUri = destFile.uri;

  // Validate audio file integrity (detect truncated/corrupted files)
  if (mediaType === 'audio') {
    const integrity = await validateAudioFile(fileUri, asset.name);
    if (!integrity.valid) {
      console.warn(`[FileImport] Invalid audio file: ${asset.name} — ${integrity.reason}`);
      try { new File(destFile.uri).delete(); } catch {}
      throw new Error(integrity.reason);
    }
  }

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

  // Create persistent bookmark for cloud file re-access
  let fileBookmark: string | undefined;
  if (asset.uri !== fileUri) {
    try {
      const bookmark = await createFileBookmark(asset.uri);
      if (bookmark) {
        fileBookmark = bookmark;
        console.log(`[FileImport] Bookmark created for: ${asset.name}`);
      }
    } catch (e: any) {
      console.warn(`[FileImport] Bookmark creation failed: ${e?.message}`);
    }
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: displayTitle,
    artist,
    album,
    uri: fileUri,
    sourceUri: asset.uri !== fileUri ? asset.uri : undefined,
    fileBookmark,
    fileSize: asset.size ?? 0,
    format: getFormat(asset.mimeType, asset.name),
    mediaType,
    importedAt: Date.now(),
    thumbnailUri,
    analysisStatus: 'idle',
  };
}

/** Guard against concurrent document picker calls */
let _picking = false;

/** Pick multiple media files at once */
export async function pickMediaFiles(filterType?: 'audio' | 'video'): Promise<Track[]> {
  if (_picking) return [];
  _picking = true;
  try {
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

    // Limit to first 10 files
    const assets = result.assets.slice(0, 10);
    if (result.assets.length > 10) {
      console.log(`[FileImport] Selected ${result.assets.length} files, processing first 10 only`);
    }

    console.log(`[FileImport] Processing ${assets.length} file(s)...`);
    const tracks: Track[] = [];
    for (const asset of assets) {
      try {
        const track = await processAsset(asset);
        if (track) tracks.push(track);
      } catch (e: any) {
        console.warn(`[FileImport] Failed to import ${asset.name}: ${e?.message}`);
      }
    }
    console.log(`[FileImport] Imported ${tracks.length}/${result.assets.length} files`);
    return tracks;
  } finally {
    _picking = false;
  }
}

/** Pick a single media file */
export async function pickMediaFile(filterType?: 'audio' | 'video'): Promise<Track | null> {
  if (_picking) return null;
  _picking = true;
  try {
    const types = filterType === 'audio' ? AUDIO_TYPES
      : filterType === 'video' ? ['video/*']
      : ALL_MEDIA_TYPES;

    const result = await DocumentPicker.getDocumentAsync({
      type: types,
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    return processAsset(result.assets[0]);
  } finally {
    _picking = false;
  }
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

    // File exists but 0 bytes — cloud placeholder, brief wait
    if (info.exists && (info.size ?? 0) === 0) {
      console.log(`[FileImport] Cloud placeholder (0 bytes): ${track.uri.slice(-50)}`);
      try {
        await waitForFile(track.uri, 5000);
        return track.uri;
      } catch {
        console.warn(`[FileImport] Cloud download timed out: ${track.uri.slice(-50)}`);
      }
    } else {
      console.log(`[FileImport] File not found: ${track.uri.slice(-60)}`);
    }
  } catch (e: any) {
    console.log(`[FileImport] File check error: ${e?.message}`);
  }

  // ─── Recovery via bookmark (cloud file re-access) ───
  if (track.fileBookmark) {
    console.log(`[FileImport] Attempting bookmark recovery...`);
    try {
      const resolvedUri = await resolveFileBookmark(track.fileBookmark);
      if (resolvedUri) {
        // Re-copy from cloud to permanent storage
        const mediaDir = new Directory(Paths.document, 'media');
        if (!mediaDir.exists) mediaDir.create();
        const safeTitle = (track.title || 'track').replace(/[^a-zA-Z0-9._-]/g, '_');
        const destPath = `${mediaDir.uri}/${Date.now()}-${safeTitle}.${track.format}`.replace('file://', '');
        const copied = await copyFromCloudUri(resolvedUri, destPath);
        if (copied) {
          const newUri = `file://${destPath}`;
          console.log(`[FileImport] Bookmark recovery success: ${newUri.slice(-50)}`);
          return newUri;
        }
      }
    } catch (e: any) {
      console.warn(`[FileImport] Bookmark recovery failed: ${e?.message}`);
    }
  }

  // ─── Fallback: try sourceUri directly ───
  if (track.sourceUri) {
    console.log(`[FileImport] Trying sourceUri fallback: ${track.sourceUri.slice(-50)}`);
    try {
      const mediaDir = new Directory(Paths.document, 'media');
      if (!mediaDir.exists) mediaDir.create();
      const safeTitle = (track.title || 'track').replace(/[^a-zA-Z0-9._-]/g, '_');
      const destPath = `${mediaDir.uri}/${Date.now()}-${safeTitle}.${track.format}`.replace('file://', '');
      const copied = await copyFromCloudUri(track.sourceUri, destPath);
      if (copied) {
        const newUri = `file://${destPath}`;
        console.log(`[FileImport] SourceUri recovery success: ${newUri.slice(-50)}`);
        return newUri;
      }
    } catch (e: any) {
      console.warn(`[FileImport] SourceUri recovery failed: ${e?.message}`);
    }
  }

  console.warn(`[FileImport] All recovery methods failed for: ${track.title}`);
  return null;
}

/** @deprecated Use pickMediaFile instead */
export const pickAudioFile = pickMediaFile;
