-- ─── Fix RLS Recursion (500 errors) ──────────────────────────
-- Run this in Supabase SQL Editor AFTER running migration-group-chat.sql
--
-- Problem: chat_room_members RLS self-references causing infinite recursion
-- when chat_room_messages or chat_rooms policies cross-reference it.
--
-- Fix: SECURITY DEFINER helper function bypasses RLS when checking membership.

-- STEP 1: Create helper function (bypasses RLS)
CREATE OR REPLACE FUNCTION is_room_member(p_room_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_room_members
    WHERE room_id = p_room_id
      AND user_id = auth.uid()
      AND removed_at IS NULL
  );
$$;

-- STEP 2: Drop old policies
DROP POLICY IF EXISTS "rooms_select" ON chat_rooms;
DROP POLICY IF EXISTS "room_members_select" ON chat_room_members;
DROP POLICY IF EXISTS "room_messages_select" ON chat_room_messages;

-- STEP 3: Recreate policies using helper function (no recursion)
CREATE POLICY "rooms_select" ON chat_rooms FOR SELECT USING (
  is_room_member(id)
);

CREATE POLICY "room_members_select" ON chat_room_members FOR SELECT USING (
  is_room_member(room_id)
);

CREATE POLICY "room_messages_select" ON chat_room_messages FOR SELECT USING (
  is_room_member(room_id)
);
