/**
 * PhraseNote file format (.pnote)
 * Shareable phrase analysis data for collaborative dance practice.
 */

export interface PhraseNoteFile {
  version: 1;
  format: 'pnote';
  metadata: {
    author: string;         // creator name
    createdAt: number;      // Date.now()
    title: string;          // track title
  };
  music: {
    bpm: number;
    duration: number;       // seconds
    beatsPerBar: number;
    danceStyle: string;     // 'bachata' | 'salsa-on1' | 'salsa-on2'
  };
  analysis: {
    beats: number[];        // beat timestamps in seconds
    downbeats: number[];    // downbeat timestamps in seconds
    downbeatOffset: number; // beat index user marked as "1"
    confidence: number;
    fingerprint?: string;   // Chromaprint fingerprint for auto-matching
  };
  phrases: {
    boundaries: number[];   // beat indices where phrases start
    beatsPerPhrase: number;
  };
  cellNotes: Record<string, string>;  // beatIndex(string) → memo text
}

export interface ImportedPhraseNote {
  id: string;                   // unique ID (uuid)
  trackId: string;              // applied track ID
  phraseNote: PhraseNoteFile;   // the imported data
  importedAt: number;           // Date.now()
  isActive: boolean;            // currently active for this track
}
