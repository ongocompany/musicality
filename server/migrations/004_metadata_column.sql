-- Add metadata JSONB column to analysis_cache for auto-tagged track info
-- (AcoustID + MusicBrainz: title, artist, album, album_art_url, release_id)

ALTER TABLE analysis_cache
ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN analysis_cache.metadata IS 'Auto-tagged track metadata from AcoustID/MusicBrainz';
