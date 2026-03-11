-- ============================================================
-- Migration: Member Hierarchy + Profile Nickname/Phone
-- Run this in Supabase SQL Editor (Run, not Explain)
-- ============================================================

-- ─── 1. Expand crew_members.role ────────────────────────
-- Old: 'captain' | 'member'
-- New: 'captain' | 'moderator' | 'regular' | 'member' | 'seedling'

-- Drop old constraint if exists
ALTER TABLE crew_members DROP CONSTRAINT IF EXISTS crew_members_role_check;

-- Add new constraint
ALTER TABLE crew_members ADD CONSTRAINT crew_members_role_check
  CHECK (role IN ('captain', 'moderator', 'regular', 'member', 'seedling'));

-- Migrate existing 'member' rows to 'seedling' (new joiners start as seedling)
UPDATE crew_members SET role = 'seedling' WHERE role = 'member';

-- ─── 2. Profile: nickname, phone, last_active_at ────────

-- Unique nickname (global identity across all crews)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nickname_changed_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT now();

-- Unique constraint on nickname (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_nickname_unique
  ON profiles (lower(nickname));

-- ─── 3. Function: Change member role ────────────────────
-- Captain can set 0~3 (seedling/member/regular/moderator)
-- Moderator can set 0~2 (seedling/member/regular)

CREATE OR REPLACE FUNCTION change_member_role(
  p_crew_id UUID,
  p_target_user_id UUID,
  p_new_role TEXT
) RETURNS VOID AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_target_role TEXT;
  v_role_level INT;
  v_caller_level INT;
  v_target_level INT;
  v_new_level INT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get caller's role
  SELECT role INTO v_caller_role FROM crew_members
    WHERE crew_id = p_crew_id AND user_id = v_caller_id;
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this crew';
  END IF;

  -- Get target's current role
  SELECT role INTO v_target_role FROM crew_members
    WHERE crew_id = p_crew_id AND user_id = p_target_user_id;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Target user is not a member of this crew';
  END IF;

  -- Role levels: seedling=0, member=1, regular=2, moderator=3, captain=4
  v_caller_level := CASE v_caller_role
    WHEN 'seedling' THEN 0 WHEN 'member' THEN 1 WHEN 'regular' THEN 2
    WHEN 'moderator' THEN 3 WHEN 'captain' THEN 4 END;
  v_target_level := CASE v_target_role
    WHEN 'seedling' THEN 0 WHEN 'member' THEN 1 WHEN 'regular' THEN 2
    WHEN 'moderator' THEN 3 WHEN 'captain' THEN 4 END;
  v_new_level := CASE p_new_role
    WHEN 'seedling' THEN 0 WHEN 'member' THEN 1 WHEN 'regular' THEN 2
    WHEN 'moderator' THEN 3 WHEN 'captain' THEN 4 ELSE -1 END;

  IF v_new_level = -1 THEN
    RAISE EXCEPTION 'Invalid role: %', p_new_role;
  END IF;

  -- Cannot change own role
  IF v_caller_id = p_target_user_id THEN
    RAISE EXCEPTION 'Cannot change your own role';
  END IF;

  -- Cannot change captain role via this function
  IF v_target_role = 'captain' THEN
    RAISE EXCEPTION 'Cannot change captain role. Use transfer_captainship instead';
  END IF;
  IF p_new_role = 'captain' THEN
    RAISE EXCEPTION 'Cannot promote to captain. Use transfer_captainship instead';
  END IF;

  -- Captain can set roles 0~3
  IF v_caller_role = 'captain' THEN
    IF v_new_level > 3 THEN
      RAISE EXCEPTION 'Invalid target role';
    END IF;
  -- Moderator can set roles 0~2 (only for members below them)
  ELSIF v_caller_role = 'moderator' THEN
    IF v_target_level >= 3 THEN
      RAISE EXCEPTION 'Cannot change role of moderator or above';
    END IF;
    IF v_new_level > 2 THEN
      RAISE EXCEPTION 'Moderators can only set roles up to regular';
    END IF;
  ELSE
    RAISE EXCEPTION 'You do not have permission to change roles';
  END IF;

  UPDATE crew_members SET role = p_new_role
    WHERE crew_id = p_crew_id AND user_id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 4. Function: Transfer captainship ──────────────────

CREATE OR REPLACE FUNCTION transfer_captainship(
  p_crew_id UUID,
  p_new_captain_id UUID
) RETURNS VOID AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_target_role TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Caller must be captain
  SELECT role INTO v_caller_role FROM crew_members
    WHERE crew_id = p_crew_id AND user_id = v_caller_id;
  IF v_caller_role != 'captain' THEN
    RAISE EXCEPTION 'Only the captain can transfer captainship';
  END IF;

  -- Target must be a crew member
  SELECT role INTO v_target_role FROM crew_members
    WHERE crew_id = p_crew_id AND user_id = p_new_captain_id;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Target user is not a member of this crew';
  END IF;

  -- Demote old captain to moderator
  UPDATE crew_members SET role = 'moderator'
    WHERE crew_id = p_crew_id AND user_id = v_caller_id;

  -- Promote new captain
  UPDATE crew_members SET role = 'captain'
    WHERE crew_id = p_crew_id AND user_id = p_new_captain_id;

  -- Update crews table
  UPDATE crews SET captain_id = p_new_captain_id, updated_at = now()
    WHERE id = p_crew_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 5. Update leave_crew: prevent captain leaving ──────

CREATE OR REPLACE FUNCTION leave_crew(p_crew_id UUID)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM crew_members
    WHERE crew_id = p_crew_id AND user_id = v_user_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Not a member of this crew';
  END IF;

  -- Captain cannot leave without transferring
  IF v_role = 'captain' THEN
    RAISE EXCEPTION 'Captain must transfer captainship before leaving. Use transfer_captainship first.';
  END IF;

  DELETE FROM crew_members
    WHERE crew_id = p_crew_id AND user_id = v_user_id;

  UPDATE crews SET member_count = member_count - 1, updated_at = now()
    WHERE id = p_crew_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 6. Update join_crew: new members start as seedling ─

CREATE OR REPLACE FUNCTION join_crew(p_crew_id UUID)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
  v_crew_type TEXT;
  v_member_count INT;
  v_member_limit INT;
  v_existing INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT crew_type, member_count, member_limit
    INTO v_crew_type, v_member_count, v_member_limit
    FROM crews WHERE id = p_crew_id AND is_active = true;

  IF v_crew_type IS NULL THEN
    RAISE EXCEPTION 'Crew not found or inactive';
  END IF;

  IF v_crew_type != 'open' THEN
    RAISE EXCEPTION 'This crew requires a join request';
  END IF;

  IF v_member_count >= v_member_limit THEN
    RAISE EXCEPTION 'Crew is full';
  END IF;

  SELECT COUNT(*) INTO v_existing FROM crew_members
    WHERE crew_id = p_crew_id AND user_id = v_user_id;
  IF v_existing > 0 THEN
    RAISE EXCEPTION 'Already a member';
  END IF;

  INSERT INTO crew_members (crew_id, user_id, role) VALUES (p_crew_id, v_user_id, 'seedling');
  UPDATE crews SET member_count = member_count + 1, updated_at = now() WHERE id = p_crew_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 7. Function: Kick member (with role check) ─────────

CREATE OR REPLACE FUNCTION kick_member(
  p_crew_id UUID,
  p_target_user_id UUID
) RETURNS VOID AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_target_role TEXT;
  v_caller_level INT;
  v_target_level INT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_caller_role FROM crew_members
    WHERE crew_id = p_crew_id AND user_id = v_caller_id;
  SELECT role INTO v_target_role FROM crew_members
    WHERE crew_id = p_crew_id AND user_id = p_target_user_id;

  IF v_caller_role IS NULL OR v_target_role IS NULL THEN
    RAISE EXCEPTION 'User not found in crew';
  END IF;

  v_caller_level := CASE v_caller_role
    WHEN 'seedling' THEN 0 WHEN 'member' THEN 1 WHEN 'regular' THEN 2
    WHEN 'moderator' THEN 3 WHEN 'captain' THEN 4 END;
  v_target_level := CASE v_target_role
    WHEN 'seedling' THEN 0 WHEN 'member' THEN 1 WHEN 'regular' THEN 2
    WHEN 'moderator' THEN 3 WHEN 'captain' THEN 4 END;

  -- Can only kick lower-ranked members
  IF v_caller_level <= v_target_level THEN
    RAISE EXCEPTION 'Cannot kick member of equal or higher rank';
  END IF;

  -- Moderators can kick 0~2 only
  IF v_caller_role = 'moderator' AND v_target_level >= 3 THEN
    RAISE EXCEPTION 'Moderators cannot kick other moderators';
  END IF;

  DELETE FROM crew_members
    WHERE crew_id = p_crew_id AND user_id = p_target_user_id;

  UPDATE crews SET member_count = member_count - 1, updated_at = now()
    WHERE id = p_crew_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 8. Update last_active_at on profile ────────────────
-- Called by app/web periodically or on key actions

CREATE OR REPLACE FUNCTION touch_last_active()
RETURNS VOID AS $$
BEGIN
  UPDATE profiles SET last_active_at = now()
    WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Done ───────────────────────────────────────────────
-- Summary:
--   Roles: seedling(0) → member(1) → regular(2) → moderator(3) → captain(4)
--   New profile fields: nickname (unique), phone, last_active_at
--   New functions: change_member_role, transfer_captainship, kick_member, touch_last_active
--   Updated: join_crew (seedling default), leave_crew (captain block)
