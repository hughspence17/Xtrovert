-- ============================================================================
-- XTROVERT — Supabase schema (BASE: ranks + profiles)
-- Paste into: Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- This file only covers the two foundational tables. Every production
-- feature table (challenges, journal_entries, community_posts, messaging,
-- streaks, daily quotes, etc.) plus ALL server-side functions and their
-- Row Level Security policies live in supabase/integration.sql — that file
-- is the single source of truth for the live database and is safe to
-- re-run at any time (every statement is idempotent).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) RANKS — progression milestones (public read-only)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ranks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL UNIQUE,
  xp_required   integer NOT NULL CHECK (xp_required >= 0),
  emblem_url    text,
  created_at    timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS ranks_xp_required_idx ON public.ranks (xp_required);

INSERT INTO public.ranks (title, xp_required, emblem_url)
VALUES
  ('Starter',  0,    NULL),
  ('Bronze',   100,  NULL),
  ('Silver',   500,  NULL),
  ('Gold',     1500, NULL),
  ('Platinum', 4000, NULL)
ON CONFLICT (title) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2) PROFILES — 1:1 with auth.users
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id                            uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username                      text NOT NULL,
  bio                           text NOT NULL DEFAULT '',
  rank_title                    text NOT NULL DEFAULT 'Starter' REFERENCES public.ranks (title),
  social_score                  integer NOT NULL DEFAULT 0 CHECK (social_score >= 0),
  streak_count                  integer NOT NULL DEFAULT 0 CHECK (streak_count >= 0),
  last_login_date               timestamptz,
  last_streak_date              date,
  last_username_change_at       timestamptz,
  last_bio_change_at            timestamptz,
  last_challenge_completed_at   timestamptz,
  created_at                    timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at                    timestamptz NOT NULL DEFAULT timezone('utc', now())
  -- NOTE: usernames are intentionally NOT unique — duplicates are allowed by
  -- design (public.profiles.id / auth.uid() is the only real identity).
);

CREATE INDEX IF NOT EXISTS profiles_social_score_idx ON public.profiles (social_score DESC);
CREATE INDEX IF NOT EXISTS profiles_rank_title_idx ON public.profiles (rank_title);

-- Auto-create a profile whenever a new auth user is created (including anonymous).
-- Username is NEVER taken from auth metadata after signup — only used as a
-- one-time seed value, since the durable, editable username lives solely in
-- public.profiles and is only ever changed via update_username().
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, bio, rank_title, social_score, streak_count)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'username', ''),
      'Operator' || upper(substr(replace(NEW.id::text, '-', ''), 1, 8))
    ),
    '',
    'Starter',
    0,
    0
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Keep updated_at fresh on profile changes.
CREATE OR REPLACE FUNCTION public.set_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_profiles_updated_at();

-- ============================================================================
-- CRITICAL SECURITY — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.ranks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ---- ranks: public read-only -----------------------------------------------
DROP POLICY IF EXISTS "Ranks are publicly readable" ON public.ranks;
CREATE POLICY "Ranks are publicly readable"
  ON public.ranks
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- No INSERT / UPDATE / DELETE policies for ranks -> clients cannot mutate them.

-- ---- profiles: row-visibility rule + column-level lockdown -----------------
-- Row visibility: your own row, OR anyone who has posted/replied in the
-- community, OR anyone who shares a conversation with you. This is what lets
-- the community/messages tabs show a username + rank without exposing every
-- silent/inactive user's identity to the world.
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are publicly readable" ON public.profiles;
CREATE POLICY "Profiles are publicly readable"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM public.community_posts cp WHERE cp.user_id = profiles.id)
    OR EXISTS (SELECT 1 FROM public.post_replies pr WHERE pr.user_id = profiles.id)
    OR EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.user_id = profiles.id
        AND public.is_conversation_member(cm.conversation_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Column-level lockdown: even though the row policy above lets other people's
-- rows be SELECTed under certain conditions, only these 4 columns are ever
-- exposed. social_score, streak_count, and every last_*_at/date column are
-- withheld from EVERY role, including the row's own owner via a raw client
-- query — the only way to read your OWN full record (score/streak/cooldowns)
-- is get_my_profile(), defined in integration.sql.
REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, username, rank_title, bio) ON public.profiles TO authenticated;
-- No direct INSERT/UPDATE/DELETE grants at all -> every write to profiles
-- MUST go through a SECURITY DEFINER function (handle_new_user trigger,
-- update_username, update_bio, complete_challenge, register_daily_login).

-- ============================================================================
-- Done. The rest of the production schema (challenges, journaling, community,
-- messaging, streak tracking, daily quotes) is in supabase/integration.sql —
-- run that file next.
-- ============================================================================
