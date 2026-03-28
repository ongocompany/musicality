import * as FileSystem from 'expo-file-system/legacy';
import { AnalysisResult } from '../types/analysis';

const ANALYSIS_DIR = `${FileSystem.documentDirectory}analysis/`;

async function ensureDir() {
  const dirInfo = await FileSystem.getInfoAsync(ANALYSIS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(ANALYSIS_DIR, { intermediates: true });
  }
}

export async function saveAnalysisResult(trackId: string, analysis: AnalysisResult): Promise<void> {
  await ensureDir();
  const fileUri = `${ANALYSIS_DIR}${trackId}.json`;
  try {
    await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(analysis));
  } catch (err) {
    console.error(`[AnalysisStorage] Save failed for ${trackId}:`, err);
  }
}

export async function loadAnalysisResult(trackId: string): Promise<AnalysisResult | null> {
  const fileUri = `${ANALYSIS_DIR}${trackId}.json`;
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) return null;
    const content = await FileSystem.readAsStringAsync(fileUri);
    return JSON.parse(content) as AnalysisResult;
  } catch (err) {
    console.error(`[AnalysisStorage] Load failed for ${trackId}:`, err);
    return null;
  }
}

export async function deleteAnalysisResult(trackId: string): Promise<void> {
  const fileUri = `${ANALYSIS_DIR}${trackId}.json`;
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    }
  } catch (err) {
    console.error(`[AnalysisStorage] Delete failed for ${trackId}:`, err);
  }
}

/**
 * Migrate: extract analysis from tracks array and save each to file.
 * Returns tracks with analysis stripped (only keeps analysisStatus).
 * Called once during persist version migration.
 */
export async function migrateAnalysisToFiles(
  tracks: any[],
): Promise<any[]> {
  await ensureDir();
  let migrated = 0;
  const stripped = await Promise.all(
    tracks.map(async (t) => {
      if (t.analysis) {
        try {
          await FileSystem.writeAsStringAsync(
            `${ANALYSIS_DIR}${t.id}.json`,
            JSON.stringify(t.analysis),
          );
          migrated++;
        } catch (err) {
          console.error(`[AnalysisStorage] Migration failed for ${t.id}:`, err);
        }
        // Strip analysis from persisted track
        const { analysis, ...rest } = t;
        return { ...rest, analysisStatus: 'done' };
      }
      return t;
    }),
  );
  console.log(`[AnalysisStorage] Migrated ${migrated}/${tracks.length} tracks to files`);
  return stripped;
}

/**
 * Load analysis results for multiple tracks from files.
 * Returns a map of trackId → AnalysisResult.
 */
export async function loadAllAnalysisResults(
  trackIds: string[],
): Promise<Map<string, AnalysisResult>> {
  const results = new Map<string, AnalysisResult>();
  await Promise.all(
    trackIds.map(async (id) => {
      const analysis = await loadAnalysisResult(id);
      if (analysis) results.set(id, analysis);
    }),
  );
  return results;
}
