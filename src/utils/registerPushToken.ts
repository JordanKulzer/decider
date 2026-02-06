import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { supabase } from "../lib/supabase";

export const registerPushToken = async (userId: string) => {
  if (!Device.isDevice) {
    console.log("Not a physical device — cannot register for push.");
    return;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Push notification permission not granted");
    return;
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;

  try {
    const { error } = await supabase
      .from("users")
      .update({ push_token: token })
      .eq("id", userId);

    if (error) throw error;

    console.log("Push token saved to Supabase");
  } catch (err) {
    console.error("Failed to save push token to Supabase:", err);
  }
};
