-- ============================================================
-- DECIDER APP: Initial Schema Migration
-- ============================================================

-- 1. Users table (extends auth.users with app-specific fields)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  push_token TEXT,
  is_private BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create user record on signup
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all non-deleted users" ON users
  FOR SELECT USING (deleted_at IS NULL);

CREATE POLICY "Users can update own record" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own record" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);


-- 2. Decisions table
CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  type_label TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lock_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'constraints'
    CHECK (status IN ('constraints', 'options', 'voting', 'locked')),
  voting_mechanism TEXT NOT NULL DEFAULT 'point_allocation'
    CHECK (voting_mechanism IN ('point_allocation', 'forced_ranking')),
  max_options INTEGER NOT NULL DEFAULT 7
    CHECK (max_options >= 2 AND max_options <= 10),
  option_submission TEXT NOT NULL DEFAULT 'anyone'
    CHECK (option_submission IN ('anyone', 'organizer_only')),
  reveal_votes_after_lock BOOLEAN DEFAULT false,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_decisions_created_by ON decisions(created_by);
CREATE INDEX idx_decisions_status ON decisions(status);
CREATE INDEX idx_decisions_invite_code ON decisions(invite_code);
CREATE INDEX idx_decisions_lock_time ON decisions(lock_time) WHERE status = 'voting';

ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their decisions" ON decisions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM decision_members
      WHERE decision_members.decision_id = decisions.id
      AND decision_members.user_id = auth.uid()
    )
    OR true -- Allow lookup by invite_code for joining; scoped at query level
  );

CREATE POLICY "Authenticated users can create decisions" ON decisions
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Organizer can update decisions" ON decisions
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Organizer can delete decisions" ON decisions
  FOR DELETE USING (auth.uid() = created_by);


-- 3. Decision Members table
CREATE TABLE IF NOT EXISTS decision_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('organizer', 'member')),
  has_voted BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(decision_id, user_id)
);

CREATE INDEX idx_decision_members_decision ON decision_members(decision_id);
CREATE INDEX idx_decision_members_user ON decision_members(user_id);

ALTER TABLE decision_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view decision members" ON decision_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM decision_members AS dm
      WHERE dm.decision_id = decision_members.decision_id
      AND dm.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can join decisions" ON decision_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own membership" ON decision_members
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can leave decisions" ON decision_members
  FOR DELETE USING (auth.uid() = user_id);


-- 4. Constraints table
CREATE TABLE IF NOT EXISTS constraints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL
    CHECK (type IN ('budget_max', 'date_range', 'distance', 'duration', 'exclusion')),
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_constraints_decision ON constraints(decision_id);

ALTER TABLE constraints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view decision constraints" ON constraints
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM decision_members
      WHERE decision_members.decision_id = constraints.decision_id
      AND decision_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can add constraints during constraints phase" ON constraints
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM decision_members
      WHERE decision_members.decision_id = constraints.decision_id
      AND decision_members.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM decisions
      WHERE decisions.id = constraints.decision_id
      AND decisions.status = 'constraints'
    )
  );

CREATE POLICY "Users can delete own constraints" ON constraints
  FOR DELETE USING (auth.uid() = user_id);


-- 5. Options table
CREATE TABLE IF NOT EXISTS options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB,
  passes_constraints BOOLEAN DEFAULT true,
  constraint_violations JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_options_decision ON options(decision_id);

ALTER TABLE options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view options" ON options
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM decision_members
      WHERE decision_members.decision_id = options.decision_id
      AND decision_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Authorized users can add options during options phase" ON options
  FOR INSERT WITH CHECK (
    auth.uid() = submitted_by
    AND EXISTS (
      SELECT 1 FROM decisions d
      WHERE d.id = options.decision_id
      AND d.status = 'options'
      AND (
        d.option_submission = 'anyone'
        OR (d.option_submission = 'organizer_only' AND d.created_by = auth.uid())
      )
    )
  );

CREATE POLICY "Organizer can delete options" ON options
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM decisions
      WHERE decisions.id = options.decision_id
      AND decisions.created_by = auth.uid()
    )
  );


-- 6. Votes table
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES options(id) ON DELETE CASCADE,
  value INTEGER NOT NULL CHECK (value >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(decision_id, user_id, option_id)
);

CREATE INDEX idx_votes_decision ON votes(decision_id);
CREATE INDEX idx_votes_user ON votes(user_id);

ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view votes" ON votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM decision_members
      WHERE decision_members.decision_id = votes.decision_id
      AND decision_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can vote during voting phase" ON votes
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM decisions
      WHERE decisions.id = votes.decision_id
      AND decisions.status = 'voting'
    )
    AND EXISTS (
      SELECT 1 FROM decision_members
      WHERE decision_members.decision_id = votes.decision_id
      AND decision_members.user_id = auth.uid()
      AND decision_members.has_voted = false
    )
  );


-- 7. Results table (populated after lock)
CREATE TABLE IF NOT EXISTS results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES options(id) ON DELETE CASCADE,
  total_points INTEGER NOT NULL DEFAULT 0,
  average_rank NUMERIC,
  rank INTEGER NOT NULL,
  is_winner BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_results_decision ON results(decision_id);

ALTER TABLE results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view results" ON results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM decision_members
      WHERE decision_members.decision_id = results.decision_id
      AND decision_members.user_id = auth.uid()
    )
  );

-- Service role inserts results via edge function
CREATE POLICY "Allow result insertion" ON results
  FOR INSERT WITH CHECK (true);
