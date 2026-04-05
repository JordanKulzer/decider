-- =============================================================================
-- 017_fix_invite_flow.sql
--
-- Fixes the decision invite flow end-to-end:
--
-- 1. send_decision_invite — rewritten to:
--    • Allow any decision organizer (not just the original creator)
--    • Idempotently return an existing pending invite (no error)
--    • Reset a declined invite back to pending (re-invite support)
--    • Never return null — always returns the invite row as JSON
--
-- 2. cancel_decision_invite(p_invite_id) — new
--    • Organizer can cancel a pending invite
--
-- 3. list_decision_invites(p_decision_id) — new
--    • Returns all pending outgoing invites for a decision (organizer-only)
-- =============================================================================


-- ── 1. send_decision_invite (rewrite) ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.send_decision_invite(
  p_decision_id uuid,
  p_invitee_id  uuid
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite         decision_invites%ROWTYPE;
  v_existing_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Must be a decision organizer (covers original creator and promoted organizers)
  -- Checks both actor_user_id (quick-mode) and user_id (legacy) columns.
  IF NOT EXISTS (
    SELECT 1 FROM decision_members
    WHERE decision_id = p_decision_id
      AND role = 'organizer'
      AND (actor_user_id = auth.uid() OR user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Only decision organizers can send invites';
  END IF;

  -- Decision must be active (not locked)
  IF EXISTS (
    SELECT 1 FROM decisions WHERE id = p_decision_id AND status = 'locked'
  ) THEN
    RAISE EXCEPTION 'Cannot invite to a locked decision';
  END IF;

  -- Cannot invite someone who is already a member
  IF EXISTS (
    SELECT 1 FROM decision_members
    WHERE decision_id = p_decision_id
      AND (actor_user_id = p_invitee_id OR user_id = p_invitee_id)
  ) THEN
    RAISE EXCEPTION 'User is already a member of this decision';
  END IF;

  -- Cannot invite yourself
  IF p_invitee_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot invite yourself';
  END IF;

  -- Check for an existing invite row
  SELECT status INTO v_existing_status
  FROM decision_invites
  WHERE decision_id = p_decision_id AND invitee_id = p_invitee_id;

  IF v_existing_status = 'pending' THEN
    -- Already has a pending invite — return it as-is (idempotent, no error)
    SELECT * INTO v_invite
    FROM decision_invites
    WHERE decision_id = p_decision_id AND invitee_id = p_invitee_id;
    RETURN row_to_json(v_invite);

  ELSIF v_existing_status = 'declined' THEN
    -- Declined invite — reset back to pending so invitee sees it again
    UPDATE decision_invites
    SET status = 'pending', inviter_id = auth.uid(), created_at = now()
    WHERE decision_id = p_decision_id AND invitee_id = p_invitee_id
    RETURNING * INTO v_invite;
    RETURN row_to_json(v_invite);

  ELSE
    -- No existing invite — insert fresh row
    INSERT INTO decision_invites (decision_id, inviter_id, invitee_id)
    VALUES (p_decision_id, auth.uid(), p_invitee_id)
    RETURNING * INTO v_invite;
    RETURN row_to_json(v_invite);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_decision_invite(uuid, uuid)
  TO authenticated;


-- ── 2. cancel_decision_invite ────────────────────────────────────────────────
-- Organizer cancels a pending outgoing invite.

CREATE OR REPLACE FUNCTION public.cancel_decision_invite(
  p_invite_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Fetch invite and verify it is pending
  SELECT decision_id INTO v_decision_id
  FROM decision_invites
  WHERE id = p_invite_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already responded';
  END IF;

  -- Must be an organizer of that decision
  IF NOT EXISTS (
    SELECT 1 FROM decision_members
    WHERE decision_id = v_decision_id
      AND role = 'organizer'
      AND (actor_user_id = auth.uid() OR user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Only decision organizers can cancel invites';
  END IF;

  DELETE FROM decision_invites WHERE id = p_invite_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_decision_invite(uuid)
  TO authenticated;


-- ── 3. list_decision_invites ─────────────────────────────────────────────────
-- Returns all pending outgoing invites for a decision (organizer-only).

CREATE OR REPLACE FUNCTION public.list_decision_invites(
  p_decision_id uuid
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Must be an organizer of that decision
  IF NOT EXISTS (
    SELECT 1 FROM decision_members
    WHERE decision_id = p_decision_id
      AND role = 'organizer'
      AND (actor_user_id = auth.uid() OR user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Only decision organizers can list invites';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(row ORDER BY row.created_at DESC), '[]'::json)
    FROM (
      SELECT
        di.id,
        di.decision_id,
        di.invitee_id,
        di.status,
        di.created_at,
        u.username  AS invitee_username,
        u.email     AS invitee_email
      FROM decision_invites di
      JOIN users u ON u.id = di.invitee_id
      WHERE di.decision_id = p_decision_id
        AND di.status = 'pending'
      ORDER BY di.created_at DESC
    ) row
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_decision_invites(uuid)
  TO authenticated;
