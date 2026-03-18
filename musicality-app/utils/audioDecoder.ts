/**
 * audioDecoder.ts
 *
 * PCM decoding utility for on-device audio analysis.
 *
 * ─── Research notes: Expo/React Native PCM decoding options ──────────────────
 *
 * Option A: expo-av / expo-audio (LIMITED — NOT viable for PCM)
 *   - expo-av Sound.loadAsync() plays audio but provides NO raw PCM access
 *   - getStatusAsync() returns playback position, duration, etc. — not sample data
 *   - Verdict: ❌ Not usable for music-tempo which needs Float32Array PCM
 *
 * Option B: expo-file-system raw read (LIMITED — format-dependent)
 *   - FileSystem.readAsStringAsync(uri, { encoding: 'base64' }) reads raw file bytes
 *   - For WAV files: header is 44 bytes, then raw PCM follows (if PCM-encoded WAV)
 *     → We CAN manually parse WAV PCM data in JS
 *     → But: most MP3/M4A/FLAC on mobile are compressed — not raw PCM
 *   - Verdict: ⚠️ Works for uncompressed WAV only, not for compressed formats
 *
 * Option C: Web Audio API decodeAudioData (EXPO WEB ONLY)
 *   - AudioContext.decodeAudioData() decodes any format → Float32Array PCM
 *   - Available in browser environments (Expo Web / React Native Web)
 *   - NOT available in native Android/iOS React Native runtime
 *   - Verdict: ❌ Web-only, not useful for native mobile app
 *
 * Option D: Native module (RECOMMENDED — most reliable)
 *   - The app already has a native AudioExtractor module (modules/my-module)
 *   - That module does: video/audio → extractAndDownsample → mono 22kHz WAV
 *   - Extension needed: add a new method that returns PCM Float32Array instead of
 *     writing to a file. Or: read the output WAV file and parse it (Option B path).
 *   - Verdict: ✅ Most reliable. Two sub-approaches:
 *     D1. Extend native module to return PCM data directly (best performance)
 *     D2. Use extractAndDownsample() → get WAV file → parse WAV in JS (current stub)
 *
 * Option E: react-native-audio-api (FUTURE — promising)
 *   - Emerging RN package that brings Web Audio API to native
 *   - Provides AudioContext.decodeAudioData() on iOS/Android
 *   - Not yet stable enough for production as of 2026-03
 *   - Verdict: ⚠️ Watch for future adoption
 *
 * ─── Current implementation ──────────────────────────────────────────────────
 *
 * STRATEGY D2 (stub):
 *   1. Call extractAndDownsample() to get a mono 22kHz WAV file path
 *   2. Read WAV file bytes via expo-file-system
 *   3. Parse WAV header to get sample rate, bit depth, channel count
 *   4. Extract PCM samples and convert to Float32Array
 *
 * This gives us a working pipeline without modifying native code.
 * The native module already produces mono 22kHz WAV — perfect for music-tempo.
 *
 * ─── TODO items ──────────────────────────────────────────────────────────────
 * TODO: Add react-native-audio-api when it reaches stable (will replace D2)
 * TODO: Extend native AudioExtractor module to return PCM bytes directly (D1)
 *       for faster analysis (avoid file I/O round-trip)
 * TODO: Handle FLAC/OGG formats that extractAndDownsample may not support
 * TODO: Add streaming/chunked processing for very long tracks (>10 min)
 */

import { readAsStringAsync, deleteAsync, EncodingType } from 'expo-file-system/legacy';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PCMDecodeResult {
  /** Mono PCM samples as Float32Array in range [-1, +1] */
  pcmData: Float32Array;
  /** Sample rate in Hz (typically 22050 after downsampling) */
  sampleRate: number;
  /** Track duration in seconds */
  duration: number;
}

// ─── WAV parsing ─────────────────────────────────────────────────────────────

/**
 * Parse a WAV file from a Base64-encoded string.
 * Handles PCM (format 1) and IEEE float (format 3) WAV files.
 *
 * WAV header structure (RIFF):
 *   Offset  Size  Field
 *   0       4     "RIFF"
 *   4       4     file size - 8
 *   8       4     "WAVE"
 *   12      4     "fmt "
 *   16      4     fmt chunk size (16 for PCM)
 *   20      2     audio format (1=PCM, 3=IEEE float)
 *   22      2     num channels
 *   24      4     sample rate
 *   28      4     byte rate
 *   32      2     block align
 *   34      2     bits per sample
 *   36      4     "data"
 *   40      4     data chunk size
 *   44      ...   PCM samples
 */
function parseWavFromBase64(base64: string): PCMDecodeResult {
  // Decode base64 to binary string
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const view = new DataView(bytes.buffer);

  // Validate RIFF header
  const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (riff !== 'RIFF') {
    throw new Error('Not a valid WAV file (missing RIFF header)');
  }

  const wave = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (wave !== 'WAVE') {
    throw new Error('Not a valid WAV file (missing WAVE identifier)');
  }

  // Read fmt chunk
  const audioFormat = view.getUint16(20, true);  // 1=PCM, 3=IEEE float
  const numChannels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);

  // Find "data" chunk (may not always be at offset 36 due to optional chunks)
  let dataOffset = 36;
  let dataSize = 0;
  while (dataOffset < bytes.length - 8) {
    const chunkId = String.fromCharCode(
      bytes[dataOffset], bytes[dataOffset + 1],
      bytes[dataOffset + 2], bytes[dataOffset + 3]
    );
    const chunkSize = view.getUint32(dataOffset + 4, true);
    if (chunkId === 'data') {
      dataOffset += 8;
      dataSize = chunkSize;
      break;
    }
    dataOffset += 8 + chunkSize;
  }

  if (dataSize === 0) {
    throw new Error('WAV file has no data chunk');
  }

  // Extract samples
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = Math.floor(dataSize / (bytesPerSample * numChannels));
  const pcmData = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    let sample = 0;

    if (audioFormat === 3) {
      // IEEE float 32-bit
      sample = view.getFloat32(dataOffset + i * bytesPerSample * numChannels, true);
    } else if (bitsPerSample === 16) {
      // PCM 16-bit signed
      sample = view.getInt16(dataOffset + i * bytesPerSample * numChannels, true) / 32768.0;
    } else if (bitsPerSample === 24) {
      // PCM 24-bit signed
      const b0 = bytes[dataOffset + i * 3 * numChannels];
      const b1 = bytes[dataOffset + i * 3 * numChannels + 1];
      const b2 = bytes[dataOffset + i * 3 * numChannels + 2];
      let val = (b2 << 16) | (b1 << 8) | b0;
      if (val >= 0x800000) val -= 0x1000000; // sign extend
      sample = val / 8388608.0;
    } else if (bitsPerSample === 8) {
      // PCM 8-bit unsigned
      sample = (bytes[dataOffset + i * numChannels] - 128) / 128.0;
    }

    pcmData[i] = Math.max(-1, Math.min(1, sample));
  }

  const duration = numSamples / sampleRate;
  return { pcmData, sampleRate, duration };
}

// ─── Main decoder ─────────────────────────────────────────────────────────────

/**
 * Decode an audio file to PCM Float32Array for music-tempo analysis.
 *
 * Current strategy: Use the existing native AudioExtractor module to produce
 * a mono 22kHz WAV, then parse the WAV file in JS.
 *
 * @param fileUri - file:// URI of the audio file
 * @param format  - file extension (mp3, wav, m4a, flac, mp4, mov, etc.)
 * @returns PCM data with sampleRate and duration
 * @throws Error if decoding fails or native module unavailable
 */
export async function decodeAudioToPCM(
  fileUri: string,
  format: string,
): Promise<PCMDecodeResult> {
  // Step 1: Convert to mono 22kHz WAV via native module
  // The native AudioExtractor already handles: video extraction + downsampling
  // For audio files it just downsamples to mono 22kHz WAV
  const { extractAndDownsample } = require('../modules/my-module');

  let wavUri: string;
  const isAlreadyWav = format.toLowerCase() === 'wav';

  if (isAlreadyWav) {
    // TODO: If WAV, verify it's mono 22kHz — if not, still run through extractor
    // For now, try to parse directly and fall back to extractor
    wavUri = fileUri;
  } else {
    // TODO: Add timeout handling (native module can hang on corrupt files)
    const extracted: string | null = await extractAndDownsample(fileUri);
    if (!extracted) {
      throw new Error(
        'Native AudioExtractor module not available. ' +
        'On-device analysis requires a native build (not Expo Go). ' +
        // TODO: When react-native-audio-api is stable, use it as fallback here
        'See utils/audioDecoder.ts for alternative strategies.'
      );
    }
    wavUri = extracted.startsWith('/') ? `file://${extracted}` : extracted;
  }

  // Step 2: Read WAV file as base64
  // TODO: For large files (>100MB), consider streaming in chunks
  const base64 = await readAsStringAsync(wavUri, {
    encoding: EncodingType.Base64,
  });

  // Step 3: Parse WAV and return PCM Float32Array
  const result = parseWavFromBase64(base64);

  // Cleanup: remove temp WAV file (if we created it, not the original)
  if (!isAlreadyWav && wavUri !== fileUri) {
    deleteAsync(wavUri, { idempotent: true }).catch(() => {
      // Non-critical cleanup failure
    });
  }

  return result;
}
