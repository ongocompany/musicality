import { requireNativeModule } from 'expo-modules-core';

const VIDEO_FORMATS = new Set(['mp4', 'mov', 'avi', 'm4v']);

export function isVideoFormat(format: string): boolean {
  return VIDEO_FORMATS.has(format.toLowerCase());
}

export interface AudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  albumArt?: string; // temp file path
  duration?: number; // seconds
}

interface AudioExtractorInterface {
  extractAndDownsample(uri: string): Promise<string>;
  extractMetadata(uri: string): Promise<AudioMetadata>;
  // File access persistence (cloud files)
  createBookmark(uri: string): Promise<string | null>;  // iOS only
  resolveBookmark(bookmarkBase64: string): Promise<string | null>;  // iOS only
  copyWithSecurityScope(sourceUri: string, destUri: string): Promise<boolean>;  // iOS only
  takePersistablePermission(uri: string): Promise<boolean>;  // Android only
  copyFromContentUri(contentUri: string, destPath: string): Promise<boolean>;  // Android only
}

export async function extractAndDownsample(uri: string): Promise<string | null> {
  try {
    const mod = requireNativeModule<AudioExtractorInterface>('AudioExtractor');
    return await mod.extractAndDownsample(uri);
  } catch (err) {
    console.error('[AudioExtractor] Failed:', err);
    return null;
  }
}

export async function extractMetadata(uri: string): Promise<AudioMetadata | null> {
  try {
    const mod = requireNativeModule<AudioExtractorInterface>('AudioExtractor');
    const meta = await mod.extractMetadata(uri);
    return meta;
  } catch (err) {
    console.warn('[AudioExtractor] Metadata extraction failed:', err);
    return null;
  }
}

// ─── File access persistence (cloud files) ───────────────────

import { Platform } from 'react-native';

/** Create a persistent bookmark for a file URI (iOS: security-scoped, Android: persistable permission) */
export async function createFileBookmark(uri: string): Promise<string | null> {
  try {
    const mod = requireNativeModule<AudioExtractorInterface>('AudioExtractor');
    if (Platform.OS === 'ios') {
      return await mod.createBookmark(uri);
    } else {
      // Android: take persistable permission, return the URI itself as "bookmark"
      const ok = await mod.takePersistablePermission(uri);
      return ok ? uri : null;
    }
  } catch (err) {
    console.warn('[FileBookmark] Create failed:', err);
    return null;
  }
}

/** Re-access a file from a previously saved bookmark. Returns accessible URI or null. */
export async function resolveFileBookmark(bookmark: string): Promise<string | null> {
  try {
    const mod = requireNativeModule<AudioExtractorInterface>('AudioExtractor');
    if (Platform.OS === 'ios') {
      return await mod.resolveBookmark(bookmark);
    } else {
      // Android: the bookmark IS the content:// URI
      return bookmark;
    }
  } catch (err) {
    console.warn('[FileBookmark] Resolve failed:', err);
    return null;
  }
}

/** Copy a file from cloud/content URI to local destination */
export async function copyFromCloudUri(sourceUri: string, destPath: string): Promise<boolean> {
  try {
    const mod = requireNativeModule<AudioExtractorInterface>('AudioExtractor');
    if (Platform.OS === 'ios') {
      return await mod.copyWithSecurityScope(sourceUri, destPath);
    } else {
      return await mod.copyFromContentUri(sourceUri, destPath);
    }
  } catch (err) {
    console.warn('[FileBookmark] Copy failed:', err);
    return false;
  }
}
