import Constants from "expo-constants";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const extra: any =
  Constants.expoConfig?.extra ?? (Constants as any).manifest?.extra ?? {};

const url = extra.EXPO_PUBLIC_SUPABASE_URL;
const anon = extra.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.warn(
    "Supabase env vars missing. Check EAS env + app.config.js. " +
      "The app will not be able to connect to the backend."
  );
}

export const supabase = createClient(url ?? "", anon ?? "", {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
