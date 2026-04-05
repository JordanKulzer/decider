-- =============================================================================
-- 021_setup_phase.sql
--
-- Introduces a "setup phase" for Quick Mode decisions.
--
-- Overview
-- ────────
-- When a decision is first created it enters setup_phase = true. During setup
-- the creator can freely add, edit, and remove options and configure the quorum
-- rules (minimum_attendees, early_lock_enabled). No voting UI is shown to
-- participants — they see a "waiting for host" message instead.
--
-- Setup phase ends in one of two ways:
--   1. Creator explicitly taps "Start / Share Decision" → end_setup_phase()
--   2. Any participant submits a response → upsert_option_response auto-ends it
--
-- Once setup_phase = false:
--   • options cannot be added, edited, or deleted
--   • title cannot be renamed
--   • quorum rules are frozen
--   • normal commitment voting begins
--
-- Changes
-- ───────
--   decisions table
--     • setup_phase  BOOLEAN NOT NULL DEFAULT false
--       (existing rows → false; new rows → set to true in create_quick_decision)
--
--   New functions
--     • end_setup_phase        — creator action to transition out of setup
--     • delete_quick_option    — creator-only option removal during setup
--     • update_quick_option    — creator-only option rename during setup
--
--   Updated functions
--     • create_quick_decision  — inserts with setup_phase = true
--     • add_quick_option       — guards on setup_phase instead of response count;
--                                creator-only
--     • rename_quick_decision  — guards on setup_phase instead of response count
--     • upsert_option_response — auto-ends setup_phase on first response
--     • get_quick_decision_state — exposes setupPhase in JSON output
-- =============================================================================


-- ── 1. Schema ─────────────────────────────────────────────────────────────────

ALTER TABLE decisions
  ADD COLUMN IF NOT EXISTS setup_phase BOOLEAN NOT NULL DEFAULT false;
-- Note: existing live decisions correctly get false; create_quick_decision sets
-- new rows to true.


-- ── 2. create_quick_decision (updated) ───────────────────────────────────────
-- Adds setup_phase = true to the INSERT. Quorum settings are no longer
-- passed at creation — they are applied atomically via end_setup_phase.

DROP FUNCTION IF EXISTS public.create_quick_decision(TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT, INT, BOOLEAN);

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
    minimum_attendees, early_lock_enabled,
    setup_phase
  ) VALUES (
    'quick', p_title, p_category, p_category,
    p_user_id, p_guest_id,
    p_closes_at, 'options', v_invite_code,
    p_minimum_attendees, p_early_lock_enabled,
    true   -- always starts in setup phase
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


-- ── 3. end_setup_phase ────────────────────────────────────────────────────────
-- Creator action: exits setup phase and finalises quorum settings atomically.
-- No-ops gracefully if setup_phase is already false.

CREATE OR REPLACE FUNCTION public.end_setup_phase(
  p_decision_id         UUID,
  p_minimum_attendees   INT     DEFAULT NULL,
  p_early_lock_enabled  BOOLEAN DEFAULT false,
  p_user_id             UUID    DEFAULT NULL,
  p_guest_id            TEXT    DEFAULT NULL
)
RETURNS void
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
    RAISE EXCEPTION 'Cannot end setup: decision is already locked';
  END IF;

  -- Verify caller is the creator.
  IF p_user_id IS NOT NULL THEN
    IF v_decision.created_by IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Only the creator can end the setup phase';
    END IF;
  ELSE
    IF v_decision.created_by_guest_id IS DISTINCT FROM p_guest_id THEN
      RAISE EXCEPTION 'Only the creator can end the setup phase';
    END IF;
  END IF;

  -- Idempotent: already out of setup — nothing to do.
  IF NOT v_decision.setup_phase THEN
    RETURN;
  END IF;

  UPDATE decisions
  SET
    setup_phase         = false,
    minimum_attendees   = p_minimum_attendees,
    early_lock_enabled  = p_early_lock_enabled
  WHERE id = p_decision_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_setup_phase(UUID, INT, BOOLEAN, UUID, TEXT)
  TO anon, authenticated;


-- ── 4. add_quick_option (updated) ────────────────────────────────────────────
-- Guards on setup_phase = true (replaces the response-count guard from 020).
-- Also restricts to the creator — only they configure options in setup.

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

  -- Structure lock: options can only be added while in setup phase.
  IF NOT v_decision.setup_phase THEN
    RAISE EXCEPTION 'Options are locked once the decision is started';
  END IF;

  -- Only the creator may add options.
  IF p_user_id IS NOT NULL THEN
    IF v_decision.created_by IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Only the creator can add options';
    END IF;
  ELSE
    IF v_decision.created_by_guest_id IS DISTINCT FROM p_guest_id THEN
      RAISE EXCEPTION 'Only the creator can add options';
    END IF;
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

GRANT EXECUTE ON FUNCTION public.add_quick_option(UUID, TEXT, UUID, TEXT)
  TO anon, authenticated;


-- ── 5. delete_quick_option ────────────────────────────────────────────────────
-- Removes an option during setup phase. Creator-only.
-- Cascades to option_responses (none should exist during setup, but safety net).

CREATE OR REPLACE FUNCTION public.delete_quick_option(
  p_decision_id UUID,
  p_option_id   UUID,
  p_user_id     UUID DEFAULT NULL,
  p_guest_id    TEXT DEFAULT NULL
)
RETURNS void
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

  IF NOT v_decision.setup_phase THEN
    RAISE EXCEPTION 'Options cannot be removed once the decision is started';
  END IF;

  -- Only the creator may remove options.
  IF p_user_id IS NOT NULL THEN
    IF v_decision.created_by IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Only the creator can remove options';
    END IF;
  ELSE
    IF v_decision.created_by_guest_id IS DISTINCT FROM p_guest_id THEN
      RAISE EXCEPTION 'Only the creator can remove options';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM options WHERE id = p_option_id AND decision_id = p_decision_id
  ) THEN
    RAISE EXCEPTION 'Option not found in this decision';
  END IF;

  DELETE FROM options WHERE id = p_option_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_quick_option(UUID, UUID, UUID, TEXT)
  TO anon, authenticated;


-- ── 6. update_quick_option ────────────────────────────────────────────────────
-- Renames an option during setup phase. Creator-only.

CREATE OR REPLACE FUNCTION public.update_quick_option(
  p_decision_id UUID,
  p_option_id   UUID,
  p_title       TEXT,
  p_user_id     UUID DEFAULT NULL,
  p_guest_id    TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision   decisions%ROWTYPE;
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

  IF NOT v_decision.setup_phase THEN
    RAISE EXCEPTION 'Options cannot be edited once the decision is started';
  END IF;

  IF p_user_id IS NOT NULL THEN
    IF v_decision.created_by IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Only the creator can edit options';
    END IF;
  ELSE
    IF v_decision.created_by_guest_id IS DISTINCT FROM p_guest_id THEN
      RAISE EXCEPTION 'Only the creator can edit options';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM options WHERE id = p_option_id AND decision_id = p_decision_id
  ) THEN
    RAISE EXCEPTION 'Option not found in this decision';
  END IF;

  -- Duplicate check: other options with same normalized title.
  IF EXISTS (
    SELECT 1 FROM options
    WHERE decision_id = p_decision_id
      AND id <> p_option_id
      AND LOWER(TRIM(regexp_replace(title, '\s+', ' ', 'g'))) = v_normalized
  ) THEN
    RAISE EXCEPTION 'Duplicate option: "%" already exists', TRIM(p_title);
  END IF;

  UPDATE options SET title = TRIM(p_title) WHERE id = p_option_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_quick_option(UUID, UUID, TEXT, UUID, TEXT)
  TO anon, authenticated;


-- ── 7. rename_quick_decision (updated) ───────────────────────────────────────
-- Guards on setup_phase instead of response count.

CREATE OR REPLACE FUNCTION public.rename_quick_decision(
  p_decision_id UUID,
  p_title       TEXT,
  p_user_id     UUID DEFAULT NULL,
  p_guest_id    TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision decisions%ROWTYPE;
  v_title    TEXT;
BEGIN
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

  v_title := TRIM(p_title);

  IF length(v_title) = 0 THEN
    RAISE EXCEPTION 'Title cannot be empty';
  END IF;

  IF length(v_title) > 60 THEN
    RAISE EXCEPTION 'Title is too long (max 60 characters)';
  END IF;

  SELECT * INTO v_decision FROM decisions WHERE id = p_decision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found: %', p_decision_id;
  END IF;

  IF p_user_id IS NOT NULL THEN
    IF v_decision.created_by IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Only the creator can rename this decision';
    END IF;
  ELSE
    IF v_decision.created_by_guest_id IS DISTINCT FROM p_guest_id THEN
      RAISE EXCEPTION 'Only the creator can rename this decision';
    END IF;
  END IF;

  -- Title is frozen once setup ends.
  IF NOT v_decision.setup_phase THEN
    RAISE EXCEPTION 'Title cannot be changed once the decision is started';
  END IF;

  UPDATE decisions SET title = v_title WHERE id = p_decision_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rename_quick_decision(UUID, TEXT, UUID, TEXT)
  TO anon, authenticated;


-- ── 8. upsert_option_response (updated) ──────────────────────────────────────
-- Auto-ends setup_phase on the first response, then proceeds normally.
-- The rest of the body (early-lock check) is unchanged from migration 019.

CREATE OR REPLACE FUNCTION public.upsert_option_response(
  p_decision_id  UUID,
  p_option_id    UUID,
  p_response     TEXT,
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

  -- Auto-end setup phase on first response. The SET is a no-op when already false.
  UPDATE decisions SET setup_phase = false
  WHERE id = p_decision_id AND setup_phase = true;
  -- Re-read so v_decision reflects the updated row.
  SELECT * INTO v_decision FROM decisions WHERE id = p_decision_id;

  IF p_user_id IS NOT NULL THEN
    INSERT INTO option_responses
      (decision_id, option_id, actor_user_id, response, is_top_choice)
    VALUES
      (p_decision_id, p_option_id, p_user_id, p_response, false)
    ON CONFLICT (option_id, actor_user_id)
      WHERE actor_user_id IS NOT NULL
      DO UPDATE SET
        response      = p_response,
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

  -- Early lock check (unchanged from migration 019).
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
      PERFORM public.resolve_quick_decision(p_decision_id);
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_option_response(UUID, UUID, TEXT, UUID, TEXT)
  TO anon, authenticated;


-- ── 9. get_quick_decision_state (updated) ────────────────────────────────────
-- Adds setupPhase to the decision JSON.

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
      'minimumAttendees',  v_decision.minimum_attendees,
      'earlyLockEnabled',  v_decision.early_lock_enabled,
      'resolvedOptionId',  v_decision.resolved_option_id,
      'resolutionReason',  v_decision.resolution_reason,
      'setupPhase',        v_decision.setup_phase
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
          COUNT(*) FILTER (WHERE response = 'im_in')       AS im_in_count,
          COUNT(*) FILTER (WHERE is_top_choice = true)     AS top_choice_count
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
