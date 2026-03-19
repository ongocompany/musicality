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
