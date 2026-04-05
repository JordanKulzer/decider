-- =============================================================================
-- 011_decision_invites.sql
--
-- Adds a proper invite system for quick decisions.
-- Creators can invite any registered user by UUID; the invitee sees pending
-- invites on HomeScreen and can accept (→ joins decision) or decline.
--
-- Objects created:
--   • decision_invites table + RLS
--   • send_decision_invite(decision_id, invitee_id) — creator sends invite
--   • respond_decision_invite(invite_id, accept)    — invitee accepts/declines
--   • get_pending_invites(user_id)                  — invitee fetches their queue
-- =============================================================================


-- ── 1. Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS decision_invites (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  decision_id  uuid        NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  inviter_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- One invite per (decision, invitee) — prevents duplicates
  UNIQUE (decision_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS idx_decision_invites_invitee
  ON decision_invites (invitee_id, status);

CREATE INDEX IF NOT EXISTS idx_decision_invites_decision
  ON decision_invites (decision_id);


-- ── 2. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE decision_invites ENABLE ROW LEVEL SECURITY;

-- Both sides can read their own rows
CREATE POLICY "Parties can view their invites"
  ON decision_invites FOR SELECT
  USING (inviter_id = auth.uid() OR invitee_id = auth.uid());

-- Invitee can update status (accept / decline)
CREATE POLICY "Invitee can respond to invite"
  ON decision_invites FOR UPDATE
  USING (invitee_id = auth.uid())
  WITH CHECK (invitee_id = auth.uid());


-- ── 3. send_decision_invite ───────────────────────────────────────────────────
-- Only the decision creator may call this.
-- Returns the new invite row as JSON, or raises a clear exception.

CREATE OR REPLACE FUNCTION public.send_decision_invite(
  p_decision_id uuid,
  p_invitee_id  uuid
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite decision_invites%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Must be the decision creator
  IF NOT EXISTS (
    SELECT 1 FROM decisions
    WHERE id = p_decision_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the decision creator can send invites';
  END IF;

  -- Decision must be active (not locked)
  IF EXISTS (
    SELECT 1 FROM decisions WHERE id = p_decision_id AND status = 'locked'
  ) THEN
    RAISE EXCEPTION 'Cannot invite to a locked decision';
  END IF;

  -- Must not already be a member (quick-mode actor_user_id or legacy user_id)
  IF EXISTS (
    SELECT 1 FROM decision_members
    WHERE decision_id = p_decision_id
      AND (actor_user_id = p_invitee_id OR user_id = p_invitee_id)
  ) THEN
    RAISE EXCEPTION 'User is already a member of this decision';
  END IF;

  -- Can't invite yourself
  IF p_invitee_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot invite yourself';
  END IF;

  INSERT INTO decision_invites (decision_id, inviter_id, invitee_id)
  VALUES (p_decision_id, auth.uid(), p_invitee_id)
  ON CONFLICT (decision_id, invitee_id) DO NOTHING
  RETURNING * INTO v_invite;

  RETURN row_to_json(v_invite);
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_decision_invite(uuid, uuid)
  TO authenticated;


-- ── 4. respond_decision_invite ────────────────────────────────────────────────
-- Invitee calls this to accept or decline.
-- On accept: atomically inserts into decision_members (actor_user_id path).

CREATE OR REPLACE FUNCTION public.respond_decision_invite(
  p_invite_id uuid,
  p_accept    boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite       decision_invites%ROWTYPE;
  v_display_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_invite
  FROM decision_invites
  WHERE id = p_invite_id
    AND invitee_id = auth.uid()
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already responded';
  END IF;

  UPDATE decision_invites
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END
  WHERE id = p_invite_id;

  IF p_accept THEN
    SELECT username INTO v_display_name FROM users WHERE id = auth.uid();

    INSERT INTO decision_members (decision_id, actor_user_id, role, display_name)
    VALUES (v_invite.decision_id, auth.uid(), 'member', v_display_name)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_decision_invite(uuid, boolean)
  TO authenticated;


-- ── 5. get_pending_invites ────────────────────────────────────────────────────
-- Returns all pending invites for a user with decision + inviter names.

CREATE OR REPLACE FUNCTION public.get_pending_invites(
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(row ORDER BY row.created_at DESC), '[]'::json)
    FROM (
      SELECT
        di.id,
        di.decision_id,
        di.inviter_id,
        di.status,
        di.created_at,
        d.title        AS decision_title,
        d.status       AS decision_status,
        d.mode         AS decision_mode,
        d.closes_at    AS decision_closes_at,
        u.username     AS inviter_username
      FROM decision_invites di
      JOIN decisions d ON d.id = di.decision_id
      JOIN users     u ON u.id = di.inviter_id
      WHERE di.invitee_id = p_user_id
        AND di.status = 'pending'
        AND d.status  != 'locked'
      ORDER BY di.created_at DESC
    ) row
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_invites(uuid)
  TO authenticated;
