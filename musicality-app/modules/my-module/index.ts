import { requireNativeModule } from 'expo-modules-core';

const VIDEO_FORMATS = new Set(['mp4', 'mov', 'avi', 'm4v']);

export function isVideoFormat(format: string): boolean {
  return VIDEO_FORMATS.has(format.toLowerCase());
}

interface AudioExtractorInterface {
  extractAndDownsample(uri: string): Promise<string>;
}

/**
 * Extract audio from a video/audio file, downsample to mono 22kHz WAV.
 * Returns the file path of the processed audio.
 * Returns null if native module is not available (requires native build).
 */
export async function extractAndDownsample(uri: string): Promise<string | null> {
  try {
    const mod = requireNativeModule<AudioExtractorInterface>('AudioExtractor');
    console.log('[AudioExtractor] Native module loaded:', Object.keys(mod));
    const result = await mod.extractAndDownsample(uri);
    console.log('[AudioExtractor] Result:', result);
    return result;
  } catch (err) {
    console.error('[AudioExtractor] Failed to load native module:', err);
    return null;
  }
}
