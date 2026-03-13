-- Musicality Labeling Tool - Supabase Migration
-- Run this in Supabase SQL Editor

-- 1. Tracks: analyzed song metadata
CREATE TABLE IF NOT EXISTS tracks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  filename TEXT NOT NULL,
  duration FLOAT NOT NULL,
  bpm FLOAT NOT NULL,
  audio_path TEXT NOT NULL,
  file_hash TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Auto sections: algorithm analysis results (preserved per version)
CREATE TABLE IF NOT EXISTS auto_sections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (label IN ('intro', 'derecho', 'majao', 'mambo', 'bridge', 'outro')),
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL,
  confidence FLOAT DEFAULT 0.5,
  analyzer_version TEXT DEFAULT 'v2.1',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. User labels: expert + user corrections
CREATE TABLE IF NOT EXISTS user_labels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (label IN ('intro', 'derecho', 'majao', 'mambo', 'bridge', 'outro')),
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL,
  labeler_id TEXT DEFAULT 'anonymous',
  source TEXT DEFAULT 'web_tool' CHECK (source IN ('web_tool', 'mobile_app')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_auto_sections_track ON auto_sections(track_id);
CREATE INDEX IF NOT EXISTS idx_user_labels_track ON user_labels(track_id);
CREATE INDEX IF NOT EXISTS idx_tracks_hash ON tracks(file_hash);

-- Storage: create 'labeling-audio' bucket via Supabase Dashboard > Storage
-- Set bucket to PUBLIC for read access (audio playback from web UI)
