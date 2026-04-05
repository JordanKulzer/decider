-- =============================================================================
-- 010_closes_at.sql
--
-- Renames lock_time → closes_at on the decisions table and updates every
-- function, policy, and index that references the column.
--
-- Rationale: "closes_at" expresses intent (when the decision closes) whereas
-- "lock_time" was an implementation detail. Using one canonical field name
-- across all layers eliminates ambiguity.
--
-- Objects updated in this migration:
--   • decisions.lock_time column → closes_at
--   • idx_decisions_lock_open index → idx_decisions_closes_open
--   • "Authenticated members can upsert own quick votes" RLS policy (quick_votes)
--   • create_quick_decision   — parameter p_lock_time → p_closes_at
--   • add_quick_option        — closes_at check
--   • upsert_quick_vote       — closes_at check
--   • lock_expired_decisions  — closes_at WHERE clause
--   • get_quick_decision_state — closes_at check + JSON output key
--   • extend_quick_deadline    — closes_at column read/write + return key
--   • end_quick_decision_early — closes_at column write
-- =============================================================================


-- ── 1. Column rename ──────────────────────────────────────────────────────────
ALTER TABLE decisions RENAME COLUMN lock_time TO closes_at;


-- ── 2. Index ──────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_decisions_lock_open;
CREATE INDEX IF NOT EXISTS idx_decisions_closes_open
  ON decisions(closes_at)
  WHERE status != 'locked';


-- ── 3. RLS policy on quick_votes (references closes_at) ──────────────────────
DROP POLICY IF EXISTS "Authenticated members can upsert own quick votes" ON quick_votes;

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
        AND d.closes_at > NOW()
    )
  );


-- ── 4. create_quick_decision ──────────────────────────────────────────────────
-- Parameter renamed: p_lock_time → p_closes_at.
DROP FUNCTION IF EXISTS public.create_quick_decision(TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_quick_decision(
  p_title        TEXT,
  p_category     TEXT,
  p_closes_at    TIMESTAMPTZ,
  p_user_id      UUID    DEFAULT NULL,
  p_guest_id     TEXT    DEFAULT NULL,
  p_display_name TEXT    DEFAULT NULL
)
RETURNS decisions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision     decisions%ROWTYPE;
  v_invite_code  TEXT;
  v_attempts     INTEGER := 0;
  v_display_name TEXT;
BEGIN
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

  IF p_guest_id IS NOT NULL AND p_guest_id NOT LIKE 'guest_%' THEN
    RAISE EXCEPTION 'Invalid guest_id format: must start with "guest_"';
  END IF;

  IF p_category NOT IN ('food', 'activity', 'trip', 'other') THEN
    RAISE EXCEPTION 'Invalid category: %', p_category;
  END IF;

  IF p_guest_id IS NOT NULL THEN
    IF TRIM(COALESCE(p_display_name, '')) = '' THEN
      RAISE EXCEPTION 'display_name is required for guests';
    END IF;
    v_display_name := TRIM(p_display_name);
  ELSE
    IF p_display_name IS NOT NULL THEN
      v_display_name := TRIM(p_display_name);
    ELSE
      SELECT username INTO v_display_name FROM users WHERE id = p_user_id;
    END IF;
  END IF;

  LOOP
    v_invite_code := public.generate_invite_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM decisions WHERE invite_code = v_invite_code);
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'Could not generate a unique invite code after 10 attempts';
    END IF;
  END LOOP;

  INSERT INTO decisions (
    mode, title, type_label, category,
    created_by, created_by_guest_id,
    closes_at, status, invite_code
  ) VALUES (
    'quick', p_title, p_category, p_category,
    p_user_id, p_guest_id,
    p_closes_at, 'options', v_invite_code
  )
  RETURNING * INTO v_decision;

  INSERT INTO decision_members
    (decision_id, actor_user_id, actor_guest_id, role, display_name)
  VALUES
    (v_decision.id, p_user_id, p_guest_id, 'organizer', v_display_name);

  RETURN v_decision;
END;
$$;


-- ── 5. add_quick_option ───────────────────────────────────────────────────────
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

  v_normalized := LOWER(TRIM(regexp_replace(p_title, '\s+', ' ', 'g')));
  IF length(v_normalized) = 0 THEN
    RAISE EXCEPTION 'Option title cannot be empty';
  END IF;

  SELECT * INTO v_decision FROM decisions WHERE id = p_decision_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found: %', p_decision_id;
  END IF;

  IF v_decision.status = 'locked' OR v_decision.closes_at <= NOW() THEN
    RAISE EXCEPTION 'Cannot add options: decision is locked';
  END IF;

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


-- ── 6. upsert_quick_vote ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_quick_vote(
  p_decision_id UUID,
  p_option_id   UUID,
  p_delta       INTEGER,
  p_user_id     UUID DEFAULT NULL,
  p_guest_id    TEXT DEFAULT NULL
)
RETURNS INTEGER
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

  SELECT * INTO v_decision FROM decisions WHERE id = p_decision_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found: %', p_decision_id;
  END IF;

  IF v_decision.status = 'locked' OR v_decision.closes_at <= NOW() THEN
    RAISE EXCEPTION 'Cannot vote: decision is locked';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM options WHERE id = p_option_id AND decision_id = p_decision_id
  ) THEN
    RAISE EXCEPTION 'Option % not found in decision %', p_option_id, p_decision_id;
  END IF;

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

  IF p_user_id IS NOT NULL THEN
    SELECT COALESCE(count, 0) INTO v_current
    FROM quick_votes
    WHERE decision_id = p_decision_id AND option_id = p_option_id
      AND actor_user_id = p_user_id;
  ELSE
    SELECT COALESCE(count, 0) INTO v_current
    FROM quick_votes
    WHERE decision_id = p_decision_id AND option_id = p_option_id
      AND actor_guest_id = p_guest_id;
  END IF;

  v_current   := COALESCE(v_current, 0);
  v_new_count := v_current + p_delta;

  IF v_new_count < 0 THEN RETURN 0; END IF;

  IF p_delta = 1 THEN
    IF p_user_id IS NOT NULL THEN
      SELECT COALESCE(SUM(count), 0) INTO v_total_used
      FROM quick_votes WHERE decision_id = p_decision_id AND actor_user_id = p_user_id;
    ELSE
      SELECT COALESCE(SUM(count), 0) INTO v_total_used
      FROM quick_votes WHERE decision_id = p_decision_id AND actor_guest_id = p_guest_id;
    END IF;
    IF v_total_used >= MAX_VOTES THEN
      RAISE EXCEPTION 'Vote limit reached: actor has used all % votes', MAX_VOTES;
    END IF;
  END IF;

  IF v_new_count = 0 THEN
    IF p_user_id IS NOT NULL THEN
      DELETE FROM quick_votes
      WHERE decision_id = p_decision_id AND option_id = p_option_id AND actor_user_id = p_user_id;
    ELSE
      DELETE FROM quick_votes
      WHERE decision_id = p_decision_id AND option_id = p_option_id AND actor_guest_id = p_guest_id;
    END IF;
    RETURN 0;
  END IF;

  IF p_user_id IS NOT NULL THEN
    INSERT INTO quick_votes (decision_id, option_id, actor_user_id, count, updated_at)
    VALUES (p_decision_id, p_option_id, p_user_id, v_new_count, NOW())
    ON CONFLICT (decision_id, option_id, actor_user_id) WHERE actor_user_id IS NOT NULL
      DO UPDATE SET count = v_new_count, updated_at = NOW();
  ELSE
    INSERT INTO quick_votes (decision_id, option_id, actor_guest_id, count, updated_at)
    VALUES (p_decision_id, p_option_id, p_guest_id, v_new_count, NOW())
    ON CONFLICT (decision_id, option_id, actor_guest_id) WHERE actor_guest_id IS NOT NULL
      DO UPDATE SET count = v_new_count, updated_at = NOW();
  END IF;

  RETURN v_new_count;
END;
$$;


-- ── 7. lock_expired_decisions ─────────────────────────────────────────────────
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
      AND closes_at <= NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;


-- ── 8. get_quick_decision_state ───────────────────────────────────────────────
-- JSON output key renamed: lockTime → closesAt
DROP FUNCTION IF EXISTS public.get_quick_decision_state(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.get_quick_decision_state(
  p_decision_id UUID,
  p_user_id     UUID DEFAULT NULL,
  p_guest_id    TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision decisions%ROWTYPE;
BEGIN
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

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

  IF v_decision.status != 'locked' AND v_decision.closes_at <= NOW() THEN
    UPDATE decisions SET status = 'locked' WHERE id = p_decision_id;
    v_decision.status := 'locked';
  END IF;

  RETURN json_build_object(
    'decision', json_build_object(
      'id',         v_decision.id,
      'title',      v_decision.title,
      'category',   v_decision.category,
      'closesAt',   v_decision.closes_at,
      'status',     v_decision.status,
      'inviteCode', v_decision.invite_code,
      'createdAt',  v_decision.created_at,
      'createdBy',  COALESCE(v_decision.created_by::text, v_decision.created_by_guest_id)
    ),
    'members', (
      SELECT json_agg(json_build_object(
        'id',           dm.id,
        'decisionId',   dm.decision_id,
        'actorUserId',  dm.actor_user_id,
        'actorGuestId', dm.actor_guest_id,
        'joinedAt',     dm.joined_at,
        'displayName',  dm.display_name
      ))
      FROM decision_members dm
      WHERE dm.decision_id = p_decision_id
    ),
    'options', (
      SELECT json_agg(
        json_build_object(
          'id',               o.id,
          'decisionId',       o.decision_id,
          'title',            o.title,
          'voteTotal',        COALESCE(total.total_count, 0),
          'myVoteCount',      COALESCE(mine.my_count, 0),
          'createdAt',        o.created_at,
          'submittedByUserId',  o.submitted_by_user_id,
          'submittedByGuestId', o.submitted_by_guest_id
        )
        ORDER BY COALESCE(total.total_count, 0) DESC, o.created_at ASC
      )
      FROM options o
      LEFT JOIN (
        SELECT option_id, SUM(count) AS total_count
        FROM quick_votes WHERE decision_id = p_decision_id GROUP BY option_id
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


-- ── 9. extend_quick_deadline ──────────────────────────────────────────────────
-- Return key renamed: newLockTime → newClosesAt
DROP FUNCTION IF EXISTS public.extend_quick_deadline(UUID, INTEGER, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.extend_quick_deadline(
  p_decision_id    UUID,
  p_minutes_to_add INTEGER,
  p_user_id        UUID DEFAULT NULL,
  p_guest_id       TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision decisions%ROWTYPE;
  v_new_closes TIMESTAMPTZ;
BEGIN
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

  IF p_minutes_to_add <= 0 THEN
    RAISE EXCEPTION 'minutesToAdd must be greater than 0, got %', p_minutes_to_add;
  END IF;

  SELECT * INTO v_decision FROM decisions WHERE id = p_decision_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found: %', p_decision_id;
  END IF;

  IF v_decision.status = 'locked' OR v_decision.closes_at <= NOW() THEN
    RAISE EXCEPTION 'Cannot extend: decision is already locked';
  END IF;

  IF p_user_id IS NOT NULL THEN
    IF v_decision.created_by IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Only the creator can extend the deadline';
    END IF;
  ELSE
    IF v_decision.created_by_guest_id IS DISTINCT FROM p_guest_id THEN
      RAISE EXCEPTION 'Only the creator can extend the deadline';
    END IF;
  END IF;

  v_new_closes := v_decision.closes_at + (p_minutes_to_add * INTERVAL '1 minute');

  UPDATE decisions SET closes_at = v_new_closes WHERE id = p_decision_id;

  RETURN json_build_object('newClosesAt', v_new_closes);
END;
$$;


-- ── 10. end_quick_decision_early ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.end_quick_decision_early(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.end_quick_decision_early(
  p_decision_id UUID,
  p_user_id     UUID DEFAULT NULL,
  p_guest_id    TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision decisions%ROWTYPE;
BEGIN
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

  SELECT * INTO v_decision FROM decisions WHERE id = p_decision_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found: %', p_decision_id;
  END IF;

  IF v_decision.status = 'locked' OR v_decision.closes_at <= NOW() THEN
    RAISE EXCEPTION 'Decision is already locked';
  END IF;

  IF p_user_id IS NOT NULL THEN
    IF v_decision.created_by IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Only the creator can end the decision early';
    END IF;
  ELSE
    IF v_decision.created_by_guest_id IS DISTINCT FROM p_guest_id THEN
      RAISE EXCEPTION 'Only the creator can end the decision early';
    END IF;
  END IF;

  UPDATE decisions SET status = 'locked', closes_at = NOW()
  WHERE id = p_decision_id;
END;
$$;


-- =============================================================================
-- GRANTS (re-grant after DROP/CREATE)
-- =============================================================================
GRANT EXECUTE ON FUNCTION public.create_quick_decision(TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.add_quick_option(UUID, TEXT, UUID, TEXT)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_quick_vote(UUID, UUID, INTEGER, UUID, TEXT)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_quick_decision_state(UUID, UUID, TEXT)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.extend_quick_deadline(UUID, INTEGER, UUID, TEXT)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.end_quick_decision_early(UUID, UUID, TEXT)
  TO anon, authenticated;
