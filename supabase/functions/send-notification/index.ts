// @ts-nocheck
// Supabase Edge Function to send push notifications via Expo Push API
// Deploy with: supabase functions deploy send-notification
// Note: This file runs in Deno runtime, not Node.js. IDE errors for Deno APIs are expected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface PushNotificationRequest {
  type:
    | "member_joined"
    | "member_left"
    | "phase_advanced"
    | "decision_locked"
    | "decision_deleted";
  decisionId?: string;
  decisionTitle?: string;
  triggerUserId: string;
  triggerUsername?: string;
  newPhase?: string;
  targetUserIds?: string[];
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound?: "default" | null;
  data?: Record<string, unknown>;
}

const PHASE_LABELS: Record<string, string> = {
  constraints: "Constraints",
  options: "Options",
  voting: "Voting",
  locked: "Locked",
};

async function sendExpoPushNotifications(messages: ExpoPushMessage[]) {
  if (messages.length === 0) return { success: true, sent: 0 };

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    console.log("Expo Push API response:", result);
    return { success: true, sent: messages.length, result };
  } catch (error) {
    console.error("Failed to send push notifications:", error);
    return { success: false, error: String(error) };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: PushNotificationRequest = await req.json();
    const {
      type,
      decisionId,
      decisionTitle,
      triggerUserId,
      triggerUsername,
      newPhase,
      targetUserIds,
    } = payload;

    console.log("Received notification request:", {
      type,
      decisionId,
      triggerUserId,
    });

    const messages: ExpoPushMessage[] = [];

    // Helper: get push tokens for all members of a decision except the trigger user
    const getMemberTokens = async (excludeUserId: string) => {
      const { data: members } = await supabase
        .from("decision_members")
        .select("user_id")
        .eq("decision_id", decisionId);

      if (!members || members.length === 0) return [];

      const userIds = members
        .map((m) => m.user_id)
        .filter((id) => id !== excludeUserId);

      if (userIds.length === 0) return [];

      const { data: users } = await supabase
        .from("users")
        .select("id, push_token")
        .in("id", userIds);

      return (users || []).filter((u) => u.push_token);
    };

    if (type === "member_joined") {
      // Notify the organizer that someone joined
      const { data: decision } = await supabase
        .from("decisions")
        .select("created_by")
        .eq("id", decisionId)
        .single();

      if (decision && decision.created_by !== triggerUserId) {
        const { data: organizer } = await supabase
          .from("users")
          .select("push_token")
          .eq("id", decision.created_by)
          .single();

        if (organizer?.push_token) {
          messages.push({
            to: organizer.push_token,
            title: "New Member Joined",
            body: `${triggerUsername} joined "${decisionTitle}"`,
            sound: "default",
            data: { decisionId, type: "member_joined" },
          });
        }
      }
    } else if (type === "member_left") {
      // Notify the organizer that someone left
      const { data: decision } = await supabase
        .from("decisions")
        .select("created_by")
        .eq("id", decisionId)
        .single();

      if (decision && decision.created_by !== triggerUserId) {
        const { data: organizer } = await supabase
          .from("users")
          .select("push_token")
          .eq("id", decision.created_by)
          .single();

        if (organizer?.push_token) {
          messages.push({
            to: organizer.push_token,
            title: "Member Left",
            body: `${triggerUsername} left "${decisionTitle}"`,
            sound: "default",
            data: { decisionId, type: "member_left" },
          });
        }
      }
    } else if (type === "phase_advanced") {
      // Notify all members (except organizer) about phase change
      const usersWithTokens = await getMemberTokens(triggerUserId);
      const phaseLabel = PHASE_LABELS[newPhase || ""] || newPhase;

      for (const user of usersWithTokens) {
        messages.push({
          to: user.push_token,
          title: `Phase: ${phaseLabel}`,
          body: `"${decisionTitle}" has moved to the ${phaseLabel} phase`,
          sound: "default",
          data: { decisionId, type: "phase_advanced", newPhase },
        });
      }
    } else if (type === "decision_locked") {
      // Notify all members that the decision is finalized
      const usersWithTokens = await getMemberTokens("");
      for (const user of usersWithTokens) {
        messages.push({
          to: user.push_token,
          title: "Decision Locked",
          body: `"${decisionTitle}" has been finalized. Check the results!`,
          sound: "default",
          data: { decisionId, type: "decision_locked" },
        });
      }
    } else if (type === "decision_deleted") {
      // Notify specific users that a decision was deleted
      if (targetUserIds && targetUserIds.length > 0) {
        const { data: users } = await supabase
          .from("users")
          .select("id, push_token")
          .in("id", targetUserIds);

        for (const user of users || []) {
          if (user.push_token && user.id !== triggerUserId) {
            messages.push({
              to: user.push_token,
              title: "Decision Deleted",
              body: `"${decisionTitle}" was deleted by ${triggerUsername}`,
              sound: "default",
              data: { type: "decision_deleted" },
            });
          }
        }
      }
    }

    console.log(`Sending ${messages.length} push notifications`);
    const result = await sendExpoPushNotifications(messages);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Error processing notification:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
