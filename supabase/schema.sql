-- ============================================================================
-- XTROVERT — Supabase schema
-- Paste this entire script into: Supabase Dashboard → SQL Editor → New query → Run
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
  id               uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username         text NOT NULL,
  bio              text NOT NULL DEFAULT '',
  rank_title       text NOT NULL DEFAULT 'Starter' REFERENCES public.ranks (title),
  social_score     integer NOT NULL DEFAULT 0 CHECK (social_score >= 0),
  streak_count     integer NOT NULL DEFAULT 0 CHECK (streak_count >= 0),
  last_login_date  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at       timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT profiles_username_unique UNIQUE (username)
);

CREATE INDEX IF NOT EXISTS profiles_social_score_idx ON public.profiles (social_score DESC);
CREATE INDEX IF NOT EXISTS profiles_rank_title_idx ON public.profiles (rank_title);

-- Auto-create a profile whenever a new auth user is created (including anonymous).
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
      'operator_' || substr(replace(NEW.id::text, '-', ''), 1, 8)
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

-- ----------------------------------------------------------------------------
-- 3) COMPLETED CHALLENGES — per-user challenge completion history
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.completed_challenges (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  challenge_id     text NOT NULL,
  challenge_title  text,
  xp_earned        integer NOT NULL DEFAULT 0 CHECK (xp_earned >= 0),
  completed_at     timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS completed_challenges_user_id_idx
  ON public.completed_challenges (user_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS completed_challenges_challenge_id_idx
  ON public.completed_challenges (challenge_id);

-- ----------------------------------------------------------------------------
-- 4) COMMUNITY SUPPORT LOG — replies / support actions on others' posts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_support_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supporter_id     uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  post_id          text NOT NULL,
  post_author_id   uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS community_support_log_supporter_id_idx
  ON public.community_support_log (supporter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS community_support_log_post_id_idx
  ON public.community_support_log (post_id);

-- ============================================================================
-- CRITICAL: DAILY LOGIN STREAK + SCALING XP
-- Call from the app with:  SELECT * FROM public.register_daily_login();
-- ============================================================================
-- Rules:
--   • last login = today      → no change
--   • last login = yesterday  → streak_count += 1
--   • last login < yesterday (or null) → streak_count = 1
-- XP formula (scales with streak):
--   xp_reward = 10 + (new_streak * 5)
--   Examples: streak 1 → +15 XP | streak 7 → +45 XP | streak 14 → +80 XP
-- ============================================================================

CREATE OR REPLACE FUNCTION public.register_daily_login()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid            uuid := auth.uid();
  profile_row    public.profiles;
  today_utc      date := (timezone('utc', now()))::date;
  last_login_day date;
  new_streak     integer;
  xp_reward      integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO profile_row
  FROM public.profiles
  WHERE id = uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', uid;
  END IF;

  last_login_day := (profile_row.last_login_date AT TIME ZONE 'utc')::date;

  -- Already checked in today: return unchanged profile.
  IF last_login_day IS NOT NULL AND last_login_day = today_utc THEN
    RETURN profile_row;
  END IF;

  -- Consecutive day vs missed day / first login.
  IF last_login_day IS NOT NULL AND last_login_day = (today_utc - 1) THEN
    new_streak := profile_row.streak_count + 1;
  ELSE
    new_streak := 1;
  END IF;

  -- Higher streak → higher daily XP reward.
  xp_reward := 10 + (new_streak * 5);

  UPDATE public.profiles
  SET
    streak_count    = new_streak,
    last_login_date = timezone('utc', now()),
    social_score    = social_score + xp_reward
  WHERE id = uid
  RETURNING * INTO profile_row;

  RETURN profile_row;
END;
$$;

REVOKE ALL ON FUNCTION public.register_daily_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_daily_login() TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_daily_login() TO anon;

-- ============================================================================
-- CRITICAL: AUTOMATIC RANK-UP ON social_score CHANGES
-- Whenever social_score is inserted/updated (login XP, challenges, support),
-- pick the highest rank whose xp_required <= social_score and set rank_title.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.evaluate_rank_on_score_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_rank_title text;
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.social_score IS DISTINCT FROM OLD.social_score THEN
    SELECT r.title
    INTO next_rank_title
    FROM public.ranks r
    WHERE r.xp_required <= NEW.social_score
    ORDER BY r.xp_required DESC
    LIMIT 1;

    IF next_rank_title IS NOT NULL THEN
      NEW.rank_title := next_rank_title;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_rank_up ON public.profiles;
CREATE TRIGGER trg_profiles_rank_up
  BEFORE INSERT OR UPDATE OF social_score ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.evaluate_rank_on_score_change();

-- ============================================================================
-- CRITICAL SECURITY — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.ranks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.completed_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_support_log ENABLE ROW LEVEL SECURITY;

-- ---- ranks: public read-only -----------------------------------------------
DROP POLICY IF EXISTS "Ranks are publicly readable" ON public.ranks;
CREATE POLICY "Ranks are publicly readable"
  ON public.ranks
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- No INSERT / UPDATE / DELETE policies for ranks → clients cannot mutate them.

-- ---- profiles: own-row only ------------------------------------------------
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated, anon
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated, anon
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ---- completed_challenges: own-row only ------------------------------------
DROP POLICY IF EXISTS "Users can view own completed challenges" ON public.completed_challenges;
CREATE POLICY "Users can view own completed challenges"
  ON public.completed_challenges
  FOR SELECT
  TO authenticated, anon
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own completed challenges" ON public.completed_challenges;
CREATE POLICY "Users can insert own completed challenges"
  ON public.completed_challenges
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own completed challenges" ON public.completed_challenges;
CREATE POLICY "Users can update own completed challenges"
  ON public.completed_challenges
  FOR UPDATE
  TO authenticated, anon
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---- community_support_log: own-row only -----------------------------------
DROP POLICY IF EXISTS "Users can view own support log" ON public.community_support_log;
CREATE POLICY "Users can view own support log"
  ON public.community_support_log
  FOR SELECT
  TO authenticated, anon
  USING (auth.uid() = supporter_id);

DROP POLICY IF EXISTS "Users can insert own support log" ON public.community_support_log;
CREATE POLICY "Users can insert own support log"
  ON public.community_support_log
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (auth.uid() = supporter_id);

DROP POLICY IF EXISTS "Users can update own support log" ON public.community_support_log;
CREATE POLICY "Users can update own support log"
  ON public.community_support_log
  FOR UPDATE
  TO authenticated, anon
  USING (auth.uid() = supporter_id)
  WITH CHECK (auth.uid() = supporter_id);

-- ============================================================================
-- Done. Verify in Table Editor that ranks / profiles / completed_challenges /
-- community_support_log exist, and that Anonymous Auth is enabled under
-- Authentication → Providers (required for signInAnonymously).
-- ============================================================================
