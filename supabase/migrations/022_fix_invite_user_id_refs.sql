-- =============================================================================
-- 022_fix_invite_user_id_refs.sql
--
-- Root cause fix: decision_members has no "user_id" column.
--
-- The base schema (001_base_schema.sql) explicitly replaced the legacy "user_id"
-- column with "actor_user_id" / "actor_guest_id".  Three functions introduced
-- in 017_fix_invite_flow.sql carried over stale "OR user_id = ..." branches
-- in their decision_members lookups, causing:
--
--   WARN [invite] sendDecisionInvite failed: column "user_id" does not exist
--
-- This migration rewrites all three functions to reference only actor_user_id.
-- Since the invite system requires Supabase Auth (auth.uid() must be non-null),
-- guest actors are never involved — actor_user_id is the only relevant column.
--
-- Changes
-- ───────
--   send_decision_invite   — remove OR user_id branches in organizer + member checks
--   cancel_decision_invite — same
--   list_decision_invites  — same
-- =============================================================================


-- ── 1. send_decision_invite ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.send_decision_invite(
  p_decision_id uuid,
  p_invitee_id  uuid
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite          decision_invites%ROWTYPE;
  v_existing_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Caller must be an organizer of the decision.
  -- decision_members uses actor_user_id for authenticated actors.
  IF NOT EXISTS (
    SELECT 1 FROM decision_members
    WHERE decision_id    = p_decision_id
      AND role           = 'organizer'
      AND actor_user_id  = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only decision organizers can send invites';
  END IF;

  -- Decision must not be locked.
  IF EXISTS (
    SELECT 1 FROM decisions WHERE id = p_decision_id AND status = 'locked'
  ) THEN
    RAISE EXCEPTION 'Cannot invite to a locked decision';
  END IF;

  -- Invitee must not already be a member.
  IF EXISTS (
    SELECT 1 FROM decision_members
    WHERE decision_id   = p_decision_id
      AND actor_user_id = p_invitee_id
  ) THEN
    RAISE EXCEPTION 'User is already a member of this decision';
  END IF;

  -- Cannot invite yourself.
  IF p_invitee_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot invite yourself';
  END IF;

  -- Check for an existing invite row.
  SELECT status INTO v_existing_status
  FROM decision_invites
  WHERE decision_id = p_decision_id AND invitee_id = p_invitee_id;

  IF v_existing_status = 'pending' THEN
    -- Already pending — idempotent return.
    SELECT * INTO v_invite
    FROM decision_invites
    WHERE decision_id = p_decision_id AND invitee_id = p_invitee_id;
    RETURN row_to_json(v_invite);

  ELSIF v_existing_status = 'declined' THEN
    -- Re-invite: reset back to pending.
    UPDATE decision_invites
    SET status = 'pending', inviter_id = auth.uid(), created_at = now()
    WHERE decision_id = p_decision_id AND invitee_id = p_invitee_id
    RETURNING * INTO v_invite;
    RETURN row_to_json(v_invite);

  ELSE
    -- No existing invite — fresh insert.
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

  SELECT decision_id INTO v_decision_id
  FROM decision_invites
  WHERE id = p_invite_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already responded';
  END IF;

  -- Caller must be an organizer of that decision.
  IF NOT EXISTS (
    SELECT 1 FROM decision_members
    WHERE decision_id   = v_decision_id
      AND role          = 'organizer'
      AND actor_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only decision organizers can cancel invites';
  END IF;

  DELETE FROM decision_invites WHERE id = p_invite_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_decision_invite(uuid)
  TO authenticated;


-- ── 3. list_decision_invites ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_decision_invites(
  p_decision_id uuid
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Caller must be an organizer of that decision.
  IF NOT EXISTS (
    SELECT 1 FROM decision_members
    WHERE decision_id   = p_decision_id
      AND role          = 'organizer'
      AND actor_user_id = auth.uid()
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
