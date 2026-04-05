-- =============================================================================
-- 016_accept_friend_request.sql
--
-- Adds SECURITY DEFINER RPCs for accepting and declining friend requests.
--
-- Problem: the client-side acceptFriendRequest inserts both friendship rows
-- directly, but RLS on friendships only allows a user to insert rows where
-- user_id = auth.uid(). The accepting user (to_user_id) can insert their own
-- side but the other direction (from_user_id → to_user_id) is blocked.
--
-- Solution: SECURITY DEFINER functions bypass RLS and handle both rows + the
-- status update atomically, with auth validation inside the function body.
--
-- Objects created:
--   • accept_friend_request(p_request_id uuid)
--   • decline_friend_request(p_request_id uuid)
-- =============================================================================


-- ── 1. accept_friend_request ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.accept_friend_request(
  p_request_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_from_user_id uuid;
  v_to_user_id   uuid;
  v_status       text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Fetch the request
  SELECT from_user_id, to_user_id, status
  INTO v_from_user_id, v_to_user_id, v_status
  FROM friend_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found';
  END IF;

  -- Only the intended recipient may accept
  IF v_to_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the recipient can accept this request';
  END IF;

  -- Self-request guard (should not exist, but reject defensively)
  IF v_from_user_id = v_to_user_id THEN
    RAISE EXCEPTION 'Self-friend requests are not allowed';
  END IF;

  -- Idempotent: already accepted → nothing to do
  IF v_status = 'accepted' THEN
    RETURN;
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Friend request is no longer pending (status: %)', v_status;
  END IF;

  -- Insert both directions; ON CONFLICT DO NOTHING handles already-friends case
  INSERT INTO friendships (user_id, friend_id, status)
  VALUES
    (v_from_user_id, v_to_user_id, 'accepted'),
    (v_to_user_id,   v_from_user_id, 'accepted')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  -- Mark request accepted
  UPDATE friend_requests
  SET status = 'accepted'
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_friend_request(uuid)
  TO authenticated;


-- ── 2. decline_friend_request ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.decline_friend_request(
  p_request_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_to_user_id uuid;
  v_status     text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT to_user_id, status
  INTO v_to_user_id, v_status
  FROM friend_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found';
  END IF;

  IF v_to_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the recipient can decline this request';
  END IF;

  -- Idempotent: already declined → nothing to do
  IF v_status = 'declined' THEN
    RETURN;
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Friend request is no longer pending (status: %)', v_status;
  END IF;

  UPDATE friend_requests
  SET status = 'declined'
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_friend_request(uuid)
  TO authenticated;
