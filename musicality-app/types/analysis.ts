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
}

export type AnalysisStatus = 'idle' | 'analyzing' | 'done' | 'error';
