-- =============================================================================
-- 015_comment_delete_permissions.sql
--
-- Expands comment DELETE and UPDATE (soft-delete) permissions so that the
-- decision creator can remove any comment on their decision, in addition to
-- the existing author-only rule.
--
-- Root cause of the prior gap
-- ────────────────────────────
-- The original policies only checked `user_id = auth.uid()`, which means
-- the organizer's direct `.delete()` or `.update()` calls were rejected by
-- RLS even though the UI correctly showed the delete button.
--
-- The UPDATE WITH CHECK gap
-- ─────────────────────────
-- RLS WITH CHECK applies to the post-update row state. After a soft-delete
-- (setting deleted_at / deleted_by) the row's user_id is still the original
-- author — not the organizer. So `WITH CHECK (user_id = auth.uid())` always
-- failed for the organizer path. The fix expands WITH CHECK to the same
-- EXISTS predicate used in USING.
--
-- Guest-created decisions
-- ───────────────────────
-- If decisions.created_by IS NULL (guest creator), no auth user satisfies
-- `d.created_by = auth.uid()`, so the organizer branch simply never applies.
-- Comment authors can still delete their own comments as before.
--
-- Objects changed:
--   • DROP + recreate "Authors can delete own comments"
--   • DROP + recreate "Authors can update own comments"
-- =============================================================================


-- ── DELETE ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authors can delete own comments" ON comments;

CREATE POLICY "Authors or organizers can delete comments"
  ON comments FOR DELETE
  USING (
    -- Comment author
    user_id = auth.uid()
    -- OR authenticated decision creator
    OR EXISTS (
      SELECT 1 FROM decisions d
      WHERE d.id = comments.decision_id
        AND d.created_by = auth.uid()
    )
  );


-- ── UPDATE (soft-delete) ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authors can update own comments" ON comments;

-- NOTE: WITH CHECK evaluates the post-update row. After a soft-delete the
-- user_id column is unchanged (still the original author). We check the same
-- EXISTS predicate in both USING and WITH CHECK so the organizer path
-- satisfies both clauses regardless of user_id.
CREATE POLICY "Authors or organizers can update comments"
  ON comments FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM decisions d
      WHERE d.id = comments.decision_id
        AND d.created_by = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM decisions d
      WHERE d.id = comments.decision_id
        AND d.created_by = auth.uid()
    )
  );
