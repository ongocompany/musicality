export interface AnalysisResult {
  bpm: number;
  beats: number[];           // beat timestamps in seconds
  downbeats: number[];       // downbeat (beat 1) timestamps in seconds
  duration: number;          // track duration in seconds
  beatsPerBar: number;       // typically 4 for 4/4 time
  confidence: number;        // analysis confidence 0-1
}

export type AnalysisStatus = 'idle' | 'analyzing' | 'done' | 'error';
