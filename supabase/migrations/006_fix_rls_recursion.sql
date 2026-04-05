-- =============================================================================
-- 006_fix_rls_recursion.sql
--
-- Fixes "infinite recursion detected in policy for relation decision_members".
--
-- Root cause: the decision_members SELECT policy checked membership by
-- querying decision_members itself, and the decisions SELECT policy also
-- queried decision_members — both triggering RLS on that table recursively.
--
-- Fix: replace both policies with calls to is_decision_member(), which is
-- defined as SECURITY DEFINER in 001_base_schema.sql and therefore bypasses
-- RLS, breaking the cycle.
-- =============================================================================

-- ── decision_members SELECT policy ───────────────────────────────────────────
DROP POLICY IF EXISTS "Members can view decision membership" ON decision_members;

CREATE POLICY "Members can view decision membership"
  ON decision_members FOR SELECT
  USING (public.is_decision_member(decision_id, auth.uid()));

-- ── decisions SELECT policy ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Members can view decisions" ON decisions;

CREATE POLICY "Members can view decisions"
  ON decisions FOR SELECT
  USING (public.is_decision_member(id, auth.uid()));
