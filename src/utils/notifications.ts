import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { SchedulableTriggerInputTypes } from "expo-notifications";
import { supabase } from "../lib/supabase";

const LOCK_NOTIFICATION_KEY = "lockNotificationIds";

type NotificationType =
  | "member_joined"
  | "member_left"
  | "phase_advanced"
  | "decision_locked"
  | "decision_deleted";

const callPushNotificationEdgeFunction = async (payload: {
  type: NotificationType;
  decisionId?: string;
  decisionTitle?: string;
  triggerUserId: string;
  triggerUsername?: string;
  newPhase?: string;
  targetUserIds?: string[];
}) => {
  try {
    const { data, error } = await supabase.functions.invoke(
      "send-notification",
      { body: payload }
    );

    if (error) {
      console.warn("Push notification edge function error:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.warn("Failed to call push notification edge function:", error);
    return null;
  }
};

export const scheduleLockTimeNotifications = async (
  lockTime: Date,
  decisionTitle: string
) => {
  const now = new Date();
  const lockMs = lockTime.getTime();

  if (lockMs <= now.getTime()) {
    return;
  }

  // Cancel any existing scheduled notifications
  const existing = await AsyncStorage.getItem(LOCK_NOTIFICATION_KEY);
  if (existing) {
    const ids: string[] = JSON.parse(existing);
    for (const id of ids) {
      await Notifications.cancelScheduledNotificationAsync(id);
    }
  }

  const scheduledIds: string[] = [];

  const permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) {
    const ask = await Notifications.requestPermissionsAsync();
    if (!ask.granted) {
      return;
    }
  }

  const scheduleIfInFuture = async (
    target: Date,
    title: string,
    body: string
  ) => {
    const timeDiff = target.getTime() - Date.now();
    const minDelayMs = 5000;

    if (timeDiff > minDelayMs) {
      const trigger: Notifications.NotificationTriggerInput = {
        type: SchedulableTriggerInputTypes.DATE,
        date: new Date(target.getTime()),
      };

      const id = await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: true },
        trigger,
      });
      scheduledIds.push(id);
    }
  };

  const thirtyMinBefore = new Date(lockMs - 30 * 60 * 1000);
  const fiveMinBefore = new Date(lockMs - 5 * 60 * 1000);

  await scheduleIfInFuture(
    thirtyMinBefore,
    "30 minutes until lock",
    `"${decisionTitle}" locks in 30 minutes. Cast your vote!`
  );

  await scheduleIfInFuture(
    fiveMinBefore,
    "5 minutes until lock",
    `"${decisionTitle}" locks in 5 minutes!`
  );

  await scheduleIfInFuture(
    lockTime,
    "Decision Locked",
    `"${decisionTitle}" is now locked. Check the results!`
  );

  await AsyncStorage.setItem(
    LOCK_NOTIFICATION_KEY,
    JSON.stringify(scheduledIds)
  );
};

export const cancelLockNotifications = async () => {
  try {
    const existing = await AsyncStorage.getItem(LOCK_NOTIFICATION_KEY);
    if (existing) {
      const ids: string[] = JSON.parse(existing);
      for (const id of ids) {
        await Notifications.cancelScheduledNotificationAsync(id);
      }
      await AsyncStorage.removeItem(LOCK_NOTIFICATION_KEY);
    }
  } catch (e) {
    console.warn("cancelLockNotifications error:", e);
  }
};

export const sendMemberJoinedNotification = async (
  decisionId: string,
  decisionTitle: string,
  username: string
) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await callPushNotificationEdgeFunction({
      type: "member_joined",
      decisionId,
      decisionTitle,
      triggerUserId: user.id,
      triggerUsername: username,
    });
  } catch (e) {
    console.warn("sendMemberJoinedNotification error:", e);
  }
};

export const sendMemberLeftNotification = async (
  decisionId: string,
  decisionTitle: string,
  username: string
) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await callPushNotificationEdgeFunction({
      type: "member_left",
      decisionId,
      decisionTitle,
      triggerUserId: user.id,
      triggerUsername: username,
    });
  } catch (e) {
    console.warn("sendMemberLeftNotification error:", e);
  }
};

export const sendPhaseAdvancedNotification = async (
  decisionId: string,
  decisionTitle: string,
  newPhase: string
) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("users")
      .select("username")
      .eq("id", user.id)
      .single();

    await callPushNotificationEdgeFunction({
      type: "phase_advanced",
      decisionId,
      decisionTitle,
      triggerUserId: user.id,
      triggerUsername: profile?.username || "The organizer",
      newPhase,
    });
  } catch (e) {
    console.warn("sendPhaseAdvancedNotification error:", e);
  }
};

export const sendDecisionDeletedNotification = async (
  decisionId: string,
  decisionTitle: string,
  targetUserIds: string[]
) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("users")
      .select("username")
      .eq("id", user.id)
      .single();

    await callPushNotificationEdgeFunction({
      type: "decision_deleted",
      decisionId,
      decisionTitle,
      triggerUserId: user.id,
      triggerUsername: profile?.username || "The organizer",
      targetUserIds,
    });
  } catch (e) {
    console.warn("sendDecisionDeletedNotification error:", e);
  }
};
