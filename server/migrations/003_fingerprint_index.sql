-- Add indexes for fingerprint-based cache lookup (Tier 2)
-- Supports: duration range filter + fingerprint matching

CREATE INDEX IF NOT EXISTS idx_analysis_cache_duration
  ON analysis_cache(duration);

CREATE INDEX IF NOT EXISTS idx_analysis_cache_fingerprint
  ON analysis_cache(fingerprint)
  WHERE fingerprint != '';
