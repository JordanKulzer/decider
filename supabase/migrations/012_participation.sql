-- =============================================================================
-- 012_participation.sql
--
-- Adds per-member participation signal to get_quick_decision_state.
--
-- Change: members JSON now includes a "hasVoted" boolean — true when the
-- member has placed at least one vote anywhere in the decision.
--
-- This is a pure query change; no schema alteration is required.
-- quick_votes rows only exist while count > 0 (zero-count rows are deleted
-- by upsert_quick_vote), so EXISTS correctly reflects active participation.
-- =============================================================================


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
        (p_user_id  IS NOT NULL AND dm.actor_user_id  = p_user_id)  OR
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
        'id',           dm.id,
        'decisionId',   dm.decision_id,
        'actorUserId',  dm.actor_user_id,
        'actorGuestId', dm.actor_guest_id,
        'joinedAt',     dm.joined_at,
        'displayName',  dm.display_name,
        -- true when the member has placed at least one vote in this decision.
        -- quick_votes rows are deleted when count reaches 0, so EXISTS is exact.
        'hasVoted', EXISTS (
          SELECT 1 FROM quick_votes qv
          WHERE qv.decision_id = p_decision_id
            AND (
              (dm.actor_user_id  IS NOT NULL AND qv.actor_user_id  = dm.actor_user_id)  OR
              (dm.actor_guest_id IS NOT NULL AND qv.actor_guest_id = dm.actor_guest_id)
            )
        )
      ))
      FROM decision_members dm
      WHERE dm.decision_id = p_decision_id
    ),
    'options', (
      SELECT json_agg(
        json_build_object(
          'id',               o.id,
          'decisionId',       o.decision_id,
          'title',            o.title,
          'voteTotal',        COALESCE(total.total_count, 0),
          'myVoteCount',      COALESCE(mine.my_count, 0),
          'createdAt',        o.created_at,
          'submittedByUserId',  o.submitted_by_user_id,
          'submittedByGuestId', o.submitted_by_guest_id
        )
        ORDER BY COALESCE(total.total_count, 0) DESC, o.created_at ASC
      )
      FROM options o
      LEFT JOIN (
        SELECT option_id, SUM(count) AS total_count
        FROM quick_votes WHERE decision_id = p_decision_id GROUP BY option_id
      ) total ON total.option_id = o.id
      LEFT JOIN (
        SELECT option_id, SUM(count) AS my_count
        FROM quick_votes
        WHERE decision_id = p_decision_id
          AND (
            (p_user_id  IS NOT NULL AND actor_user_id  = p_user_id)  OR
            (p_guest_id IS NOT NULL AND actor_guest_id = p_guest_id)
          )
        GROUP BY option_id
      ) mine ON mine.option_id = o.id
      WHERE o.decision_id = p_decision_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_quick_decision_state(UUID, UUID, TEXT)
  TO anon, authenticated;
