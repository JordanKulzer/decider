import React, { useState } from "react";
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  View,
  SafeAreaView,
} from "react-native";
import { TextInput as PaperInput } from "react-native-paper";
import { supabase } from "../lib/supabase";
import { MaterialIcons as Icon } from "@expo/vector-icons";

// ─── Dark input theme ─────────────────────────────────────────────────────────
const INPUT_THEME = {
  colors: {
    primary: "#6366f1",
    onSurfaceVariant: "#64748b",
    outline: "#334155",
    onSurface: "#f1f5f9",
    surface: "#1e293b",
    background: "#0f172a",
  },
};

const SignUpScreen = ({ navigation }: { navigation: any }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  const checkUsernameAvailable = async (
    usernameToCheck: string
  ): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id")
        .eq("username", usernameToCheck)
        .maybeSingle();

      if (error) return true; // can't read table (e.g. RLS) — let the DB enforce uniqueness
      return !data;
    } catch {
      return false;
    }
  };

  const handleSignup = async () => {
    if (!username || !email || !password) {
      setError("Please fill out all fields.");
      return;
    }
    if (username.length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    if (username.length > 20) {
      setError("Username must be 20 characters or less.");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError(
        "Username can only contain letters, numbers, and underscores."
      );
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    const isAvailable = await checkUsernameAvailable(username);
    if (!isAvailable) {
      setError("Username is already taken. Please choose another.");
      return;
    }

    setError("");
    try {
      console.log("[SignUp] Attempting signup for:", email.trim());
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { username } },
      });

      console.log("[SignUp] Response:", { data, error: signUpError });

      if (signUpError) throw signUpError;

      // Check if user was created but needs email confirmation
      if (data?.user && !data?.session) {
        setError("Check your email for a confirmation link!");
        return;
      }
    } catch (err: any) {
      console.error("[SignUp] Error:", err);
      if (
        err.message?.includes("User already registered") ||
        err.message?.includes("email")
      ) {
        setError("Email already in use or invalid.");
      } else if (err.message?.includes("password")) {
        setError("Password must be at least 6 characters.");
      } else {
        setError(`Signup failed: ${err.message || "Unknown error"}`);
      }
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Wordmark ── */}
            <View style={styles.wordmarkBlock}>
              <Text style={styles.logoText}>Decider</Text>
            </View>

            <Text style={styles.title}>Create your account</Text>

            <PaperInput
              label="Username"
              mode="outlined"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              style={styles.input}
              theme={INPUT_THEME}
              right={
                username ? (
                  <PaperInput.Icon
                    icon="close"
                    onPress={() => setUsername("")}
                    color="#6366f1"
                  />
                ) : null
              }
            />

            <PaperInput
              label="Email"
              mode="outlined"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
              theme={INPUT_THEME}
              right={
                email ? (
                  <PaperInput.Icon
                    icon="close"
                    onPress={() => setEmail("")}
                    color="#6366f1"
                  />
                ) : null
              }
            />

            <PaperInput
              label="Password"
              mode="outlined"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              theme={INPUT_THEME}
              right={
                password ? (
                  <PaperInput.Icon
                    icon={showPassword ? "eye-off" : "eye"}
                    onPress={() => setShowPassword(!showPassword)}
                    color="#6366f1"
                  />
                ) : null
              }
            />

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity style={styles.primaryBtn} onPress={handleSignup}>
              <Text style={styles.primaryBtnText}>Sign Up</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backLink}
              onPress={() => navigation.goBack()}
            >
              <Icon name="arrow-back" size={16} color="#94a3b8" />
              <Text style={styles.backLinkText}>Back to Login</Text>
            </TouchableOpacity>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 40,
  },

  // ── Wordmark ──
  wordmarkBlock: {
    alignItems: "center",
    marginBottom: 36,
  },
  logoText: {
    fontSize: 38,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
    color: "#6366f1",
    letterSpacing: -0.5,
  },

  // ── Form ──
  title: {
    fontSize: 22,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
    color: "#f1f5f9",
    marginBottom: 18,
  },
  input: {
    marginBottom: 14,
    backgroundColor: "#1e293b",
  },
  errorBox: {
    backgroundColor: "#2d1515",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.3)",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  errorText: {
    color: "#f87171",
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
    textAlign: "center",
  },

  // ── Buttons ──
  primaryBtn: {
    backgroundColor: "#6366f1",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 16,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
    fontFamily: "Rubik_500Medium",
  },

  // ── Back link ──
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 4,
  },
  backLinkText: {
    color: "#94a3b8",
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
  },
});

export default SignUpScreen;
