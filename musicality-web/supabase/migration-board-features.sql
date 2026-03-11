-- ─── Board Features Migration ────────────────────────────────
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Adds: media attachments, likes, view count, reply count

-- 1. Add columns to general_posts
ALTER TABLE general_posts ADD COLUMN IF NOT EXISTS media_urls TEXT[] DEFAULT '{}';
ALTER TABLE general_posts ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0;
ALTER TABLE general_posts ADD COLUMN IF NOT EXISTS reply_count INTEGER DEFAULT 0;
ALTER TABLE general_posts ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;

-- 2. Create post_likes table
CREATE TABLE IF NOT EXISTS public.post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES general_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user ON post_likes(user_id);

-- 3. RLS for post_likes
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "post_likes_select" ON post_likes FOR SELECT USING (true);
CREATE POLICY "post_likes_insert" ON post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "post_likes_delete" ON post_likes FOR DELETE USING (auth.uid() = user_id);

-- 4. Toggle like function (returns true = liked, false = unliked)
CREATE OR REPLACE FUNCTION toggle_post_like(p_post_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM post_likes WHERE post_id = p_post_id AND user_id = auth.uid()
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM post_likes WHERE post_id = p_post_id AND user_id = auth.uid();
    UPDATE general_posts SET like_count = GREATEST(0, like_count - 1) WHERE id = p_post_id;
    RETURN FALSE;
  ELSE
    INSERT INTO post_likes (post_id, user_id) VALUES (p_post_id, auth.uid());
    UPDATE general_posts SET like_count = like_count + 1 WHERE id = p_post_id;
    RETURN TRUE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Auto-update reply_count trigger
CREATE OR REPLACE FUNCTION update_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE general_posts SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE general_posts SET reply_count = GREATEST(0, reply_count - 1) WHERE id = OLD.parent_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reply_count ON general_posts;
CREATE TRIGGER trg_reply_count
  AFTER INSERT OR DELETE ON general_posts
  FOR EACH ROW EXECUTE FUNCTION update_reply_count();

-- 6. Increment view count function
CREATE OR REPLACE FUNCTION increment_post_view(p_post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE general_posts SET view_count = view_count + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Storage bucket for post media (images & videos)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('post-media', 'post-media', true, 52428800)  -- 50MB max
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "post_media_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'post-media');
CREATE POLICY "post_media_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'post-media' AND auth.role() = 'authenticated');
CREATE POLICY "post_media_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 8. Backfill reply_count for existing posts
UPDATE general_posts p
SET reply_count = (
  SELECT COUNT(*) FROM general_posts r WHERE r.parent_id = p.id
)
WHERE EXISTS (
  SELECT 1 FROM general_posts r WHERE r.parent_id = p.id
);

SELECT 'Migration complete!' AS status;
