import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Share, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { AnalysisResult } from '../types/analysis';
import { PhraseNoteFile } from '../types/phraseNote';
import { DanceStyle } from '../utils/beatCounter';

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
}): PhraseNoteFile {
  const { author, title, analysis, danceStyle, downbeatOffset, boundaries, beatsPerPhrase, cellNotes } = params;

  return {
    version: 1,
    format: 'pnote',
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

  const jsonContent = JSON.stringify(phraseNote, null, 2);

  // Write JSON to cache using expo-file-system v19 File API
  // Use .json extension for broad OS/app compatibility
  const file = new File(Paths.cache, `${safeName}.pnote.json`);
  if (file.exists) {
    file.delete();
  }
  file.create();
  file.write(jsonContent);

  console.log('[PhraseNote] File written:', file.uri, 'size:', file.size);

  // Check if sharing is available
  const isAvailable = await Sharing.isAvailableAsync();
  console.log('[PhraseNote] Sharing available:', isAvailable);
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device');
  }

  // Try expo-sharing first, fall back to RN Share if it hangs
  console.log('[PhraseNote] Opening share sheet...');
  try {
    const sharePromise = Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: `Share PhraseNote: ${phraseNote.metadata.title}`,
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('__timeout__')), 3000)
    );
    await Promise.race([sharePromise, timeoutPromise]);
    console.log('[PhraseNote] Share sheet closed');
  } catch (e: any) {
    if (e?.message === '__timeout__') {
      // expo-sharing hung — fall back to RN Share with JSON text
      console.log('[PhraseNote] expo-sharing timeout, falling back to RN Share');
      await Share.share({
        title: `${phraseNote.metadata.title}.pnote`,
        message: jsonContent,
      });
      console.log('[PhraseNote] RN Share closed');
    } else {
      throw e; // re-throw original error (e.g. "User did not share")
    }
  }
}

/**
 * Validate a parsed PhraseNote object.
 * Returns null if valid, error message string if invalid.
 */
export function validatePhraseNote(data: unknown): string | null {
  if (!data || typeof data !== 'object') return 'Invalid data format';

  const pn = data as Record<string, unknown>;
  if (pn.version !== 1) return `Unsupported version: ${pn.version}`;
  if (pn.format !== 'pnote') return `Invalid format: ${pn.format}`;
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
    type: ['application/json', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  // Read file content using expo-file-system v19 File API
  const file = new File(asset.uri);
  if (!file.exists) {
    throw new Error('Selected file does not exist');
  }
  const content = await file.text();
  const data = JSON.parse(content);

  const error = validatePhraseNote(data);
  if (error) {
    throw new Error(error);
  }

  return data as PhraseNoteFile;
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
