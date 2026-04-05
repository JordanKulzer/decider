-- =============================================================================
-- 020_structure_lock.sql
--
-- Enforces structure locking for Quick Mode decisions.
--
-- Overview
-- ────────
-- Once any participant has submitted a response to any option in a decision,
-- the decision's structure is considered locked. Two operations become
-- forbidden at that point:
--
--   1. Adding new options   (add_quick_option)
--   2. Renaming the decision (rename_quick_decision)
--
-- This mirrors the rule enforced on the client:
--   • Options are added in QuickStartScreen before creation — they cannot be
--     added inline in LiveDecisionScreen.
--   • The rename button in the header is hidden once hasAnyResponse is true.
--
-- The server-side check here is the authoritative safety net for stale clients
-- or direct API calls.
--
-- Changes
-- ───────
--   add_quick_option       — raises if any option_response row exists for the decision
--   rename_quick_decision  — raises if any option_response row exists for the decision
-- =============================================================================


-- ── 1. add_quick_option (updated) ────────────────────────────────────────────
-- Adds the structure-lock guard: options cannot be added once any response
-- exists for the decision. All other logic is unchanged.

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

  -- Normalize title for duplicate detection.
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

  IF v_decision.status = 'locked' OR v_decision.closes_at <= NOW() THEN
    RAISE EXCEPTION 'Cannot add options: decision is locked';
  END IF;

  -- Structure lock: no new options once any response exists for this decision.
  IF EXISTS (
    SELECT 1 FROM option_responses WHERE decision_id = p_decision_id LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Options are locked once responses begin';
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

  -- Duplicate check (normalized comparison).
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


-- ── 2. rename_quick_decision (updated) ───────────────────────────────────────
-- Adds the structure-lock guard: the title cannot be changed once any response
-- exists for the decision. All other logic is unchanged.

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

  -- Verify caller is the creator.
  IF p_user_id IS NOT NULL THEN
    IF v_decision.created_by IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Only the creator can rename this decision';
    END IF;
  ELSE
    IF v_decision.created_by_guest_id IS DISTINCT FROM p_guest_id THEN
      RAISE EXCEPTION 'Only the creator can rename this decision';
    END IF;
  END IF;

  -- Structure lock: title cannot be changed once any response exists.
  IF EXISTS (
    SELECT 1 FROM option_responses WHERE decision_id = p_decision_id LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Title cannot be changed after responses have started';
  END IF;

  UPDATE decisions SET title = v_title WHERE id = p_decision_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rename_quick_decision(UUID, TEXT, UUID, TEXT)
  TO anon, authenticated;
