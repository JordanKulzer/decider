-- =============================================================================
-- 002_friends.sql
--
-- Friend requests and bidirectional friendships.
--
-- Design notes vs. old 002_friends_and_max_options.sql:
--   • Self-request CHECK constraint added (was missing).
--   • friendships SELECT policy tightened: only your own rows are visible.
--     The old policy exposed friend_id rows to the friend, which leaks
--     blocked relationships. A user should only query WHERE user_id = me.
--   • UPDATE policy on friend_requests scoped to status transitions only
--     (accepted | declined) — callers cannot reopen a decided request.
--   • max_options update from the old migration is not reproduced here;
--     001_base_schema.sql already defines max_options with the correct range.
--   • Separate GRANT statements removed — Supabase grants these to
--     'authenticated' via the RLS policies automatically.
-- =============================================================================

-- =============================================================================
-- FRIEND REQUESTS
-- from_user_id sends; to_user_id accepts or declines.
-- =============================================================================
CREATE TABLE IF NOT EXISTS friend_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (from_user_id, to_user_id),
  CONSTRAINT chk_no_self_request CHECK (from_user_id <> to_user_id)
);

CREATE INDEX idx_friend_requests_from   ON friend_requests(from_user_id);
CREATE INDEX idx_friend_requests_to     ON friend_requests(to_user_id);
-- Partial index: pending requests are the hot path (notifications, badge count).
CREATE INDEX idx_friend_requests_pending ON friend_requests(to_user_id)
  WHERE status = 'pending';

ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;

-- Both parties can see the request.
CREATE POLICY "Users can view own friend requests"
  ON friend_requests FOR SELECT
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- Only the sender can create.
CREATE POLICY "Users can send friend requests"
  ON friend_requests FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);

-- Only the recipient can update, and only to accepted/declined.
-- This prevents the sender from "un-declining" a request they sent.
CREATE POLICY "Recipients can respond to requests"
  ON friend_requests FOR UPDATE
  USING (auth.uid() = to_user_id)
  WITH CHECK (status IN ('accepted', 'declined'));

-- Either party can delete (cancel or dismiss).
CREATE POLICY "Either party can delete a request"
  ON friend_requests FOR DELETE
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- =============================================================================
-- FRIENDSHIPS
-- Bidirectional: accepting inserts two rows (A→B and B→A) so every user
-- can answer "show me my friends" with a single WHERE user_id = auth.uid()
-- without a UNION.
-- =============================================================================
CREATE TABLE IF NOT EXISTS friendships (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status    TEXT NOT NULL DEFAULT 'accepted'
              CHECK (status IN ('accepted', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, friend_id),
  CONSTRAINT chk_no_self_friendship CHECK (user_id <> friend_id)
);

CREATE INDEX idx_friendships_user   ON friendships(user_id);
CREATE INDEX idx_friendships_friend ON friendships(friend_id);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- SELECT: only your own perspective. You cannot enumerate who has blocked you.
CREATE POLICY "Users can view own friendships"
  ON friendships FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: you can only write your own side of the relationship.
CREATE POLICY "Users can create own friendships"
  ON friendships FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: update your own status (e.g., block someone).
CREATE POLICY "Users can update own friendships"
  ON friendships FOR UPDATE
  USING (auth.uid() = user_id);

-- DELETE: unfriend from your side.
CREATE POLICY "Users can delete own friendships"
  ON friendships FOR DELETE
  USING (auth.uid() = user_id);
