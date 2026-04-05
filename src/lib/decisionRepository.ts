import type {
  DecisionActor,
  LiveDecisionState,
  QuickDecision,
  QuickDecisionCategory,
  QuickDecisionOption,
  ResponseType,
} from "../domain/decisionTypes";

// ─────────────────────────────────────────────────────────────────────────────
// Input / Output shapes
//
// Each method has a named input type so call-sites are readable and the
// interface can evolve without positional-argument churn.
// ─────────────────────────────────────────────────────────────────────────────

// ── createQuickDecision ───────────────────────────────────────────────────────

export interface CreateQuickDecisionInput {
  actor: DecisionActor;
  category: QuickDecisionCategory;
  /** Display name shown to other participants. Required for guests;
   *  authenticated users fall back to their username when omitted. */
  displayName?: string;
  /** Optional custom title. If omitted, a category-based default is used. */
  title?: string;
  /** Optional ISO-8601 closes_at timestamp. If omitted, a category default is used. */
  closesAt?: string;
  /**
   * Minimum number of 'im_in' responses required for an option to be declared
   * the winner. Null / omitted = no quorum (most 'im_in' always wins).
   */
  minimumAttendees?: number | null;
  /**
   * When true, the decision resolves the instant any option reaches
   * minimumAttendees — before the deadline.
   * Ignored when minimumAttendees is not set.
   */
  earlyLockEnabled?: boolean;
}

export interface CreateQuickDecisionResult {
  decision: QuickDecision;
}

// ── getLiveDecisionState ──────────────────────────────────────────────────────

export interface GetLiveDecisionStateInput {
  decisionId: string;
  /** The viewer — used to populate myResponse/myIsTopChoice and isCreator. */
  actor: DecisionActor;
}

// ── joinDecision ──────────────────────────────────────────────────────────────

export interface JoinDecisionInput {
  /** Accepts either a decision UUID or a short invite code. */
  decisionIdOrCode: string;
  actor: DecisionActor;
  /** Display name shown to other participants. Required for guests;
   *  authenticated users fall back to their username when omitted. */
  displayName?: string;
}

export interface JoinDecisionResult {
  /** The resolved decision ID (useful when joining via invite code). */
  decisionId: string;
  /** True if the actor was already a member before this call (idempotent re-join). */
  alreadyMember: boolean;
}

// ── addOption ─────────────────────────────────────────────────────────────────

export interface AddOptionInput {
  decisionId: string;
  actor: DecisionActor;
  title: string;
}

export interface AddOptionResult {
  option: QuickDecisionOption;
}

// ── setOptionResponse ─────────────────────────────────────────────────────────

export interface SetOptionResponseInput {
  decisionId: string;
  optionId: string;
  response: ResponseType;
  actor: DecisionActor;
}

// ── toggleTopChoice ───────────────────────────────────────────────────────────

export interface ToggleTopChoiceInput {
  decisionId: string;
  optionId: string;
  actor: DecisionActor;
}

// ── extendDeadline ────────────────────────────────────────────────────────────

export interface ExtendDeadlineInput {
  decisionId: string;
  actor: DecisionActor;
  /** Number of minutes to add to the current closes_at. Must be > 0. */
  minutesToAdd: number;
}

export interface ExtendDeadlineResult {
  /** The new ISO-8601 closes_at timestamp after the extension. */
  newClosesAt: string;
}

// ── endDecisionEarly ──────────────────────────────────────────────────────────

export interface EndDecisionEarlyInput {
  decisionId: string;
  actor: DecisionActor;
}

// ── deleteDecision ────────────────────────────────────────────────────────────

export interface DeleteDecisionInput {
  decisionId: string;
  actor: DecisionActor;
}

// ── leaveDecision ─────────────────────────────────────────────────────────────

export interface LeaveDecisionInput {
  decisionId: string;
  actor: DecisionActor;
}

// ── renameDecision ────────────────────────────────────────────────────────────

export interface RenameDecisionInput {
  decisionId: string;
  actor: DecisionActor;
  /** New title. Must be non-empty after trimming. Max 60 characters. */
  title: string;
}

// ── endSetupPhase ─────────────────────────────────────────────────────────────

export interface EndSetupPhaseInput {
  decisionId: string;
  actor: DecisionActor;
  /**
   * Quorum settings collected during setup. Applied atomically when setup ends.
   * Null = no quorum required.
   */
  minimumAttendees: number | null;
  earlyLockEnabled: boolean;
}

// ── deleteOption ──────────────────────────────────────────────────────────────

export interface DeleteOptionInput {
  decisionId: string;
  optionId: string;
  actor: DecisionActor;
}

// ── updateOption ──────────────────────────────────────────────────────────────

export interface UpdateOptionInput {
  decisionId: string;
  optionId: string;
  title: string;
  actor: DecisionActor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The contract between the UI layer and the data layer for Quick Mode.
 *
 * Two implementations will exist:
 *   - MockDecisionRepository   (used during UI development and testing)
 *   - SupabaseDecisionRepository (production backend)
 *
 * The UI imports only this interface and a factory function — it never
 * references either concrete class directly.
 */
export interface DecisionRepository {
  /**
   * Creates a new Quick Mode decision with auto-generated title and a 24-hour
   * deadline. The actor is added as the organizer member automatically.
   *
   * Throws if creation fails.
   */
  createQuickDecision(
    input: CreateQuickDecisionInput
  ): Promise<CreateQuickDecisionResult>;

  /**
   * Returns the full live state of a decision as seen by the given actor.
   * Options are sorted by imInCount DESC, topChoiceCount DESC, createdAt ASC.
   * myResponse and myIsTopChoice on each option reflect the actor's personal state.
   *
   * Throws if the decision does not exist.
   */
  getLiveDecisionState(
    input: GetLiveDecisionStateInput
  ): Promise<LiveDecisionState>;

  /**
   * Adds the actor as a member of the decision.
   * No-ops gracefully if the actor is already a member.
   *
   * Throws if the decision does not exist or the code is invalid.
   */
  joinDecision(input: JoinDecisionInput): Promise<JoinDecisionResult>;

  /**
   * Adds a new option to the decision.
   *
   * Throws if:
   *   - the decision is locked
   *   - the actor is not a member
   *   - title is empty after trimming
   */
  addOption(input: AddOptionInput): Promise<AddOptionResult>;

  /**
   * Sets the actor's response on a single option.
   * Idempotent — safe to call repeatedly with the same or different value.
   * Changing to 'cant' automatically clears is_top_choice on that option.
   *
   * Throws if:
   *   - the decision is locked
   *   - the actor is not a member
   *   - the option does not belong to this decision
   */
  setOptionResponse(input: SetOptionResponseInput): Promise<void>;

  /**
   * Toggles the top_choice flag on one option for the actor.
   * Requires an existing 'im_in' or 'prefer_not' response on this option.
   * Turning on clears top_choice on all other options for this actor.
   *
   * Returns the new is_top_choice value.
   *
   * Throws if:
   *   - the decision is locked
   *   - no 'im_in' or 'prefer_not' response exists on this option
   */
  toggleTopChoice(input: ToggleTopChoiceInput): Promise<boolean>;

  /**
   * Extends the decision deadline by the given number of minutes.
   * Only the creator may call this.
   *
   * Throws if:
   *   - the decision is already locked
   *   - the actor is not the creator
   *   - minutesToAdd is <= 0
   */
  extendDeadline(input: ExtendDeadlineInput): Promise<ExtendDeadlineResult>;

  /**
   * Immediately locks the decision regardless of the current deadline.
   * Sets status to "locked" and lock_time to now.
   * Only the creator may call this.
   *
   * Throws if:
   *   - the decision is already locked
   *   - the actor is not the creator
   */
  endDecisionEarly(input: EndDecisionEarlyInput): Promise<void>;

  /**
   * Permanently deletes the decision and all related data (members, options,
   * votes). Only the creator may call this.
   *
   * Throws if the actor is not the creator.
   */
  deleteDecision(input: DeleteDecisionInput): Promise<void>;

  /**
   * Removes the actor from the decision and clears all their votes.
   * The creator cannot leave — they must delete the decision instead.
   *
   * Throws if the actor is not a member.
   */
  leaveDecision(input: LeaveDecisionInput): Promise<void>;

  /**
   * Updates the decision's display title. Only the creator may call this.
   * Allowed only while setup_phase = true.
   *
   * Throws if:
   *   - the actor is not the creator
   *   - title is empty after trimming
   *   - title exceeds 60 characters
   *   - setup phase has already ended
   */
  renameDecision(input: RenameDecisionInput): Promise<void>;

  /**
   * Exits the setup phase, applying the final quorum rules atomically.
   * No-op if setup_phase is already false.
   * Only the creator may call this.
   *
   * Throws if the decision is locked.
   */
  endSetupPhase(input: EndSetupPhaseInput): Promise<void>;

  /**
   * Removes an option during setup phase. Creator-only.
   *
   * Throws if:
   *   - setup_phase = false
   *   - the actor is not the creator
   *   - the option does not exist in this decision
   */
  deleteOption(input: DeleteOptionInput): Promise<void>;

  /**
   * Renames an option during setup phase. Creator-only.
   *
   * Throws if:
   *   - setup_phase = false
   *   - the actor is not the creator
   *   - the option does not exist in this decision
   *   - the new title is empty or duplicates an existing option
   */
  updateOption(input: UpdateOptionInput): Promise<void>;

  /**
   * Subscribes to state changes for a specific decision.
   *
   * The listener is called (with no arguments) after any mutation that
   * changes decision state: joinDecision, addOption, setOptionResponse,
   * toggleTopChoice, extendDeadline, endDecisionEarly.
   *
   * Returns an unsubscribe function. Call it when the subscriber unmounts
   * to prevent memory leaks and stale-closure calls.
   *
   * Mock implementation: in-memory listener set, synchronous notification.
   * Supabase implementation: wraps a realtime channel subscription.
   */
  subscribeToDecision(decisionId: string, listener: () => void): () => void;
}
