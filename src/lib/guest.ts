import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DecisionActor } from "../domain/decisionTypes";

const GUEST_KEY          = "decider_guest_id";
const GUEST_DISPLAY_NAME = "decider_guest_display_name";

/**
 * Returns the device-persistent guest ID, creating one if this is the first
 * app open. The same ID is returned on every subsequent call on the same device.
 *
 * Format: "guest_<8 random alphanumeric chars>_<unix ms timestamp>"
 * The "guest_" prefix lets all other code distinguish guests from auth users
 * without passing extra flags.
 */
export async function getOrCreateGuestId(): Promise<string> {
  const existing = await AsyncStorage.getItem(GUEST_KEY);
  if (existing) return existing;

  const rand = Math.random().toString(36).slice(2, 10);
  const id = `guest_${rand}_${Date.now()}`;
  await AsyncStorage.setItem(GUEST_KEY, id);
  return id;
}

/**
 * Returns a `DecisionActor` for the current guest.
 * Creates and persists a guest ID if one does not already exist.
 *
 * Use this in screens to get a typed actor rather than a raw string.
 */
export async function getGuestActor(): Promise<DecisionActor> {
  const guestId = await getOrCreateGuestId();
  return { kind: "guest", guestId };
}

/**
 * Returns the stored guest ID without creating one.
 * Returns null if no guest session exists on this device yet.
 */
export async function getGuestId(): Promise<string | null> {
  return AsyncStorage.getItem(GUEST_KEY);
}

/** Returns the stored guest display name, or null if not yet set. */
export async function getGuestDisplayName(): Promise<string | null> {
  return AsyncStorage.getItem(GUEST_DISPLAY_NAME);
}

/** Persists the guest's chosen display name. */
export async function setGuestDisplayName(name: string): Promise<void> {
  await AsyncStorage.setItem(GUEST_DISPLAY_NAME, name.trim());
}

/** Removes the stored display name (call alongside clearGuestId on account creation). */
export async function clearGuestDisplayName(): Promise<void> {
  await AsyncStorage.removeItem(GUEST_DISPLAY_NAME);
}

/**
 * Removes the stored guest ID from this device.
 *
 * Call this only when a guest successfully completes account creation and
 * their data has been migrated to the new auth user. Do NOT call on logout
 * of a registered account — guests don't log out.
 *
 * Account-claiming / data migration is a future feature and is NOT
 * implemented here. This function exists as the correct deletion point
 * for when it is.
 */
export async function clearGuestId(): Promise<void> {
  await AsyncStorage.removeItem(GUEST_KEY);
}
