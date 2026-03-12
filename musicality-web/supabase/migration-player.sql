-- ============================================================
-- WM1: Web Player — tracks, analyses, editions, notes, folders
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Library folders
CREATE TABLE IF NOT EXISTS player_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'audio' CHECK (media_type IN ('audio', 'video', 'youtube')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE player_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_folders_owner" ON player_folders
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Tracks (per user, local files + YouTube)
CREATE TABLE IF NOT EXISTS player_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('audio', 'video', 'youtube')),
  -- File identification
  fingerprint TEXT,              -- Chromaprint audio fingerprint
  file_hash TEXT,                -- SHA-256 for quick file matching
  file_size BIGINT,
  format TEXT,                   -- mp3, wav, mp4, mov, etc.
  duration REAL,                 -- seconds
  -- YouTube
  youtube_url TEXT,
  youtube_video_id TEXT,
  -- Organization
  folder_id UUID REFERENCES player_folders(id) ON DELETE SET NULL,
  dance_style TEXT NOT NULL DEFAULT 'bachata',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraints: same file = same track per user
CREATE UNIQUE INDEX idx_tracks_user_fingerprint
  ON player_tracks (user_id, fingerprint) WHERE fingerprint IS NOT NULL;
CREATE UNIQUE INDEX idx_tracks_user_youtube
  ON player_tracks (user_id, youtube_video_id) WHERE youtube_video_id IS NOT NULL;
CREATE UNIQUE INDEX idx_tracks_user_filehash
  ON player_tracks (user_id, file_hash) WHERE file_hash IS NOT NULL;

CREATE INDEX idx_tracks_fingerprint ON player_tracks (fingerprint) WHERE fingerprint IS NOT NULL;
CREATE INDEX idx_tracks_youtube_vid ON player_tracks (youtube_video_id) WHERE youtube_video_id IS NOT NULL;

ALTER TABLE player_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_tracks_owner" ON player_tracks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. Analysis results (per track)
CREATE TABLE IF NOT EXISTS track_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES player_tracks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bpm REAL NOT NULL,
  beats JSONB NOT NULL DEFAULT '[]',           -- [0.5, 1.0, 1.5, ...] seconds
  downbeats JSONB NOT NULL DEFAULT '[]',       -- subset of beats
  beats_per_bar INT NOT NULL DEFAULT 4,
  confidence REAL NOT NULL DEFAULT 0,
  sections JSONB DEFAULT '[]',                 -- [{label, startTime, endTime, confidence}]
  phrase_boundaries JSONB DEFAULT '[]',        -- seconds (server-detected)
  waveform_peaks JSONB DEFAULT '[]',           -- normalized 0-1
  fingerprint TEXT,                            -- Chromaprint (for cross-user sharing later)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(track_id, user_id)
);

ALTER TABLE track_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "track_analyses_owner" ON track_analyses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Allow reading analyses by fingerprint (for cross-device matching)
CREATE POLICY "track_analyses_read_by_fingerprint" ON track_analyses
  FOR SELECT USING (
    fingerprint IS NOT NULL
    AND fingerprint IN (
      SELECT fingerprint FROM player_tracks WHERE user_id = auth.uid() AND fingerprint IS NOT NULL
    )
  );

-- 4. Phrase editions (server + up to 3 user editions per track)
CREATE TABLE IF NOT EXISTS phrase_editions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES player_tracks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  edition_id TEXT NOT NULL,                    -- 'S' (server), '1', '2', '3'
  boundaries JSONB NOT NULL DEFAULT '[]',      -- beat indices (not timestamps)
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(track_id, user_id, edition_id)
);

ALTER TABLE phrase_editions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phrase_editions_owner" ON phrase_editions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5. Cell notes (per-beat choreography memos)
CREATE TABLE IF NOT EXISTS cell_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES player_tracks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  edition_id TEXT NOT NULL DEFAULT 'S',
  notes JSONB NOT NULL DEFAULT '{}',           -- {"0": "basic step", "4": "cross body lead"}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(track_id, user_id, edition_id)
);

ALTER TABLE cell_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cell_notes_owner" ON cell_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6. Track settings (per-track user overrides)
CREATE TABLE IF NOT EXISTS track_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES player_tracks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  downbeat_offset INT NOT NULL DEFAULT 0,      -- beat index marked as "1"
  dance_style_override TEXT,                   -- per-track override (null = use global)
  playback_rate REAL NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(track_id, user_id)
);

ALTER TABLE track_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "track_settings_owner" ON track_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- RPC: Fingerprint matching — find existing analysis by fingerprint
-- ============================================================

CREATE OR REPLACE FUNCTION match_track_by_fingerprint(
  p_fingerprint TEXT
)
RETURNS TABLE (
  track_id UUID,
  analysis_id UUID,
  bpm REAL,
  beats JSONB,
  downbeats JSONB,
  beats_per_bar INT,
  confidence REAL,
  sections JSONB,
  phrase_boundaries JSONB,
  waveform_peaks JSONB
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id AS track_id,
    a.id AS analysis_id,
    a.bpm,
    a.beats,
    a.downbeats,
    a.beats_per_bar,
    a.confidence,
    a.sections,
    a.phrase_boundaries,
    a.waveform_peaks
  FROM player_tracks t
  JOIN track_analyses a ON a.track_id = t.id
  WHERE t.fingerprint = p_fingerprint
    AND t.user_id = auth.uid()
  ORDER BY a.created_at DESC
  LIMIT 1;
$$;

-- ============================================================
-- RPC: Upsert track + analysis in one call
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_track_with_analysis(
  p_title TEXT,
  p_media_type TEXT,
  p_fingerprint TEXT DEFAULT NULL,
  p_file_hash TEXT DEFAULT NULL,
  p_file_size BIGINT DEFAULT NULL,
  p_format TEXT DEFAULT NULL,
  p_duration REAL DEFAULT NULL,
  p_youtube_url TEXT DEFAULT NULL,
  p_youtube_video_id TEXT DEFAULT NULL,
  p_dance_style TEXT DEFAULT 'bachata',
  p_folder_id UUID DEFAULT NULL,
  -- Analysis fields
  p_bpm REAL DEFAULT NULL,
  p_beats JSONB DEFAULT '[]',
  p_downbeats JSONB DEFAULT '[]',
  p_beats_per_bar INT DEFAULT 4,
  p_confidence REAL DEFAULT 0,
  p_sections JSONB DEFAULT '[]',
  p_phrase_boundaries JSONB DEFAULT '[]',
  p_waveform_peaks JSONB DEFAULT '[]'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_track_id UUID;
BEGIN
  -- Try to find existing track by fingerprint or youtube_video_id or file_hash
  SELECT id INTO v_track_id FROM player_tracks
  WHERE user_id = v_user_id
    AND (
      (p_fingerprint IS NOT NULL AND fingerprint = p_fingerprint)
      OR (p_youtube_video_id IS NOT NULL AND youtube_video_id = p_youtube_video_id)
      OR (p_file_hash IS NOT NULL AND file_hash = p_file_hash)
    )
  LIMIT 1;

  IF v_track_id IS NULL THEN
    -- Insert new track
    INSERT INTO player_tracks (user_id, title, media_type, fingerprint, file_hash, file_size, format, duration, youtube_url, youtube_video_id, dance_style, folder_id)
    VALUES (v_user_id, p_title, p_media_type, p_fingerprint, p_file_hash, p_file_size, p_format, p_duration, p_youtube_url, p_youtube_video_id, p_dance_style, p_folder_id)
    RETURNING id INTO v_track_id;
  ELSE
    -- Update existing track metadata
    UPDATE player_tracks SET
      title = COALESCE(p_title, title),
      duration = COALESCE(p_duration, duration),
      fingerprint = COALESCE(p_fingerprint, fingerprint),
      file_hash = COALESCE(p_file_hash, file_hash),
      updated_at = now()
    WHERE id = v_track_id;
  END IF;

  -- Upsert analysis if BPM provided
  IF p_bpm IS NOT NULL THEN
    INSERT INTO track_analyses (track_id, user_id, bpm, beats, downbeats, beats_per_bar, confidence, sections, phrase_boundaries, waveform_peaks, fingerprint)
    VALUES (v_track_id, v_user_id, p_bpm, p_beats, p_downbeats, p_beats_per_bar, p_confidence, p_sections, p_phrase_boundaries, p_waveform_peaks, p_fingerprint)
    ON CONFLICT (track_id, user_id) DO UPDATE SET
      bpm = EXCLUDED.bpm,
      beats = EXCLUDED.beats,
      downbeats = EXCLUDED.downbeats,
      beats_per_bar = EXCLUDED.beats_per_bar,
      confidence = EXCLUDED.confidence,
      sections = EXCLUDED.sections,
      phrase_boundaries = EXCLUDED.phrase_boundaries,
      waveform_peaks = EXCLUDED.waveform_peaks,
      fingerprint = EXCLUDED.fingerprint;
  END IF;

  RETURN v_track_id;
END;
$$;
