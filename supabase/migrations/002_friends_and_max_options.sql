-- ============================================================
-- DECIDER APP: Friends System & Max Options Update
-- ============================================================

-- ============================================
-- 1. FRIEND REQUESTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_user_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON public.friend_requests(from_user_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON public.friend_requests(to_user_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_status ON public.friend_requests(status);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

-- Users can view requests they sent or received
CREATE POLICY "Users can view own friend requests" ON public.friend_requests
  FOR SELECT USING (
    auth.uid() = from_user_id OR auth.uid() = to_user_id
  );

-- Users can send friend requests
CREATE POLICY "Users can send friend requests" ON public.friend_requests
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

-- Users can update requests they received (accept/decline)
CREATE POLICY "Users can respond to friend requests" ON public.friend_requests
  FOR UPDATE USING (auth.uid() = to_user_id);

-- Users can delete requests they sent or received
CREATE POLICY "Users can delete friend requests" ON public.friend_requests
  FOR DELETE USING (
    auth.uid() = from_user_id OR auth.uid() = to_user_id
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friend_requests TO authenticated;

-- ============================================
-- 2. FRIENDSHIPS TABLE (bidirectional)
-- ============================================

CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('accepted', 'blocked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user ON public.friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON public.friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON public.friendships(status);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Users can view their own friendships
CREATE POLICY "Users can view own friendships" ON public.friendships
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Users can insert friendships (when accepting requests)
CREATE POLICY "Users can create friendships" ON public.friendships
  FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() = friend_id);

-- Users can delete their own friendships (unfriend)
CREATE POLICY "Users can delete own friendships" ON public.friendships
  FOR DELETE USING (auth.uid() = user_id OR auth.uid() = friend_id);

GRANT SELECT, INSERT, DELETE ON public.friendships TO authenticated;

-- ============================================
-- 3. UPDATE MAX_OPTIONS CONSTRAINT
-- ============================================
-- Allow max_options = 0 to represent "unlimited"

-- Drop old constraint and add new one
ALTER TABLE public.decisions DROP CONSTRAINT IF EXISTS decisions_max_options_check;
ALTER TABLE public.decisions ADD CONSTRAINT decisions_max_options_check
  CHECK (max_options >= 0 AND max_options <= 10);

-- ============================================
-- 4. UPDATE USERS SELECT POLICY
-- ============================================
-- Allow users to search for other users (needed for friend search)
-- The existing policy only allows viewing own profile, but we need
-- users to be able to find others by username/email

DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can view all non-deleted users" ON public.users;

CREATE POLICY "Authenticated users can view non-deleted users" ON public.users
  FOR SELECT USING (deleted_at IS NULL);
