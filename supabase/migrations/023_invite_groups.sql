-- =============================================================================
-- 023_invite_groups.sql
--
-- Saved Invite Groups — private, reusable invite templates.
--
-- Design
-- ──────
-- Groups are private to their creator. No shared ownership, no group chat,
-- no social objects. They are purely shortcuts: name a set of people once,
-- bulk-invite them into any Quick Mode plan with one tap.
--
-- Per-member eligibility is handled gracefully in bulk_invite_group:
--   • already a decision member  → counted, skipped
--   • already has pending invite → counted, skipped
--   • previously declined invite → reset to pending (re-invite)
--   • no existing invite         → fresh insert
--
-- Tables
-- ──────
--   invite_groups         — one row per saved group
--   invite_group_members  — one row per (group, member) pair
--
-- Functions (all SECURITY DEFINER, auth.uid() enforced)
-- ─────────────────────────────────────────────────────
--   get_invite_groups()
--   create_invite_group(p_name)
--   rename_invite_group(p_group_id, p_name)
--   delete_invite_group(p_group_id)
--   add_invite_group_member(p_group_id, p_member_user_id)
--   remove_invite_group_member(p_group_id, p_member_user_id)
--   bulk_invite_group(p_decision_id, p_group_id)
-- =============================================================================


-- ── 1. Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invite_groups (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL
                              CHECK (length(trim(name)) >= 1 AND length(trim(name)) <= 50),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_groups_owner ON invite_groups(owner_user_id);

CREATE TABLE IF NOT EXISTS invite_group_members (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID        NOT NULL REFERENCES invite_groups(id) ON DELETE CASCADE,
  member_user_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, member_user_id)
);

CREATE INDEX IF NOT EXISTS idx_invite_group_members_group ON invite_group_members(group_id);


-- ── 2. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE invite_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_group_members ENABLE ROW LEVEL SECURITY;

-- invite_groups: owner-only
CREATE POLICY "Owner can view own groups"
  ON invite_groups FOR SELECT USING (owner_user_id = auth.uid());

CREATE POLICY "Owner can create groups"
  ON invite_groups FOR INSERT WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Owner can update own groups"
  ON invite_groups FOR UPDATE
  USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Owner can delete own groups"
  ON invite_groups FOR DELETE USING (owner_user_id = auth.uid());

-- invite_group_members: group-owner access (requires join)
CREATE POLICY "Group owner can view members"
  ON invite_group_members FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM invite_groups ig
    WHERE ig.id = invite_group_members.group_id AND ig.owner_user_id = auth.uid()
  ));

CREATE POLICY "Group owner can add members"
  ON invite_group_members FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM invite_groups ig
    WHERE ig.id = invite_group_members.group_id AND ig.owner_user_id = auth.uid()
  ));

CREATE POLICY "Group owner can remove members"
  ON invite_group_members FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM invite_groups ig
    WHERE ig.id = invite_group_members.group_id AND ig.owner_user_id = auth.uid()
  ));


-- ── 3. get_invite_groups ──────────────────────────────────────────────────────
-- Returns all groups owned by auth.uid(), with member details, ordered newest first.

CREATE OR REPLACE FUNCTION public.get_invite_groups()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(g ORDER BY g.created_at DESC), '[]'::json)
    FROM (
      SELECT
        ig.id,
        ig.name,
        ig.created_at,
        COUNT(igm.id)::int AS member_count,
        COALESCE(
          json_agg(
            json_build_object(
              'id',       u.id,
              'username', u.username,
              'email',    COALESCE(u.email, '')
            )
            ORDER BY igm.added_at
          ) FILTER (WHERE u.id IS NOT NULL),
          '[]'::json
        ) AS members
      FROM invite_groups ig
      LEFT JOIN invite_group_members igm ON igm.group_id = ig.id
      LEFT JOIN users u ON u.id = igm.member_user_id
      WHERE ig.owner_user_id = auth.uid()
      GROUP BY ig.id, ig.name, ig.created_at
      ORDER BY ig.created_at DESC
    ) g
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_groups()
  TO authenticated;


-- ── 4. create_invite_group ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_invite_group(p_name TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_group invite_groups%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF trim(p_name) = ''        THEN RAISE EXCEPTION 'Group name cannot be empty'; END IF;
  IF length(trim(p_name)) > 50 THEN RAISE EXCEPTION 'Group name cannot exceed 50 characters'; END IF;

  INSERT INTO invite_groups (owner_user_id, name)
  VALUES (auth.uid(), trim(p_name))
  RETURNING * INTO v_group;

  RETURN json_build_object(
    'id',          v_group.id,
    'name',        v_group.name,
    'created_at',  v_group.created_at,
    'member_count', 0,
    'members',     '[]'::json
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invite_group(TEXT)
  TO authenticated;


-- ── 5. rename_invite_group ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rename_invite_group(p_group_id UUID, p_name TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF trim(p_name) = '' THEN RAISE EXCEPTION 'Group name cannot be empty'; END IF;

  UPDATE invite_groups
  SET name = trim(p_name)
  WHERE id = p_group_id AND owner_user_id = auth.uid();

  IF NOT FOUND THEN RAISE EXCEPTION 'Group not found or access denied'; END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rename_invite_group(UUID, TEXT)
  TO authenticated;


-- ── 6. delete_invite_group ────────────────────────────────────────────────────
-- invite_group_members rows cascade-delete automatically.

CREATE OR REPLACE FUNCTION public.delete_invite_group(p_group_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  DELETE FROM invite_groups WHERE id = p_group_id AND owner_user_id = auth.uid();

  IF NOT FOUND THEN RAISE EXCEPTION 'Group not found or access denied'; END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_invite_group(UUID)
  TO authenticated;


-- ── 7. add_invite_group_member ────────────────────────────────────────────────
-- Idempotent: duplicate (group_id, member_user_id) is silently ignored.

CREATE OR REPLACE FUNCTION public.add_invite_group_member(
  p_group_id       UUID,
  p_member_user_id UUID
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM invite_groups WHERE id = p_group_id AND owner_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Group not found or access denied';
  END IF;

  IF p_member_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot add yourself to a group';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_member_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  INSERT INTO invite_group_members (group_id, member_user_id)
  VALUES (p_group_id, p_member_user_id)
  ON CONFLICT (group_id, member_user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_invite_group_member(UUID, UUID)
  TO authenticated;


-- ── 8. remove_invite_group_member ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.remove_invite_group_member(
  p_group_id       UUID,
  p_member_user_id UUID
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM invite_groups WHERE id = p_group_id AND owner_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Group not found or access denied';
  END IF;

  DELETE FROM invite_group_members
  WHERE group_id = p_group_id AND member_user_id = p_member_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_invite_group_member(UUID, UUID)
  TO authenticated;


-- ── 9. bulk_invite_group ─────────────────────────────────────────────────────
-- Invites all eligible group members to a decision in one atomic operation.
-- Returns per-outcome counts + the IDs of newly-invited users (for client
-- optimistic state updates).

CREATE OR REPLACE FUNCTION public.bulk_invite_group(
  p_decision_id UUID,
  p_group_id    UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_member          RECORD;
  v_invited         INT    := 0;
  v_already_member  INT    := 0;
  v_already_invited INT    := 0;
  v_invited_ids     UUID[] := '{}';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  -- Caller must be an organizer of the decision.
  IF NOT EXISTS (
    SELECT 1 FROM decision_members
    WHERE decision_id   = p_decision_id
      AND role          = 'organizer'
      AND actor_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only decision organizers can bulk-invite';
  END IF;

  -- Group must belong to the caller.
  IF NOT EXISTS (
    SELECT 1 FROM invite_groups WHERE id = p_group_id AND owner_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Group not found or access denied';
  END IF;

  -- Decision must be active.
  IF EXISTS (SELECT 1 FROM decisions WHERE id = p_decision_id AND status = 'locked') THEN
    RAISE EXCEPTION 'Cannot invite to a locked decision';
  END IF;

  FOR v_member IN (
    SELECT member_user_id FROM invite_group_members WHERE group_id = p_group_id
  ) LOOP

    -- Already a plan member → skip.
    IF EXISTS (
      SELECT 1 FROM decision_members
      WHERE decision_id   = p_decision_id
        AND actor_user_id = v_member.member_user_id
    ) THEN
      v_already_member := v_already_member + 1;
      CONTINUE;
    END IF;

    -- Already has a pending invite → skip.
    IF EXISTS (
      SELECT 1 FROM decision_invites
      WHERE decision_id = p_decision_id
        AND invitee_id  = v_member.member_user_id
        AND status      = 'pending'
    ) THEN
      v_already_invited := v_already_invited + 1;
      CONTINUE;
    END IF;

    -- Insert fresh or reset a declined invite back to pending.
    INSERT INTO decision_invites (decision_id, inviter_id, invitee_id)
    VALUES (p_decision_id, auth.uid(), v_member.member_user_id)
    ON CONFLICT (decision_id, invitee_id) DO UPDATE
      SET status = 'pending', inviter_id = auth.uid(), created_at = now();

    v_invited     := v_invited + 1;
    v_invited_ids := v_invited_ids || v_member.member_user_id;
  END LOOP;

  RETURN json_build_object(
    'invited',        v_invited,
    'alreadyMember',  v_already_member,
    'alreadyInvited', v_already_invited,
    'invitedIds',     v_invited_ids
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_invite_group(UUID, UUID)
  TO authenticated;
