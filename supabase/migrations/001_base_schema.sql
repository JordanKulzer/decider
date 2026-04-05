-- =============================================================================
-- 001_base_schema.sql
--
-- Core tables used by both Quick Mode and Advanced Mode.
--
-- Structure:
--   PART 1 — Extensions + helper functions
--   PART 2 — All CREATE TABLE + indexes  (no policies here)
--   PART 3 — All ALTER TABLE ENABLE ROW LEVEL SECURITY
--   PART 4 — All CREATE POLICY           (all tables exist by this point)
--   PART 5 — Triggers
--
-- Splitting table creation from policy creation prevents "relation does not
-- exist" errors on policies that cross-reference other tables (e.g., the
-- decisions SELECT policy checks decision_members).
--
-- Key departures from the old initial schema:
--   • decisions.created_by is now nullable; created_by_guest_id TEXT added.
--     Exactly one must be set (XOR CHECK via num_nonnulls).
--   • decision_members uses (actor_user_id, actor_guest_id) instead of user_id.
--   • options uses (submitted_by_user_id, submitted_by_guest_id).
--   • votes renamed to advanced_votes. quick_votes lives in 003_quick_mode.sql.
--   • decisions.mode and decisions.category columns added.
--   • No "OR true" RLS shortcuts anywhere.
--
-- Identity note
-- ─────────────
-- The RECOMMENDED production path is Supabase Anonymous Auth:
--   supabase.auth.signInAnonymously()
-- Each guest gets a real auth.users row so auth.uid() works for everyone,
-- collapsing the XOR identity pattern to a single UUID column everywhere.
-- The dual-column schema below supports the CURRENT app code without
-- requiring anonymous-auth adoption first.
-- =============================================================================


-- =============================================================================
-- PART 1 — Extensions + standalone helper functions
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Generates a 6-character invite code from an unambiguous character set.
-- Used by 003_quick_mode.sql as well; defined here so it is always available.
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code  TEXT := '';
  i     INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    code := code || substr(chars, floor(random() * length(chars))::int + 1, 1);
  END LOOP;
  RETURN code;
END;
$$;


-- =============================================================================
-- PART 2 — Tables + indexes (no RLS policies in this section)
-- =============================================================================

-- ── users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT        UNIQUE NOT NULL,
  email       TEXT,
  push_token  TEXT,
  is_private  BOOLEAN     NOT NULL DEFAULT false,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── decisions ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS decisions (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  mode     TEXT NOT NULL DEFAULT 'advanced'
             CHECK (mode IN ('quick', 'advanced')),

  title       TEXT NOT NULL,
  description TEXT,
  -- type_label: organizer label for advanced; copy of category for quick.
  -- HomeScreen reads this column for both modes without a mode branch.
  type_label  TEXT,
  -- category: Quick Mode only; NULL for advanced decisions.
  category    TEXT CHECK (
    category IS NULL OR
    category IN ('food', 'activity', 'trip', 'other')
  ),

  -- XOR: exactly one of created_by / created_by_guest_id must be non-null.
  -- Quick Mode supports guest creators (no auth.users row).
  -- Advanced Mode always requires created_by (enforced by INSERT policy).
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_guest_id TEXT,
  CONSTRAINT chk_decision_creator
    CHECK (num_nonnulls(created_by, created_by_guest_id) = 1),

  lock_time TIMESTAMPTZ NOT NULL,

  -- Quick Mode uses:    'options' | 'locked'
  -- Advanced Mode uses: 'constraints' | 'options' | 'voting' | 'locked'
  status TEXT NOT NULL DEFAULT 'options'
    CHECK (status IN ('constraints', 'options', 'voting', 'locked')),

  -- Advanced Mode only (NULL for quick decisions)
  voting_mechanism TEXT
    CHECK (voting_mechanism IS NULL OR
           voting_mechanism IN ('point_allocation', 'forced_ranking')),
  max_options      INTEGER
    CHECK (max_options IS NULL OR (max_options >= 0 AND max_options <= 20)),
  option_submission TEXT DEFAULT 'anyone'
    CHECK (option_submission IN ('anyone', 'organizer_only')),
  reveal_votes_after_lock BOOLEAN DEFAULT false,

  invite_code TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decisions_created_by  ON decisions(created_by);
CREATE INDEX IF NOT EXISTS idx_decisions_status      ON decisions(status);
CREATE INDEX IF NOT EXISTS idx_decisions_invite_code ON decisions(invite_code);
CREATE INDEX IF NOT EXISTS idx_decisions_mode        ON decisions(mode);
CREATE INDEX IF NOT EXISTS idx_decisions_lock_open   ON decisions(lock_time)
  WHERE status != 'locked';

-- ── decision_members ──────────────────────────────────────────────────────────
-- Exactly one of actor_user_id / actor_guest_id must be set.
CREATE TABLE IF NOT EXISTS decision_members (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id    UUID        NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,

  actor_user_id  UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_guest_id TEXT,
  CONSTRAINT chk_member_actor
    CHECK (num_nonnulls(actor_user_id, actor_guest_id) = 1),

  role       TEXT    NOT NULL DEFAULT 'member'
               CHECK (role IN ('organizer', 'member')),
  has_voted  BOOLEAN NOT NULL DEFAULT false,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique indexes: one membership row per actor per decision.
-- Normal UNIQUE constraints treat two NULLs as non-conflicting in Postgres,
-- so we need partial indexes to get the correct uniqueness behaviour.
CREATE UNIQUE INDEX IF NOT EXISTS uq_member_user
  ON decision_members (decision_id, actor_user_id)
  WHERE actor_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_member_guest
  ON decision_members (decision_id, actor_guest_id)
  WHERE actor_guest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_decision_members_decision ON decision_members(decision_id);
CREATE INDEX IF NOT EXISTS idx_decision_members_user     ON decision_members(actor_user_id);

-- ── options ───────────────────────────────────────────────────────────────────
-- voteTotal is NOT stored here; computed at query time via SUM(quick_votes.count).
CREATE TABLE IF NOT EXISTS options (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id           UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,

  submitted_by_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_by_guest_id TEXT,
  CONSTRAINT chk_option_submitter
    CHECK (num_nonnulls(submitted_by_user_id, submitted_by_guest_id) = 1),

  title TEXT NOT NULL,

  -- Advanced Mode only
  description           TEXT,
  metadata              JSONB,
  passes_constraints    BOOLEAN DEFAULT true,
  constraint_violations JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_options_decision ON options(decision_id);

-- ── constraints (Advanced Mode only) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS constraints (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL
                CHECK (type IN ('budget_max', 'date_range', 'distance', 'duration', 'exclusion')),
  value       JSONB NOT NULL,
  weight      INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_constraints_decision ON constraints(decision_id);

-- ── advanced_votes (Advanced Mode only) ──────────────────────────────────────
-- Renamed from "votes" to distinguish from quick_votes (003_quick_mode.sql).
-- One row per (decision × user × option); value = points or rank position.
CREATE TABLE IF NOT EXISTS advanced_votes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_id   UUID NOT NULL REFERENCES options(id) ON DELETE CASCADE,
  value       INTEGER NOT NULL CHECK (value >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (decision_id, user_id, option_id)
);

CREATE INDEX IF NOT EXISTS idx_advanced_votes_decision ON advanced_votes(decision_id);
CREATE INDEX IF NOT EXISTS idx_advanced_votes_user     ON advanced_votes(user_id);

-- ── results (Advanced Mode only) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS results (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id  UUID    NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  option_id    UUID    NOT NULL REFERENCES options(id) ON DELETE CASCADE,
  total_points INTEGER NOT NULL DEFAULT 0,
  average_rank NUMERIC,
  rank         INTEGER NOT NULL,
  is_winner    BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_results_decision ON results(decision_id);


-- =============================================================================
-- PART 3 — Enable RLS on every table
-- (Must come before CREATE POLICY statements)
-- =============================================================================

ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE options          ENABLE ROW LEVEL SECURITY;
ALTER TABLE constraints      ENABLE ROW LEVEL SECURITY;
ALTER TABLE advanced_votes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE results          ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- PART 4 — RLS policies
-- All tables exist by this point, so cross-table references are safe.
-- =============================================================================

-- ── users ─────────────────────────────────────────────────────────────────────
CREATE POLICY "Authenticated users can view non-deleted users"
  ON users FOR SELECT
  USING (deleted_at IS NULL AND auth.role() = 'authenticated');

CREATE POLICY "Users can update own record"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- ── decisions ─────────────────────────────────────────────────────────────────
-- SELECT: authenticated user is a member. decision_members exists now.
CREATE POLICY "Members can view decisions"
  ON decisions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM decision_members dm
      WHERE dm.decision_id = decisions.id
        AND dm.actor_user_id = auth.uid()
    )
  );

-- INSERT: authenticated users only; guest-created quick decisions go through
-- create_quick_decision() SECURITY DEFINER in 003_quick_mode.sql.
CREATE POLICY "Authenticated users can create decisions"
  ON decisions FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND created_by_guest_id IS NULL
  );

CREATE POLICY "Creator can update decision"
  ON decisions FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Creator can delete decision"
  ON decisions FOR DELETE
  USING (auth.uid() = created_by);

-- ── decision_members ──────────────────────────────────────────────────────────
CREATE POLICY "Members can view decision membership"
  ON decision_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM decision_members dm
      WHERE dm.decision_id = decision_members.decision_id
        AND dm.actor_user_id = auth.uid()
    )
  );

-- Authenticated users can insert their own membership row directly.
-- Guest joins go through join_quick_decision() SECURITY DEFINER.
CREATE POLICY "Authenticated users can join decisions"
  ON decision_members FOR INSERT
  WITH CHECK (
    actor_user_id = auth.uid()
    AND actor_guest_id IS NULL
  );

CREATE POLICY "Users can update own membership"
  ON decision_members FOR UPDATE
  USING (actor_user_id = auth.uid());

CREATE POLICY "Users can leave decisions"
  ON decision_members FOR DELETE
  USING (actor_user_id = auth.uid());

-- ── options ───────────────────────────────────────────────────────────────────
CREATE POLICY "Members can view options"
  ON options FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM decision_members dm
      WHERE dm.decision_id = options.decision_id
        AND dm.actor_user_id = auth.uid()
    )
  );

-- Authenticated members can insert directly. Guest option adds go through
-- add_quick_option() SECURITY DEFINER in 003_quick_mode.sql.
CREATE POLICY "Authenticated members can add options"
  ON options FOR INSERT
  WITH CHECK (
    submitted_by_user_id = auth.uid()
    AND submitted_by_guest_id IS NULL
    AND EXISTS (
      SELECT 1 FROM decision_members dm
      WHERE dm.decision_id = options.decision_id
        AND dm.actor_user_id = auth.uid()
    )
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

CREATE POLICY "Creator can delete options"
  ON options FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM decisions d
      WHERE d.id = options.decision_id
        AND d.created_by = auth.uid()
    )
  );

-- ── constraints ───────────────────────────────────────────────────────────────
CREATE POLICY "Members can view constraints"
  ON constraints FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM decision_members dm
      WHERE dm.decision_id = constraints.decision_id
        AND dm.actor_user_id = auth.uid()
    )
  );

CREATE POLICY "Members can add constraints during constraints phase"
  ON constraints FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM decision_members dm
      WHERE dm.decision_id = constraints.decision_id
        AND dm.actor_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM decisions d
      WHERE d.id = constraints.decision_id AND d.status = 'constraints'
    )
  );

CREATE POLICY "Users can delete own constraints"
  ON constraints FOR DELETE
  USING (auth.uid() = user_id);

-- ── advanced_votes ────────────────────────────────────────────────────────────
CREATE POLICY "Members can view advanced votes"
  ON advanced_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM decision_members dm
      WHERE dm.decision_id = advanced_votes.decision_id
        AND dm.actor_user_id = auth.uid()
    )
  );

CREATE POLICY "Members can vote in voting phase"
  ON advanced_votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM decisions d
      WHERE d.id = advanced_votes.decision_id AND d.status = 'voting'
    )
    AND EXISTS (
      SELECT 1 FROM decision_members dm
      WHERE dm.decision_id = advanced_votes.decision_id
        AND dm.actor_user_id = auth.uid()
        AND dm.has_voted = false
    )
  );

-- ── results ───────────────────────────────────────────────────────────────────
CREATE POLICY "Members can view results"
  ON results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM decision_members dm
      WHERE dm.decision_id = results.decision_id
        AND dm.actor_user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert results"
  ON results FOR INSERT
  WITH CHECK (auth.role() = 'service_role');


-- =============================================================================
-- PART 5 — Triggers
-- =============================================================================

-- Auto-create a users row when a real (non-anonymous) Supabase user signs up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Skip anonymous users — they have no username and never appear in users.
  -- If/when they link a real identity, the trigger fires again and
  -- ON CONFLICT prevents a duplicate.
  IF NEW.is_anonymous THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.users (id, username, email)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      'user_' || LEFT(NEW.id::text, 8)
    ),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Convenience predicate — used by app queries and 003_quick_mode.sql functions.
CREATE OR REPLACE FUNCTION public.is_decision_member(
  p_decision_id UUID,
  p_user_id     UUID
)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM decision_members
    WHERE decision_id  = p_decision_id
      AND actor_user_id = p_user_id
  );
$$;
