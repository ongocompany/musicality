import { NativeModulesProxy } from 'expo-modules-core';

const VIDEO_FORMATS = new Set(['mp4', 'mov', 'avi', 'm4v']);

export function isVideoFormat(format: string): boolean {
  return VIDEO_FORMATS.has(format.toLowerCase());
}

/**
 * Extract audio from a video/audio file, downsample to mono 22kHz WAV.
 * Returns the file path of the processed audio.
 * Returns null if native module is not available (requires native build).
 */
export async function extractAndDownsample(uri: string): Promise<string | null> {
  const mod = NativeModulesProxy['AudioExtractor'];
  if (!mod?.extractAndDownsample) {
    return null;
  }
  return mod.extractAndDownsample(uri);
}
