-- ─── Social System Migration ────────────────────────────────
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Adds: user_follows, user_blocks, user_notes, direct_messages
-- Adds: follower_count/following_count to profiles
-- Adds: toggle_follow, toggle_block, send_message, mark_messages_read RPCs
-- Updates: delete_my_account to clean up social data

-- ══════════════════════════════════════════════════════════════
-- 1. Add follower/following counts to profiles
-- ══════════════════════════════════════════════════════════════
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS follower_count INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;

-- ══════════════════════════════════════════════════════════════
-- 2. user_follows table
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.user_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows(following_id);

ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows_select" ON user_follows FOR SELECT USING (true);
CREATE POLICY "follows_insert" ON user_follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "follows_delete" ON user_follows FOR DELETE USING (auth.uid() = follower_id);

-- ══════════════════════════════════════════════════════════════
-- 3. user_blocks table
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocks_select" ON user_blocks FOR SELECT USING (auth.uid() = blocker_id);
CREATE POLICY "blocks_insert" ON user_blocks FOR INSERT WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "blocks_delete" ON user_blocks FOR DELETE USING (auth.uid() = blocker_id);

-- ══════════════════════════════════════════════════════════════
-- 4. user_notes table (private comments about other users)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.user_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(author_id, target_user_id),
  CHECK (author_id != target_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_notes_author ON user_notes(author_id);

ALTER TABLE user_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes_select" ON user_notes FOR SELECT USING (auth.uid() = author_id);
CREATE POLICY "notes_insert" ON user_notes FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "notes_update" ON user_notes FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "notes_delete" ON user_notes FOR DELETE USING (auth.uid() = author_id);

-- ══════════════════════════════════════════════════════════════
-- 5. direct_messages table
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 2000),
  read_at TIMESTAMPTZ,
  archived_by_sender BOOLEAN DEFAULT false,
  archived_by_recipient BOOLEAN DEFAULT false,
  deleted_by_sender BOOLEAN DEFAULT false,
  deleted_by_recipient BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (sender_id != recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_sender ON direct_messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_recipient ON direct_messages(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_unread ON direct_messages(recipient_id) WHERE read_at IS NULL AND deleted_by_recipient = false;

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dm_select" ON direct_messages FOR SELECT USING (
  (auth.uid() = sender_id AND deleted_by_sender = false)
  OR
  (auth.uid() = recipient_id AND deleted_by_recipient = false)
);
CREATE POLICY "dm_insert" ON direct_messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "dm_update" ON direct_messages FOR UPDATE USING (
  auth.uid() = sender_id OR auth.uid() = recipient_id
);

-- ══════════════════════════════════════════════════════════════
-- 6. toggle_follow RPC
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION toggle_follow(p_target_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_exists BOOLEAN;
  v_blocked BOOLEAN;
BEGIN
  -- Cannot follow yourself
  IF v_user_id = p_target_user_id THEN
    RAISE EXCEPTION 'Cannot follow yourself';
  END IF;

  -- Check if blocked in either direction
  SELECT EXISTS(
    SELECT 1 FROM user_blocks
    WHERE (blocker_id = v_user_id AND blocked_id = p_target_user_id)
       OR (blocker_id = p_target_user_id AND blocked_id = v_user_id)
  ) INTO v_blocked;

  IF v_blocked THEN
    RAISE EXCEPTION 'Cannot follow blocked user';
  END IF;

  -- Check if already following
  SELECT EXISTS(
    SELECT 1 FROM user_follows
    WHERE follower_id = v_user_id AND following_id = p_target_user_id
  ) INTO v_exists;

  IF v_exists THEN
    -- Unfollow
    DELETE FROM user_follows
    WHERE follower_id = v_user_id AND following_id = p_target_user_id;

    UPDATE profiles SET following_count = GREATEST(0, following_count - 1) WHERE id = v_user_id;
    UPDATE profiles SET follower_count = GREATEST(0, follower_count - 1) WHERE id = p_target_user_id;
    RETURN FALSE;
  ELSE
    -- Follow
    INSERT INTO user_follows (follower_id, following_id) VALUES (v_user_id, p_target_user_id);

    UPDATE profiles SET following_count = following_count + 1 WHERE id = v_user_id;
    UPDATE profiles SET follower_count = follower_count + 1 WHERE id = p_target_user_id;
    RETURN TRUE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════
-- 7. toggle_block RPC
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION toggle_block(p_target_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_exists BOOLEAN;
  v_was_following BOOLEAN;
  v_was_followed_by BOOLEAN;
BEGIN
  -- Cannot block yourself
  IF v_user_id = p_target_user_id THEN
    RAISE EXCEPTION 'Cannot block yourself';
  END IF;

  -- Check if already blocked
  SELECT EXISTS(
    SELECT 1 FROM user_blocks
    WHERE blocker_id = v_user_id AND blocked_id = p_target_user_id
  ) INTO v_exists;

  IF v_exists THEN
    -- Unblock
    DELETE FROM user_blocks
    WHERE blocker_id = v_user_id AND blocked_id = p_target_user_id;
    RETURN FALSE;
  ELSE
    -- Block: insert block
    INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (v_user_id, p_target_user_id);

    -- Auto-unfollow: I was following them
    SELECT EXISTS(
      SELECT 1 FROM user_follows WHERE follower_id = v_user_id AND following_id = p_target_user_id
    ) INTO v_was_following;

    IF v_was_following THEN
      DELETE FROM user_follows WHERE follower_id = v_user_id AND following_id = p_target_user_id;
      UPDATE profiles SET following_count = GREATEST(0, following_count - 1) WHERE id = v_user_id;
      UPDATE profiles SET follower_count = GREATEST(0, follower_count - 1) WHERE id = p_target_user_id;
    END IF;

    -- Auto-unfollow: they were following me
    SELECT EXISTS(
      SELECT 1 FROM user_follows WHERE follower_id = p_target_user_id AND following_id = v_user_id
    ) INTO v_was_followed_by;

    IF v_was_followed_by THEN
      DELETE FROM user_follows WHERE follower_id = p_target_user_id AND following_id = v_user_id;
      UPDATE profiles SET following_count = GREATEST(0, following_count - 1) WHERE id = p_target_user_id;
      UPDATE profiles SET follower_count = GREATEST(0, follower_count - 1) WHERE id = v_user_id;
    END IF;

    RETURN TRUE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════
-- 8. send_message RPC
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION send_message(p_recipient_id UUID, p_content TEXT)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_blocked BOOLEAN;
  v_message_id UUID;
BEGIN
  -- Cannot message yourself
  IF v_user_id = p_recipient_id THEN
    RAISE EXCEPTION 'Cannot message yourself';
  END IF;

  -- Check if blocked in either direction
  SELECT EXISTS(
    SELECT 1 FROM user_blocks
    WHERE (blocker_id = v_user_id AND blocked_id = p_recipient_id)
       OR (blocker_id = p_recipient_id AND blocked_id = v_user_id)
  ) INTO v_blocked;

  IF v_blocked THEN
    RAISE EXCEPTION 'Cannot send message to blocked user';
  END IF;

  -- Validate content
  IF p_content IS NULL OR char_length(trim(p_content)) = 0 THEN
    RAISE EXCEPTION 'Message content cannot be empty';
  END IF;

  -- Insert message
  INSERT INTO direct_messages (sender_id, recipient_id, content)
  VALUES (v_user_id, p_recipient_id, trim(p_content))
  RETURNING id INTO v_message_id;

  RETURN v_message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════
-- 9. mark_messages_read RPC
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION mark_messages_read(p_sender_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE direct_messages
  SET read_at = now()
  WHERE sender_id = p_sender_id
    AND recipient_id = auth.uid()
    AND read_at IS NULL
    AND deleted_by_recipient = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════
-- 10. Update delete_my_account to clean up social data
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_captain_count INT;
BEGIN
  -- Prevent captain from deleting account
  SELECT COUNT(*) INTO v_captain_count
  FROM crews WHERE captain_id = v_user_id AND is_active = true;

  IF v_captain_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete account while captain of active crews. Transfer captainship first.';
  END IF;

  -- Clean up social data (new)
  -- Adjust follower/following counts before deleting follows
  UPDATE profiles SET follower_count = GREATEST(0, follower_count - 1)
  WHERE id IN (SELECT following_id FROM user_follows WHERE follower_id = v_user_id);

  UPDATE profiles SET following_count = GREATEST(0, following_count - 1)
  WHERE id IN (SELECT follower_id FROM user_follows WHERE following_id = v_user_id);

  DELETE FROM direct_messages WHERE sender_id = v_user_id OR recipient_id = v_user_id;
  DELETE FROM user_notes WHERE author_id = v_user_id OR target_user_id = v_user_id;
  DELETE FROM user_blocks WHERE blocker_id = v_user_id OR blocked_id = v_user_id;
  DELETE FROM user_follows WHERE follower_id = v_user_id OR following_id = v_user_id;

  -- Clean up existing data (unchanged)
  DELETE FROM general_posts WHERE user_id = v_user_id;
  DELETE FROM thread_phrase_notes WHERE user_id = v_user_id;
  DELETE FROM crew_join_requests WHERE user_id = v_user_id;
  DELETE FROM crew_members WHERE user_id = v_user_id;
  DELETE FROM profiles WHERE id = v_user_id;
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
