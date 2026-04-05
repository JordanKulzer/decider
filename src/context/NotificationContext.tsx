import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Scoped notification counts — social only (decision counts live in HomeScreen)
// ─────────────────────────────────────────────────────────────────────────────

interface NotificationState {
  /** Number of accepted friends */
  friendCount: number;
  /** Pending friend requests addressed to the current user */
  friendRequestCount: number;
  /** Refresh both counts (call after acting on friend requests or accepting) */
  refreshFriendStats: () => Promise<void>;
}

const NotificationContext = createContext<NotificationState>({
  friendCount:          0,
  friendRequestCount:   0,
  refreshFriendStats:   async () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [friendCount, setFriendCount] = useState(0);
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const refreshFriendStats = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setFriendCount(0);
        setFriendRequestCount(0);
        return;
      }

      const [friendsResult, requestsResult] = await Promise.all([
        supabase
          .from("friendships")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "accepted"),
        supabase
          .from("friend_requests")
          .select("*", { count: "exact", head: true })
          .eq("to_user_id", user.id)
          .eq("status", "pending"),
      ]);

      setFriendCount(friendsResult.count ?? 0);
      setFriendRequestCount(requestsResult.count ?? 0);
    } catch {
      // non-critical — counts stay at last known value
    }
  }, []);

  const setupRealtimeSubscription = useCallback(async () => {
    // Clean up any existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const channel = supabase
      .channel(`friend-stats-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friend_requests",
          filter: `to_user_id=eq.${user.id}`,
        },
        () => { refreshFriendStats(); }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships",
          filter: `user_id=eq.${user.id}`,
        },
        () => { refreshFriendStats(); }
      )
      .subscribe();

    channelRef.current = channel;
  }, [refreshFriendStats]);

  useEffect(() => {
    refreshFriendStats();
    setupRealtimeSubscription();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        refreshFriendStats();
        setupRealtimeSubscription();
      } else {
        setFriendCount(0);
        setFriendRequestCount(0);
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      }
    });

    return () => {
      subscription.unsubscribe();
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [refreshFriendStats, setupRealtimeSubscription]);

  return (
    <NotificationContext.Provider value={{ friendCount, friendRequestCount, refreshFriendStats }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationState {
  return useContext(NotificationContext);
}
