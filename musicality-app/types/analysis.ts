export type SectionLabel = 'intro' | 'derecho' | 'majao' | 'mambo' | 'bridge' | 'outro';

export interface Section {
  label: SectionLabel;
  startTime: number;   // seconds
  endTime: number;     // seconds
  confidence: number;  // 0-1
}

export interface AnalysisResult {
  bpm: number;
  beats: number[];           // beat timestamps in seconds
  downbeats: number[];       // downbeat (beat 1) timestamps in seconds
  duration: number;          // track duration in seconds
  beatsPerBar: number;       // typically 4 for 4/4 time
  confidence: number;        // analysis confidence 0-1
  sections?: Section[];      // music structure sections (optional for backward compat)
}

export type AnalysisStatus = 'idle' | 'analyzing' | 'done' | 'error';
