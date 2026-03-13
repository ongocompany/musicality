-- Global analysis cache (server-side only, no RLS)
-- Stores analysis results keyed by SHA-256 file hash
-- Any user uploading the same file gets instant cached results

CREATE TABLE IF NOT EXISTS analysis_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_hash TEXT UNIQUE NOT NULL,
  file_size BIGINT,
  bpm REAL NOT NULL,
  beats JSONB NOT NULL DEFAULT '[]',
  downbeats JSONB NOT NULL DEFAULT '[]',
  duration REAL NOT NULL,
  beats_per_bar INT NOT NULL DEFAULT 4,
  confidence REAL NOT NULL DEFAULT 0,
  sections JSONB DEFAULT '[]',
  phrase_boundaries JSONB DEFAULT '[]',
  waveform_peaks JSONB DEFAULT '[]',
  fingerprint TEXT DEFAULT '',
  analyzer_version TEXT NOT NULL DEFAULT 'v2.1',
  hit_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analysis_cache_hash ON analysis_cache(file_hash);
CREATE INDEX IF NOT EXISTS idx_analysis_cache_version ON analysis_cache(analyzer_version);

-- No RLS — accessed only via server service-role key
ALTER TABLE analysis_cache DISABLE ROW LEVEL SECURITY;
