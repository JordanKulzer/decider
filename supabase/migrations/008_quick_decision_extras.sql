-- =============================================================================
-- 008_quick_decision_extras.sql
--
-- Adds / updates SECURITY DEFINER functions needed by SupabaseDecisionRepository:
--
--   • join_quick_decision        — updated to return JSON {decisionId, alreadyMember}
--   • join_quick_decision_by_id  — join using a decision UUID instead of invite code
--   • extend_quick_deadline      — creator extends lock_time
--   • end_quick_decision_early   — creator locks decision immediately
--   • get_quick_decision_state   — updated to include display_name in members
--
-- Why update join_quick_decision's return type?
-- The old signature returned a bare UUID. The TypeScript repository now needs to
-- know whether the actor was already a member so JoinDecisionScreen can decide
-- whether to show the join prompt or navigate directly. Dropping and recreating
-- is necessary because Postgres treats return-type changes as a new function.
-- =============================================================================


-- ── join_quick_decision (updated — returns JSON) ──────────────────────────────
-- Drops the old UUID-returning signature first.
DROP FUNCTION IF EXISTS public.join_quick_decision(TEXT, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.join_quick_decision(
  p_invite_code  TEXT,
  p_user_id      UUID    DEFAULT NULL,
  p_guest_id     TEXT    DEFAULT NULL,
  p_display_name TEXT    DEFAULT NULL
)
RETURNS JSON   -- { "decisionId": UUID, "alreadyMember": BOOLEAN }
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision      decisions%ROWTYPE;
  v_display_name  TEXT;
  v_already       BOOLEAN := false;
BEGIN
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

  IF p_guest_id IS NOT NULL AND p_guest_id NOT LIKE 'guest_%' THEN
    RAISE EXCEPTION 'Invalid guest_id format: must start with "guest_"';
  END IF;

  -- Resolve display_name (same logic as create_quick_decision in 004).
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

  SELECT * INTO v_decision
  FROM decisions
  WHERE UPPER(invite_code) = UPPER(p_invite_code)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No decision found for invite code "%"', p_invite_code;
  END IF;

  -- Check existing membership before inserting.
  IF p_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM decision_members
      WHERE decision_id = v_decision.id AND actor_user_id = p_user_id
    ) INTO v_already;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM decision_members
      WHERE decision_id = v_decision.id AND actor_guest_id = p_guest_id
    ) INTO v_already;
  END IF;

  IF NOT v_already THEN
    IF p_user_id IS NOT NULL THEN
      INSERT INTO decision_members (decision_id, actor_user_id, role, display_name)
      VALUES (v_decision.id, p_user_id, 'member', v_display_name)
      ON CONFLICT (decision_id, actor_user_id) WHERE actor_user_id IS NOT NULL
        DO UPDATE SET display_name = EXCLUDED.display_name
        WHERE decision_members.display_name IS DISTINCT FROM EXCLUDED.display_name;
    ELSE
      INSERT INTO decision_members (decision_id, actor_guest_id, role, display_name)
      VALUES (v_decision.id, p_guest_id, 'member', v_display_name)
      ON CONFLICT (decision_id, actor_guest_id) WHERE actor_guest_id IS NOT NULL
        DO UPDATE SET display_name = EXCLUDED.display_name
        WHERE decision_members.display_name IS DISTINCT FROM EXCLUDED.display_name;
    END IF;
  END IF;

  RETURN json_build_object(
    'decisionId',   v_decision.id,
    'alreadyMember', v_already
  );
END;
$$;


-- ── join_quick_decision_by_id ─────────────────────────────────────────────────
-- Joins a decision using its UUID. Used when the caller already has the ID
-- (e.g., deep-link navigation or re-joining after creation).
CREATE OR REPLACE FUNCTION public.join_quick_decision_by_id(
  p_decision_id  UUID,
  p_user_id      UUID    DEFAULT NULL,
  p_guest_id     TEXT    DEFAULT NULL,
  p_display_name TEXT    DEFAULT NULL
)
RETURNS JSON   -- { "decisionId": UUID, "alreadyMember": BOOLEAN }
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_display_name  TEXT;
  v_already       BOOLEAN := false;
BEGIN
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

  IF p_guest_id IS NOT NULL AND p_guest_id NOT LIKE 'guest_%' THEN
    RAISE EXCEPTION 'Invalid guest_id format: must start with "guest_"';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM decisions WHERE id = p_decision_id) THEN
    RAISE EXCEPTION 'Decision not found: %', p_decision_id;
  END IF;

  -- Resolve display_name.
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

  -- Check existing membership.
  IF p_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM decision_members
      WHERE decision_id = p_decision_id AND actor_user_id = p_user_id
    ) INTO v_already;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM decision_members
      WHERE decision_id = p_decision_id AND actor_guest_id = p_guest_id
    ) INTO v_already;
  END IF;

  IF NOT v_already THEN
    IF p_user_id IS NOT NULL THEN
      INSERT INTO decision_members (decision_id, actor_user_id, role, display_name)
      VALUES (p_decision_id, p_user_id, 'member', v_display_name)
      ON CONFLICT (decision_id, actor_user_id) WHERE actor_user_id IS NOT NULL
        DO UPDATE SET display_name = EXCLUDED.display_name
        WHERE decision_members.display_name IS DISTINCT FROM EXCLUDED.display_name;
    ELSE
      INSERT INTO decision_members (decision_id, actor_guest_id, role, display_name)
      VALUES (p_decision_id, p_guest_id, 'member', v_display_name)
      ON CONFLICT (decision_id, actor_guest_id) WHERE actor_guest_id IS NOT NULL
        DO UPDATE SET display_name = EXCLUDED.display_name
        WHERE decision_members.display_name IS DISTINCT FROM EXCLUDED.display_name;
    END IF;
  END IF;

  RETURN json_build_object(
    'decisionId',    p_decision_id,
    'alreadyMember', v_already
  );
END;
$$;


-- ── extend_quick_deadline ─────────────────────────────────────────────────────
-- Adds minutes to the current lock_time. Only the creator may call this.
CREATE OR REPLACE FUNCTION public.extend_quick_deadline(
  p_decision_id    UUID,
  p_minutes_to_add INTEGER,
  p_user_id        UUID DEFAULT NULL,
  p_guest_id       TEXT DEFAULT NULL
)
RETURNS JSON   -- { "newLockTime": TIMESTAMPTZ }
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision decisions%ROWTYPE;
  v_new_lock TIMESTAMPTZ;
BEGIN
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

  IF p_minutes_to_add <= 0 THEN
    RAISE EXCEPTION 'minutesToAdd must be greater than 0, got %', p_minutes_to_add;
  END IF;

  SELECT * INTO v_decision
  FROM decisions WHERE id = p_decision_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found: %', p_decision_id;
  END IF;

  IF v_decision.status = 'locked' OR v_decision.lock_time <= NOW() THEN
    RAISE EXCEPTION 'Cannot extend: decision is already locked';
  END IF;

  -- Verify caller is the creator.
  IF p_user_id IS NOT NULL THEN
    IF v_decision.created_by IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Only the creator can extend the deadline';
    END IF;
  ELSE
    IF v_decision.created_by_guest_id IS DISTINCT FROM p_guest_id THEN
      RAISE EXCEPTION 'Only the creator can extend the deadline';
    END IF;
  END IF;

  v_new_lock := v_decision.lock_time + (p_minutes_to_add * INTERVAL '1 minute');

  UPDATE decisions SET lock_time = v_new_lock WHERE id = p_decision_id;

  RETURN json_build_object('newLockTime', v_new_lock);
END;
$$;


-- ── end_quick_decision_early ──────────────────────────────────────────────────
-- Immediately locks the decision. Only the creator may call this.
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

  SELECT * INTO v_decision
  FROM decisions WHERE id = p_decision_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found: %', p_decision_id;
  END IF;

  IF v_decision.status = 'locked' OR v_decision.lock_time <= NOW() THEN
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

  UPDATE decisions
  SET status = 'locked', lock_time = NOW()
  WHERE id = p_decision_id;
END;
$$;


-- ── get_quick_decision_state (updated — adds display_name to members) ─────────
DROP FUNCTION IF EXISTS public.get_quick_decision_state(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.get_quick_decision_state(
  p_decision_id UUID,
  p_user_id     UUID DEFAULT NULL,
  p_guest_id    TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision  decisions%ROWTYPE;
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

  -- Auto-lock if deadline has passed.
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
        'joinedAt',      dm.joined_at,
        'displayName',   dm.display_name
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
-- =============================================================================
GRANT EXECUTE ON FUNCTION public.join_quick_decision(TEXT, UUID, TEXT, TEXT)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.join_quick_decision_by_id(UUID, UUID, TEXT, TEXT)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.extend_quick_deadline(UUID, INTEGER, UUID, TEXT)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.end_quick_decision_early(UUID, UUID, TEXT)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_quick_decision_state(UUID, UUID, TEXT)
  TO anon, authenticated;
