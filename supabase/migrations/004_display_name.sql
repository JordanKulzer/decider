-- =============================================================================
-- 004_display_name.sql
--
-- Adds display_name to decision_members and updates the Quick Mode SECURITY
-- DEFINER functions to accept and store it.
--
-- Why display_name on decision_members (not users)?
-- ──────────────────────────────────────────────────
-- Guests have no users row, so there is nowhere to store a global name for
-- them. Authenticated users already have users.username. Storing display_name
-- on the membership row means:
--   • Each actor can have a per-decision name (useful later, no harm now).
--   • Guests get a readable name inside decisions without any account.
--   • Authenticated users default to their username when display_name is NULL.
--   • No schema changes are needed to users or auth.users.
-- =============================================================================

-- Drop old 5-param / 3-param signatures from 003_quick_mode.sql.
-- In Postgres, CREATE OR REPLACE with a different parameter list creates a
-- new overload rather than replacing the existing function. The old signatures
-- would remain callable and bypass display_name enforcement, so they must be
-- removed explicitly before the new versions are defined.
DROP FUNCTION IF EXISTS public.create_quick_decision(TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT);
DROP FUNCTION IF EXISTS public.join_quick_decision(TEXT, UUID, TEXT);

ALTER TABLE decision_members
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- ── create_quick_decision (updated) ──────────────────────────────────────────
-- Adds p_display_name parameter.
-- • Guests: display_name is required; raises an exception if absent or blank.
-- • Authenticated users: falls back to users.username when p_display_name is NULL.
-- Whitespace is normalized (TRIM) before storage in both cases.
CREATE OR REPLACE FUNCTION public.create_quick_decision(
  p_title        TEXT,
  p_category     TEXT,
  p_lock_time    TIMESTAMPTZ,
  p_user_id      UUID    DEFAULT NULL,
  p_guest_id     TEXT    DEFAULT NULL,
  p_display_name TEXT    DEFAULT NULL
)
RETURNS decisions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision     decisions%ROWTYPE;
  v_invite_code  TEXT;
  v_attempts     INTEGER := 0;
  v_display_name TEXT;
BEGIN
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

  IF p_guest_id IS NOT NULL AND p_guest_id NOT LIKE 'guest_%' THEN
    RAISE EXCEPTION 'Invalid guest_id format: must start with "guest_"';
  END IF;

  IF p_category NOT IN ('food', 'activity', 'trip', 'other') THEN
    RAISE EXCEPTION 'Invalid category: %', p_category;
  END IF;

  -- Resolve and normalize display_name.
  IF p_guest_id IS NOT NULL THEN
    -- Guests must provide a non-blank name — there is no fallback identity.
    IF TRIM(COALESCE(p_display_name, '')) = '' THEN
      RAISE EXCEPTION 'display_name is required for guests';
    END IF;
    v_display_name := TRIM(p_display_name);
  ELSE
    -- Authenticated user: use supplied name (trimmed) or fall back to username.
    IF p_display_name IS NOT NULL THEN
      v_display_name := TRIM(p_display_name);
    ELSE
      SELECT username INTO v_display_name FROM users WHERE id = p_user_id;
    END IF;
  END IF;

  LOOP
    v_invite_code := public.generate_invite_code();
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM decisions WHERE invite_code = v_invite_code
    );
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'Could not generate a unique invite code after 10 attempts';
    END IF;
  END LOOP;

  INSERT INTO decisions (
    mode, title, type_label, category,
    created_by, created_by_guest_id,
    lock_time, status, invite_code
  ) VALUES (
    'quick', p_title, p_category, p_category,
    p_user_id, p_guest_id,
    p_lock_time, 'options', v_invite_code
  )
  RETURNING * INTO v_decision;

  INSERT INTO decision_members
    (decision_id, actor_user_id, actor_guest_id, role, display_name)
  VALUES
    (v_decision.id, p_user_id, p_guest_id, 'organizer', v_display_name);

  RETURN v_decision;
END;
$$;

-- ── join_quick_decision (updated) ────────────────────────────────────────────
-- Adds p_display_name parameter. Same enforcement and normalization as above.
-- On idempotent re-join (already a member), updates display_name if a new
-- non-null value is provided — lets returning guests refresh their name.
CREATE OR REPLACE FUNCTION public.join_quick_decision(
  p_invite_code  TEXT,
  p_user_id      UUID    DEFAULT NULL,
  p_guest_id     TEXT    DEFAULT NULL,
  p_display_name TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision     decisions%ROWTYPE;
  v_display_name TEXT;
BEGIN
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

  IF p_guest_id IS NOT NULL AND p_guest_id NOT LIKE 'guest_%' THEN
    RAISE EXCEPTION 'Invalid guest_id format: must start with "guest_"';
  END IF;

  -- Resolve and normalize display_name.
  IF p_guest_id IS NOT NULL THEN
    IF TRIM(COALESCE(p_display_name, '')) = '' THEN
      RAISE EXCEPTION 'display_name is required for guests';
    END IF;
    v_display_name := TRIM(p_display_name);
  ELSE
    IF p_display_name IS NOT NULL THEN
      v_display_name := TRIM(p_display_name);
    ELSE
      SELECT username INTO v_display_name FROM users WHERE id = p_user_id;
    END IF;
  END IF;

  SELECT * INTO v_decision
  FROM decisions
  WHERE UPPER(invite_code) = UPPER(p_invite_code)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No decision found for invite code "%"', p_invite_code;
  END IF;

  -- Insert new membership, or update display_name if already a member.
  -- ON CONFLICT uses the partial index predicate — NOT "ON CONFLICT ON CONSTRAINT"
  -- which only works for named table-level UNIQUE constraints, not partial indexes.
  IF p_user_id IS NOT NULL THEN
    INSERT INTO decision_members
      (decision_id, actor_user_id, role, display_name)
    VALUES
      (v_decision.id, p_user_id, 'member', v_display_name)
    ON CONFLICT (decision_id, actor_user_id) WHERE actor_user_id IS NOT NULL
      DO UPDATE SET display_name = EXCLUDED.display_name
      WHERE decision_members.display_name IS DISTINCT FROM EXCLUDED.display_name;
  ELSE
    INSERT INTO decision_members
      (decision_id, actor_guest_id, role, display_name)
    VALUES
      (v_decision.id, p_guest_id, 'member', v_display_name)
    ON CONFLICT (decision_id, actor_guest_id) WHERE actor_guest_id IS NOT NULL
      DO UPDATE SET display_name = EXCLUDED.display_name
      WHERE decision_members.display_name IS DISTINCT FROM EXCLUDED.display_name;
  END IF;

  RETURN v_decision.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_quick_decision(TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.join_quick_decision(TEXT, UUID, TEXT, TEXT)
  TO anon, authenticated;
