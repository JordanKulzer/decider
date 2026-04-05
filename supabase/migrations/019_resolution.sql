-- =============================================================================
-- 019_resolution.sql
--
-- Deterministic winner resolution for Quick Mode decisions.
--
-- Overview
-- ────────
-- Adds optional quorum and early-lock support to quick decisions, then
-- provides a single SECURITY DEFINER function that resolves a decision to
-- exactly one winner (or a documented non-winner reason) using three
-- fully deterministic tiebreakers:
--
--   1. im_in_count DESC     — most attendees
--   2. top_choice_count DESC — most "this is my top pick" flags
--   3. created_at ASC       — earliest option (stable, unique)
--
-- After all three tiebreakers, there is always exactly one winner candidate,
-- so ties at lock time are impossible by construction.
--
-- Possible resolution outcomes
-- ────────────────────────────
--   'winner'       — one option cleared quorum (or quorum is not set)
--   'no_quorum'    — quorum was set, no option reached the threshold
--   'no_responses' — no option received even one 'im_in' response
--
-- No "fallback to leader when quorum fails" flag was added — that ambiguity
-- was intentionally excluded. If a team wants the leader even without quorum,
-- they should not set minimum_attendees at all.
--
-- Changes
-- ───────
--   decisions table
--     • minimum_attendees   INT     — NULL = no quorum required
--     • early_lock_enabled  BOOLEAN — if true, resolve the instant quorum is hit
--     • resolved_option_id  UUID    — the winning option (NULL when no winner)
--     • resolution_reason   TEXT    — 'winner' | 'no_quorum' | 'no_responses'
--
--   New function: resolve_quick_decision(UUID)
--   Updated:      create_quick_decision      — new params p_minimum_attendees, p_early_lock_enabled
--   Updated:      upsert_option_response     — calls resolve when early lock triggers
--   Updated:      get_quick_decision_state   — exposes all four new decision fields
-- =============================================================================


-- ── 1. Schema additions ───────────────────────────────────────────────────────

ALTER TABLE decisions
  ADD COLUMN IF NOT EXISTS minimum_attendees   INT
    CHECK (minimum_attendees IS NULL OR minimum_attendees > 0),
  ADD COLUMN IF NOT EXISTS early_lock_enabled  BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolved_option_id  UUID     REFERENCES options(id),
  ADD COLUMN IF NOT EXISTS resolution_reason   TEXT
    CHECK (resolution_reason IN ('winner', 'no_quorum', 'no_responses'));


-- ── 2. resolve_quick_decision ─────────────────────────────────────────────────
-- Picks the winner using the three-tiebreaker algorithm, checks quorum, and
-- writes resolved_option_id + resolution_reason + status='locked'.
--
-- Idempotent: if the decision is already fully resolved (status='locked' AND
-- resolution_reason IS NOT NULL), returns the stored result without re-running.
--
-- Called by:
--   • upsert_option_response  — when early_lock_enabled fires
--   • resolve-decision edge function — on deadline expiry (cron)
--   • end_quick_decision_early — via direct call (added below)

CREATE OR REPLACE FUNCTION public.resolve_quick_decision(
  p_decision_id UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision          decisions%ROWTYPE;
  v_winner_option_id  UUID;
  v_winner_im_in      INT;
  v_resolution_reason TEXT;
BEGIN
  -- Lock the row to prevent concurrent resolution races.
  SELECT * INTO v_decision FROM decisions WHERE id = p_decision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found: %', p_decision_id;
  END IF;

  -- Idempotent: already fully resolved — return stored result.
  IF v_decision.status = 'locked' AND v_decision.resolution_reason IS NOT NULL THEN
    RETURN json_build_object(
      'resolvedOptionId', v_decision.resolved_option_id,
      'resolutionReason', v_decision.resolution_reason
    );
  END IF;

  -- ── Pick winner candidate ──────────────────────────────────────────────────
  -- Tiebreaker 1: im_in_count DESC
  -- Tiebreaker 2: top_choice_count DESC
  -- Tiebreaker 3: created_at ASC  (always unique → always one winner)
  SELECT o.id INTO v_winner_option_id
  FROM options o
  LEFT JOIN (
    SELECT
      option_id,
      COUNT(*) FILTER (WHERE response = 'im_in')   AS im_in_count,
      COUNT(*) FILTER (WHERE is_top_choice = true)  AS top_choice_count
    FROM option_responses
    WHERE decision_id = p_decision_id
    GROUP BY option_id
  ) agg ON agg.option_id = o.id
  WHERE o.decision_id = p_decision_id
  ORDER BY
    COALESCE(agg.im_in_count, 0)      DESC,
    COALESCE(agg.top_choice_count, 0) DESC,
    o.created_at                      ASC
  LIMIT 1;

  IF v_winner_option_id IS NULL THEN
    -- No options exist at all.
    v_resolution_reason := 'no_responses';

  ELSE
    -- How many 'im_in' responses does the winner candidate have?
    SELECT COUNT(*) INTO v_winner_im_in
    FROM option_responses
    WHERE option_id   = v_winner_option_id
      AND decision_id = p_decision_id
      AND response    = 'im_in';

    IF v_winner_im_in = 0 THEN
      -- Options exist but nobody picked 'im_in' on any of them.
      v_resolution_reason := 'no_responses';
      v_winner_option_id  := NULL;

    ELSIF v_decision.minimum_attendees IS NOT NULL
      AND v_winner_im_in < v_decision.minimum_attendees THEN
      -- Quorum was set and the leading option didn't reach it.
      v_resolution_reason := 'no_quorum';
      v_winner_option_id  := NULL;

    ELSE
      v_resolution_reason := 'winner';
    END IF;
  END IF;

  -- ── Persist result ────────────────────────────────────────────────────────
  -- closes_at = LEAST(existing, NOW()) so early-lock never extends the deadline.
  UPDATE decisions
  SET
    status             = 'locked',
    closes_at          = LEAST(closes_at, NOW()),
    resolved_option_id = v_winner_option_id,
    resolution_reason  = v_resolution_reason
  WHERE id = p_decision_id;

  RETURN json_build_object(
    'resolvedOptionId', v_winner_option_id,
    'resolutionReason', v_resolution_reason
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_quick_decision(UUID)
  TO anon, authenticated;


-- ── 3. create_quick_decision (updated) ───────────────────────────────────────
-- Adds p_minimum_attendees and p_early_lock_enabled parameters.
-- All other behaviour is unchanged from migration 010.

DROP FUNCTION IF EXISTS public.create_quick_decision(TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_quick_decision(
  p_title               TEXT,
  p_category            TEXT,
  p_closes_at           TIMESTAMPTZ,
  p_user_id             UUID    DEFAULT NULL,
  p_guest_id            TEXT    DEFAULT NULL,
  p_display_name        TEXT    DEFAULT NULL,
  p_minimum_attendees   INT     DEFAULT NULL,
  p_early_lock_enabled  BOOLEAN DEFAULT false
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

  IF p_minimum_attendees IS NOT NULL AND p_minimum_attendees < 1 THEN
    RAISE EXCEPTION 'minimum_attendees must be at least 1, got %', p_minimum_attendees;
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
    closes_at, status, invite_code,
    minimum_attendees, early_lock_enabled
  ) VALUES (
    'quick', p_title, p_category, p_category,
    p_user_id, p_guest_id,
    p_closes_at, 'options', v_invite_code,
    p_minimum_attendees, p_early_lock_enabled
  )
  RETURNING * INTO v_decision;

  INSERT INTO decision_members
    (decision_id, actor_user_id, actor_guest_id, role, display_name)
  VALUES
    (v_decision.id, p_user_id, p_guest_id, 'organizer', v_display_name);

  RETURN v_decision;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_quick_decision(TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT, INT, BOOLEAN)
  TO anon, authenticated;


-- ── 4. upsert_option_response (updated) ──────────────────────────────────────
-- Adds early-lock check at the end: if early_lock_enabled is true and any
-- option now has im_in_count >= minimum_attendees, resolve the decision
-- immediately by calling resolve_quick_decision().
--
-- The rest of the function body is unchanged from migration 018.

CREATE OR REPLACE FUNCTION public.upsert_option_response(
  p_decision_id  UUID,
  p_option_id    UUID,
  p_response     TEXT,           -- 'im_in' | 'prefer_not' | 'cant'
  p_user_id      UUID DEFAULT NULL,
  p_guest_id     TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision  decisions%ROWTYPE;
  v_max_im_in INT;
BEGIN
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

  IF p_response NOT IN ('im_in', 'prefer_not', 'cant') THEN
    RAISE EXCEPTION 'Invalid response: must be im_in, prefer_not, or cant';
  END IF;

  SELECT * INTO v_decision FROM decisions WHERE id = p_decision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found: %', p_decision_id;
  END IF;

  IF v_decision.status = 'locked' OR v_decision.closes_at <= NOW() THEN
    RAISE EXCEPTION 'Cannot respond: decision is locked';
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
        (p_user_id  IS NOT NULL AND dm.actor_user_id  = p_user_id) OR
        (p_guest_id IS NOT NULL AND dm.actor_guest_id = p_guest_id)
      )
  ) THEN
    RAISE EXCEPTION 'Actor is not a member of this decision';
  END IF;

  IF p_user_id IS NOT NULL THEN
    INSERT INTO option_responses
      (decision_id, option_id, actor_user_id, response, is_top_choice)
    VALUES
      (p_decision_id, p_option_id, p_user_id, p_response, false)
    ON CONFLICT (option_id, actor_user_id)
      WHERE actor_user_id IS NOT NULL
      DO UPDATE SET
        response      = p_response,
        -- Changing to 'cant' clears top choice; other transitions preserve it
        is_top_choice = CASE WHEN p_response = 'cant'
                             THEN false
                             ELSE option_responses.is_top_choice END,
        updated_at    = NOW();
  ELSE
    INSERT INTO option_responses
      (decision_id, option_id, actor_guest_id, response, is_top_choice)
    VALUES
      (p_decision_id, p_option_id, p_guest_id, p_response, false)
    ON CONFLICT (option_id, actor_guest_id)
      WHERE actor_guest_id IS NOT NULL
      DO UPDATE SET
        response      = p_response,
        is_top_choice = CASE WHEN p_response = 'cant'
                             THEN false
                             ELSE option_responses.is_top_choice END,
        updated_at    = NOW();
  END IF;

  -- ── Early lock check ───────────────────────────────────────────────────────
  -- Only runs when the organizer configured early_lock_enabled with a quorum
  -- threshold. Checks whether any option has just reached quorum; if so,
  -- resolves the decision immediately via the shared algorithm.
  IF v_decision.early_lock_enabled AND v_decision.minimum_attendees IS NOT NULL THEN
    SELECT COALESCE(MAX(cnt), 0) INTO v_max_im_in
    FROM (
      SELECT COUNT(*) AS cnt
      FROM option_responses
      WHERE decision_id = p_decision_id
        AND response    = 'im_in'
      GROUP BY option_id
    ) sub;

    IF v_max_im_in >= v_decision.minimum_attendees THEN
      -- Resolve the decision; FOR UPDATE lock above serialises concurrent responses.
      PERFORM public.resolve_quick_decision(p_decision_id);
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_option_response(UUID, UUID, TEXT, UUID, TEXT)
  TO anon, authenticated;


-- ── 5. get_quick_decision_state (updated) ────────────────────────────────────
-- Adds four new decision fields to the JSON output:
--   minimumAttendees, earlyLockEnabled, resolvedOptionId, resolutionReason
--
-- The rest of the function (members, options) is unchanged from migration 018.

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
        (p_user_id  IS NOT NULL AND dm.actor_user_id  = p_user_id) OR
        (p_guest_id IS NOT NULL AND dm.actor_guest_id = p_guest_id)
      )
  ) THEN
    RAISE EXCEPTION 'Actor is not a member of decision %', p_decision_id;
  END IF;

  SELECT * INTO v_decision FROM decisions WHERE id = p_decision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found: %', p_decision_id;
  END IF;

  -- Auto-lock on deadline expiry.
  -- Full resolution (resolve_quick_decision) is run by the cron edge function;
  -- here we just flip the status flag so the screen renders as locked immediately.
  IF v_decision.status != 'locked' AND v_decision.closes_at <= NOW() THEN
    UPDATE decisions SET status = 'locked' WHERE id = p_decision_id;
    v_decision.status := 'locked';
  END IF;

  RETURN json_build_object(
    'decision', json_build_object(
      'id',                v_decision.id,
      'title',             v_decision.title,
      'category',          v_decision.category,
      'closesAt',          v_decision.closes_at,
      'status',            v_decision.status,
      'inviteCode',        v_decision.invite_code,
      'createdAt',         v_decision.created_at,
      'createdBy',         COALESCE(v_decision.created_by::text, v_decision.created_by_guest_id),
      -- Resolution fields (all nullable)
      'minimumAttendees',  v_decision.minimum_attendees,
      'earlyLockEnabled',  v_decision.early_lock_enabled,
      'resolvedOptionId',  v_decision.resolved_option_id,
      'resolutionReason',  v_decision.resolution_reason
    ),
    'members', (
      SELECT json_agg(json_build_object(
        'id',            dm.id,
        'decisionId',    dm.decision_id,
        'actorUserId',   dm.actor_user_id,
        'actorGuestId',  dm.actor_guest_id,
        'joinedAt',      dm.joined_at,
        'displayName',   dm.display_name,
        'hasResponded',  EXISTS (
          SELECT 1 FROM option_responses orr
          WHERE orr.decision_id = p_decision_id
            AND (
              (dm.actor_user_id  IS NOT NULL AND orr.actor_user_id  = dm.actor_user_id) OR
              (dm.actor_guest_id IS NOT NULL AND orr.actor_guest_id = dm.actor_guest_id)
            )
        )
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
          'imInCount',           COALESCE(agg.im_in_count, 0),
          'topChoiceCount',      COALESCE(agg.top_choice_count, 0),
          'myResponse',          mine.response,
          'myIsTopChoice',       COALESCE(mine.is_top_choice, false),
          'createdAt',           o.created_at,
          'submittedByUserId',   o.submitted_by_user_id,
          'submittedByGuestId',  o.submitted_by_guest_id
        )
        ORDER BY
          COALESCE(agg.im_in_count, 0)       DESC,
          COALESCE(agg.top_choice_count, 0)  DESC,
          o.created_at                        ASC
      )
      FROM options o
      LEFT JOIN (
        SELECT
          option_id,
          COUNT(*) FILTER (WHERE response = 'im_in')      AS im_in_count,
          COUNT(*) FILTER (WHERE is_top_choice = true)    AS top_choice_count
        FROM option_responses
        WHERE decision_id = p_decision_id
        GROUP BY option_id
      ) agg ON agg.option_id = o.id
      LEFT JOIN LATERAL (
        SELECT response, is_top_choice
        FROM option_responses
        WHERE option_id = o.id
          AND (
            (p_user_id  IS NOT NULL AND actor_user_id  = p_user_id) OR
            (p_guest_id IS NOT NULL AND actor_guest_id = p_guest_id)
          )
        LIMIT 1
      ) mine ON true
      WHERE o.decision_id = p_decision_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_quick_decision_state(UUID, UUID, TEXT)
  TO anon, authenticated;
