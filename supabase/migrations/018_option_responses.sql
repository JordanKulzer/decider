-- =============================================================================
-- 018_option_responses.sql
--
-- Replaces the numeric quick_votes model with structured per-option responses.
-- Each participant sets one of ('im_in', 'prefer_not', 'cant') per option,
-- and may mark exactly one option as their top_choice.
--
-- Changes:
--   • Creates option_responses table
--   • upsert_option_response() — replaces upsert_quick_vote()
--   • toggle_top_choice()      — new
--   • get_quick_decision_state() rewritten for response-based fields
-- =============================================================================


-- ── 1. Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS option_responses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id     UUID        NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  option_id       UUID        NOT NULL REFERENCES options(id)   ON DELETE CASCADE,

  -- XOR identity: exactly one must be set.
  actor_user_id   UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_guest_id  TEXT,
  CONSTRAINT chk_option_response_actor
    CHECK (num_nonnulls(actor_user_id, actor_guest_id) = 1),

  response        TEXT        NOT NULL CHECK (response IN ('im_in', 'prefer_not', 'cant')),
  is_top_choice   BOOLEAN     NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One response per (option × actor), per identity path.
CREATE UNIQUE INDEX uq_option_responses_user
  ON option_responses (option_id, actor_user_id)
  WHERE actor_user_id IS NOT NULL;

CREATE UNIQUE INDEX uq_option_responses_guest
  ON option_responses (option_id, actor_guest_id)
  WHERE actor_guest_id IS NOT NULL;

CREATE INDEX idx_option_responses_decision ON option_responses (decision_id);
CREATE INDEX idx_option_responses_option   ON option_responses (option_id);

ALTER TABLE option_responses ENABLE ROW LEVEL SECURITY;

-- Authenticated members can read all responses for their decisions.
-- Guest reads go through the SECURITY DEFINER get_quick_decision_state function.
CREATE POLICY "Members can view option responses"
  ON option_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM decision_members dm
      WHERE dm.decision_id = option_responses.decision_id
        AND dm.actor_user_id = auth.uid()
    )
  );


-- ── 2. upsert_option_response ─────────────────────────────────────────────────
-- Sets one participant's response on one option.
-- Idempotent: safe to call repeatedly with the same or different value.
-- Selecting 'cant' automatically clears is_top_choice on that option.

CREATE OR REPLACE FUNCTION public.upsert_option_response(
  p_decision_id  UUID,
  p_option_id    UUID,
  p_response     TEXT,           -- 'im_in' | 'prefer_not' | 'cant'
  p_user_id      UUID DEFAULT NULL,
  p_guest_id     TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision decisions%ROWTYPE;
BEGIN
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

  IF p_response NOT IN ('im_in', 'prefer_not', 'cant') THEN
    RAISE EXCEPTION 'Invalid response: must be im_in, prefer_not, or cant';
  END IF;

  SELECT * INTO v_decision FROM decisions WHERE id = p_decision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found: %', p_decision_id;
  END IF;

  IF v_decision.status = 'locked' OR v_decision.closes_at <= NOW() THEN
    RAISE EXCEPTION 'Cannot respond: decision is locked';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM options WHERE id = p_option_id AND decision_id = p_decision_id
  ) THEN
    RAISE EXCEPTION 'Option % not found in decision %', p_option_id, p_decision_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM decision_members dm
    WHERE dm.decision_id = p_decision_id
      AND (
        (p_user_id  IS NOT NULL AND dm.actor_user_id  = p_user_id) OR
        (p_guest_id IS NOT NULL AND dm.actor_guest_id = p_guest_id)
      )
  ) THEN
    RAISE EXCEPTION 'Actor is not a member of this decision';
  END IF;

  IF p_user_id IS NOT NULL THEN
    INSERT INTO option_responses
      (decision_id, option_id, actor_user_id, response, is_top_choice)
    VALUES
      (p_decision_id, p_option_id, p_user_id, p_response, false)
    ON CONFLICT (option_id, actor_user_id)
      WHERE actor_user_id IS NOT NULL
      DO UPDATE SET
        response      = p_response,
        -- Changing to 'cant' clears top choice; other transitions preserve it
        is_top_choice = CASE WHEN p_response = 'cant'
                             THEN false
                             ELSE option_responses.is_top_choice END,
        updated_at    = NOW();
  ELSE
    INSERT INTO option_responses
      (decision_id, option_id, actor_guest_id, response, is_top_choice)
    VALUES
      (p_decision_id, p_option_id, p_guest_id, p_response, false)
    ON CONFLICT (option_id, actor_guest_id)
      WHERE actor_guest_id IS NOT NULL
      DO UPDATE SET
        response      = p_response,
        is_top_choice = CASE WHEN p_response = 'cant'
                             THEN false
                             ELSE option_responses.is_top_choice END,
        updated_at    = NOW();
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_option_response(UUID, UUID, TEXT, UUID, TEXT)
  TO anon, authenticated;


-- ── 3. toggle_top_choice ──────────────────────────────────────────────────────
-- Toggles the top_choice flag on one option for one participant.
--
-- Rules:
--   • Requires an existing 'im_in' or 'prefer_not' response on this option
--   • Toggling ON clears is_top_choice on all other options for this actor
--   • Toggling OFF just clears is_top_choice on this option
-- Returns the new is_top_choice value.

CREATE OR REPLACE FUNCTION public.toggle_top_choice(
  p_decision_id  UUID,
  p_option_id    UUID,
  p_user_id      UUID DEFAULT NULL,
  p_guest_id     TEXT DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision      decisions%ROWTYPE;
  v_current_resp  TEXT;
  v_current_tc    BOOLEAN;
  v_new_tc        BOOLEAN;
BEGIN
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

  SELECT * INTO v_decision FROM decisions WHERE id = p_decision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found: %', p_decision_id;
  END IF;

  IF v_decision.status = 'locked' OR v_decision.closes_at <= NOW() THEN
    RAISE EXCEPTION 'Cannot update top choice: decision is locked';
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT response, is_top_choice INTO v_current_resp, v_current_tc
    FROM option_responses
    WHERE option_id = p_option_id AND actor_user_id = p_user_id;
  ELSE
    SELECT response, is_top_choice INTO v_current_resp, v_current_tc
    FROM option_responses
    WHERE option_id = p_option_id AND actor_guest_id = p_guest_id;
  END IF;

  IF v_current_resp IS NULL OR v_current_resp = 'cant' THEN
    RAISE EXCEPTION 'Top choice requires an im_in or prefer_not response on this option';
  END IF;

  v_new_tc := NOT COALESCE(v_current_tc, false);

  -- Turning on: clear top choice on all other options for this actor in this decision
  IF v_new_tc THEN
    IF p_user_id IS NOT NULL THEN
      UPDATE option_responses
      SET is_top_choice = false, updated_at = NOW()
      WHERE decision_id = p_decision_id
        AND actor_user_id = p_user_id
        AND option_id <> p_option_id;
    ELSE
      UPDATE option_responses
      SET is_top_choice = false, updated_at = NOW()
      WHERE decision_id = p_decision_id
        AND actor_guest_id = p_guest_id
        AND option_id <> p_option_id;
    END IF;
  END IF;

  IF p_user_id IS NOT NULL THEN
    UPDATE option_responses
    SET is_top_choice = v_new_tc, updated_at = NOW()
    WHERE option_id = p_option_id AND actor_user_id = p_user_id;
  ELSE
    UPDATE option_responses
    SET is_top_choice = v_new_tc, updated_at = NOW()
    WHERE option_id = p_option_id AND actor_guest_id = p_guest_id;
  END IF;

  RETURN v_new_tc;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_top_choice(UUID, UUID, UUID, TEXT)
  TO anon, authenticated;


-- ── 4. get_quick_decision_state (rewrite) ────────────────────────────────────
-- Returns response-based data instead of numeric vote counts.
--
-- Per option:  imInCount, topChoiceCount, myResponse, myIsTopChoice
-- Per member:  hasResponded (replaces hasVoted)
-- Options sorted by: imInCount DESC, topChoiceCount DESC, created_at ASC

DROP FUNCTION IF EXISTS public.get_quick_decision_state(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.get_quick_decision_state(
  p_decision_id UUID,
  p_user_id     UUID DEFAULT NULL,
  p_guest_id    TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision decisions%ROWTYPE;
BEGIN
  IF num_nonnulls(p_user_id, p_guest_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one of p_user_id or p_guest_id must be provided';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM decision_members dm
    WHERE dm.decision_id = p_decision_id
      AND (
        (p_user_id  IS NOT NULL AND dm.actor_user_id  = p_user_id) OR
        (p_guest_id IS NOT NULL AND dm.actor_guest_id = p_guest_id)
      )
  ) THEN
    RAISE EXCEPTION 'Actor is not a member of decision %', p_decision_id;
  END IF;

  SELECT * INTO v_decision FROM decisions WHERE id = p_decision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found: %', p_decision_id;
  END IF;

  IF v_decision.status != 'locked' AND v_decision.closes_at <= NOW() THEN
    UPDATE decisions SET status = 'locked' WHERE id = p_decision_id;
    v_decision.status := 'locked';
  END IF;

  RETURN json_build_object(
    'decision', json_build_object(
      'id',         v_decision.id,
      'title',      v_decision.title,
      'category',   v_decision.category,
      'closesAt',   v_decision.closes_at,
      'status',     v_decision.status,
      'inviteCode', v_decision.invite_code,
      'createdAt',  v_decision.created_at,
      'createdBy',  COALESCE(v_decision.created_by::text, v_decision.created_by_guest_id)
    ),
    'members', (
      SELECT json_agg(json_build_object(
        'id',            dm.id,
        'decisionId',    dm.decision_id,
        'actorUserId',   dm.actor_user_id,
        'actorGuestId',  dm.actor_guest_id,
        'joinedAt',      dm.joined_at,
        'displayName',   dm.display_name,
        'hasResponded',  EXISTS (
          SELECT 1 FROM option_responses orr
          WHERE orr.decision_id = p_decision_id
            AND (
              (dm.actor_user_id  IS NOT NULL AND orr.actor_user_id  = dm.actor_user_id) OR
              (dm.actor_guest_id IS NOT NULL AND orr.actor_guest_id = dm.actor_guest_id)
            )
        )
      ))
      FROM decision_members dm
      WHERE dm.decision_id = p_decision_id
    ),
    'options', (
      SELECT json_agg(
        json_build_object(
          'id',                  o.id,
          'decisionId',          o.decision_id,
          'title',               o.title,
          'imInCount',           COALESCE(agg.im_in_count, 0),
          'topChoiceCount',      COALESCE(agg.top_choice_count, 0),
          'myResponse',          mine.response,
          'myIsTopChoice',       COALESCE(mine.is_top_choice, false),
          'createdAt',           o.created_at,
          'submittedByUserId',   o.submitted_by_user_id,
          'submittedByGuestId',  o.submitted_by_guest_id
        )
        ORDER BY
          COALESCE(agg.im_in_count, 0)       DESC,
          COALESCE(agg.top_choice_count, 0)  DESC,
          o.created_at                        ASC
      )
      FROM options o
      LEFT JOIN (
        SELECT
          option_id,
          COUNT(*) FILTER (WHERE response = 'im_in')       AS im_in_count,
          COUNT(*) FILTER (WHERE is_top_choice = true)     AS top_choice_count
        FROM option_responses
        WHERE decision_id = p_decision_id
        GROUP BY option_id
      ) agg ON agg.option_id = o.id
      LEFT JOIN LATERAL (
        SELECT response, is_top_choice
        FROM option_responses
        WHERE option_id = o.id
          AND (
            (p_user_id  IS NOT NULL AND actor_user_id  = p_user_id) OR
            (p_guest_id IS NOT NULL AND actor_guest_id = p_guest_id)
          )
        LIMIT 1
      ) mine ON true
      WHERE o.decision_id = p_decision_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_quick_decision_state(UUID, UUID, TEXT)
  TO anon, authenticated;
