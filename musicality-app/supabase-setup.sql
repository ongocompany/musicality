-- ============================================================
-- Musicality Community Schema Setup
-- Run this in Supabase SQL Editor or via CLI
-- ============================================================

-- ─── 1. PROFILES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  dance_style TEXT DEFAULT 'bachata',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    'Dancer'
  ));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── 2. CREWS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  thumbnail_url TEXT,
  crew_type TEXT NOT NULL CHECK (crew_type IN ('open', 'closed')) DEFAULT 'open',
  captain_id UUID NOT NULL REFERENCES auth.users(id),
  member_limit INT NOT NULL DEFAULT 50 CHECK (member_limit BETWEEN 2 AND 200),
  member_count INT NOT NULL DEFAULT 1,
  dance_style TEXT DEFAULT 'bachata',
  invite_code TEXT UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crews_captain ON crews(captain_id);
CREATE INDEX IF NOT EXISTS idx_crews_active ON crews(is_active) WHERE is_active = true;

-- ─── 3. CREW MEMBERS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crew_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id UUID NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('captain', 'member')) DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(crew_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_crew_members_crew ON crew_members(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_members_user ON crew_members(user_id);

-- ─── 4. CREW JOIN REQUESTS ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crew_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id UUID NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  message TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_join_requests_pending ON crew_join_requests(crew_id) WHERE status = 'pending';

-- ─── 5. SONG THREADS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.song_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id UUID NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  youtube_id TEXT,
  bpm REAL,
  dance_style TEXT DEFAULT 'bachata',
  post_count INT DEFAULT 0,
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_threads_crew ON song_threads(crew_id, last_activity_at DESC);

-- ─── 6. THREAD PHRASE NOTES ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.thread_phrase_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES song_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phrase_note_data JSONB NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_thread_notes ON thread_phrase_notes(thread_id, created_at DESC);

-- ─── 7. GENERAL POSTS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.general_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id UUID NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 2000),
  parent_id UUID REFERENCES general_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_posts_crew ON general_posts(crew_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_parent ON general_posts(parent_id) WHERE parent_id IS NOT NULL;

-- ─── 8. RLS POLICIES ────────────────────────────────────────

-- Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Crews
ALTER TABLE crews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crews_select" ON crews FOR SELECT USING (is_active = true);
CREATE POLICY "crews_insert" ON crews FOR INSERT WITH CHECK (auth.uid() = captain_id);
CREATE POLICY "crews_update" ON crews FOR UPDATE USING (auth.uid() = captain_id);

-- Crew Members
ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_select" ON crew_members FOR SELECT USING (true);
CREATE POLICY "members_insert" ON crew_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "members_delete" ON crew_members FOR DELETE
  USING (auth.uid() = user_id OR crew_id IN (SELECT id FROM crews WHERE captain_id = auth.uid()));

-- Join Requests
ALTER TABLE crew_join_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "requests_select_own" ON crew_join_requests FOR SELECT
  USING (auth.uid() = user_id OR crew_id IN (SELECT id FROM crews WHERE captain_id = auth.uid()));
CREATE POLICY "requests_insert" ON crew_join_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "requests_update" ON crew_join_requests FOR UPDATE
  USING (crew_id IN (SELECT id FROM crews WHERE captain_id = auth.uid()));

-- Song Threads
ALTER TABLE song_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "threads_select" ON song_threads FOR SELECT
  USING (crew_id IN (SELECT crew_id FROM crew_members WHERE user_id = auth.uid()));
CREATE POLICY "threads_insert" ON song_threads FOR INSERT
  WITH CHECK (crew_id IN (SELECT crew_id FROM crew_members WHERE user_id = auth.uid()));

-- Thread Phrase Notes
ALTER TABLE thread_phrase_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes_select" ON thread_phrase_notes FOR SELECT
  USING (thread_id IN (
    SELECT st.id FROM song_threads st
    JOIN crew_members cm ON cm.crew_id = st.crew_id
    WHERE cm.user_id = auth.uid()
  ));
CREATE POLICY "notes_insert" ON thread_phrase_notes FOR INSERT
  WITH CHECK (thread_id IN (
    SELECT st.id FROM song_threads st
    JOIN crew_members cm ON cm.crew_id = st.crew_id
    WHERE cm.user_id = auth.uid()
  ) AND auth.uid() = user_id);

-- General Posts
ALTER TABLE general_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts_select" ON general_posts FOR SELECT
  USING (crew_id IN (SELECT crew_id FROM crew_members WHERE user_id = auth.uid()));
CREATE POLICY "posts_insert" ON general_posts FOR INSERT
  WITH CHECK (crew_id IN (SELECT crew_id FROM crew_members WHERE user_id = auth.uid()) AND auth.uid() = user_id);
CREATE POLICY "posts_delete" ON general_posts FOR DELETE
  USING (auth.uid() = user_id);

-- ─── 9. DB FUNCTIONS (atomic operations) ─────────────────────

-- Join open crew (atomic)
CREATE OR REPLACE FUNCTION public.join_crew(p_crew_id UUID)
RETURNS void AS $$
DECLARE v_crew RECORD;
BEGIN
  SELECT * INTO v_crew FROM crews WHERE id = p_crew_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Crew not found'; END IF;
  IF v_crew.crew_type = 'closed' THEN RAISE EXCEPTION 'Crew requires approval'; END IF;
  IF v_crew.member_count >= v_crew.member_limit THEN RAISE EXCEPTION 'Crew is full'; END IF;
  IF EXISTS (SELECT 1 FROM crew_members WHERE crew_id = p_crew_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Already a member';
  END IF;
  INSERT INTO crew_members (crew_id, user_id, role) VALUES (p_crew_id, auth.uid(), 'member');
  UPDATE crews SET member_count = member_count + 1, updated_at = now() WHERE id = p_crew_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Leave crew (atomic)
CREATE OR REPLACE FUNCTION public.leave_crew(p_crew_id UUID)
RETURNS void AS $$
BEGIN
  DELETE FROM crew_members WHERE crew_id = p_crew_id AND user_id = auth.uid() AND role != 'captain';
  IF FOUND THEN
    UPDATE crews SET member_count = GREATEST(member_count - 1, 0), updated_at = now() WHERE id = p_crew_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Approve join request (captain only, atomic)
CREATE OR REPLACE FUNCTION public.approve_join_request(p_request_id UUID)
RETURNS void AS $$
DECLARE v_req RECORD; v_crew RECORD;
BEGIN
  SELECT * INTO v_req FROM crew_join_requests WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  SELECT * INTO v_crew FROM crews WHERE id = v_req.crew_id AND captain_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_crew.member_count >= v_crew.member_limit THEN RAISE EXCEPTION 'Crew is full'; END IF;
  UPDATE crew_join_requests SET status = 'approved', resolved_at = now(), resolved_by = auth.uid() WHERE id = p_request_id;
  INSERT INTO crew_members (crew_id, user_id, role) VALUES (v_req.crew_id, v_req.user_id, 'member');
  UPDATE crews SET member_count = member_count + 1, updated_at = now() WHERE id = v_req.crew_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 10. STORAGE BUCKET ──────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('crew-thumbnails', 'crew-thumbnails', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: anyone can read, authenticated users can upload
CREATE POLICY "crew_thumbnails_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'crew-thumbnails');
CREATE POLICY "crew_thumbnails_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'crew-thumbnails' AND auth.uid() IS NOT NULL);
CREATE POLICY "crew_thumbnails_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'crew-thumbnails' AND auth.uid() IS NOT NULL);

-- ============================================================
-- DONE! All tables, policies, functions, and storage created.
-- ============================================================
