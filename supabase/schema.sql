-- ============================================
-- DECIDER APP - SUPABASE DATABASE SCHEMA
-- ============================================
-- Run this in your Supabase SQL Editor (Database > SQL Editor)
-- Make sure to run it in order (tables first, then RLS, then triggers)

-- ============================================
-- 1. ENABLE EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 2. CREATE TABLES
-- ============================================

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Decisions table
CREATE TABLE IF NOT EXISTS public.decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  type_label TEXT, -- 'dinner', 'trip', 'activity', 'purchase', 'rule_change', 'other'
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lock_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'constraints', -- 'constraints', 'options', 'voting', 'locked'
  voting_mechanism TEXT NOT NULL DEFAULT 'point_allocation', -- 'point_allocation', 'forced_ranking'
  max_options INTEGER NOT NULL DEFAULT 7 CHECK (max_options >= 0 AND max_options <= 10),
  option_submission TEXT NOT NULL DEFAULT 'anyone', -- 'anyone', 'organizer_only'
  reveal_votes_after_lock BOOLEAN NOT NULL DEFAULT false,
  invite_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Decision members table
CREATE TABLE IF NOT EXISTS public.decision_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id UUID NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- 'organizer', 'member'
  has_voted BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(decision_id, user_id)
);

-- Constraints table
CREATE TABLE IF NOT EXISTS public.constraints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id UUID NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'budget_max', 'date_range', 'distance', 'duration', 'exclusion'
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Options table
CREATE TABLE IF NOT EXISTS public.options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id UUID NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB,
  passes_constraints BOOLEAN NOT NULL DEFAULT true,
  constraint_violations JSONB, -- Array of {constraint_id, reason}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Votes table
CREATE TABLE IF NOT EXISTS public.votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id UUID NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES public.options(id) ON DELETE CASCADE,
  value INTEGER NOT NULL, -- Points (1-10) or Rank (1-N)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(decision_id, user_id, option_id)
);

-- Results table
CREATE TABLE IF NOT EXISTS public.results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id UUID NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES public.options(id) ON DELETE CASCADE,
  total_points INTEGER NOT NULL DEFAULT 0,
  average_rank DECIMAL(5,2),
  rank INTEGER NOT NULL,
  is_winner BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(decision_id, option_id)
);

-- ============================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_decisions_created_by ON public.decisions(created_by);
CREATE INDEX IF NOT EXISTS idx_decisions_invite_code ON public.decisions(invite_code);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON public.decisions(status);
CREATE INDEX IF NOT EXISTS idx_decision_members_decision_id ON public.decision_members(decision_id);
CREATE INDEX IF NOT EXISTS idx_decision_members_user_id ON public.decision_members(user_id);
CREATE INDEX IF NOT EXISTS idx_constraints_decision_id ON public.constraints(decision_id);
CREATE INDEX IF NOT EXISTS idx_options_decision_id ON public.options(decision_id);
CREATE INDEX IF NOT EXISTS idx_votes_decision_id ON public.votes(decision_id);
CREATE INDEX IF NOT EXISTS idx_votes_user_id ON public.votes(user_id);
CREATE INDEX IF NOT EXISTS idx_results_decision_id ON public.results(decision_id);

-- ============================================
-- 4. ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. ROW LEVEL SECURITY POLICIES
-- ============================================

-- USERS POLICIES
-- Users can read their own data
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own data
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Users can insert their own profile (on signup)
CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- DECISIONS POLICIES
-- Users can view decisions they are members of
CREATE POLICY "Members can view decisions" ON public.decisions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.decision_members
      WHERE decision_id = decisions.id AND user_id = auth.uid()
    )
  );

-- Users can create decisions
CREATE POLICY "Authenticated users can create decisions" ON public.decisions
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Organizers can update their decisions
CREATE POLICY "Organizers can update decisions" ON public.decisions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.decision_members
      WHERE decision_id = decisions.id
        AND user_id = auth.uid()
        AND role = 'organizer'
    )
  );

-- DECISION MEMBERS POLICIES
-- Members can view other members in their decisions
CREATE POLICY "Members can view decision members" ON public.decision_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.decision_members dm
      WHERE dm.decision_id = decision_members.decision_id AND dm.user_id = auth.uid()
    )
  );

-- Users can join decisions (insert themselves)
CREATE POLICY "Users can join decisions" ON public.decision_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own membership (has_voted)
CREATE POLICY "Users can update own membership" ON public.decision_members
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can leave decisions (delete themselves)
CREATE POLICY "Users can leave decisions" ON public.decision_members
  FOR DELETE USING (auth.uid() = user_id);

-- CONSTRAINTS POLICIES
-- Members can view constraints in their decisions
CREATE POLICY "Members can view constraints" ON public.constraints
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.decision_members
      WHERE decision_id = constraints.decision_id AND user_id = auth.uid()
    )
  );

-- Members can add constraints
CREATE POLICY "Members can add constraints" ON public.constraints
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.decision_members
      WHERE decision_id = constraints.decision_id AND user_id = auth.uid()
    )
  );

-- Users can delete their own constraints
CREATE POLICY "Users can delete own constraints" ON public.constraints
  FOR DELETE USING (auth.uid() = user_id);

-- OPTIONS POLICIES
-- Members can view options in their decisions
CREATE POLICY "Members can view options" ON public.options
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.decision_members
      WHERE decision_id = options.decision_id AND user_id = auth.uid()
    )
  );

-- Members can add options (if allowed by decision settings)
CREATE POLICY "Members can add options" ON public.options
  FOR INSERT WITH CHECK (
    auth.uid() = submitted_by AND
    EXISTS (
      SELECT 1 FROM public.decision_members dm
      JOIN public.decisions d ON d.id = dm.decision_id
      WHERE dm.decision_id = options.decision_id
        AND dm.user_id = auth.uid()
        AND (d.option_submission = 'anyone' OR dm.role = 'organizer')
    )
  );

-- Users can delete their own options, organizers can delete any
CREATE POLICY "Users can delete own options or organizers can delete any" ON public.options
  FOR DELETE USING (
    auth.uid() = submitted_by OR
    EXISTS (
      SELECT 1 FROM public.decision_members
      WHERE decision_id = options.decision_id
        AND user_id = auth.uid()
        AND role = 'organizer'
    )
  );

-- VOTES POLICIES
-- Members can view votes in their decisions (respecting reveal settings)
CREATE POLICY "Members can view votes" ON public.votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.decision_members dm
      JOIN public.decisions d ON d.id = dm.decision_id
      WHERE dm.decision_id = votes.decision_id
        AND dm.user_id = auth.uid()
        AND (d.status = 'locked' OR votes.user_id = auth.uid())
    )
  );

-- Members can submit votes
CREATE POLICY "Members can submit votes" ON public.votes
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.decision_members dm
      JOIN public.decisions d ON d.id = dm.decision_id
      WHERE dm.decision_id = votes.decision_id
        AND dm.user_id = auth.uid()
        AND d.status = 'voting'
        AND dm.has_voted = false
    )
  );

-- Organizers can delete votes (for reverting phases)
CREATE POLICY "Organizers can delete votes" ON public.votes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.decision_members
      WHERE decision_id = votes.decision_id
        AND user_id = auth.uid()
        AND role = 'organizer'
    )
  );

-- RESULTS POLICIES
-- Members can view results
CREATE POLICY "Members can view results" ON public.results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.decision_members
      WHERE decision_id = results.decision_id AND user_id = auth.uid()
    )
  );

-- System can insert/update results (via service role or triggers)
-- For now, allow organizers to manage results
CREATE POLICY "Organizers can manage results" ON public.results
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.decision_members
      WHERE decision_id = results.decision_id
        AND user_id = auth.uid()
        AND role = 'organizer'
    )
  );

-- ============================================
-- 6. FUNCTIONS & TRIGGERS
-- ============================================

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, username, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || LEFT(NEW.id::text, 8)),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create user profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to add creator as organizer when decision is created
CREATE OR REPLACE FUNCTION public.handle_new_decision()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.decision_members (decision_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'organizer');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-add creator as organizer
DROP TRIGGER IF EXISTS on_decision_created ON public.decisions;
CREATE TRIGGER on_decision_created
  AFTER INSERT ON public.decisions
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_decision();

-- Function to generate unique invite code
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Removed confusing chars (0,O,1,I)
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || SUBSTR(chars, FLOOR(RANDOM() * LENGTH(chars) + 1)::INTEGER, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate and store results when decision locks
CREATE OR REPLACE FUNCTION public.calculate_results(p_decision_id UUID)
RETURNS VOID AS $$
DECLARE
  v_mechanism TEXT;
  v_option RECORD;
  v_rank INTEGER := 1;
  v_prev_score DECIMAL;
BEGIN
  -- Get voting mechanism
  SELECT voting_mechanism INTO v_mechanism
  FROM public.decisions WHERE id = p_decision_id;

  -- Clear existing results
  DELETE FROM public.results WHERE decision_id = p_decision_id;

  IF v_mechanism = 'point_allocation' THEN
    -- Point allocation: sum all points, highest wins
    FOR v_option IN (
      SELECT
        o.id as option_id,
        COALESCE(SUM(v.value), 0) as total_points
      FROM public.options o
      LEFT JOIN public.votes v ON v.option_id = o.id
      WHERE o.decision_id = p_decision_id AND o.passes_constraints = true
      GROUP BY o.id
      ORDER BY COALESCE(SUM(v.value), 0) DESC
    ) LOOP
      INSERT INTO public.results (decision_id, option_id, total_points, rank, is_winner)
      VALUES (
        p_decision_id,
        v_option.option_id,
        v_option.total_points,
        v_rank,
        v_rank = 1
      );
      v_rank := v_rank + 1;
    END LOOP;

  ELSE -- forced_ranking
    -- Forced ranking: average all ranks, lowest average wins
    FOR v_option IN (
      SELECT
        o.id as option_id,
        COALESCE(AVG(v.value), 999) as avg_rank,
        COALESCE(SUM(v.value), 0) as total_points
      FROM public.options o
      LEFT JOIN public.votes v ON v.option_id = o.id
      WHERE o.decision_id = p_decision_id AND o.passes_constraints = true
      GROUP BY o.id
      ORDER BY COALESCE(AVG(v.value), 999) ASC
    ) LOOP
      INSERT INTO public.results (decision_id, option_id, total_points, average_rank, rank, is_winner)
      VALUES (
        p_decision_id,
        v_option.option_id,
        v_option.total_points,
        v_option.avg_rank,
        v_rank,
        v_rank = 1
      );
      v_rank := v_rank + 1;
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to auto-lock decisions and calculate results
CREATE OR REPLACE FUNCTION public.check_and_lock_decisions()
RETURNS VOID AS $$
DECLARE
  v_decision RECORD;
BEGIN
  FOR v_decision IN (
    SELECT id FROM public.decisions
    WHERE status = 'voting' AND lock_time <= NOW()
  ) LOOP
    -- Update status to locked
    UPDATE public.decisions SET status = 'locked' WHERE id = v_decision.id;
    -- Calculate results
    PERFORM public.calculate_results(v_decision.id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. GRANT PERMISSIONS
-- ============================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant permissions on tables
GRANT SELECT ON public.users TO anon, authenticated;
GRANT INSERT, UPDATE ON public.users TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.decisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decision_members TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.constraints TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.options TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.votes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.results TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_results(UUID) TO authenticated;

-- ============================================
-- 8. OPTIONAL: CRON JOB FOR AUTO-LOCKING
-- ============================================
-- If you have pg_cron extension enabled, uncomment this:
-- SELECT cron.schedule('check-locks', '* * * * *', 'SELECT public.check_and_lock_decisions()');

-- ============================================
-- 9. ADDITIONAL FEATURES (Run after initial setup)
-- ============================================

-- Helper function to check membership (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.is_decision_member(p_decision_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.decision_members
    WHERE decision_id = p_decision_id AND user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.is_decision_member(UUID, UUID) TO authenticated;

-- Fix recursive policies
DROP POLICY IF EXISTS "Members can view decision members" ON public.decision_members;
CREATE POLICY "Members can view decision members" ON public.decision_members
  FOR SELECT USING (public.is_decision_member(decision_id, auth.uid()));

DROP POLICY IF EXISTS "Members can view decisions" ON public.decisions;
CREATE POLICY "Members can view decisions" ON public.decisions
  FOR SELECT USING (public.is_decision_member(id, auth.uid()));

-- ADVANCE VOTES TABLE (vote-to-advance system)
CREATE TABLE IF NOT EXISTS public.advance_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id UUID NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  from_phase TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(decision_id, user_id, from_phase)
);

-- COMMENTS TABLE
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id UUID NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  option_id UUID REFERENCES public.options(id) ON DELETE CASCADE,
  constraint_id UUID REFERENCES public.constraints(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  deleted_by UUID REFERENCES public.users(id),
  CONSTRAINT comment_target CHECK (
    (option_id IS NOT NULL AND constraint_id IS NULL) OR
    (option_id IS NULL AND constraint_id IS NOT NULL) OR
    (option_id IS NULL AND constraint_id IS NULL AND parent_id IS NOT NULL)
  )
);

-- Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_advance_votes_decision ON public.advance_votes(decision_id);
CREATE INDEX IF NOT EXISTS idx_comments_decision ON public.comments(decision_id);
CREATE INDEX IF NOT EXISTS idx_comments_option ON public.comments(option_id);
CREATE INDEX IF NOT EXISTS idx_comments_constraint ON public.comments(constraint_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON public.comments(parent_id);

-- Enable RLS on new tables
ALTER TABLE public.advance_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- RLS policies for advance_votes
CREATE POLICY "Members can view advance votes" ON public.advance_votes
  FOR SELECT USING (public.is_decision_member(decision_id, auth.uid()));

CREATE POLICY "Members can submit advance votes" ON public.advance_votes
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    public.is_decision_member(decision_id, auth.uid())
  );

CREATE POLICY "Users can delete own advance votes" ON public.advance_votes
  FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for comments
CREATE POLICY "Members can view comments" ON public.comments
  FOR SELECT USING (public.is_decision_member(decision_id, auth.uid()));

CREATE POLICY "Members can add comments" ON public.comments
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    public.is_decision_member(decision_id, auth.uid())
  );

-- Users can hard-delete own comments, organizers can delete any
CREATE POLICY "Users or organizers can delete comments" ON public.comments
  FOR DELETE USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.decision_members
      WHERE decision_id = comments.decision_id
        AND user_id = auth.uid()
        AND role = 'organizer'
    )
  );

-- Organizers can soft-delete comments (update deleted_at)
CREATE POLICY "Organizers can soft delete comments" ON public.comments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.decision_members
      WHERE decision_id = comments.decision_id
        AND user_id = auth.uid()
        AND role = 'organizer'
    )
  );

-- Update member removal policy for organizer removal capability
DROP POLICY IF EXISTS "Users can leave decisions" ON public.decision_members;
CREATE POLICY "Members can leave or be removed" ON public.decision_members
  FOR DELETE USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.decision_members dm
      WHERE dm.decision_id = decision_members.decision_id
        AND dm.user_id = auth.uid()
        AND dm.role = 'organizer'
    )
  );

-- Grant permissions on new tables
GRANT SELECT, INSERT, DELETE ON public.advance_votes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;

-- ============================================
-- 10. MONETIZATION & SUBSCRIPTION SYSTEM
-- ============================================

-- Add tier and subscription fields to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro')),
ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'none' CHECK (subscription_status IN ('none', 'active', 'canceled', 'past_due')),
ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- Add Pro features to decisions table
ALTER TABLE public.decisions
ADD COLUMN IF NOT EXISTS silent_voting BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS constraint_weights_enabled BOOLEAN NOT NULL DEFAULT false;

-- Add weight to constraints table
ALTER TABLE public.constraints
ADD COLUMN IF NOT EXISTS weight INTEGER NOT NULL DEFAULT 1 CHECK (weight >= 1 AND weight <= 5);

-- Subscriptions table for audit/history
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'stripe', 'apple', 'google', 'manual'
  provider_subscription_id TEXT,
  plan TEXT NOT NULL, -- 'pro_monthly', 'pro_yearly'
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'expired')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  canceled_at TIMESTAMPTZ,
  UNIQUE(provider, provider_subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- Enable RLS on subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscriptions
CREATE POLICY "Users can view own subscriptions" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Grant permissions on subscriptions table
GRANT SELECT ON public.subscriptions TO authenticated;

-- Update votes policy for silent voting
DROP POLICY IF EXISTS "Members can view votes" ON public.votes;
CREATE POLICY "Members can view votes respecting silent mode" ON public.votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.decision_members dm
      JOIN public.decisions d ON d.id = dm.decision_id
      WHERE dm.decision_id = votes.decision_id
        AND dm.user_id = auth.uid()
        AND (
          -- Can always see own votes
          votes.user_id = auth.uid()
          OR
          -- Can see all votes if decision is locked
          d.status = 'locked'
          OR
          -- Can see votes if NOT silent voting mode
          d.silent_voting = false
        )
    )
  );

-- ============================================
-- 11. FRIENDS SYSTEM
-- ============================================

-- Friend Requests table
CREATE TABLE IF NOT EXISTS public.friend_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_user_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON public.friend_requests(from_user_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON public.friend_requests(to_user_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_status ON public.friend_requests(status);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own friend requests" ON public.friend_requests
  FOR SELECT USING (
    auth.uid() = from_user_id OR auth.uid() = to_user_id
  );

CREATE POLICY "Users can send friend requests" ON public.friend_requests
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Users can respond to friend requests" ON public.friend_requests
  FOR UPDATE USING (auth.uid() = to_user_id);

CREATE POLICY "Users can delete friend requests" ON public.friend_requests
  FOR DELETE USING (
    auth.uid() = from_user_id OR auth.uid() = to_user_id
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friend_requests TO authenticated;

-- Friendships table (bidirectional - one row per direction)
CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('accepted', 'blocked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user ON public.friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON public.friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON public.friendships(status);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own friendships" ON public.friendships
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can create friendships" ON public.friendships
  FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can delete own friendships" ON public.friendships
  FOR DELETE USING (auth.uid() = user_id OR auth.uid() = friend_id);

GRANT SELECT, INSERT, DELETE ON public.friendships TO authenticated;

-- Update users policy to allow searching for other users
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Authenticated users can view non-deleted users" ON public.users
  FOR SELECT USING (deleted_at IS NULL);

-- ============================================
-- SETUP COMPLETE!
-- ============================================
-- Next steps:
-- 1. Go to Authentication > Settings and configure email templates
-- 2. Add your EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env
-- 3. Test the app!
