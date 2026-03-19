export type SectionLabel = 'intro' | 'derecho' | 'majao' | 'mambo' | 'bridge' | 'outro';

export interface Section {
  label: SectionLabel;
  startTime: number;   // seconds
  endTime: number;     // seconds
  confidence: number;  // 0-1
}

// ─── Phrase-based structure ───────────────────────────

export type PhraseDetectionMode = 'rule-based' | 'user-marked' | 'server';

export interface Phrase {
  index: number;           // 0-based phrase number
  startBeatIndex: number;  // index into beats[] where phrase starts
  endBeatIndex: number;    // index into beats[] where phrase ends (exclusive)
  startTime: number;       // seconds (from beats[startBeatIndex])
  endTime: number;         // seconds (from beats[endBeatIndex] or track duration)
}

export interface PhraseMap {
  phrases: Phrase[];
  beatsPerPhrase: number;        // e.g., 32 (4 eight-counts)
  detectionMode: PhraseDetectionMode;
}

// ─── Track metadata (auto-tagged via AcoustID + MusicBrainz) ──

export interface TrackMetadata {
  title?: string;           // track title from MusicBrainz
  artist?: string;          // artist name
  album?: string;           // album name
  albumArtUrl?: string;     // Cover Art Archive URL (250px thumbnail)
  releaseId?: string;       // MusicBrainz release ID
}

// ─── Analysis result ──────────────────────────────────

export interface AnalysisResult {
  bpm: number;
  beats: number[];           // beat timestamps in seconds
  downbeats: number[];       // downbeat (beat 1) timestamps in seconds
  duration: number;          // track duration in seconds
  beatsPerBar: number;       // typically 4 for 4/4 time
  confidence: number;        // analysis confidence 0-1
  sections?: Section[];      // music structure sections (backward compat)
  phraseBoundaries?: number[]; // phrase boundary timestamps from server (seconds)
  waveformPeaks?: number[];    // normalized amplitude peaks (0-1) for waveform visualization
  fingerprint?: string;        // Chromaprint audio fingerprint for track identification
  metadata?: TrackMetadata;    // auto-tagged track info (AcoustID + MusicBrainz)
}

export type AnalysisStatus = 'idle' | 'analyzing' | 'done' | 'error';

// ─── Phrase Edition System ───────────────────────────

/** Edition identifier: 'S' = server original, '1'|'2'|'3' = user editions */
export type EditionId = 'S' | '1' | '2' | '3';

export interface PhraseEdition {
  id: EditionId;
  boundaries: number[];   // beat indices (not timestamps)
  createdAt: number;       // Date.now()
  updatedAt: number;       // Date.now()
}

export interface TrackEditions {
  server: PhraseEdition | null;     // 'S' edition — from server analysis
  userEditions: PhraseEdition[];    // max 3 user editions
  activeEditionId: EditionId;       // currently active
}
