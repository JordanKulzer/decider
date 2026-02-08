import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { fetchUserProfile } from "../lib/subscription";
import { UserProfile, UserTier, TIER_LIMITS } from "../types/decisions";
import { isDemoMode, DEMO_USER_ID } from "../lib/demoMode";

interface SubscriptionContextType {
  profile: UserProfile | null;
  loading: boolean;
  isProUser: boolean;
  tier: UserTier;
  subscriptionStatus: string;
  limits: typeof TIER_LIMITS.free;
  refresh: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  canUseSilentVoting: boolean;
  canUseConstraintWeighting: boolean;
}

const defaultLimits = TIER_LIMITS.free;

const SubscriptionContext = createContext<SubscriptionContextType>({
  profile: null,
  loading: true,
  isProUser: false,
  tier: "free",
  subscriptionStatus: "none",
  limits: defaultLimits,
  refresh: async () => {},
  refreshSubscription: async () => {},
  canUseSilentVoting: false,
  canUseConstraintWeighting: false,
});

interface SubscriptionProviderProps {
  userId: string | null;
  children: React.ReactNode;
}

export const SubscriptionProvider: React.FC<SubscriptionProviderProps> = ({
  userId,
  children,
}) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await fetchUserProfile(userId);
      setProfile(data);
    } catch (err) {
      console.error("Error fetching user profile:", err);
      // Set default free profile on error
      setProfile({
        id: userId,
        username: "",
        email: "",
        tier: "free",
        subscription_status: "none",
        subscription_expires_at: null,
      });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const tier = profile?.tier || "free";
  const subscriptionStatus = profile?.subscription_status || "none";
  const isProUser = tier === "pro";
  const limits = TIER_LIMITS[tier];
  const canUseSilentVoting = limits.silentVoting;
  const canUseConstraintWeighting = limits.constraintWeighting;

  return (
    <SubscriptionContext.Provider
      value={{
        profile,
        loading,
        isProUser,
        tier,
        subscriptionStatus,
        limits,
        refresh,
        refreshSubscription: refresh,
        canUseSilentVoting,
        canUseConstraintWeighting,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return context;
};

export default SubscriptionContext;
