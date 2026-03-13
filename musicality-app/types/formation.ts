// ─── Dancer definition ──────────────────────────────

export interface DancerDef {
  id: string;              // e.g., 'L1', 'F1', 'L2', 'F2'
  label: string;           // e.g., 'Leader 1', 'Follower 1'
  role: 'leader' | 'follower';
  color: string;           // hex for rendering
  crewMemberId?: string;   // Supabase user_id for crew member assignment
  crewMemberName?: string; // display name (works offline)
}

// ─── Stage configuration ────────────────────────────

export interface StageConfig {
  gridWidth: number;       // stage width in meters (default 8)
  gridHeight: number;      // stage depth in meters (default 4)
}

export const DEFAULT_STAGE_CONFIG: StageConfig = { gridWidth: 8, gridHeight: 4 };

export const STAGE_PRESETS: { label: string; config: StageConfig }[] = [
  { label: '6×3m', config: { gridWidth: 6, gridHeight: 3 } },
  { label: '8×4m', config: { gridWidth: 8, gridHeight: 4 } },
  { label: '10×5m', config: { gridWidth: 10, gridHeight: 5 } },
  { label: '12×6m', config: { gridWidth: 12, gridHeight: 6 } },
];

// ─── A single dancer's position at one beat ─────────

export interface DancerPosition {
  dancerId: string;        // references DancerDef.id
  x: number;               // 0.0 - 1.0 normalized (left to right)
  y: number;               // 0.0 - 1.0 normalized (back to front of stage)
  offstage?: boolean;      // true = in backstage area (waiting)
}

// ─── Formation keyframe = state at one beat ─────────

export interface FormationKeyframe {
  beatIndex: number;       // global beat index (same as PhraseGrid cell)
  positions: DancerPosition[];
}

// ─── Formation data for an entire track ─────────────

export interface FormationData {
  version: 1;
  dancers: DancerDef[];    // configurable 2-12 dancers
  keyframes: FormationKeyframe[];
  // Sparse: only beats with formations are stored.
  // Beats between keyframes interpolate linearly.
}

// ─── Formation Edition (parallels PhraseEdition) ────

export type FormationEditionId = 'S' | '1' | '2' | '3';

export interface FormationEdition {
  id: FormationEditionId;
  data: FormationData;
  createdAt: number;       // Date.now()
  updatedAt: number;       // Date.now()
}

export interface TrackFormations {
  server: FormationEdition | null;     // AI-suggested
  userEditions: FormationEdition[];    // max 3 user editions
  activeEditionId: FormationEditionId;
}

// ─── ChoreoNote file format (.cnote) ─────────────────
// Shareable choreography formation data, parallel to PhraseNote.

export interface ChoreoNoteFile {
  version: 1;
  format: 'cnote';
  metadata: {
    author: string;         // creator display name
    authorId?: string;      // Supabase user_id (when synced)
    authorAvatar?: string;  // avatar URL (when synced)
    createdAt: number;      // Date.now()
    title: string;          // track title
  };
  music: {
    bpm: number;
    duration: number;       // seconds
    beatsPerBar: number;
    danceStyle: string;
    fingerprint?: string;   // Chromaprint for auto-matching
  };
  formation: FormationData;
  stageConfig: StageConfig;
}

export interface ImportedChoreoNote {
  id: string;                     // unique ID (uuid)
  trackId: string;                // applied track ID
  choreoNote: ChoreoNoteFile;     // the imported data
  importedAt: number;             // Date.now()
  isActive: boolean;
}

// ─── Pattern library ────────────────────────────────

export type PatternId =
  | 'pairs-facing'
  | 'pairs-side'
  | 'line'
  | 'circle'
  | 'v-shape'
  | 'diamond'
  | 'staggered'
  | 'scatter'
  | 'two-lines';

export interface FormationPattern {
  id: PatternId;
  name: string;
  description: string;
  minDancers: number;
  maxDancers: number;
}

// ─── Default dancer configs ─────────────────────────

const LEADER_COLORS = ['#4488FF', '#2196F3', '#1565C0', '#0D47A1', '#42A5F5', '#1E88E5'];
const FOLLOWER_COLORS = ['#FF6B9D', '#E91E63', '#C2185B', '#AD1457', '#F06292', '#EC407A'];

export function createDefaultDancers(count: number): DancerDef[] {
  const dancers: DancerDef[] = [];
  const pairs = Math.ceil(count / 2);

  for (let i = 0; i < pairs; i++) {
    dancers.push({
      id: `L${i + 1}`,
      label: `Leader ${i + 1}`,
      role: 'leader',
      color: LEADER_COLORS[i % LEADER_COLORS.length],
    });
    if (dancers.length < count) {
      dancers.push({
        id: `F${i + 1}`,
        label: `Follower ${i + 1}`,
        role: 'follower',
        color: FOLLOWER_COLORS[i % FOLLOWER_COLORS.length],
      });
    }
  }

  return dancers.slice(0, count);
}
