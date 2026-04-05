import { supabase } from "./supabase";
import { getGuestActor } from "./guest";
import type { DecisionActor } from "../domain/decisionTypes";

/**
 * Resolves the current actor for Quick Mode interactions.
 *
 * Resolution order:
 *   1. If a Supabase session exists, return an authenticated user actor.
 *   2. Otherwise, return the device-persistent guest actor (created on first call).
 *
 * This is the only file in the Quick Mode layer that imports Supabase directly.
 * Screens and hooks import this helper instead of importing Supabase themselves.
 */
export async function resolveDecisionActor(): Promise<DecisionActor> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return { kind: "user", userId: user.id };
  }

  return getGuestActor();
}
