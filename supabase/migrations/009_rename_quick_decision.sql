-- =============================================================================
-- 009_rename_quick_decision.sql
--
-- Adds rename_quick_decision — lets the creator change a decision's title
-- after creation without any friction at the creation step.
--
-- Enforced rules (same SECURITY DEFINER pattern as all other Quick Mode mutations):
--   • Exactly one identity (user or guest) must be provided.
--   • Caller must be the creator.
--   • Title must be non-empty after trimming and at most 60 characters.
--   • No lock-state restriction — renaming is allowed on both active and locked
--     decisions so the creator can correct a title after the fact.
-- =============================================================================

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

  UPDATE decisions SET title = v_title WHERE id = p_decision_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rename_quick_decision(UUID, TEXT, UUID, TEXT)
  TO anon, authenticated;
