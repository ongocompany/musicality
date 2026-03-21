import { Asset } from 'expo-asset';
import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  copyAsync,
  downloadAsync,
  deleteAsync,
} from 'expo-file-system/legacy';
import { usePlayerStore } from '../stores/playerStore';
import { AnalysisResult } from '../types/analysis';
import { Track } from '../types/track';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const DEMO_ANALYSIS = require('../assets/demo/UnSoloLatido.json');
const DEMO_MP3 = require('../assets/demo/UnSoloLatido.mp3');

export const DEMO_TRACK_ID = 'demo-un-solo-latido';
const DEMO_DIR = `${documentDirectory}demo/`;
// Use filename without spaces to avoid iOS URI issues
const DEMO_FILENAME = 'UnSoloLatido.mp3';

/**
 * Convert server snake_case analysis JSON to app's camelCase AnalysisResult.
 */
function mapServerAnalysis(raw: any): AnalysisResult {
  return {
    bpm: raw.bpm,
    beats: raw.beats,
    downbeats: raw.downbeats,
    duration: raw.duration,
    beatsPerBar: raw.beats_per_bar ?? raw.beatsPerBar ?? 4,
    confidence: raw.confidence,
    sections: raw.sections?.map((s: any) => ({
      label: s.label,
      startTime: s.start_time ?? s.startTime,
      endTime: s.end_time ?? s.endTime,
      confidence: s.confidence,
    })),
    phraseBoundaries: raw.phrase_boundaries ?? raw.phraseBoundaries,
    waveformPeaks: raw.waveform_peaks ?? raw.waveformPeaks,
    fingerprint: raw.fingerprint,
    metadata: raw.metadata ?? undefined,
  };
}

/**
 * Load the bundled demo track into the library on first launch.
 * Returns true if the demo track was added (first time).
 */
export async function ensureDemoTrack(): Promise<boolean> {
  const store = usePlayerStore.getState();

  // Already in library? Check if valid (file must exist and be > 1KB)
  const existingTrack = store.tracks.find((t) => t.id === DEMO_TRACK_ID);
  if (existingTrack) {
    try {
      const fileInfo = await getInfoAsync(existingTrack.uri);
      if (fileInfo.exists && (fileInfo as any).size > 1024) {
        return false; // Valid demo track already loaded
      }
      // Corrupt or missing — remove from library and re-add
      console.warn('[DemoTrack] Existing demo track invalid, re-loading...');
      store.removeTrack(DEMO_TRACK_ID);
    } catch {
      store.removeTrack(DEMO_TRACK_ID);
    }
  }

  try {
    // 1. Download bundled asset to local cache
    const asset = Asset.fromModule(DEMO_MP3);
    await asset.downloadAsync();

    if (!asset.localUri) {
      console.warn('[DemoTrack] Failed to download demo asset');
      return false;
    }

    console.log('[DemoTrack] Asset localUri:', asset.localUri);

    // 2. Ensure demo directory exists
    const dirInfo = await getInfoAsync(DEMO_DIR);
    if (!dirInfo.exists) {
      await makeDirectoryAsync(DEMO_DIR, { intermediates: true });
    }

    const destUri = `${DEMO_DIR}${DEMO_FILENAME}`;

    // 3. Copy asset to persistent document directory
    //    Delete corrupt file if it exists but is too small (< 1KB)
    const destInfo = await getInfoAsync(destUri);
    if (destInfo.exists && (destInfo as any).size < 1024) {
      console.warn('[DemoTrack] Corrupt file detected, deleting:', (destInfo as any).size, 'bytes');
      await deleteAsync(destUri, { idempotent: true });
    }
    if (!(await getInfoAsync(destUri)).exists) {
      // Try copyAsync first (works in production builds)
      // Fall back to downloadAsync (works in Metro dev mode where localUri may be HTTP)
      const isLocalFile = asset.localUri?.startsWith('file://');
      if (isLocalFile) {
        await copyAsync({ from: asset.localUri!, to: destUri });
        console.log('[DemoTrack] Copied (copyAsync) to:', destUri);
      } else {
        // In Metro dev mode, asset.uri is an HTTP URL — download it
        const sourceUri = asset.localUri || asset.uri;
        console.log('[DemoTrack] Downloading from:', sourceUri);
        await downloadAsync(sourceUri, destUri);
        console.log('[DemoTrack] Downloaded to:', destUri);
      }
    }

    // 4. Verify file was written successfully
    const verifyInfo = await getInfoAsync(destUri);
    if (!verifyInfo.exists || (verifyInfo as any).size === 0) {
      console.error('[DemoTrack] File verification failed');
      return false;
    }
    console.log('[DemoTrack] File verified, size:', (verifyInfo as any).size);

    // 5. Parse analysis data
    const analysis = mapServerAnalysis(DEMO_ANALYSIS);

    // 6. Create track object
    const demoTrack: Track = {
      id: DEMO_TRACK_ID,
      title: 'Un Solo Latido',
      uri: destUri,
      fileSize: (verifyInfo as any).size ?? 2 * 1024 * 1024,
      format: 'mp3',
      mediaType: 'audio',
      duration: analysis.duration,
      importedAt: Date.now(),
      artist: 'Ritmo',
      album: 'Demo',
      analysis,
      analysisStatus: 'done',
    };

    // 7. Add to library
    store.addTrack(demoTrack);

    console.log('[DemoTrack] Demo track loaded successfully');
    return true;
  } catch (error) {
    console.error('[DemoTrack] Failed to load demo track:', error);
    return false;
  }
}
