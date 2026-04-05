// ─────────────────────────────────────────────────────────────────────────────
// Quick Decision Domain Types
//
// These types describe the Quick Mode domain only.
// They are intentionally separate from the legacy advanced-mode types in
// src/types/decisions.ts so the two flows don't become entangled.
// ─────────────────────────────────────────────────────────────────────────────

// ── Primitives ────────────────────────────────────────────────────────────────

/** Distinguishes the two top-level flows in the app. */
export type DecisionMode = "quick" | "advanced";

/**
 * The outcome written to decisions.resolution_reason when a quick decision
 * is locked by resolve_quick_decision().
 *
 *   "winner"       — one option cleared the quorum (or no quorum was set)
 *   "no_quorum"    — minimum_attendees was set but no option reached it
 *   "no_responses" — no option received even one 'im_in' response
 */
export type ResolutionReason = "winner" | "no_quorum" | "no_responses";

/**
 * Quick decisions only have two meaningful statuses:
 *   - "options"  → decision is open, options can be added and responses set
 *   - "locked"   → deadline passed or creator ended early, no more changes
 */
export type QuickDecisionStatus = "options" | "locked";

/** Category the creator chose at the start of the Quick flow. */
export type QuickDecisionCategory = "food" | "activity" | "trip" | "other";

/**
 * A participant's structured response to one option.
 *   - "im_in"       → participant is available / on board
 *   - "prefer_not"  → participant can make it but would rather not
 *   - "cant"        → participant cannot do this option
 */
export type ResponseType = "im_in" | "prefer_not" | "cant";

// ── Identity ──────────────────────────────────────────────────────────────────

/**
 * Who is performing an action.
 *
 * A discriminated union so every call-site is forced to handle both cases.
 * The UI resolves an actor once at startup and passes it through; the
 * repository implementations use it to decide which DB column to write to.
 */
export type DecisionActor =
  | { kind: "user";  userId:  string }
  | { kind: "guest"; guestId: string };

/** Extracts the raw ID string from an actor regardless of kind. */
export function actorId(actor: DecisionActor): string {
  return actor.kind === "user" ? actor.userId : actor.guestId;
}

// ── Core entities ─────────────────────────────────────────────────────────────

/** A Quick Mode decision record. */
export interface QuickDecision {
  id: string;
  title: string;
  category: QuickDecisionCategory;
  /** ISO-8601 timestamp of when the decision closes. */
  closesAt: string;
  status: QuickDecisionStatus;
  inviteCode: string;
  createdAt: string;
  /**
   * Raw creator identity — either an auth user ID or a guest_ prefixed string.
   * Use `isCreator(decision, actor)` rather than comparing this directly.
   */
  createdBy: string;

  // ── Resolution settings (set at creation time) ──────────────────────────

  /**
   * Minimum number of 'im_in' responses an option must have to be declared
   * the winner. NULL means no quorum is required.
   */
  minimumAttendees: number | null;
  /**
   * When true and minimum_attendees is set, the decision resolves the instant
   * any option reaches the quorum threshold — before the deadline.
   */
  earlyLockEnabled: boolean;

  // ── Setup phase ─────────────────────────────────────────────────────────────

  /**
   * True while the decision is in the pre-launch staging area.
   * During setup the creator can add/edit/remove options and configure
   * quorum rules. Setup ends when the creator taps "Start / Share" or
   * when the first participant response is submitted (auto-transition).
   */
  setupPhase: boolean;

  // ── Resolution output (written when the decision locks) ─────────────────

  /**
   * The winning option's ID, or null when the resolution reason is not
   * 'winner' (quorum miss or no responses). NULL until the decision is locked.
   */
  resolvedOptionId: string | null;
  /**
   * Why the decision resolved as it did. NULL until the decision is locked
   * and fully resolved by resolve_quick_decision().
   */
  resolutionReason: ResolutionReason | null;
}

/**
 * A participant in a quick decision.
 * One of actorUserId / actorGuestId will be set; the other will be null.
 */
export interface QuickDecisionMember {
  id: string;
  decisionId: string;
  actorUserId:  string | null;
  actorGuestId: string | null;
  joinedAt: string;
  /** Readable name shown to other participants. */
  displayName: string | null;
  /** True when the member has set at least one response in this decision. */
  hasResponded: boolean;
}

/**
 * A single option within a quick decision.
 * Counts are aggregated across all participants.
 */
export interface QuickDecisionOption {
  id: string;
  decisionId: string;
  title: string;
  /** Number of participants whose response is 'im_in'. */
  imInCount: number;
  /** Number of participants who have marked this as their top choice. */
  topChoiceCount: number;
  createdAt: string;
  submittedByUserId:  string | null;
  submittedByGuestId: string | null;
}

// ── View models ───────────────────────────────────────────────────────────────

/**
 * A single option enriched with the current actor's personal response state.
 * Used directly by the LiveDecisionScreen render path.
 */
export interface LiveDecisionOptionView extends QuickDecisionOption {
  /** This actor's current response, or null if they haven't responded yet. */
  myResponse:    ResponseType | null;
  /** True when this actor has marked this option as their top choice. */
  myIsTopChoice: boolean;
}

/**
 * The complete view state for the LiveDecisionScreen.
 *
 * All derived booleans are pre-computed here so the screen is pure display
 * logic. The repository/hook layer is responsible for producing this shape.
 */
export interface LiveDecisionState {
  decision: QuickDecision;
  members:  QuickDecisionMember[];
  /** Options sorted by imInCount DESC, topChoiceCount DESC, createdAt ASC. */
  options:  LiveDecisionOptionView[];
  isCreator: boolean;
  isLocked:  boolean;
  /**
   * IDs of the options with the most 'im_in' responses — used for live
   * highlighting during the active phase only.
   * More than one entry means a tie at the top right now.
   * Empty when no options have any 'im_in' responses yet.
   *
   * At lock time, prefer decision.resolvedOptionId for the resolved winner,
   * which is always a single option (deterministic tiebreakers).
   */
  leaderOptionIds: string[];
  /**
   * Human-readable rule message derived from minimumAttendees and
   * earlyLockEnabled. Displayed near the top of the screen.
   * Examples: "Most people in wins", "Needs 3 people in to finalize",
   *           "First option to 3 people wins"
   */
  ruleMessage: string;
  /**
   * True when at least one member has submitted any response.
   * Drives the participation signal ("X of Y responded").
   */
  hasAnyResponse: boolean;
  /**
   * True while the decision is in the pre-launch staging area.
   * When true: creator can add/edit/remove options and rename the decision.
   * When false: structure is frozen and normal commitment voting is active.
   */
  isSetupPhase: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default deadline duration for a new quick decision, in milliseconds. */
export const DEFAULT_QUICK_DEADLINE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if the given actor is the creator of the decision. */
export function isCreator(decision: QuickDecision, actor: DecisionActor): boolean {
  return actorId(actor) === decision.createdBy;
}

/**
 * Derives the rule message shown near the top of LiveDecisionScreen.
 *
 * The three rule configurations map to distinct lock behaviors:
 *   • No threshold:              "Most people in wins at deadline"
 *     → At deadline, option with most 'im_in' responses wins. No minimum.
 *   • Threshold + deadline:      "Needs N in to finalize — most people in wins at deadline"
 *     → At deadline, winner must have ≥ N. Otherwise no_quorum (no plan locks).
 *     → "most people in wins" describes who the winner will be IF quorum is met.
 *   • Threshold + early lock:    "Locks as soon as N say they're in"
 *     → First option to reach N locks immediately. If none reach N by deadline → no_quorum.
 */
export function deriveRuleMessage(decision: QuickDecision): string {
  const n = decision.minimumAttendees;
  if (n === null) {
    return "Most people in wins at deadline";
  }
  const people = n === 1 ? "1 person" : `${n} people`;
  if (decision.earlyLockEnabled) {
    return `Locks as soon as ${people} say they're in`;
  }
  return `Needs ${people} in to finalize — most people in wins at deadline`;
}

/**
 * Derives `leaderOptionIds` from a list of options based on imInCount.
 * Returns [] if no option has any 'im_in' responses.
 */
export function deriveLeaderOptionIds(options: QuickDecisionOption[]): string[] {
  if (options.length === 0) return [];
  const topCount = Math.max(...options.map((o) => o.imInCount));
  if (topCount === 0) return [];
  return options.filter((o) => o.imInCount === topCount).map((o) => o.id);
}

/**
 * Derives the full `LiveDecisionState` from raw data.
 * Keeping this as a pure function makes it trivially testable.
 */
export function buildLiveDecisionState(
  decision: QuickDecision,
  members:  QuickDecisionMember[],
  options:  QuickDecisionOption[],
  myResponsesByOptionId: Record<string, { response: ResponseType; isTopChoice: boolean }>,
  actor: DecisionActor,
): LiveDecisionState {
  const enrichedOptions: LiveDecisionOptionView[] = options
    .map((o) => ({
      ...o,
      myResponse:    myResponsesByOptionId[o.id]?.response    ?? null,
      myIsTopChoice: myResponsesByOptionId[o.id]?.isTopChoice ?? false,
    }))
    // Sort matches get_quick_decision_state ORDER BY
    .sort((a, b) =>
      b.imInCount - a.imInCount ||
      b.topChoiceCount - a.topChoiceCount ||
      a.createdAt.localeCompare(b.createdAt)
    );

  return {
    decision,
    members,
    options: enrichedOptions,
    isCreator: isCreator(decision, actor),
    isLocked:  decision.status === "locked",
    leaderOptionIds: deriveLeaderOptionIds(options),
    ruleMessage: deriveRuleMessage(decision),
    hasAnyResponse: members.some((m) => m.hasResponded),
    isSetupPhase: decision.setupPhase,
  };
}
