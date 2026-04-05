-- =============================================================================
-- 003_quick_mode.sql
--
-- Quick Mode: count-based vote table and SECURITY DEFINER functions that
-- handle both authenticated-user and guest identity paths uniformly.
--
-- Why SECURITY DEFINER functions?
-- ────────────────────────────────
-- Supabase RLS is evaluated against auth.uid(), which is NULL for unauthenticated
-- (anon-role) requests. Guests use a locally generated "guest_XXXX" string stored
-- in AsyncStorage — they have no Supabase session, so auth.uid() is always NULL
-- for them. Rather than writing permissive RLS policies (the "OR true" anti-pattern
-- from the old schema), all Quick Mode mutations that need to work for guests are
-- wrapped in SECURITY DEFINER functions. The function validates the caller's
-- identity explicitly before touching any data.
--
-- Recommended upgrade path
-- ────────────────────────
-- Adopt Supabase Anonymous Auth (supabase.auth.signInAnonymously()).
-- Once every actor has a real JWT — even guests — these functions simplify:
-- the guest_id branches disappear, the XOR check constraints on identity
-- columns become plain NOT NULL foreign keys, and standard RLS applies.
-- The interface contract (DecisionRepository) does not change; only the
-- SupabaseDecisionRepository implementation and resolveDecisionActor.ts change.
-- =============================================================================

-- =============================================================================
-- QUICK VOTES
--
-- One row per (decision × option × actor). `count` is always >= 1 — rows
-- with count 0 are deleted rather than kept at zero.
--
-- This maps directly to the VoteCountRecord shape in MockDecisionRepository
-- and the increment/decrement contract in decisionRepository.ts:
--   • incrementVote  → upsert_quick_vote(delta = +1)
--   • decrementVote  → upsert_quick_vote(delta = -1)
--
-- voteTotal is NOT stored on options. It is computed at query time via
--   SUM(quick_votes.count) GROUP BY option_id
-- inside getLiveDecisionState(). This avoids any trigger-maintained denormalized
-- column and keeps the aggregation source-of-truth in one place.
-- =============================================================================
CREATE TABLE IF NOT EXISTS quick_votes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id    UUID        NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  option_id      UUID        NOT NULL REFERENCES options(id) ON DELETE CASCADE,

  -- XOR identity: exactly one must be set.
  actor_user_id  UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_guest_id TEXT,
  CONSTRAINT chk_quick_vote_actor
    CHECK (num_nonnulls(actor_user_id, actor_guest_id) = 1),

  -- count is the number of votes this actor has placed on this option.
  -- Upper bound matches MAX_QUICK_VOTES (5) in decisionTypes.ts.
  -- The function enforces the cross-option total; this constraint catches
  -- any direct INSERT that bypasses the function.
  count      INTEGER NOT NULL DEFAULT 1 CHECK (count >= 1 AND count <= 5),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique indexes: one record per (actor × option), per identity path.
-- ON CONFLICT ... WHERE clauses below reference these exact expressions.
CREATE UNIQUE INDEX uq_quick_votes_user
  ON quick_votes (decision_id, option_id, actor_user_id)
  WHERE actor_user_id IS NOT NULL;

CREATE UNIQUE INDEX uq_quick_votes_guest
  ON quick_votes (decision_id, option_id, actor_guest_id)
  WHERE actor_guest_id IS NOT NULL;

CREATE INDEX idx_quick_votes_decision ON quick_votes(decision_id);
CREATE INDEX idx_quick_votes_option   ON quick_votes(option_id);

ALTER TABLE quick_votes ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated members can read votes (used to populate myVoteCount).
CREATE POLICY "Authenticated members can view quick votes"
  ON quick_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM decision_members dm
      WHERE dm.decision_id = quick_votes.decision_id
        AND dm.actor_user_id = auth.uid()
    )
  );

-- Direct INSERT/UPDATE/DELETE for authenticated users.
-- All Quick Mode mutations for GUESTS go through the SECURITY DEFINER
-- functions below. The app's SupabaseDecisionRepository should route ALL
-- mutations through those functions (not direct DML) for consistency.
CREATE POLICY "Authenticated members can upsert own quick votes"
  ON quick_votes FOR INSERT
  WITH CHECK (
    actor_user_id = auth.uid()
    AND actor_guest_id IS NULL
    AND EXISTS (
      SELECT 1 FROM decision_members dm
      WHERE dm.decision_id = quick_votes.decision_id
        AND dm.actor_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM decisions d
      WHERE d.id = quick_votes.decision_id
        AND d.status = 'options'
        AND d.lock_time > NOW()
    )
  );

CREATE POLICY "Authenticated members can update own quick votes"
  ON quick_votes FOR UPDATE
  USING (actor_user_id = auth.uid());

CREATE POLICY "Authenticated members can delete own quick votes"
  ON quick_votes FOR DELETE
  USING (actor_user_id = auth.uid());

-- =============================================================================
-- SECURITY DEFINER FUNCTIONS
-- These are the canonical mutation path for SupabaseDecisionRepository.
-- They enforce all business rules atomically, and are the ONLY path for
-- guest mutations (which cannot use RLS directly).
-- =============================================================================

-- ── create_quick_decision ─────────────────────────────────────────────────────
-- Creates a decision and adds the creator as the first member in one
-- transaction. Called by decisionRepository.createQuickDecision().
--
-- p_user_id  — set for authenticated actors, NULL for guests.
-- p_guest_id — set for guest actors, NULL for authenticated users.
CREATE OR REPLACE FUNCTION public.create_quick_decision(
  p_title      TEXT,
  p_category   TEXT,
  p_lock_time  TIMESTAMPTZ,
  p_user_id    UUID DEFAULT NULL,
  p_guest_id   TEXT DEFAULT NULL
)
RETURNS decisions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision    decisions%ROWTYPE;
  v_invite_code TEXT;
  v_attempts    INTEGER := 0;
BEGIN
  -- Exactly one identity must be provided.
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

  -- Validate guest_id format (must start with 'guest_').
  IF p_guest_id IS NOT NULL AND p_guest_id NOT LIKE 'guest_%' THEN
    RAISE EXCEPTION 'Invalid guest_id format: must start with "guest_"';
  END IF;

  -- Validate category.
  IF p_category NOT IN ('food', 'activity', 'trip', 'other') THEN
    RAISE EXCEPTION 'Invalid category: %', p_category;
  END IF;

  -- Generate a unique 6-character invite code, retrying on collision.
  LOOP
    v_invite_code := public.generate_invite_code();
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM decisions WHERE invite_code = v_invite_code
    );
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'Could not generate a unique invite code after 10 attempts';
    END IF;
  END LOOP;

  -- Insert the decision.
  -- type_label mirrors category so HomeScreen's unified card renderer works
  -- without a mode branch (it reads type_label for both modes).
  INSERT INTO decisions (
    mode,
    title,
    type_label,
    category,
    created_by,
    created_by_guest_id,
    lock_time,
    status,
    invite_code
  ) VALUES (
    'quick',
    p_title,
    p_category,   -- type_label = category for quick decisions
    p_category,
    p_user_id,
    p_guest_id,
    p_lock_time,
    'options',
    v_invite_code
  )
  RETURNING * INTO v_decision;

  -- Add creator as the first member with organizer role.
  INSERT INTO decision_members (decision_id, actor_user_id, actor_guest_id, role)
  VALUES (v_decision.id, p_user_id, p_guest_id, 'organizer');

  RETURN v_decision;
END;
$$;

-- ── join_quick_decision ───────────────────────────────────────────────────────
-- Looks up a decision by invite code and adds the actor as a member.
-- Idempotent: if the actor is already a member, returns the decision_id
-- without error. Called by decisionRepository.joinDecision().
CREATE OR REPLACE FUNCTION public.join_quick_decision(
  p_invite_code TEXT,
  p_user_id     UUID DEFAULT NULL,
  p_guest_id    TEXT DEFAULT NULL
)
RETURNS UUID   -- returns the resolved decision_id
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision decisions%ROWTYPE;
BEGIN
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

  IF p_guest_id IS NOT NULL AND p_guest_id NOT LIKE 'guest_%' THEN
    RAISE EXCEPTION 'Invalid guest_id format: must start with "guest_"';
  END IF;

  -- Case-insensitive invite code lookup.
  SELECT * INTO v_decision
  FROM decisions
  WHERE UPPER(invite_code) = UPPER(p_invite_code)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No decision found for invite code "%"', p_invite_code;
  END IF;

  -- Idempotent insert: ON CONFLICT DO NOTHING leverages the partial unique
  -- indexes defined above (uq_member_user / uq_member_guest).
  INSERT INTO decision_members (decision_id, actor_user_id, actor_guest_id, role)
  VALUES (v_decision.id, p_user_id, p_guest_id, 'member')
  ON CONFLICT DO NOTHING;

  RETURN v_decision.id;
END;
$$;

-- ── add_quick_option ──────────────────────────────────────────────────────────
-- Validates membership, lock state, and duplicate title before inserting.
-- Called by decisionRepository.addOption() for both users and guests.
CREATE OR REPLACE FUNCTION public.add_quick_option(
  p_decision_id UUID,
  p_title       TEXT,
  p_user_id     UUID DEFAULT NULL,
  p_guest_id    TEXT DEFAULT NULL
)
RETURNS options
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision   decisions%ROWTYPE;
  v_option     options%ROWTYPE;
  v_normalized TEXT;
BEGIN
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

  -- Normalize title for duplicate detection (matches MockDecisionRepository).
  v_normalized := LOWER(TRIM(regexp_replace(p_title, '\s+', ' ', 'g')));
  IF length(v_normalized) = 0 THEN
    RAISE EXCEPTION 'Option title cannot be empty';
  END IF;

  -- Lock the decision row so concurrent adds are serialized.
  SELECT * INTO v_decision
  FROM decisions WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found: %', p_decision_id;
  END IF;

  IF v_decision.status = 'locked' OR v_decision.lock_time <= NOW() THEN
    RAISE EXCEPTION 'Cannot add options: decision is locked';
  END IF;

  -- Verify actor is a member.
  IF NOT EXISTS (
    SELECT 1 FROM decision_members dm
    WHERE dm.decision_id = p_decision_id
      AND (
        (p_user_id  IS NOT NULL AND dm.actor_user_id  = p_user_id)  OR
        (p_guest_id IS NOT NULL AND dm.actor_guest_id = p_guest_id)
      )
  ) THEN
    RAISE EXCEPTION 'Actor must join the decision before adding options';
  END IF;

  -- Duplicate check (normalized comparison, same as MockDecisionRepository).
  IF EXISTS (
    SELECT 1 FROM options
    WHERE decision_id = p_decision_id
      AND LOWER(TRIM(regexp_replace(title, '\s+', ' ', 'g'))) = v_normalized
  ) THEN
    RAISE EXCEPTION 'Duplicate option: "%" already exists in this decision', TRIM(p_title);
  END IF;

  INSERT INTO options (decision_id, submitted_by_user_id, submitted_by_guest_id, title)
  VALUES (p_decision_id, p_user_id, p_guest_id, TRIM(p_title))
  RETURNING * INTO v_option;

  RETURN v_option;
END;
$$;

-- ── upsert_quick_vote ─────────────────────────────────────────────────────────
-- Increments (+1) or decrements (-1) a vote count for one (actor × option).
-- Returns the new count on this option after the mutation (0 = row deleted).
--
-- Business rules enforced atomically:
--   1. Decision must be status='options' and lock_time in the future.
--   2. Actor must be a member.
--   3. Total votes across all options cannot exceed MAX_QUICK_VOTES (5).
--   4. Count on a single option cannot go below 0 (graceful no-op).
--
-- Corresponds to decisionRepository.incrementVote / decrementVote.
CREATE OR REPLACE FUNCTION public.upsert_quick_vote(
  p_decision_id UUID,
  p_option_id   UUID,
  p_delta       INTEGER,          -- must be +1 or -1
  p_user_id     UUID DEFAULT NULL,
  p_guest_id    TEXT DEFAULT NULL
)
RETURNS INTEGER                   -- new count on this option (0 means no votes)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  MAX_VOTES    CONSTANT INTEGER := 5;
  v_decision   decisions%ROWTYPE;
  v_current    INTEGER;
  v_total_used INTEGER;
  v_new_count  INTEGER;
BEGIN
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

  IF p_delta NOT IN (1, -1) THEN
    RAISE EXCEPTION 'p_delta must be 1 or -1, got %', p_delta;
  END IF;

  -- Lock the decision row to prevent concurrent vote-limit bypass.
  SELECT * INTO v_decision
  FROM decisions WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found: %', p_decision_id;
  END IF;

  IF v_decision.status = 'locked' OR v_decision.lock_time <= NOW() THEN
    RAISE EXCEPTION 'Cannot vote: decision is locked';
  END IF;

  -- Verify option belongs to this decision.
  IF NOT EXISTS (
    SELECT 1 FROM options
    WHERE id = p_option_id AND decision_id = p_decision_id
  ) THEN
    RAISE EXCEPTION 'Option % not found in decision %', p_option_id, p_decision_id;
  END IF;

  -- Verify membership.
  IF NOT EXISTS (
    SELECT 1 FROM decision_members dm
    WHERE dm.decision_id = p_decision_id
      AND (
        (p_user_id  IS NOT NULL AND dm.actor_user_id  = p_user_id)  OR
        (p_guest_id IS NOT NULL AND dm.actor_guest_id = p_guest_id)
      )
  ) THEN
    RAISE EXCEPTION 'Actor is not a member of this decision';
  END IF;

  -- Get current count for this actor on this specific option.
  IF p_user_id IS NOT NULL THEN
    SELECT COALESCE(count, 0) INTO v_current
    FROM quick_votes
    WHERE decision_id = p_decision_id
      AND option_id   = p_option_id
      AND actor_user_id = p_user_id;
  ELSE
    SELECT COALESCE(count, 0) INTO v_current
    FROM quick_votes
    WHERE decision_id   = p_decision_id
      AND option_id     = p_option_id
      AND actor_guest_id = p_guest_id;
  END IF;

  v_current   := COALESCE(v_current, 0);
  v_new_count := v_current + p_delta;

  -- Graceful no-op: can't go below zero.
  IF v_new_count < 0 THEN
    RETURN 0;
  END IF;

  -- Enforce total-vote budget before adding.
  IF p_delta = 1 THEN
    IF p_user_id IS NOT NULL THEN
      SELECT COALESCE(SUM(count), 0) INTO v_total_used
      FROM quick_votes
      WHERE decision_id = p_decision_id AND actor_user_id = p_user_id;
    ELSE
      SELECT COALESCE(SUM(count), 0) INTO v_total_used
      FROM quick_votes
      WHERE decision_id = p_decision_id AND actor_guest_id = p_guest_id;
    END IF;

    IF v_total_used >= MAX_VOTES THEN
      RAISE EXCEPTION 'Vote limit reached: actor has used all % votes', MAX_VOTES;
    END IF;
  END IF;

  -- Delete the row when count reaches zero.
  IF v_new_count = 0 THEN
    IF p_user_id IS NOT NULL THEN
      DELETE FROM quick_votes
      WHERE decision_id = p_decision_id
        AND option_id   = p_option_id
        AND actor_user_id = p_user_id;
    ELSE
      DELETE FROM quick_votes
      WHERE decision_id   = p_decision_id
        AND option_id     = p_option_id
        AND actor_guest_id = p_guest_id;
    END IF;
    RETURN 0;
  END IF;

  -- Upsert. ON CONFLICT targets the partial unique indexes by replicating
  -- their exact (columns WHERE predicate) expression — Postgres requires
  -- this syntax for partial index conflict resolution.
  IF p_user_id IS NOT NULL THEN
    INSERT INTO quick_votes
      (decision_id, option_id, actor_user_id, count, updated_at)
    VALUES
      (p_decision_id, p_option_id, p_user_id, v_new_count, NOW())
    ON CONFLICT (decision_id, option_id, actor_user_id)
      WHERE actor_user_id IS NOT NULL
      DO UPDATE SET count = v_new_count, updated_at = NOW();
  ELSE
    INSERT INTO quick_votes
      (decision_id, option_id, actor_guest_id, count, updated_at)
    VALUES
      (p_decision_id, p_option_id, p_guest_id, v_new_count, NOW())
    ON CONFLICT (decision_id, option_id, actor_guest_id)
      WHERE actor_guest_id IS NOT NULL
      DO UPDATE SET count = v_new_count, updated_at = NOW();
  END IF;

  RETURN v_new_count;
END;
$$;

-- ── lock_expired_decisions ────────────────────────────────────────────────────
-- Flips decisions whose lock_time has passed to status='locked'.
-- Called by pg_cron (or a Supabase Edge Function on a cron schedule).
-- Returns the number of decisions locked in this run.
CREATE OR REPLACE FUNCTION public.lock_expired_decisions()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH updated AS (
    UPDATE decisions
    SET status = 'locked'
    WHERE status IN ('options', 'voting')
      AND lock_time <= NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;

-- ── get_quick_decision_state ──────────────────────────────────────────────────
-- Single-query read of a complete quick decision as seen by one actor.
-- Returns a JSON object matching the shape expected by buildLiveDecisionState()
-- in decisionTypes.ts. Using a function here:
--   (a) bypasses RLS so guests can read their own decisions, and
--   (b) consolidates the multi-table join into one round-trip.
--
-- The SupabaseDecisionRepository.getLiveDecisionState() implementation should
-- call this function via supabase.rpc('get_quick_decision_state', {...}).
CREATE OR REPLACE FUNCTION public.get_quick_decision_state(
  p_decision_id UUID,
  p_user_id     UUID DEFAULT NULL,
  p_guest_id    TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision   decisions%ROWTYPE;
  v_is_locked  BOOLEAN;
BEGIN
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

  -- Verify actor is a member before returning any data.
  IF NOT EXISTS (
    SELECT 1 FROM decision_members dm
    WHERE dm.decision_id = p_decision_id
      AND (
        (p_user_id  IS NOT NULL AND dm.actor_user_id  = p_user_id)  OR
        (p_guest_id IS NOT NULL AND dm.actor_guest_id = p_guest_id)
      )
  ) THEN
    RAISE EXCEPTION 'Actor is not a member of decision %', p_decision_id;
  END IF;

  SELECT * INTO v_decision FROM decisions WHERE id = p_decision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found: %', p_decision_id;
  END IF;

  -- Auto-lock if deadline has passed (same logic as MockDecisionRepository
  -- applyDeadlineIfExpired).
  IF v_decision.status != 'locked' AND v_decision.lock_time <= NOW() THEN
    UPDATE decisions SET status = 'locked' WHERE id = p_decision_id;
    v_decision.status := 'locked';
  END IF;

  RETURN json_build_object(
    'decision', json_build_object(
      'id',          v_decision.id,
      'title',       v_decision.title,
      'category',    v_decision.category,
      'lockTime',    v_decision.lock_time,
      'status',      v_decision.status,
      'inviteCode',  v_decision.invite_code,
      'createdAt',   v_decision.created_at,
      'createdBy',   COALESCE(v_decision.created_by::text, v_decision.created_by_guest_id)
    ),
    'members', (
      SELECT json_agg(json_build_object(
        'id',            dm.id,
        'decisionId',    dm.decision_id,
        'actorUserId',   dm.actor_user_id,
        'actorGuestId',  dm.actor_guest_id,
        'joinedAt',      dm.joined_at
      ))
      FROM decision_members dm
      WHERE dm.decision_id = p_decision_id
    ),
    'options', (
      SELECT json_agg(
        json_build_object(
          'id',                  o.id,
          'decisionId',          o.decision_id,
          'title',               o.title,
          'voteTotal',           COALESCE(total.total_count, 0),
          'myVoteCount',         COALESCE(mine.my_count, 0),
          'createdAt',           o.created_at,
          'submittedByUserId',   o.submitted_by_user_id,
          'submittedByGuestId',  o.submitted_by_guest_id
        )
        ORDER BY COALESCE(total.total_count, 0) DESC, o.created_at ASC
      )
      FROM options o
      LEFT JOIN (
        SELECT option_id, SUM(count) AS total_count
        FROM quick_votes
        WHERE decision_id = p_decision_id
        GROUP BY option_id
      ) total ON total.option_id = o.id
      LEFT JOIN (
        SELECT option_id, SUM(count) AS my_count
        FROM quick_votes
        WHERE decision_id = p_decision_id
          AND (
            (p_user_id  IS NOT NULL AND actor_user_id  = p_user_id)  OR
            (p_guest_id IS NOT NULL AND actor_guest_id = p_guest_id)
          )
        GROUP BY option_id
      ) mine ON mine.option_id = o.id
      WHERE o.decision_id = p_decision_id
    )
  );
END;
$$;

-- =============================================================================
-- GRANTS
-- SECURITY DEFINER functions run as the function owner (usually postgres).
-- Explicit EXECUTE grants let anon-role callers (guests) and authenticated
-- users invoke them. No table-level access is granted to anon.
-- =============================================================================
GRANT EXECUTE ON FUNCTION public.create_quick_decision(TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.join_quick_decision(TEXT, UUID, TEXT)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.add_quick_option(UUID, TEXT, UUID, TEXT)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_quick_vote(UUID, UUID, INTEGER, UUID, TEXT)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_quick_decision_state(UUID, UUID, TEXT)
  TO anon, authenticated;

-- lock_expired_decisions is called by pg_cron with service role — no grant needed.
