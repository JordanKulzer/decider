/**
 * Resolution algorithm tests for Quick Mode.
 *
 * Tests use MockDecisionRepository so they run without Supabase.
 * The same algorithm is mirrored in resolve_quick_decision() (019_resolution.sql).
 *
 * Run with:  npx tsx src/lib/__tests__/decisionResolution.test.ts
 * (install tsx first if needed:  npm i -D tsx)
 *
 * Coverage:
 *   ✓ Normal winner — highest im_in count
 *   ✓ Tiebreaker 1 — im_in count selects winner over equal top_choice
 *   ✓ Tiebreaker 2 — top_choice breaks im_in tie
 *   ✓ Tiebreaker 3 — created_at (insertion order) breaks full tie
 *   ✓ Quorum miss (no_quorum) — no option reached minimum_attendees
 *   ✓ Quorum hit (winner) — option cleared minimum_attendees threshold
 *   ✓ Early lock — fires before deadline when quorum is reached
 *   ✓ Guest participation — guests resolve the same as authenticated users
 *   ✓ No im_in responses at all (no_responses)
 *   ✓ No options at all (no_responses)
 *   ✓ Prefer-not response does not count toward im_in winner
 *   ✓ Cant response clears top_choice and does not boost im_in
 */

import { MockDecisionRepository } from "../mockDecisionRepository";
import type { DecisionActor } from "../../domain/decisionTypes";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal inline test harness
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function describe(suite: string, fn: () => void) {
  console.log(`\n  ${suite}`);
  fn();
}

function it(name: string, fn: () => void | Promise<void>) {
  Promise.resolve(fn()).then(() => {
    console.log(`    ✓ ${name}`);
    passed++;
  }).catch((err) => {
    console.error(`    ✗ ${name}`);
    console.error(`      ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  });
}

function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected: T) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test actors
// ─────────────────────────────────────────────────────────────────────────────

const alice: DecisionActor  = { kind: "user",  userId:  "user_alice" };
const bob: DecisionActor    = { kind: "user",  userId:  "user_bob" };
const carol: DecisionActor  = { kind: "user",  userId:  "user_carol" };
const guestDan: DecisionActor = { kind: "guest", guestId: "guest_dan" };

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a decision with members + options, return { repo, decisionId, optionIds }
// ─────────────────────────────────────────────────────────────────────────────

async function setup(opts: {
  members?: DecisionActor[];
  optionTitles: string[];
  minimumAttendees?: number;
  earlyLockEnabled?: boolean;
  /** Milliseconds from now. Defaults to 1 hour. */
  ttlMs?: number;
}) {
  const repo = new MockDecisionRepository();
  const creator = opts.members?.[0] ?? alice;

  const closesAt = new Date(
    Date.now() + (opts.ttlMs ?? 60 * 60 * 1000)
  ).toISOString();

  const { decision } = await repo.createQuickDecision({
    actor: creator,
    category: "other",
    closesAt,
    minimumAttendees: opts.minimumAttendees ?? null,
    earlyLockEnabled: opts.earlyLockEnabled ?? false,
  });
  const decisionId = decision.id;

  // Join remaining members.
  for (const member of opts.members?.slice(1) ?? []) {
    await repo.joinDecision({ decisionIdOrCode: decisionId, actor: member });
  }

  // Add options (submitted by creator).
  const optionIds: string[] = [];
  for (const title of opts.optionTitles) {
    const { option } = await repo.addOption({ decisionId, actor: creator, title });
    optionIds.push(option.id);
  }

  return { repo, decisionId, optionIds };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────────────────────

describe("Normal winner (no quorum)", () => {
  it("option with most im_in responses wins", async () => {
    const { repo, decisionId, optionIds } = await setup({
      members: [alice, bob, carol],
      optionTitles: ["Pizza", "Sushi"],
    });
    const [pizza, sushi] = optionIds;

    await repo.setOptionResponse({ decisionId, optionId: pizza, response: "im_in", actor: alice });
    await repo.setOptionResponse({ decisionId, optionId: sushi, response: "im_in", actor: bob });
    await repo.setOptionResponse({ decisionId, optionId: sushi, response: "im_in", actor: carol });

    await repo.endDecisionEarly({ decisionId, actor: alice });

    const state = await repo.getLiveDecisionState({ decisionId, actor: alice });
    expect(state.decision.resolvedOptionId).toBe(sushi);
    expect(state.decision.resolutionReason).toBe("winner");
  });
});

describe("Tiebreaker 1: im_in count", () => {
  it("option with higher im_in beats one with only prefer_not", async () => {
    const { repo, decisionId, optionIds } = await setup({
      members: [alice, bob],
      optionTitles: ["A", "B"],
    });
    const [optA, optB] = optionIds;

    // A: 1 im_in; B: 0 im_in but 2 prefer_not
    await repo.setOptionResponse({ decisionId, optionId: optA, response: "im_in",      actor: alice });
    await repo.setOptionResponse({ decisionId, optionId: optB, response: "prefer_not", actor: alice });
    await repo.setOptionResponse({ decisionId, optionId: optB, response: "prefer_not", actor: bob   });

    await repo.endDecisionEarly({ decisionId, actor: alice });
    const state = await repo.getLiveDecisionState({ decisionId, actor: alice });
    expect(state.decision.resolvedOptionId).toBe(optA);
  });
});

describe("Tiebreaker 2: top_choice breaks im_in tie", () => {
  it("when im_in is tied, the option with more top_choice flags wins", async () => {
    const { repo, decisionId, optionIds } = await setup({
      members: [alice, bob, carol],
      optionTitles: ["A", "B"],
    });
    const [optA, optB] = optionIds;

    // Both options have 1 im_in.
    await repo.setOptionResponse({ decisionId, optionId: optA, response: "im_in", actor: alice });
    await repo.setOptionResponse({ decisionId, optionId: optB, response: "im_in", actor: bob   });

    // B gets a top_choice flag from carol who is prefer_not on it.
    await repo.setOptionResponse({ decisionId, optionId: optB, response: "prefer_not", actor: carol });
    await repo.toggleTopChoice({ decisionId, optionId: optB, actor: carol });

    await repo.endDecisionEarly({ decisionId, actor: alice });
    const state = await repo.getLiveDecisionState({ decisionId, actor: alice });
    expect(state.decision.resolvedOptionId).toBe(optB);
  });
});

describe("Tiebreaker 3: earliest option wins full tie", () => {
  it("when im_in and top_choice both tied, first-added option wins", async () => {
    const { repo, decisionId, optionIds } = await setup({
      members: [alice, bob],
      optionTitles: ["First", "Second"],
    });
    const [first, _second] = optionIds;

    // Equal im_in, no top_choice on either.
    await repo.setOptionResponse({ decisionId, optionId: first,   response: "im_in", actor: alice });
    await repo.setOptionResponse({ decisionId, optionId: _second, response: "im_in", actor: bob   });

    await repo.endDecisionEarly({ decisionId, actor: alice });
    const state = await repo.getLiveDecisionState({ decisionId, actor: alice });
    // First-added option wins because it has the earlier createdAt timestamp.
    expect(state.decision.resolvedOptionId).toBe(first);
    expect(state.decision.resolutionReason).toBe("winner");
  });
});

describe("Quorum miss (no_quorum)", () => {
  it("resolves to no_quorum when leader does not reach minimum_attendees", async () => {
    const { repo, decisionId, optionIds } = await setup({
      members: [alice, bob, carol],
      optionTitles: ["Only option"],
      minimumAttendees: 3,
    });
    const [opt] = optionIds;

    // Only 2 im_in; quorum requires 3.
    await repo.setOptionResponse({ decisionId, optionId: opt, response: "im_in", actor: alice });
    await repo.setOptionResponse({ decisionId, optionId: opt, response: "im_in", actor: bob   });

    await repo.endDecisionEarly({ decisionId, actor: alice });
    const state = await repo.getLiveDecisionState({ decisionId, actor: alice });
    expect(state.decision.resolutionReason).toBe("no_quorum");
    expect(state.decision.resolvedOptionId).toBeNull();
  });

  it("resolves to winner when leader exactly meets minimum_attendees", async () => {
    const { repo, decisionId, optionIds } = await setup({
      members: [alice, bob, carol],
      optionTitles: ["Party"],
      minimumAttendees: 3,
    });
    const [opt] = optionIds;

    await repo.setOptionResponse({ decisionId, optionId: opt, response: "im_in", actor: alice });
    await repo.setOptionResponse({ decisionId, optionId: opt, response: "im_in", actor: bob   });
    await repo.setOptionResponse({ decisionId, optionId: opt, response: "im_in", actor: carol });

    await repo.endDecisionEarly({ decisionId, actor: alice });
    const state = await repo.getLiveDecisionState({ decisionId, actor: alice });
    expect(state.decision.resolutionReason).toBe("winner");
    expect(state.decision.resolvedOptionId).toBe(opt);
  });
});

describe("Early lock", () => {
  it("locks immediately when an option reaches quorum before the deadline", async () => {
    const { repo, decisionId, optionIds } = await setup({
      members: [alice, bob],
      optionTitles: ["Movie night"],
      minimumAttendees: 2,
      earlyLockEnabled: true,
      ttlMs: 24 * 60 * 60 * 1000, // long deadline — should lock early
    });
    const [opt] = optionIds;

    await repo.setOptionResponse({ decisionId, optionId: opt, response: "im_in", actor: alice });

    // Not yet locked — only 1 of 2 needed.
    let state = await repo.getLiveDecisionState({ decisionId, actor: alice });
    expect(state.isLocked).toBe(false);

    // Second response hits quorum — should auto-lock.
    await repo.setOptionResponse({ decisionId, optionId: opt, response: "im_in", actor: bob });

    state = await repo.getLiveDecisionState({ decisionId, actor: alice });
    expect(state.isLocked).toBe(true);
    expect(state.decision.resolutionReason).toBe("winner");
    expect(state.decision.resolvedOptionId).toBe(opt);
  });

  it("does not lock early when earlyLockEnabled is false even if quorum is met", async () => {
    const { repo, decisionId, optionIds } = await setup({
      members: [alice, bob],
      optionTitles: ["Dinner"],
      minimumAttendees: 2,
      earlyLockEnabled: false,
      ttlMs: 24 * 60 * 60 * 1000,
    });
    const [opt] = optionIds;

    await repo.setOptionResponse({ decisionId, optionId: opt, response: "im_in", actor: alice });
    await repo.setOptionResponse({ decisionId, optionId: opt, response: "im_in", actor: bob   });

    const state = await repo.getLiveDecisionState({ decisionId, actor: alice });
    expect(state.isLocked).toBe(false); // still open — deadline hasn't passed
  });
});

describe("Guest participation", () => {
  it("guest im_in response is counted toward the winner", async () => {
    const { repo, decisionId, optionIds } = await setup({
      members: [alice, guestDan],
      optionTitles: ["Tacos", "Ramen"],
    });
    const [tacos, ramen] = optionIds;

    // Guest votes for ramen; alice votes for tacos.
    await repo.setOptionResponse({ decisionId, optionId: tacos, response: "im_in", actor: alice    });
    await repo.setOptionResponse({ decisionId, optionId: ramen, response: "im_in", actor: guestDan });
    await repo.setOptionResponse({ decisionId, optionId: ramen, response: "im_in", actor: alice    });

    await repo.endDecisionEarly({ decisionId, actor: alice });
    const state = await repo.getLiveDecisionState({ decisionId, actor: alice });
    // Ramen has 2 im_in (alice + guest); tacos has 1 (alice only from first vote is overwritten by ramen)
    // Wait — alice set im_in on tacos then im_in on ramen; second call replaces the first on ramen
    // Actually alice set tacos=im_in then ramen=im_in. Those are separate options so both persist.
    // ramen: alice + guestDan = 2; tacos: alice = 1
    expect(state.decision.resolvedOptionId).toBe(ramen);
  });

  it("guest can set top_choice and it counts as tiebreaker", async () => {
    const { repo, decisionId, optionIds } = await setup({
      members: [alice, guestDan],
      optionTitles: ["A", "B"],
    });
    const [optA, optB] = optionIds;

    // Both get 1 im_in; guest marks B as top_choice.
    await repo.setOptionResponse({ decisionId, optionId: optA, response: "im_in", actor: alice    });
    await repo.setOptionResponse({ decisionId, optionId: optB, response: "im_in", actor: guestDan });
    await repo.toggleTopChoice({ decisionId, optionId: optB, actor: guestDan });

    await repo.endDecisionEarly({ decisionId, actor: alice });
    const state = await repo.getLiveDecisionState({ decisionId, actor: alice });
    expect(state.decision.resolvedOptionId).toBe(optB);
  });
});

describe("No im_in responses (no_responses)", () => {
  it("resolves to no_responses when everyone marks cant or prefer_not", async () => {
    const { repo, decisionId, optionIds } = await setup({
      members: [alice, bob],
      optionTitles: ["Option A"],
    });
    const [opt] = optionIds;

    await repo.setOptionResponse({ decisionId, optionId: opt, response: "cant",       actor: alice });
    await repo.setOptionResponse({ decisionId, optionId: opt, response: "prefer_not", actor: bob   });

    await repo.endDecisionEarly({ decisionId, actor: alice });
    const state = await repo.getLiveDecisionState({ decisionId, actor: alice });
    expect(state.decision.resolutionReason).toBe("no_responses");
    expect(state.decision.resolvedOptionId).toBeNull();
  });
});

describe("No options at all (no_responses)", () => {
  it("resolves to no_responses when no options were ever added", async () => {
    const repo = new MockDecisionRepository();
    const closesAt = new Date(Date.now() + 3600_000).toISOString();
    const { decision } = await repo.createQuickDecision({
      actor: alice,
      category: "food",
      closesAt,
    });

    await repo.endDecisionEarly({ decisionId: decision.id, actor: alice });
    const state = await repo.getLiveDecisionState({ decisionId: decision.id, actor: alice });
    expect(state.decision.resolutionReason).toBe("no_responses");
    expect(state.decision.resolvedOptionId).toBeNull();
  });
});

describe("Response semantics", () => {
  it("prefer_not does not count toward im_in winner", async () => {
    const { repo, decisionId, optionIds } = await setup({
      members: [alice, bob, carol],
      optionTitles: ["Good", "Meh"],
    });
    const [good, meh] = optionIds;

    // 'meh' gets 2 prefer_not but 0 im_in; 'good' gets 1 im_in.
    await repo.setOptionResponse({ decisionId, optionId: good, response: "im_in",      actor: alice });
    await repo.setOptionResponse({ decisionId, optionId: meh,  response: "prefer_not", actor: bob   });
    await repo.setOptionResponse({ decisionId, optionId: meh,  response: "prefer_not", actor: carol });

    await repo.endDecisionEarly({ decisionId, actor: alice });
    const state = await repo.getLiveDecisionState({ decisionId, actor: alice });
    expect(state.decision.resolvedOptionId).toBe(good);
  });

  it("changing to cant clears the top_choice flag", async () => {
    const { repo, decisionId, optionIds } = await setup({
      members: [alice],
      optionTitles: ["Solo option"],
    });
    const [opt] = optionIds;

    await repo.setOptionResponse({ decisionId, optionId: opt, response: "im_in", actor: alice });
    await repo.toggleTopChoice({ decisionId, optionId: opt, actor: alice });

    // Verify top_choice is set.
    let state = await repo.getLiveDecisionState({ decisionId, actor: alice });
    expect(state.options[0].myIsTopChoice).toBe(true);

    // Change to cant — should clear top_choice.
    await repo.setOptionResponse({ decisionId, optionId: opt, response: "cant", actor: alice });
    state = await repo.getLiveDecisionState({ decisionId, actor: alice });
    expect(state.options[0].myIsTopChoice).toBe(false);
  });

  it("top_choice requires im_in or prefer_not — cant throws", async () => {
    const { repo, decisionId, optionIds } = await setup({
      members: [alice],
      optionTitles: ["Option"],
    });
    const [opt] = optionIds;

    await repo.setOptionResponse({ decisionId, optionId: opt, response: "cant", actor: alice });

    let threw = false;
    try {
      await repo.toggleTopChoice({ decisionId, optionId: opt, actor: alice });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe("Resolution idempotency", () => {
  it("calling endDecisionEarly twice returns the same result", async () => {
    const { repo, decisionId, optionIds } = await setup({
      members: [alice, bob],
      optionTitles: ["X", "Y"],
    });
    const [optX] = optionIds;

    await repo.setOptionResponse({ decisionId, optionId: optX, response: "im_in", actor: alice });
    await repo.setOptionResponse({ decisionId, optionId: optX, response: "im_in", actor: bob   });

    await repo.endDecisionEarly({ decisionId, actor: alice });
    const stateA = await repo.getLiveDecisionState({ decisionId, actor: alice });

    // Second call should be a no-op (throws "already locked").
    let threw = false;
    try {
      await repo.endDecisionEarly({ decisionId, actor: alice });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    const stateB = await repo.getLiveDecisionState({ decisionId, actor: alice });
    expect(stateB.decision.resolvedOptionId).toBe(stateA.decision.resolvedOptionId);
    expect(stateB.decision.resolutionReason).toBe(stateA.decision.resolutionReason);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

// Wait one tick for all async its to settle, then print results.
setTimeout(() => {
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}, 200);
