import { supabase } from "./supabase";
import {
  buildLiveDecisionState,
  type DecisionActor,
  type LiveDecisionState,
  type QuickDecision,
  type QuickDecisionCategory,
  type QuickDecisionMember,
  type QuickDecisionOption,
  type ResponseType,
} from "../domain/decisionTypes";
import type {
  AddOptionInput,
  AddOptionResult,
  CreateQuickDecisionInput,
  CreateQuickDecisionResult,
  DecisionRepository,
  DeleteDecisionInput,
  DeleteOptionInput,
  EndDecisionEarlyInput,
  EndSetupPhaseInput,
  ExtendDeadlineInput,
  ExtendDeadlineResult,
  GetLiveDecisionStateInput,
  JoinDecisionInput,
  JoinDecisionResult,
  LeaveDecisionInput,
  RenameDecisionInput,
  SetOptionResponseInput,
  ToggleTopChoiceInput,
  UpdateOptionInput,
} from "./decisionRepository";

// ── Category deadlines (mirrors MockDecisionRepository) ───────────────────────

const DEADLINE_MS: Record<QuickDecisionCategory, number> = {
  food:     2  * 60 * 60 * 1000,
  activity: 6  * 60 * 60 * 1000,
  trip:     3  * 24 * 60 * 60 * 1000,
  other:    24 * 60 * 60 * 1000,
};

const DEFAULT_TITLES: Record<QuickDecisionCategory, string> = {
  food:     "Dinner tonight",
  activity: "What should we do?",
  trip:     "Trip plan",
  other:    "New decision",
};

function pickTitle(category: QuickDecisionCategory): string {
  return DEFAULT_TITLES[category];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUUID(s: string): boolean {
  return UUID_RE.test(s);
}

function actorParams(actor: DecisionActor): { p_user_id?: string; p_guest_id?: string } {
  return actor.kind === "user"
    ? { p_user_id: actor.userId }
    : { p_guest_id: actor.guestId };
}

/** Maps a `decisions` table row (snake_case) to the QuickDecision domain type. */
function mapDecisionRow(row: Record<string, any>): QuickDecision {
  return {
    id:                row.id,
    title:             row.title,
    category:          row.category,
    closesAt:          row.closes_at,
    status:            row.status,
    inviteCode:        row.invite_code,
    createdAt:         row.created_at,
    createdBy:         row.created_by ?? row.created_by_guest_id,
    minimumAttendees:  row.minimum_attendees  ?? null,
    earlyLockEnabled:  row.early_lock_enabled ?? false,
    setupPhase:        row.setup_phase        ?? true,
    resolvedOptionId:  row.resolved_option_id ?? null,
    resolutionReason:  row.resolution_reason  ?? null,
  };
}

/** Maps an `options` table row (snake_case) to the QuickDecisionOption domain type. */
function mapOptionRow(row: Record<string, any>): QuickDecisionOption {
  return {
    id:                  row.id,
    decisionId:          row.decision_id,
    title:               row.title,
    imInCount:           0,
    topChoiceCount:      0,
    createdAt:           row.created_at,
    submittedByUserId:   row.submitted_by_user_id ?? null,
    submittedByGuestId:  row.submitted_by_guest_id ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SupabaseDecisionRepository
// ─────────────────────────────────────────────────────────────────────────────

export class SupabaseDecisionRepository implements DecisionRepository {

  // ── createQuickDecision ───────────────────────────────────────────────────

  async createQuickDecision(
    input: CreateQuickDecisionInput
  ): Promise<CreateQuickDecisionResult> {
    const { actor, category, displayName } = input;

    const params: Record<string, unknown> = {
      p_title:     input.title?.trim() || pickTitle(category),
      p_category:  category,
      p_closes_at: input.closesAt ?? new Date(Date.now() + DEADLINE_MS[category]).toISOString(),
      ...actorParams(actor),
    };
    if (displayName !== undefined) {
      params.p_display_name = displayName;
    }
    if (input.minimumAttendees !== undefined && input.minimumAttendees !== null) {
      params.p_minimum_attendees = input.minimumAttendees;
    }
    if (input.earlyLockEnabled) {
      params.p_early_lock_enabled = true;
    }

    const { data, error } = await supabase.rpc("create_quick_decision", params);
    if (error) throw new Error(error.message);

    return { decision: mapDecisionRow(data as Record<string, any>) };
  }

  // ── getLiveDecisionState ──────────────────────────────────────────────────

  async getLiveDecisionState(
    input: GetLiveDecisionStateInput
  ): Promise<LiveDecisionState> {
    const { decisionId, actor } = input;

    const { data, error } = await supabase.rpc("get_quick_decision_state", {
      p_decision_id: decisionId,
      ...actorParams(actor),
    });
    if (error) throw new Error(error.message);

    const json = data as Record<string, any>;

    const decision: QuickDecision = {
      id:                json.decision.id,
      title:             json.decision.title,
      category:          json.decision.category,
      closesAt:          json.decision.closesAt,
      status:            json.decision.status,
      inviteCode:        json.decision.inviteCode,
      createdAt:         json.decision.createdAt,
      createdBy:         json.decision.createdBy,
      minimumAttendees:  json.decision.minimumAttendees  ?? null,
      earlyLockEnabled:  json.decision.earlyLockEnabled  ?? false,
      setupPhase:        json.decision.setupPhase        ?? false,
      resolvedOptionId:  json.decision.resolvedOptionId  ?? null,
      resolutionReason:  json.decision.resolutionReason  ?? null,
    };

    const members: QuickDecisionMember[] = (json.members ?? []).map(
      (m: Record<string, any>) => ({
        id:            m.id,
        decisionId:    m.decisionId,
        actorUserId:   m.actorUserId  ?? null,
        actorGuestId:  m.actorGuestId ?? null,
        joinedAt:      m.joinedAt,
        displayName:   m.displayName  ?? null,
        hasResponded:  m.hasResponded ?? false,
      })
    );

    const myResponsesByOptionId: Record<string, { response: ResponseType; isTopChoice: boolean }> = {};
    const options: QuickDecisionOption[] = (json.options ?? []).map(
      (o: Record<string, any>) => {
        if (o.myResponse !== null && o.myResponse !== undefined) {
          myResponsesByOptionId[o.id] = {
            response:    o.myResponse as ResponseType,
            isTopChoice: o.myIsTopChoice ?? false,
          };
        }
        return {
          id:                 o.id,
          decisionId:         o.decisionId,
          title:              o.title,
          imInCount:          o.imInCount       ?? 0,
          topChoiceCount:     o.topChoiceCount  ?? 0,
          createdAt:          o.createdAt,
          submittedByUserId:  o.submittedByUserId  ?? null,
          submittedByGuestId: o.submittedByGuestId ?? null,
        };
      }
    );

    return buildLiveDecisionState(decision, members, options, myResponsesByOptionId, actor);
  }

  // ── joinDecision ──────────────────────────────────────────────────────────

  async joinDecision(input: JoinDecisionInput): Promise<JoinDecisionResult> {
    const { decisionIdOrCode, actor, displayName } = input;

    const byId = isUUID(decisionIdOrCode);
    const rpcName = byId ? "join_quick_decision_by_id" : "join_quick_decision";

    const params: Record<string, unknown> = byId
      ? { p_decision_id: decisionIdOrCode }
      : { p_invite_code: decisionIdOrCode };

    Object.assign(params, actorParams(actor));
    if (displayName !== undefined) {
      params.p_display_name = displayName;
    }

    const { data, error } = await supabase.rpc(rpcName, params);
    if (error) throw new Error(error.message);

    const json = data as Record<string, any>;
    return {
      decisionId:    json.decisionId,
      alreadyMember: json.alreadyMember ?? false,
    };
  }

  // ── addOption ─────────────────────────────────────────────────────────────

  async addOption(input: AddOptionInput): Promise<AddOptionResult> {
    const { decisionId, actor, title } = input;

    const { data, error } = await supabase.rpc("add_quick_option", {
      p_decision_id: decisionId,
      p_title:       title,
      ...actorParams(actor),
    });
    if (error) throw new Error(error.message);

    return { option: mapOptionRow(data as Record<string, any>) };
  }

  // ── setOptionResponse ─────────────────────────────────────────────────────

  async setOptionResponse(input: SetOptionResponseInput): Promise<void> {
    const { decisionId, optionId, response, actor } = input;

    const { error } = await supabase.rpc("upsert_option_response", {
      p_decision_id: decisionId,
      p_option_id:   optionId,
      p_response:    response,
      ...actorParams(actor),
    });
    if (error) throw new Error(error.message);
  }

  // ── toggleTopChoice ───────────────────────────────────────────────────────

  async toggleTopChoice(input: ToggleTopChoiceInput): Promise<boolean> {
    const { decisionId, optionId, actor } = input;

    const { data, error } = await supabase.rpc("toggle_top_choice", {
      p_decision_id: decisionId,
      p_option_id:   optionId,
      ...actorParams(actor),
    });
    if (error) throw new Error(error.message);
    return data as boolean;
  }

  // ── extendDeadline ────────────────────────────────────────────────────────

  async extendDeadline(input: ExtendDeadlineInput): Promise<ExtendDeadlineResult> {
    const { decisionId, actor, minutesToAdd } = input;

    const { data, error } = await supabase.rpc("extend_quick_deadline", {
      p_decision_id:    decisionId,
      p_minutes_to_add: minutesToAdd,
      ...actorParams(actor),
    });
    if (error) throw new Error(error.message);

    const json = data as Record<string, any>;
    return { newClosesAt: json.newClosesAt };
  }

  // ── endDecisionEarly ──────────────────────────────────────────────────────

  async endDecisionEarly(input: EndDecisionEarlyInput): Promise<void> {
    const { decisionId, actor } = input;

    const { error } = await supabase.rpc("end_quick_decision_early", {
      p_decision_id: decisionId,
      ...actorParams(actor),
    });
    if (error) throw new Error(error.message);
  }

  // ── deleteDecision ────────────────────────────────────────────────────────

  async deleteDecision(input: DeleteDecisionInput): Promise<void> {
    const { decisionId, actor } = input;

    const { error } = await supabase.rpc("delete_quick_decision", {
      p_decision_id: decisionId,
      ...actorParams(actor),
    });
    if (error) throw new Error(error.message);
  }

  // ── leaveDecision ─────────────────────────────────────────────────────────

  async leaveDecision(input: LeaveDecisionInput): Promise<void> {
    const { decisionId, actor } = input;

    const { error } = await supabase.rpc("leave_quick_decision", {
      p_decision_id: decisionId,
      ...actorParams(actor),
    });
    if (error) throw new Error(error.message);
  }

  // ── renameDecision ────────────────────────────────────────────────────────

  async renameDecision(input: RenameDecisionInput): Promise<void> {
    const { decisionId, actor, title } = input;

    const { error } = await supabase.rpc("rename_quick_decision", {
      p_decision_id: decisionId,
      p_title:       title,
      ...actorParams(actor),
    });
    if (error) throw new Error(error.message);
  }

  // ── endSetupPhase ─────────────────────────────────────────────────────────

  async endSetupPhase(input: EndSetupPhaseInput): Promise<void> {
    const { decisionId, actor, minimumAttendees, earlyLockEnabled } = input;

    const params: Record<string, unknown> = {
      p_decision_id:        decisionId,
      p_early_lock_enabled: earlyLockEnabled,
      ...actorParams(actor),
    };
    if (minimumAttendees !== null) {
      params.p_minimum_attendees = minimumAttendees;
    }

    const { error } = await supabase.rpc("end_setup_phase", params);
    if (error) throw new Error(error.message);
  }

  // ── deleteOption ──────────────────────────────────────────────────────────

  async deleteOption(input: DeleteOptionInput): Promise<void> {
    const { decisionId, optionId, actor } = input;

    const { error } = await supabase.rpc("delete_quick_option", {
      p_decision_id: decisionId,
      p_option_id:   optionId,
      ...actorParams(actor),
    });
    if (error) throw new Error(error.message);
  }

  // ── updateOption ──────────────────────────────────────────────────────────

  async updateOption(input: UpdateOptionInput): Promise<void> {
    const { decisionId, optionId, title, actor } = input;

    const { error } = await supabase.rpc("update_quick_option", {
      p_decision_id: decisionId,
      p_option_id:   optionId,
      p_title:       title,
      ...actorParams(actor),
    });
    if (error) throw new Error(error.message);
  }

  // ── subscribeToDecision ───────────────────────────────────────────────────

  subscribeToDecision(decisionId: string, listener: () => void): () => void {
    const channel = supabase
      .channel(`quick_decision_${decisionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "decisions", filter: `id=eq.${decisionId}` },
        listener
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "decision_members", filter: `decision_id=eq.${decisionId}` },
        listener
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "options", filter: `decision_id=eq.${decisionId}` },
        listener
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "option_responses", filter: `decision_id=eq.${decisionId}` },
        listener
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
}
