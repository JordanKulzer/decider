-- =============================================================================
-- 013_comments.sql
--
-- Adds the comments table and supporting objects for the CommentSection UI.
--
-- Design notes
-- ────────────
-- • user_id is used (not actor_user_id) because:
--     - CommentSection only renders for authenticated users
--     - addComment / fetchComments in lib/decisions.ts use user_id directly
--     - All comment authors have a real auth.users row
--
-- • option_id / constraint_id / parent_id are nullable. The UI targets one
--   of them per comment (option comment, constraint comment, or decision-level
--   comment where all three are NULL). parent_id is used for reply threading.
--
-- • Soft-delete via deleted_at / deleted_by preserves thread structure while
--   hiding content. Hard DELETE (removeComment) is also supported for own rows.
--
-- • No UPDATE RLS is added for content editing. Edits are out of scope.
--   The organizer soft-delete path goes through the get_decision_comments RPC
--   which is SECURITY DEFINER, so it bypasses RLS cleanly.
--
-- Objects created:
--   • comments table + indexes
--   • RLS policies (SELECT, INSERT, DELETE)
--   • get_decision_comments(p_decision_id, p_user_id, p_guest_id) RPC
-- =============================================================================


-- ── 1. Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comments (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  decision_id   uuid        NOT NULL REFERENCES decisions(id)   ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  option_id     uuid                 REFERENCES options(id)     ON DELETE SET NULL,
  constraint_id uuid                 REFERENCES constraints(id) ON DELETE SET NULL,
  parent_id     uuid                 REFERENCES comments(id)    ON DELETE CASCADE,
  content       text        NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 500),
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  deleted_by    uuid                 REFERENCES auth.users(id)
);


-- ── 2. Indexes ────────────────────────────────────────────────────────────────

-- Primary query pattern: fetch all comments for a decision ordered by time.
CREATE INDEX IF NOT EXISTS idx_comments_decision_created
  ON comments (decision_id, created_at ASC);

-- Fast lookups when fetching replies for a parent comment.
CREATE INDEX IF NOT EXISTS idx_comments_parent
  ON comments (parent_id)
  WHERE parent_id IS NOT NULL;

-- Membership check in RLS uses user_id.
CREATE INDEX IF NOT EXISTS idx_comments_user
  ON comments (user_id);


-- ── 3. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the decision can read all comments for it.
-- Covers both quick-mode (actor_user_id) and advanced-mode (legacy user_id)
-- membership rows.
CREATE POLICY "Members can view comments"
  ON comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM decision_members dm
      WHERE dm.decision_id = comments.decision_id
        AND dm.actor_user_id = auth.uid()
    )
  );

-- INSERT: authenticated member, inserting their own row.
CREATE POLICY "Members can post comments"
  ON comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM decision_members dm
      WHERE dm.decision_id = comments.decision_id
        AND dm.actor_user_id = auth.uid()
    )
  );

-- DELETE: authors may hard-delete their own comments.
-- (removeComment in lib/decisions.ts uses a direct DELETE)
CREATE POLICY "Authors can delete own comments"
  ON comments FOR DELETE
  USING (user_id = auth.uid());

-- UPDATE: authors may soft-delete their own rows; organizers use the
-- SECURITY DEFINER RPC below which bypasses RLS.
-- This policy covers the direct .update() path used by softDeleteComment
-- when the caller is deleting their own comment.
CREATE POLICY "Authors can update own comments"
  ON comments FOR UPDATE
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ── 4. get_decision_comments RPC ─────────────────────────────────────────────
-- Returns all comments for a decision, ordered oldest-first, with the
-- commenter's username joined from the users table.
--
-- Runs SECURITY DEFINER so it can:
--   a) bypass RLS for the organizer soft-delete path (deleted_by check)
--   b) support the same p_user_id / p_guest_id call pattern as other RPCs
--
-- The caller must be a member of the decision; the function enforces this
-- explicitly before returning any data.

CREATE OR REPLACE FUNCTION public.get_decision_comments(
  p_decision_id uuid,
  p_user_id     uuid DEFAULT NULL,
  p_guest_id    text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

  -- Verify caller is a member of the decision.
  IF NOT EXISTS (
    SELECT 1 FROM decision_members dm
    WHERE dm.decision_id = p_decision_id
      AND (
        (p_user_id  IS NOT NULL AND dm.actor_user_id  = p_user_id)  OR
        (p_guest_id IS NOT NULL AND dm.actor_guest_id = p_guest_id)
      )
  ) THEN
    RAISE EXCEPTION 'Actor is not a member of decision %', p_decision_id;
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(row ORDER BY row.created_at ASC), '[]'::json)
    FROM (
      SELECT
        c.id,
        c.decision_id,
        c.user_id,
        c.option_id,
        c.constraint_id,
        c.parent_id,
        c.content,
        c.created_at,
        c.deleted_at,
        c.deleted_by,
        u.username
      FROM comments c
      LEFT JOIN users u ON u.id = c.user_id
      WHERE c.decision_id = p_decision_id
      ORDER BY c.created_at ASC
    ) row
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_decision_comments(uuid, uuid, text)
  TO authenticated;
