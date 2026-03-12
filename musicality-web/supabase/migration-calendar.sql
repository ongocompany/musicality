-- ─── Calendar Events Migration ──────────────────────────────
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Adds: events, user_saved_events
-- Adds: 4 RPC functions for crew event management

-- ══════════════════════════════════════════════════════════════
-- STEP 1: Tables
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME DEFAULT NULL,
  location TEXT DEFAULT '',
  description TEXT DEFAULT '',
  crew_id UUID REFERENCES crews(id) ON DELETE CASCADE DEFAULT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_saved_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, event_id)
);

-- ══════════════════════════════════════════════════════════════
-- STEP 2: Indexes
-- ══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_events_crew ON events(crew_id);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_saved_events_user ON user_saved_events(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_events_event ON user_saved_events(event_id);

-- ══════════════════════════════════════════════════════════════
-- STEP 3: RLS
-- ══════════════════════════════════════════════════════════════

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_saved_events ENABLE ROW LEVEL SECURITY;

-- events: personal → creator only, crew → crew members
CREATE POLICY "events_select" ON events FOR SELECT USING (
  (crew_id IS NULL AND created_by = auth.uid())
  OR
  (crew_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM crew_members WHERE crew_id = events.crew_id AND user_id = auth.uid()
  ))
);

CREATE POLICY "events_insert" ON events FOR INSERT
  WITH CHECK (auth.uid() = created_by AND crew_id IS NULL);

CREATE POLICY "events_update" ON events FOR UPDATE
  USING (auth.uid() = created_by AND crew_id IS NULL);

CREATE POLICY "events_delete" ON events FOR DELETE
  USING (auth.uid() = created_by AND crew_id IS NULL);

-- user_saved_events: own records only
CREATE POLICY "saved_events_select" ON user_saved_events FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "saved_events_insert" ON user_saved_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saved_events_delete" ON user_saved_events FOR DELETE
  USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- STEP 4: RPC functions
-- ══════════════════════════════════════════════════════════════

-- 4a. create_crew_event (captain/moderator only)
CREATE OR REPLACE FUNCTION create_crew_event(
  p_crew_id UUID,
  p_title TEXT,
  p_event_date DATE,
  p_event_time TIME DEFAULT NULL,
  p_location TEXT DEFAULT '',
  p_description TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
  v_event_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT role INTO v_role FROM crew_members
    WHERE crew_id = p_crew_id AND user_id = v_uid;

  IF v_role IS NULL THEN RAISE EXCEPTION 'Not a member of this crew'; END IF;
  IF v_role NOT IN ('captain', 'moderator') THEN
    RAISE EXCEPTION 'Only captain or moderator can create crew events';
  END IF;

  INSERT INTO events (title, event_date, event_time, location, description, crew_id, created_by)
  VALUES (p_title, p_event_date, p_event_time, p_location, p_description, p_crew_id, v_uid)
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- 4b. update_crew_event (captain/moderator only)
CREATE OR REPLACE FUNCTION update_crew_event(
  p_event_id UUID,
  p_title TEXT DEFAULT NULL,
  p_event_date DATE DEFAULT NULL,
  p_event_time TIME DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_crew_id UUID;
  v_role TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT crew_id INTO v_crew_id FROM events WHERE id = p_event_id;
  IF v_crew_id IS NULL THEN RAISE EXCEPTION 'Event not found or not a crew event'; END IF;

  SELECT role INTO v_role FROM crew_members
    WHERE crew_id = v_crew_id AND user_id = v_uid;

  IF v_role IS NULL OR v_role NOT IN ('captain', 'moderator') THEN
    RAISE EXCEPTION 'Only captain or moderator can update crew events';
  END IF;

  UPDATE events SET
    title = COALESCE(p_title, title),
    event_date = COALESCE(p_event_date, event_date),
    event_time = COALESCE(p_event_time, event_time),
    location = COALESCE(p_location, location),
    description = COALESCE(p_description, description),
    updated_at = now()
  WHERE id = p_event_id;
END;
$$;

-- 4c. delete_crew_event (captain/moderator only)
CREATE OR REPLACE FUNCTION delete_crew_event(p_event_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_crew_id UUID;
  v_role TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT crew_id INTO v_crew_id FROM events WHERE id = p_event_id;
  IF v_crew_id IS NULL THEN RAISE EXCEPTION 'Event not found or not a crew event'; END IF;

  SELECT role INTO v_role FROM crew_members
    WHERE crew_id = v_crew_id AND user_id = v_uid;

  IF v_role IS NULL OR v_role NOT IN ('captain', 'moderator') THEN
    RAISE EXCEPTION 'Only captain or moderator can delete crew events';
  END IF;

  DELETE FROM events WHERE id = p_event_id;
END;
$$;

-- 4d. toggle_save_event (crew member)
CREATE OR REPLACE FUNCTION toggle_save_event(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_crew_id UUID;
  v_exists BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT crew_id INTO v_crew_id FROM events WHERE id = p_event_id;
  IF v_crew_id IS NULL THEN RAISE EXCEPTION 'Event not found or not a crew event'; END IF;

  IF NOT EXISTS (SELECT 1 FROM crew_members WHERE crew_id = v_crew_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Not a member of this crew';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM user_saved_events WHERE event_id = p_event_id AND user_id = v_uid
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM user_saved_events WHERE event_id = p_event_id AND user_id = v_uid;
    RETURN FALSE;
  ELSE
    INSERT INTO user_saved_events (user_id, event_id) VALUES (v_uid, p_event_id);
    RETURN TRUE;
  END IF;
END;
$$;
