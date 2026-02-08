import { supabase } from "./supabase";
import { isDemoMode, DEMO_USER_ID } from "./demoMode";
import { UserProfile, UserTier, TIER_LIMITS } from "../types/decisions";

// ─── FETCH USER PROFILE ───

export const fetchUserProfile = async (userId: string): Promise<UserProfile> => {
  if (isDemoMode()) {
    return {
      id: DEMO_USER_ID,
      username: "demo_user",
      email: "demo@example.com",
      tier: "free",
      subscription_status: "none",
      subscription_expires_at: null,
    };
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, username, email, tier, subscription_status, subscription_expires_at")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return data as UserProfile;
};

// ─── TIER CHECKING FUNCTIONS ───

export const checkCanCreateDecision = async (
  userId: string
): Promise<{ allowed: boolean; reason?: string; currentCount: number; limit: number }> => {
  if (isDemoMode()) {
    return { allowed: true, currentCount: 0, limit: Infinity };
  }

  const profile = await fetchUserProfile(userId);
  const limits = TIER_LIMITS[profile.tier];

  if (limits.activeDecisions === Infinity) {
    return { allowed: true, currentCount: 0, limit: Infinity };
  }

  // Count active (non-locked) decisions
  const { count, error } = await supabase
    .from("decisions")
    .select("id", { count: "exact", head: true })
    .eq("created_by", userId)
    .neq("status", "locked");

  if (error) throw error;

  const currentCount = count || 0;
  const limit = limits.activeDecisions;

  if (currentCount >= limit) {
    return {
      allowed: false,
      reason: `Free tier is limited to ${limit} active decisions. Upgrade to Pro for unlimited decisions.`,
      currentCount,
      limit,
    };
  }

  return { allowed: true, currentCount, limit };
};

export const checkParticipantLimit = async (
  decisionId: string,
  hostUserId: string
): Promise<{ allowed: boolean; reason?: string; currentCount: number; limit: number }> => {
  if (isDemoMode()) {
    return { allowed: true, currentCount: 0, limit: Infinity };
  }

  const profile = await fetchUserProfile(hostUserId);
  const limits = TIER_LIMITS[profile.tier];

  const { count, error } = await supabase
    .from("decision_members")
    .select("id", { count: "exact", head: true })
    .eq("decision_id", decisionId);

  if (error) throw error;

  const currentCount = count || 0;
  const limit = limits.maxParticipants;

  if (limit !== Infinity && currentCount >= limit) {
    return {
      allowed: false,
      reason: `This decision has reached the participant limit (${limit}). The organizer needs to upgrade to Pro for unlimited participants.`,
      currentCount,
      limit,
    };
  }

  return { allowed: true, currentCount, limit };
};

export const checkFeatureAccess = (
  tier: UserTier,
  feature: "silentVoting" | "constraintWeighting"
): boolean => {
  return TIER_LIMITS[tier][feature];
};

export const getHistoryLimitDays = (tier: UserTier): number => {
  const days = TIER_LIMITS[tier].historyDays;
  return days === Infinity ? -1 : days; // -1 means no limit
};

// ─── SUBSCRIPTION MANAGEMENT (STUBS) ───

export type SubscriptionPlan = "pro_monthly" | "pro_yearly";

export const initiateSubscription = async (
  _userId: string,
  _plan: SubscriptionPlan
): Promise<{ checkoutUrl: string }> => {
  // TODO: Integrate with Stripe/RevenueCat
  // This is a stub that will be implemented when payment provider is chosen
  throw new Error("Payment integration not yet implemented. Coming soon!");
};

export const cancelSubscription = async (_userId: string): Promise<void> => {
  // TODO: Integrate with payment provider
  throw new Error("Payment integration not yet implemented. Coming soon!");
};

export const restoreSubscription = async (_userId: string): Promise<boolean> => {
  // TODO: Check with payment provider for active subscriptions
  // Used for restoring purchases on mobile
  throw new Error("Payment integration not yet implemented. Coming soon!");
};

// ─── MANUAL UPGRADE (FOR TESTING/ADMIN) ───

export const manualUpgradeUser = async (
  userId: string,
  tier: UserTier,
  expiresAt?: Date
): Promise<void> => {
  if (isDemoMode()) return;

  const { error } = await supabase
    .from("users")
    .update({
      tier,
      subscription_status: tier === "pro" ? "active" : "none",
      subscription_expires_at: expiresAt?.toISOString() || null,
    })
    .eq("id", userId);

  if (error) throw error;
};
