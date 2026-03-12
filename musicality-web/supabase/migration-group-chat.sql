-- ─── Group Chat System Migration ────────────────────────────
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Adds: chat_rooms, chat_room_members, chat_room_messages, chat_room_reads
-- Adds: 7 RPC functions for group chat operations
-- Updates: delete_my_account to clean up chat room data

-- ══════════════════════════════════════════════════════════════
-- STEP 1: Create all 4 tables first (no cross-references yet)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  type TEXT NOT NULL DEFAULT 'group' CHECK (type IN ('dm_converted', 'group')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  removed_at TIMESTAMPTZ,
  UNIQUE(room_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_room_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 2000),
  message_type TEXT NOT NULL DEFAULT 'message' CHECK (message_type IN ('message', 'system')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_room_reads (
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

-- ══════════════════════════════════════════════════════════════
-- STEP 2: Indexes
-- ══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_chat_rooms_created_by ON chat_rooms(created_by);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_active ON chat_rooms(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_crm_room ON chat_room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_crm_user ON chat_room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_active ON chat_room_members(user_id) WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_msg_room ON chat_room_messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_msg_sender ON chat_room_messages(sender_id);

-- ══════════════════════════════════════════════════════════════
-- STEP 3: Enable RLS + Policies (all tables exist now)
-- ══════════════════════════════════════════════════════════════

ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_room_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_room_reads ENABLE ROW LEVEL SECURITY;

-- chat_rooms: members can see rooms they belong to
CREATE POLICY "rooms_select" ON chat_rooms FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM chat_room_members
    WHERE chat_room_members.room_id = chat_rooms.id
      AND chat_room_members.user_id = auth.uid()
      AND chat_room_members.removed_at IS NULL
  )
);

-- chat_room_members: members can see other members in their rooms
CREATE POLICY "room_members_select" ON chat_room_members FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM chat_room_members AS self
    WHERE self.room_id = chat_room_members.room_id
      AND self.user_id = auth.uid()
      AND self.removed_at IS NULL
  )
);

-- chat_room_messages: members can see messages in their rooms
CREATE POLICY "room_messages_select" ON chat_room_messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM chat_room_members
    WHERE chat_room_members.room_id = chat_room_messages.room_id
      AND chat_room_members.user_id = auth.uid()
      AND chat_room_members.removed_at IS NULL
  )
);

-- chat_room_reads: users can only see/manage their own reads
CREATE POLICY "room_reads_select" ON chat_room_reads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "room_reads_upsert" ON chat_room_reads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "room_reads_update" ON chat_room_reads FOR UPDATE USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- STEP 4: RPC functions
-- ══════════════════════════════════════════════════════════════

-- 4a. create_chat_room
CREATE OR REPLACE FUNCTION create_chat_room(
  p_member_ids UUID[],
  p_name TEXT DEFAULT NULL,
  p_type TEXT DEFAULT 'group'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_room_id UUID;
  v_member_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF array_length(p_member_ids, 1) IS NULL OR array_length(p_member_ids, 1) < 1 THEN
    RAISE EXCEPTION 'At least one other member required';
  END IF;

  INSERT INTO chat_rooms (name, type, created_by)
  VALUES (p_name, p_type, v_uid)
  RETURNING id INTO v_room_id;

  INSERT INTO chat_room_members (room_id, user_id, role)
  VALUES (v_room_id, v_uid, 'owner');

  FOREACH v_member_id IN ARRAY p_member_ids
  LOOP
    IF v_member_id != v_uid THEN
      IF NOT EXISTS (
        SELECT 1 FROM user_blocks
        WHERE (blocker_id = v_uid AND blocked_id = v_member_id)
           OR (blocker_id = v_member_id AND blocked_id = v_uid)
      ) THEN
        INSERT INTO chat_room_members (room_id, user_id, role)
        VALUES (v_room_id, v_member_id, 'member')
        ON CONFLICT (room_id, user_id) DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO chat_room_messages (room_id, sender_id, content, message_type)
  VALUES (v_room_id, v_uid, '그룹 채팅방이 생성되었습니다.', 'system');

  INSERT INTO chat_room_reads (room_id, user_id, last_read_at)
  VALUES (v_room_id, v_uid, now());

  RETURN v_room_id;
END;
$$;

-- 4b. send_room_message
CREATE OR REPLACE FUNCTION send_room_message(
  p_room_id UUID,
  p_content TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_msg_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF trim(p_content) = '' THEN
    RAISE EXCEPTION 'Content cannot be empty';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM chat_rooms WHERE id = p_room_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Room not found or inactive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM chat_room_members
    WHERE room_id = p_room_id AND user_id = v_uid AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Not a member of this room';
  END IF;

  INSERT INTO chat_room_messages (room_id, sender_id, content, message_type)
  VALUES (p_room_id, v_uid, trim(p_content), 'message')
  RETURNING id INTO v_msg_id;

  UPDATE chat_rooms SET updated_at = now() WHERE id = p_room_id;

  INSERT INTO chat_room_reads (room_id, user_id, last_read_at)
  VALUES (p_room_id, v_uid, now())
  ON CONFLICT (room_id, user_id) DO UPDATE SET last_read_at = now();

  RETURN v_msg_id;
END;
$$;

-- 4c. invite_to_room
CREATE OR REPLACE FUNCTION invite_to_room(
  p_room_id UUID,
  p_user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_display_name TEXT;
  v_invitee_name TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM chat_rooms WHERE id = p_room_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Room not found or inactive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM chat_room_members
    WHERE room_id = p_room_id AND user_id = v_uid AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Not a member of this room';
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_blocks
    WHERE (blocker_id = v_uid AND blocked_id = p_user_id)
       OR (blocker_id = p_user_id AND blocked_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'Cannot invite this user';
  END IF;

  INSERT INTO chat_room_members (room_id, user_id, role)
  VALUES (p_room_id, p_user_id, 'member')
  ON CONFLICT (room_id, user_id) DO UPDATE SET removed_at = NULL, joined_at = now();

  SELECT display_name INTO v_display_name FROM profiles WHERE id = v_uid;
  SELECT display_name INTO v_invitee_name FROM profiles WHERE id = p_user_id;

  INSERT INTO chat_room_messages (room_id, sender_id, content, message_type)
  VALUES (p_room_id, v_uid,
    COALESCE(v_display_name, '사용자') || '님이 ' || COALESCE(v_invitee_name, '사용자') || '님을 초대했습니다.',
    'system');

  UPDATE chat_rooms SET updated_at = now() WHERE id = p_room_id;
END;
$$;

-- 4d. kick_from_room (owner only)
CREATE OR REPLACE FUNCTION kick_from_room(
  p_room_id UUID,
  p_user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_display_name TEXT;
  v_kicked_name TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM chat_room_members
    WHERE room_id = p_room_id AND user_id = v_uid AND role = 'owner' AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Only the room owner can kick members';
  END IF;

  IF v_uid = p_user_id THEN
    RAISE EXCEPTION 'Cannot kick yourself';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM chat_room_members
    WHERE room_id = p_room_id AND user_id = p_user_id AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'User is not a member of this room';
  END IF;

  UPDATE chat_room_members
  SET removed_at = now()
  WHERE room_id = p_room_id AND user_id = p_user_id;

  SELECT display_name INTO v_display_name FROM profiles WHERE id = v_uid;
  SELECT display_name INTO v_kicked_name FROM profiles WHERE id = p_user_id;

  INSERT INTO chat_room_messages (room_id, sender_id, content, message_type)
  VALUES (p_room_id, v_uid,
    COALESCE(v_kicked_name, '사용자') || '님이 방에서 내보내졌습니다.',
    'system');

  UPDATE chat_rooms SET updated_at = now() WHERE id = p_room_id;
END;
$$;

-- 4e. leave_room
CREATE OR REPLACE FUNCTION leave_room(
  p_room_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_display_name TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM chat_room_members
    WHERE room_id = p_room_id AND user_id = v_uid AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Not a member of this room';
  END IF;

  UPDATE chat_room_members
  SET removed_at = now()
  WHERE room_id = p_room_id AND user_id = v_uid;

  SELECT display_name INTO v_display_name FROM profiles WHERE id = v_uid;

  INSERT INTO chat_room_messages (room_id, sender_id, content, message_type)
  VALUES (p_room_id, v_uid,
    COALESCE(v_display_name, '사용자') || '님이 채팅방을 나갔습니다.',
    'system');

  UPDATE chat_rooms SET updated_at = now() WHERE id = p_room_id;
END;
$$;

-- 4f. close_room (owner: deactivate, non-owner: leave)
CREATE OR REPLACE FUNCTION close_room(
  p_room_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role
  FROM chat_room_members
  WHERE room_id = p_room_id AND user_id = v_uid AND removed_at IS NULL;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Not a member of this room';
  END IF;

  IF v_role = 'owner' THEN
    UPDATE chat_rooms SET is_active = false, updated_at = now() WHERE id = p_room_id;

    INSERT INTO chat_room_messages (room_id, sender_id, content, message_type)
    VALUES (p_room_id, v_uid, '채팅방이 종료되었습니다.', 'system');
  ELSE
    PERFORM leave_room(p_room_id);
  END IF;
END;
$$;

-- 4g. mark_room_messages_read
CREATE OR REPLACE FUNCTION mark_room_messages_read(
  p_room_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO chat_room_reads (room_id, user_id, last_read_at)
  VALUES (p_room_id, v_uid, now())
  ON CONFLICT (room_id, user_id) DO UPDATE SET last_read_at = now();
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- STEP 5: Update delete_my_account to include chat room cleanup
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_crew_names text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT string_agg(c.name, ', ')
  INTO v_crew_names
  FROM crew_members cm
  JOIN crews c ON c.id = cm.crew_id
  WHERE cm.user_id = v_uid AND cm.role = 'captain';

  IF v_crew_names IS NOT NULL THEN
    RAISE EXCEPTION 'You are captain of: %. Transfer captainship or delete the crew(s) before deleting your account.', v_crew_names;
  END IF;

  UPDATE chat_rooms SET is_active = false WHERE created_by = v_uid;
  DELETE FROM chat_room_members WHERE user_id = v_uid;
  DELETE FROM chat_room_reads WHERE user_id = v_uid;
  DELETE FROM direct_messages WHERE sender_id = v_uid OR recipient_id = v_uid;
  DELETE FROM user_notes WHERE author_id = v_uid OR target_user_id = v_uid;
  DELETE FROM user_blocks WHERE blocker_id = v_uid OR blocked_id = v_uid;

  UPDATE profiles SET follower_count = GREATEST(0, follower_count - 1)
  WHERE id IN (SELECT following_id FROM user_follows WHERE follower_id = v_uid);

  UPDATE profiles SET following_count = GREATEST(0, following_count - 1)
  WHERE id IN (SELECT follower_id FROM user_follows WHERE following_id = v_uid);

  DELETE FROM user_follows WHERE follower_id = v_uid OR following_id = v_uid;
  DELETE FROM general_posts WHERE user_id = v_uid;
  DELETE FROM thread_phrase_notes WHERE user_id = v_uid;
  DELETE FROM crew_join_requests WHERE user_id = v_uid;
  DELETE FROM crew_members WHERE user_id = v_uid;
  DELETE FROM profiles WHERE id = v_uid;
  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;
