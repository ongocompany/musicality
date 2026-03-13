-- ============================================================
-- Account Deletion RPC
-- Run this in Supabase SQL Editor
-- ============================================================

-- Delete the current user's account entirely.
-- Checks that the user is NOT a captain of any crew first.
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

  -- Check if captain of any crew
  SELECT string_agg(c.name, ', ')
  INTO v_crew_names
  FROM crew_members cm
  JOIN crews c ON c.id = cm.crew_id
  WHERE cm.user_id = v_uid AND cm.role = 'captain';

  IF v_crew_names IS NOT NULL THEN
    RAISE EXCEPTION 'You are captain of: %. Transfer captainship or delete the crew(s) before deleting your account.', v_crew_names;
  END IF;

  -- Delete general posts (replies first via cascade or manual)
  DELETE FROM general_posts WHERE user_id = v_uid;

  -- Delete thread phrase notes
  DELETE FROM thread_phrase_notes WHERE user_id = v_uid;

  -- Delete join requests
  DELETE FROM crew_join_requests WHERE user_id = v_uid;

  -- Delete crew memberships
  DELETE FROM crew_members WHERE user_id = v_uid;

  -- Delete profile
  DELETE FROM profiles WHERE id = v_uid;

  -- Delete auth user (SECURITY DEFINER allows this)
  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;
