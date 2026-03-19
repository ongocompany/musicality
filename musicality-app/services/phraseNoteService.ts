import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Share, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import CryptoJS from 'crypto-js';
import * as ExpoCrypto from 'expo-crypto';

// Provide secure random to crypto-js in React Native environment
const originalRandom = CryptoJS.lib.WordArray.random;
CryptoJS.lib.WordArray.random = (nBytes: number) => {
  const bytes = ExpoCrypto.getRandomBytes(nBytes);
  const words: number[] = [];
  for (let i = 0; i < nBytes; i += 4) {
    words.push(
      ((bytes[i] || 0) << 24) |
      ((bytes[i + 1] || 0) << 16) |
      ((bytes[i + 2] || 0) << 8) |
      (bytes[i + 3] || 0)
    );
  }
  return CryptoJS.lib.WordArray.create(words, nBytes);
};

import { AnalysisResult } from '../types/analysis';
import { PhraseNoteFile } from '../types/phraseNote';
import { DanceStyle } from '../utils/beatCounter';

// ─── Encryption ──────────────────────────────────────────
// AES-256 symmetric key for .ritmo file encryption
// This prevents casual inspection of exported files
const RITMO_FILE_KEY = 'R1tm0-2026!Lat1n-D4nc3-Mus1c@lity';
const RITMO_MAGIC = 'RITMO1'; // file header magic bytes for format detection

function encryptPhraseNote(data: PhraseNoteFile): string {
  const json = JSON.stringify(data);
  const encrypted = CryptoJS.AES.encrypt(json, RITMO_FILE_KEY).toString();
  // Prepend magic header for format detection
  return RITMO_MAGIC + encrypted;
}

export function decryptPhraseNote(content: string): PhraseNoteFile {
  // Check magic header
  if (!content.startsWith(RITMO_MAGIC)) {
    // Try legacy JSON format (backward compatibility)
    const parsed = JSON.parse(content);
    return parsed as PhraseNoteFile;
  }
  const encrypted = content.slice(RITMO_MAGIC.length);
  const bytes = CryptoJS.AES.decrypt(encrypted, RITMO_FILE_KEY);
  const json = bytes.toString(CryptoJS.enc.Utf8);
  if (!json) throw new Error('Failed to decrypt file. Invalid or corrupted data.');
  return JSON.parse(json) as PhraseNoteFile;
}

/**
 * Build a PhraseNoteFile from current track state.
 */
export function buildPhraseNoteFile(params: {
  author: string;
  title: string;
  analysis: AnalysisResult;
  danceStyle: DanceStyle;
  downbeatOffset: number;      // beat index marked as "1"
  boundaries: number[];        // phrase boundary beat indices
  beatsPerPhrase: number;
  cellNotes: Record<string, string>;
  formation?: import('../types/formation').FormationData;
}): PhraseNoteFile {
  const { author, title, analysis, danceStyle, downbeatOffset, boundaries, beatsPerPhrase, cellNotes, formation } = params;

  return {
    version: 1,
    format: formation ? 'cnote' : 'pnote',
    metadata: {
      author: author.trim() || 'Unknown',
      createdAt: Date.now(),
      title,
    },
    music: {
      bpm: analysis.bpm,
      duration: analysis.duration,
      beatsPerBar: analysis.beatsPerBar,
      danceStyle,
    },
    analysis: {
      beats: analysis.beats,
      downbeats: analysis.downbeats,
      downbeatOffset,
      confidence: analysis.confidence,
      fingerprint: analysis.fingerprint,
    },
    phrases: {
      boundaries,
      beatsPerPhrase,
    },
    cellNotes: cellNotes || {},
    ...(formation ? { formation } : {}),
  };
}

/**
 * Export a PhraseNoteFile to a .pnote file and open the native share sheet.
 */
export async function exportPhraseNote(
  phraseNote: PhraseNoteFile,
  filename?: string,
): Promise<void> {
  const safeName = (filename || phraseNote.metadata.title || 'phrasenote')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 30);

  const ext = phraseNote.format === 'cnote' ? 'cnote' : 'pnote';
  const encrypted = encryptPhraseNote(phraseNote);

  // Write encrypted data to cache as .ritmo file
  const file = new File(Paths.cache, `${safeName}.${ext}.ritmo`);
  if (file.exists) {
    file.delete();
  }
  file.create();
  file.write(encrypted);

  console.log('[PhraseNote] Encrypted file written:', file.uri, 'size:', file.size);

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device');
  }

  const noteLabel = phraseNote.format === 'cnote' ? 'ChoreoNote' : 'PhraseNote';
  console.log('[PhraseNote] Opening share sheet...');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/octet-stream',
    dialogTitle: `Share ${noteLabel}: ${phraseNote.metadata.title}`,
  });
  console.log('[PhraseNote] Share sheet closed');
}

/**
 * Validate a parsed PhraseNote object.
 * Returns null if valid, error message string if invalid.
 */
export function validatePhraseNote(data: unknown): string | null {
  if (!data || typeof data !== 'object') return 'Invalid data format';

  const pn = data as Record<string, unknown>;
  if (pn.version !== 1) return `Unsupported version: ${pn.version}`;
  if (pn.format !== 'pnote' && pn.format !== 'cnote') return `Invalid format: ${pn.format}`;
  if (!pn.metadata || typeof pn.metadata !== 'object') return 'Missing metadata';
  if (!pn.music || typeof pn.music !== 'object') return 'Missing music info';
  if (!pn.analysis || typeof pn.analysis !== 'object') return 'Missing analysis data';
  if (!pn.phrases || typeof pn.phrases !== 'object') return 'Missing phrase data';

  const analysis = pn.analysis as Record<string, unknown>;
  if (!Array.isArray(analysis.beats) || analysis.beats.length === 0) {
    return 'Missing beat data';
  }

  const phrases = pn.phrases as Record<string, unknown>;
  if (!Array.isArray(phrases.boundaries)) {
    return 'Missing phrase boundaries';
  }

  return null; // valid
}

/**
 * Open document picker and read a .pnote file.
 * Returns parsed PhraseNoteFile or null if cancelled/invalid.
 */
export async function pickPhraseNoteFile(): Promise<PhraseNoteFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/octet-stream', 'application/json', '*/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const file = new File(asset.uri);
  if (!file.exists) {
    throw new Error('Selected file does not exist');
  }
  const content = await file.text();

  // Decrypt (handles both encrypted .ritmo and legacy JSON)
  const data = decryptPhraseNote(content);

  const error = validatePhraseNote(data);
  if (error) {
    throw new Error(error);
  }

  return data;
}

/**
 * Find a matching track by comparing BPM and duration.
 * Fingerprint matching is preferred but falls back to BPM+duration heuristic.
 * Returns trackId or null if no match found.
 */
export function findMatchingTrack(
  tracks: Array<{ id: string; analysis?: { bpm: number; duration: number; fingerprint?: string } }>,
  phraseNote: PhraseNoteFile,
): string | null {
  const pnFingerprint = phraseNote.analysis.fingerprint;
  const pnBpm = phraseNote.music.bpm;
  const pnDuration = phraseNote.music.duration;

  // Pass 1: Fingerprint exact match
  if (pnFingerprint) {
    for (const track of tracks) {
      if (track.analysis?.fingerprint && track.analysis.fingerprint === pnFingerprint) {
        return track.id;
      }
    }
  }

  // Pass 2: BPM + duration heuristic (within 2% BPM and 5s duration)
  for (const track of tracks) {
    if (!track.analysis) continue;
    const bpmDiff = Math.abs(track.analysis.bpm - pnBpm) / pnBpm;
    const durDiff = Math.abs(track.analysis.duration - pnDuration);
    if (bpmDiff < 0.02 && durDiff < 5) {
      return track.id;
    }
  }

  return null;
}
