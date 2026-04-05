-- =============================================================================
-- 005_advanced_mode_compat.sql
--
-- Adds subscription/tier columns to users and the advance_votes table, which
-- are required by the advanced-mode app code but were absent from
-- 001_base_schema.sql.
-- =============================================================================


-- ── Subscription columns on users ────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'pro')),
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'none'
    CHECK (subscription_status IN ('none', 'active', 'canceled', 'past_due')),
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;


-- ── advance_votes — "vote to advance phase" (Advanced Mode only) ──────────────
-- One row per (decision × user × from_phase); records that a member has
-- clicked "ready to advance" from a given phase.  When a quorum is reached
-- the phase transitions.
CREATE TABLE IF NOT EXISTS advance_votes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID        NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_phase  TEXT        NOT NULL CHECK (from_phase IN ('constraints', 'options')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (decision_id, user_id, from_phase)
);

CREATE INDEX IF NOT EXISTS idx_advance_votes_decision ON advance_votes(decision_id);
CREATE INDEX IF NOT EXISTS idx_advance_votes_user     ON advance_votes(user_id);

ALTER TABLE advance_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view advance votes"
  ON advance_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM decision_members dm
      WHERE dm.decision_id = advance_votes.decision_id
        AND dm.actor_user_id = auth.uid()
    )
  );

CREATE POLICY "Members can submit advance votes"
  ON advance_votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM decision_members dm
      WHERE dm.decision_id = advance_votes.decision_id
        AND dm.actor_user_id = auth.uid()
    )
  );

CREATE POLICY "Members can retract advance votes"
  ON advance_votes FOR DELETE
  USING (auth.uid() = user_id);
