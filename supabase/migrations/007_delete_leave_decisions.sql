-- =============================================================================
-- 007_delete_leave_decisions.sql
--
-- SECURITY DEFINER functions for:
--   • delete_quick_decision — creator deletes a decision and all related data
--   • leave_quick_decision  — non-creator member leaves; their votes are removed
--
-- Why functions instead of direct DML?
--   Guests have no Supabase session (auth.uid() = NULL), so they cannot use
--   standard RLS policies. SECURITY DEFINER functions validate the caller's
--   identity explicitly and run as the function owner, bypassing RLS safely.
--   Authenticated users go through the same path for consistency.
--
-- Cascade behaviour (defined in 001_base_schema.sql + 003_quick_mode.sql):
--   decisions → decision_members (ON DELETE CASCADE)
--   decisions → options          (ON DELETE CASCADE)
--   options   → quick_votes      (ON DELETE CASCADE)
-- Deleting a decision row therefore removes all members, options, and votes.
-- =============================================================================


-- ── delete_quick_decision ─────────────────────────────────────────────────────
-- Verifies that the caller is the creator, then deletes the decision row.
-- Cascade deletes handle decision_members, options, and quick_votes.
CREATE OR REPLACE FUNCTION public.delete_quick_decision(
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

  -- Verify the caller is the creator.
  IF p_user_id IS NOT NULL THEN
    IF v_decision.created_by IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Only the creator can delete this decision';
    END IF;
  ELSE
    IF v_decision.created_by_guest_id IS DISTINCT FROM p_guest_id THEN
      RAISE EXCEPTION 'Only the creator can delete this decision';
    END IF;
  END IF;

  DELETE FROM decisions WHERE id = p_decision_id;
END;
$$;


-- ── leave_quick_decision ──────────────────────────────────────────────────────
-- Removes the caller's membership row and their quick_votes for the decision.
-- Validates the caller is a member before removing anything.
CREATE OR REPLACE FUNCTION public.leave_quick_decision(
  p_decision_id UUID,
  p_user_id     UUID DEFAULT NULL,
  p_guest_id    TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

  -- Verify decision exists.
  IF NOT EXISTS (SELECT 1 FROM decisions WHERE id = p_decision_id) THEN
    RAISE EXCEPTION 'Decision not found: %', p_decision_id;
  END IF;

  -- Verify caller is a member.
  IF p_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM decision_members
      WHERE decision_id = p_decision_id AND actor_user_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'Actor is not a member of this decision';
    END IF;

    -- Remove their votes first (quick_votes foreign key cascades on option
    -- delete but NOT on member delete, so we handle it explicitly here).
    DELETE FROM quick_votes
    WHERE decision_id = p_decision_id AND actor_user_id = p_user_id;

    -- Remove their membership row.
    DELETE FROM decision_members
    WHERE decision_id = p_decision_id AND actor_user_id = p_user_id;

  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM decision_members
      WHERE decision_id = p_decision_id AND actor_guest_id = p_guest_id
    ) THEN
      RAISE EXCEPTION 'Actor is not a member of this decision';
    END IF;

    DELETE FROM quick_votes
    WHERE decision_id = p_decision_id AND actor_guest_id = p_guest_id;

    DELETE FROM decision_members
    WHERE decision_id = p_decision_id AND actor_guest_id = p_guest_id;
  END IF;
END;
$$;


-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT EXECUTE ON FUNCTION public.delete_quick_decision(UUID, UUID, TEXT)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.leave_quick_decision(UUID, UUID, TEXT)
  TO anon, authenticated;
