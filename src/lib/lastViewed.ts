import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@decider/lastViewed";

/**
 * Returns the stored map of decisionId → last-seen signature string.
 * A signature encodes the meaningful mutable state of a decision at the
 * point the user last opened it (e.g. "options:3" or "locked:5").
 */
export async function getLastViewedSignatures(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * Stores the current signature for a decision, overwriting the previous entry.
 * Call this when the user opens a decision card.
 */
export async function markDecisionViewed(
  decisionId: string,
  signature: string
): Promise<void> {
  try {
    const map = await getLastViewedSignatures();
    map[decisionId] = signature;
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
  } catch {}
}
