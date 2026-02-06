import Constants from "expo-constants";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const extra: any =
  Constants.expoConfig?.extra ?? (Constants as any).manifest?.extra ?? {};

const url = extra.EXPO_PUBLIC_SUPABASE_URL;
const anon = extra.EXPO_PUBLIC_SUPABASE_ANON_KEY;

console.log("[Supabase] Config loaded:", {
  hasUrl: !!url,
  urlPrefix: url?.substring(0, 30),
  hasAnon: !!anon,
  anonPrefix: anon?.substring(0, 20),
});

const DEMO_MODE = !url || !anon;

if (DEMO_MODE) {
  console.warn(
    "Supabase env vars missing. Running in demo mode without backend connectivity."
  );
}

// Use dummy values for demo mode to prevent initialization errors
const supabaseUrl = url || "https://demo.supabase.co";
const supabaseAnonKey =
  anon ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlbW8iLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjo1MDAwMDAwMDB9.demo";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export { DEMO_MODE };
