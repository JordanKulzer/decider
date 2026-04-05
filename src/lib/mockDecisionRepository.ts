import {
  actorId,
  buildLiveDecisionState,
  isCreator,
  type DecisionActor,
  type QuickDecision,
  type QuickDecisionCategory,
  type QuickDecisionMember,
  type QuickDecisionOption,
  type ResolutionReason,
  type ResponseType,
} from "../domain/decisionTypes";

import type { LiveDecisionState } from "../domain/decisionTypes";

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

// ─────────────────────────────────────────────────────────────────────────────
// Internal storage types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One response record per (actor × option) pair within a decision.
 *
 * Mirrors the option_responses table: one of the actor id fields is set,
 * and is_top_choice is a per-actor flag that can be true on at most one option
 * per actor per decision.
 */
interface ResponseRecord {
  actorRawId: string;
  optionId:   string;
  response:   ResponseType;
  isTopChoice: boolean;
}

/**
 * Composite key for the response map: `${actorRawId}:${optionId}`.
 */
function responseKey(actorRawId: string, optionId: string): string {
  return `${actorRawId}:${optionId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Title pools per category
// ─────────────────────────────────────────────────────────────────────────────

const TITLE_POOLS: Record<QuickDecisionCategory, string[]> = {
  food: [
    "Dinner tonight",
    "Where should we eat?",
    "Lunch pick",
    "Food run",
  ],
  activity: [
    "What should we do?",
    "Activity pick",
    "Plans for tonight",
    "Let's do something",
  ],
  trip: [
    "Where should we go?",
    "Next trip",
    "Destination pick",
    "Travel plans",
  ],
  other: [
    "Quick decision",
    "Help us decide",
    "What do you think?",
    "Group pick",
  ],
};

/** Deadline duration in milliseconds per category. */
const DEADLINE_MS: Record<QuickDecisionCategory, number> = {
  food:     2  * 60 * 60 * 1000,       // 2 hours
  activity: 6  * 60 * 60 * 1000,       // 6 hours
  trip:     3  * 24 * 60 * 60 * 1000,  // 3 days
  other:    24 * 60 * 60 * 1000,       // 24 hours
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

let _idCounter = 0;

/** Deterministic, incrementing ID — no randomness so tests can assert on it. */
function nextId(prefix: string): string {
  _idCounter += 1;
  return `${prefix}_${String(_idCounter).padStart(5, "0")}`;
}

/** Resets the counter — useful in test setup. */
export function _resetIdCounter(): void {
  _idCounter = 0;
}

function now(): string {
  return new Date().toISOString();
}

/** Generates a 6-character uppercase invite code from the decision id. */
function makeInviteCode(decisionId: string): string {
  const seed = decisionId.split("_")[1] ?? "000001";
  const n = parseInt(seed, 10);
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  let v = n;
  for (let i = 0; i < 6; i++) {
    code += chars[v % chars.length];
    v = Math.floor(v / chars.length) + (i + 1) * 7;
  }
  return code;
}

/** Picks a title from the pool deterministically by cycling through the list. */
function pickTitle(category: QuickDecisionCategory, decisionIndex: number): string {
  const pool = TITLE_POOLS[category];
  return pool[decisionIndex % pool.length];
}

/** Normalizes an option title for duplicate detection. */
function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function isExpiredByDeadline(decision: QuickDecision): boolean {
  return Date.now() > new Date(decision.closesAt).getTime();
}

function isEffectivelyLocked(decision: QuickDecision): boolean {
  return decision.status === "locked" || isExpiredByDeadline(decision);
}

const actorKey = actorId;

// ─────────────────────────────────────────────────────────────────────────────
// MockDecisionRepository
// ─────────────────────────────────────────────────────────────────────────────

export class MockDecisionRepository implements DecisionRepository {
  // ── In-memory stores ────────────────────────────────────────────────────────
  private decisions  = new Map<string, QuickDecision>();
  private members    = new Map<string, QuickDecisionMember[]>(); // keyed by decisionId
  private options    = new Map<string, QuickDecisionOption[]>(); // keyed by decisionId
  /**
   * Outer key: decisionId
   * Inner key: responseKey(actorRawId, optionId) → ResponseRecord
   *
   * One record per (actor × option) pair.
   */
  private responses  = new Map<string, Map<string, ResponseRecord>>();

  /** Active listeners keyed by decisionId. */
  private listeners  = new Map<string, Set<() => void>>();

  /** Track how many decisions have been created so title cycling works. */
  private decisionCount = 0;

  // ── Private helpers ─────────────────────────────────────────────────────────

  private getDecisionOrThrow(decisionId: string): QuickDecision {
    const d = this.decisions.get(decisionId);
    if (!d) throw new Error(`Decision not found: ${decisionId}`);
    return d;
  }

  private resolveDecisionOrThrow(decisionIdOrCode: string): QuickDecision {
    const byId = this.decisions.get(decisionIdOrCode);
    if (byId) return byId;

    const upper = decisionIdOrCode.toUpperCase();
    for (const d of this.decisions.values()) {
      if (d.inviteCode === upper) return d;
    }

    throw new Error(`Decision not found for id or code: "${decisionIdOrCode}"`);
  }

  private getMembersOf(decisionId: string): QuickDecisionMember[] {
    return this.members.get(decisionId) ?? [];
  }

  private getOptionsOf(decisionId: string): QuickDecisionOption[] {
    return this.options.get(decisionId) ?? [];
  }

  private getResponseMap(decisionId: string): Map<string, ResponseRecord> {
    let map = this.responses.get(decisionId);
    if (!map) {
      map = new Map();
      this.responses.set(decisionId, map);
    }
    return map;
  }

  private isMember(decisionId: string, actor: DecisionActor): boolean {
    const key = actorKey(actor);
    return this.getMembersOf(decisionId).some((m) =>
      actor.kind === "user"
        ? m.actorUserId === key
        : m.actorGuestId === key
    );
  }

  /**
   * Returns { [optionId]: { response, isTopChoice } } for every option
   * this actor has a response on. Used by buildLiveDecisionState.
   */
  private myResponsesByOption(
    decisionId: string,
    actor: DecisionActor
  ): Record<string, { response: ResponseType; isTopChoice: boolean }> {
    const rawId = actorKey(actor);
    const result: Record<string, { response: ResponseType; isTopChoice: boolean }> = {};
    for (const record of this.getResponseMap(decisionId).values()) {
      if (record.actorRawId === rawId) {
        result[record.optionId] = {
          response:    record.response,
          isTopChoice: record.isTopChoice,
        };
      }
    }
    return result;
  }

  /**
   * Recomputes imInCount and topChoiceCount on every option for a decision
   * by scanning the response map. Called after every response mutation.
   */
  private syncOptionCounts(decisionId: string): void {
    const imInCounts:       Record<string, number> = {};
    const topChoiceCounts:  Record<string, number> = {};

    for (const record of this.getResponseMap(decisionId).values()) {
      if (record.response === "im_in") {
        imInCounts[record.optionId] = (imInCounts[record.optionId] ?? 0) + 1;
      }
      if (record.isTopChoice) {
        topChoiceCounts[record.optionId] = (topChoiceCounts[record.optionId] ?? 0) + 1;
      }
    }

    const opts = this.getOptionsOf(decisionId).map((o) => ({
      ...o,
      imInCount:      imInCounts[o.id]      ?? 0,
      topChoiceCount: topChoiceCounts[o.id] ?? 0,
    }));
    this.options.set(decisionId, opts);
  }

  private notify(decisionId: string): void {
    const set = this.listeners.get(decisionId);
    if (!set) return;
    for (const listener of set) {
      listener();
    }
  }

  /**
   * Deterministic resolution algorithm — mirrors resolve_quick_decision() in SQL.
   *
   * Tiebreaker 1: imInCount DESC
   * Tiebreaker 2: topChoiceCount DESC
   * Tiebreaker 3: createdAt ASC  (always unique → always one winner)
   *
   * Mutates the stored decision in place to set resolvedOptionId,
   * resolutionReason, and status='locked'. Returns the mutated record.
   */
  private _resolveDecision(decisionId: string): QuickDecision {
    const decision = this.getDecisionOrThrow(decisionId);

    // Idempotent: already fully resolved.
    if (decision.status === "locked" && decision.resolutionReason !== null) {
      return decision;
    }

    const options       = this.getOptionsOf(decisionId);
    const responseMap   = this.getResponseMap(decisionId);

    // Aggregate im_in and top_choice counts per option.
    const imInCounts:       Record<string, number> = {};
    const topChoiceCounts:  Record<string, number> = {};
    for (const record of responseMap.values()) {
      if (record.response === "im_in") {
        imInCounts[record.optionId] = (imInCounts[record.optionId] ?? 0) + 1;
      }
      if (record.isTopChoice) {
        topChoiceCounts[record.optionId] = (topChoiceCounts[record.optionId] ?? 0) + 1;
      }
    }

    let resolvedOptionId: string | null = null;
    let resolutionReason: ResolutionReason;

    if (options.length === 0) {
      // No options were ever added.
      resolutionReason = "no_responses";
    } else {
      // Sort: imInCount DESC, topChoiceCount DESC, createdAt ASC
      const sorted = [...options].sort((a, b) => {
        const imInDiff = (imInCounts[b.id] ?? 0) - (imInCounts[a.id] ?? 0);
        if (imInDiff !== 0) return imInDiff;
        const tcDiff = (topChoiceCounts[b.id] ?? 0) - (topChoiceCounts[a.id] ?? 0);
        if (tcDiff !== 0) return tcDiff;
        return a.createdAt.localeCompare(b.createdAt);
      });

      const candidate    = sorted[0];
      const candidateImIn = imInCounts[candidate.id] ?? 0;

      if (candidateImIn === 0) {
        // Options exist but no im_in responses at all.
        resolutionReason = "no_responses";
      } else if (
        decision.minimumAttendees !== null &&
        candidateImIn < decision.minimumAttendees
      ) {
        // Quorum was set and the leading option didn't reach it.
        resolutionReason = "no_quorum";
      } else {
        resolvedOptionId = candidate.id;
        resolutionReason = "winner";
      }
    }

    const resolved: QuickDecision = {
      ...decision,
      status:           "locked",
      resolvedOptionId,
      resolutionReason,
    };
    this.decisions.set(decisionId, resolved);
    return resolved;
  }

  /**
   * Checks whether early-lock conditions are met after a response mutation
   * and, if so, resolves the decision immediately.
   * A no-op when early_lock_enabled is false or minimum_attendees is null.
   */
  private _checkEarlyLock(decisionId: string): void {
    const decision = this.decisions.get(decisionId);
    if (!decision) return;
    if (!decision.earlyLockEnabled || decision.minimumAttendees === null) return;
    if (decision.status === "locked") return;

    const responseMap = this.getResponseMap(decisionId);
    const imInPerOption: Record<string, number> = {};
    for (const record of responseMap.values()) {
      if (record.response === "im_in") {
        imInPerOption[record.optionId] = (imInPerOption[record.optionId] ?? 0) + 1;
      }
    }

    const maxImIn = Math.max(0, ...Object.values(imInPerOption));
    if (maxImIn >= decision.minimumAttendees) {
      this._resolveDecision(decisionId);
    }
  }

  subscribeToDecision(decisionId: string, listener: () => void): () => void {
    let set = this.listeners.get(decisionId);
    if (!set) {
      set = new Set();
      this.listeners.set(decisionId, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) {
        this.listeners.delete(decisionId);
      }
    };
  }

  private applyDeadlineIfExpired(decision: QuickDecision): QuickDecision {
    if (decision.status !== "locked" && isExpiredByDeadline(decision)) {
      // Resolve (sets status, resolvedOptionId, resolutionReason) rather than
      // just flipping the status flag — matches resolve_quick_decision() in SQL.
      return this._resolveDecision(decision.id);
    }
    return decision;
  }

  // ── DecisionRepository implementation ──────────────────────────────────────

  async createQuickDecision(
    input: CreateQuickDecisionInput
  ): Promise<CreateQuickDecisionResult> {
    const { actor, category } = input;

    const id = nextId("dec");
    const createdAt = now();
    const closesAt = input.closesAt ?? new Date(
      Date.now() + DEADLINE_MS[category]
    ).toISOString();

    const decision: QuickDecision = {
      id,
      title: input.title?.trim() || pickTitle(category, this.decisionCount),
      category,
      closesAt,
      status: "options",
      inviteCode: makeInviteCode(id),
      createdAt,
      createdBy: actorId(actor),
      // Quorum settings start at defaults — finalised via endSetupPhase.
      minimumAttendees:  input.minimumAttendees  ?? null,
      earlyLockEnabled:  input.earlyLockEnabled  ?? false,
      setupPhase:        true,
      resolvedOptionId:  null,
      resolutionReason:  null,
    };

    this.decisionCount += 1;
    this.decisions.set(id, decision);
    this.members.set(id, []);
    this.options.set(id, []);
    this.responses.set(id, new Map());

    const memberId = nextId("mbr");
    const creatorMember: QuickDecisionMember = {
      id: memberId,
      decisionId: id,
      actorUserId:  actor.kind === "user"  ? actor.userId  : null,
      actorGuestId: actor.kind === "guest" ? actor.guestId : null,
      joinedAt: createdAt,
      displayName: input.displayName ?? null,
      hasResponded: false,
    };
    this.members.set(id, [creatorMember]);

    return { decision };
  }

  async getLiveDecisionState(
    input: GetLiveDecisionStateInput
  ): Promise<LiveDecisionState> {
    const { decisionId, actor } = input;

    let decision = this.getDecisionOrThrow(decisionId);
    decision = this.applyDeadlineIfExpired(decision);

    const rawMembers = this.getMembersOf(decisionId);
    const options    = this.getOptionsOf(decisionId);
    const myResponsesByOptionId = this.myResponsesByOption(decisionId, actor);

    // Derive hasResponded dynamically — a member has responded if they have
    // any response record in this decision.
    const responseMap = this.getResponseMap(decisionId);
    const members: QuickDecisionMember[] = rawMembers.map((m) => {
      const rawId = m.actorUserId ?? m.actorGuestId ?? "";
      const hasResponded = rawId
        ? [...responseMap.values()].some((r) => r.actorRawId === rawId)
        : false;
      return { ...m, hasResponded };
    });

    return buildLiveDecisionState(decision, members, options, myResponsesByOptionId, actor);
  }

  async joinDecision(input: JoinDecisionInput): Promise<JoinDecisionResult> {
    const { decisionIdOrCode, actor } = input;

    const decision = this.resolveDecisionOrThrow(decisionIdOrCode);

    if (this.isMember(decision.id, actor)) {
      return { decisionId: decision.id, alreadyMember: true };
    }

    const member: QuickDecisionMember = {
      id: nextId("mbr"),
      decisionId: decision.id,
      actorUserId:  actor.kind === "user"  ? actor.userId  : null,
      actorGuestId: actor.kind === "guest" ? actor.guestId : null,
      joinedAt: now(),
      displayName: input.displayName ?? null,
      hasResponded: false,
    };

    const existing = this.getMembersOf(decision.id);
    this.members.set(decision.id, [...existing, member]);
    this.notify(decision.id);

    return { decisionId: decision.id, alreadyMember: false };
  }

  async addOption(input: AddOptionInput): Promise<AddOptionResult> {
    const { decisionId, actor, title } = input;

    const decision = this.applyDeadlineIfExpired(
      this.getDecisionOrThrow(decisionId)
    );

    if (isEffectivelyLocked(decision)) {
      throw new Error("Cannot add options: decision is locked.");
    }

    // Structure lock: options can only be added during setup phase.
    if (!decision.setupPhase) {
      throw new Error("Options are locked once the decision is started.");
    }

    // Only the creator may add options.
    if (!isCreator(decision, actor)) {
      throw new Error("Only the creator can add options.");
    }

    if (!this.isMember(decisionId, actor)) {
      throw new Error("Actor must join the decision before adding options.");
    }

    const trimmed = title.trim();
    if (trimmed.length === 0) {
      throw new Error("Option title cannot be empty.");
    }

    const normalized = normalizeTitle(trimmed);
    const duplicate = this.getOptionsOf(decisionId).some(
      (o) => normalizeTitle(o.title) === normalized
    );
    if (duplicate) {
      throw new Error(`Duplicate option: "${trimmed}" already exists in this decision.`);
    }

    const option: QuickDecisionOption = {
      id: nextId("opt"),
      decisionId,
      title: trimmed,
      imInCount:      0,
      topChoiceCount: 0,
      createdAt: now(),
      submittedByUserId:  actor.kind === "user"  ? actor.userId  : null,
      submittedByGuestId: actor.kind === "guest" ? actor.guestId : null,
    };

    const existing = this.getOptionsOf(decisionId);
    this.options.set(decisionId, [...existing, option]);
    this.notify(decisionId);

    return { option };
  }

  async setOptionResponse(input: SetOptionResponseInput): Promise<void> {
    const { decisionId, optionId, response, actor } = input;

    let decision = this.applyDeadlineIfExpired(
      this.getDecisionOrThrow(decisionId)
    );

    if (isEffectivelyLocked(decision)) {
      throw new Error("Cannot respond: decision is locked.");
    }

    if (!this.isMember(decisionId, actor)) {
      throw new Error("Actor must join the decision before responding.");
    }

    // Auto-end setup phase when the first response is submitted.
    if (decision.setupPhase) {
      decision = { ...decision, setupPhase: false };
      this.decisions.set(decisionId, decision);
    }

    const option = this.getOptionsOf(decisionId).find((o) => o.id === optionId);
    if (!option) {
      throw new Error(`Option not found in this decision: ${optionId}`);
    }

    const rawId = actorKey(actor);
    const key   = responseKey(rawId, optionId);
    const map   = this.getResponseMap(decisionId);
    const existing = map.get(key);

    const newIsTopChoice =
      response === "cant"
        ? false
        : existing?.isTopChoice ?? false;

    map.set(key, { actorRawId: rawId, optionId, response, isTopChoice: newIsTopChoice });

    this.syncOptionCounts(decisionId);
    // Check early lock after every response change.
    this._checkEarlyLock(decisionId);
    this.notify(decisionId);
  }

  async toggleTopChoice(input: ToggleTopChoiceInput): Promise<boolean> {
    const { decisionId, optionId, actor } = input;

    const decision = this.applyDeadlineIfExpired(
      this.getDecisionOrThrow(decisionId)
    );

    if (isEffectivelyLocked(decision)) {
      throw new Error("Cannot update top choice: decision is locked.");
    }

    const rawId  = actorKey(actor);
    const key    = responseKey(rawId, optionId);
    const map    = this.getResponseMap(decisionId);
    const record = map.get(key);

    if (!record || record.response === "cant") {
      throw new Error("Top choice requires an im_in or prefer_not response on this option.");
    }

    const newTopChoice = !record.isTopChoice;

    if (newTopChoice) {
      // Clear top_choice on all other options for this actor in this decision.
      for (const [k, r] of map.entries()) {
        if (r.actorRawId === rawId && r.optionId !== optionId && r.isTopChoice) {
          map.set(k, { ...r, isTopChoice: false });
        }
      }
    }

    map.set(key, { ...record, isTopChoice: newTopChoice });

    this.syncOptionCounts(decisionId);
    this.notify(decisionId);

    return newTopChoice;
  }

  async extendDeadline(input: ExtendDeadlineInput): Promise<ExtendDeadlineResult> {
    const { decisionId, actor, minutesToAdd } = input;

    const decision = this.applyDeadlineIfExpired(
      this.getDecisionOrThrow(decisionId)
    );

    if (isEffectivelyLocked(decision)) {
      throw new Error("Cannot extend: decision is already locked.");
    }

    if (!isCreator(decision, actor)) {
      throw new Error("Only the creator can extend the deadline.");
    }

    if (minutesToAdd <= 0) {
      throw new Error(`minutesToAdd must be greater than 0, got ${minutesToAdd}.`);
    }

    const currentLock = new Date(decision.closesAt).getTime();
    const newClosesAt = new Date(
      currentLock + minutesToAdd * 60 * 1000
    ).toISOString();

    const updated: QuickDecision = { ...decision, closesAt: newClosesAt };
    this.decisions.set(decisionId, updated);
    this.notify(decisionId);

    return { newClosesAt };
  }

  async endDecisionEarly(input: EndDecisionEarlyInput): Promise<void> {
    const { decisionId, actor } = input;

    const decision = this.applyDeadlineIfExpired(
      this.getDecisionOrThrow(decisionId)
    );

    if (isEffectivelyLocked(decision)) {
      throw new Error("Decision is already locked.");
    }

    if (!isCreator(decision, actor)) {
      throw new Error("Only the creator can end the decision early.");
    }

    // Snap deadline to now before resolving so the algorithm sees the current
    // state (early-end is an explicit creator action, not a quorum trigger).
    const snapped: QuickDecision = { ...decision, closesAt: now() };
    this.decisions.set(decisionId, snapped);
    this._resolveDecision(decisionId);
    this.notify(decisionId);
  }

  async deleteDecision(input: DeleteDecisionInput): Promise<void> {
    const { decisionId, actor } = input;

    const decision = this.getDecisionOrThrow(decisionId);

    if (!isCreator(decision, actor)) {
      throw new Error("Only the creator can delete this decision.");
    }

    this.decisions.delete(decisionId);
    this.members.delete(decisionId);
    this.options.delete(decisionId);
    this.responses.delete(decisionId);
    this.listeners.delete(decisionId);
  }

  async renameDecision(input: RenameDecisionInput): Promise<void> {
    const { decisionId, actor, title } = input;

    const decision = this.getDecisionOrThrow(decisionId);

    if (!isCreator(decision, actor)) {
      throw new Error("Only the creator can rename this decision.");
    }

    // Title is frozen once setup ends.
    if (!decision.setupPhase) {
      throw new Error("Title cannot be changed once the decision is started.");
    }

    const trimmed = title.trim();
    if (!trimmed) throw new Error("Title cannot be empty.");
    if (trimmed.length > 60) throw new Error("Title is too long (max 60 characters).");

    this.decisions.set(decisionId, { ...decision, title: trimmed });
    this.notify(decisionId);
  }

  async leaveDecision(input: LeaveDecisionInput): Promise<void> {
    const { decisionId, actor } = input;

    this.getDecisionOrThrow(decisionId);

    if (!this.isMember(decisionId, actor)) {
      throw new Error("Actor is not a member of this decision.");
    }

    const remaining = this.getMembersOf(decisionId).filter((m) =>
      actor.kind === "user"
        ? m.actorUserId !== actorKey(actor)
        : m.actorGuestId !== actorKey(actor)
    );
    this.members.set(decisionId, remaining);

    // Remove all of this actor's responses for this decision.
    const rawId      = actorKey(actor);
    const responseMap = this.getResponseMap(decisionId);
    for (const [key, record] of responseMap.entries()) {
      if (record.actorRawId === rawId) {
        responseMap.delete(key);
      }
    }
    this.syncOptionCounts(decisionId);
    this.notify(decisionId);
  }

  async endSetupPhase(input: EndSetupPhaseInput): Promise<void> {
    const { decisionId, actor, minimumAttendees, earlyLockEnabled } = input;

    const decision = this.applyDeadlineIfExpired(
      this.getDecisionOrThrow(decisionId)
    );

    if (isEffectivelyLocked(decision)) {
      throw new Error("Cannot end setup: decision is already locked.");
    }

    if (!isCreator(decision, actor)) {
      throw new Error("Only the creator can end the setup phase.");
    }

    // Idempotent.
    if (!decision.setupPhase) return;

    this.decisions.set(decisionId, {
      ...decision,
      setupPhase:        false,
      minimumAttendees:  minimumAttendees,
      earlyLockEnabled:  earlyLockEnabled,
    });
    this.notify(decisionId);
  }

  async deleteOption(input: DeleteOptionInput): Promise<void> {
    const { decisionId, optionId, actor } = input;

    const decision = this.getDecisionOrThrow(decisionId);

    if (!decision.setupPhase) {
      throw new Error("Options cannot be removed once the decision is started.");
    }

    if (!isCreator(decision, actor)) {
      throw new Error("Only the creator can remove options.");
    }

    const existing = this.getOptionsOf(decisionId);
    if (!existing.some((o) => o.id === optionId)) {
      throw new Error("Option not found in this decision.");
    }

    this.options.set(decisionId, existing.filter((o) => o.id !== optionId));
    this.notify(decisionId);
  }

  async updateOption(input: UpdateOptionInput): Promise<void> {
    const { decisionId, optionId, title, actor } = input;

    const decision = this.getDecisionOrThrow(decisionId);

    if (!decision.setupPhase) {
      throw new Error("Options cannot be edited once the decision is started.");
    }

    if (!isCreator(decision, actor)) {
      throw new Error("Only the creator can edit options.");
    }

    const trimmed = title.trim();
    if (!trimmed) throw new Error("Option title cannot be empty.");

    const existing = this.getOptionsOf(decisionId);
    const target = existing.find((o) => o.id === optionId);
    if (!target) throw new Error("Option not found in this decision.");

    const normalized = normalizeTitle(trimmed);
    const duplicate = existing.some(
      (o) => o.id !== optionId && normalizeTitle(o.title) === normalized
    );
    if (duplicate) throw new Error(`Duplicate option: "${trimmed}" already exists.`);

    this.options.set(
      decisionId,
      existing.map((o) => (o.id === optionId ? { ...o, title: trimmed } : o))
    );
    this.notify(decisionId);
  }

  // ── Test helpers (not part of the interface) ────────────────────────────────

  reset(): void {
    this.decisions.clear();
    this.members.clear();
    this.options.clear();
    this.responses.clear();
    this.listeners.clear();
    this.decisionCount = 0;
    _resetIdCounter();
  }

  _forceExpire(decisionId: string): void {
    const d = this.getDecisionOrThrow(decisionId);
    const expired: QuickDecision = {
      ...d,
      closesAt: new Date(Date.now() - 1000).toISOString(),
    };
    this.decisions.set(decisionId, expired);
  }
}
