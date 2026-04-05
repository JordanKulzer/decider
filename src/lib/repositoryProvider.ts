import type { DecisionRepository } from "./decisionRepository";
import { SupabaseDecisionRepository } from "./supabaseDecisionRepository";

// ─────────────────────────────────────────────────────────────────────────────
// Repository provider
//
// The UI imports `decisionRepository` from here and never references the
// concrete implementation directly.
//
// To switch back to the in-memory mock (e.g. for UI-only testing):
//   import { MockDecisionRepository } from "./mockDecisionRepository";
//   export const decisionRepository: DecisionRepository = new MockDecisionRepository();
// ─────────────────────────────────────────────────────────────────────────────

export const decisionRepository: DecisionRepository = new SupabaseDecisionRepository();
