import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
} from "react-native";
import { TextInput as PaperInput } from "react-native-paper";
import { MaterialIcons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

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

const LoginScreen = ({ navigation }: { navigation: any }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");
    try {
      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({ email, password });

      if (loginError) {
        if (loginError.message.includes("Invalid login credentials")) {
          setError("Incorrect email or password.");
        } else {
          setError("Login failed. Try again.");
        }
        return;
      }

      if (data.user) {
        try {
          const { data: userData, error: userError } = await supabase
            .from("users")
            .select("deleted_at")
            .eq("id", data.user.id)
            .maybeSingle();

          if (!userError && userData && userData.deleted_at) {
            await supabase.auth.signOut();
            setError(
              "This account has been deleted. Please contact support if this is an error."
            );
            return;
          }
        } catch {
          // If deleted check fails, allow login to proceed
        }
      }
    } catch {
      setError("Unexpected error. Please try again.");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Wordmark ── */}
          <View style={styles.wordmarkBlock}>
            <Text style={styles.logoText}>Decider</Text>
            <Text style={styles.tagline}>Group decisions, resolved.</Text>
          </View>

          {/* ── Form ── */}
          <Text style={styles.title}>Welcome back</Text>

          <PaperInput
            label="Email"
            mode="outlined"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (text === "" && password === "") setError("");
            }}
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
            onChangeText={(text) => {
              setPassword(text);
              if (text === "" && email === "") setError("");
            }}
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

          <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin}>
            <Text style={styles.primaryBtnText}>Log in</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate("ForgotPassword")}
            style={styles.forgotLink}
          >
            <Text style={styles.forgotLinkText}>Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate("Signup")}>
            <Text style={styles.signupLink}>
              Don't have an account?{" "}
              <Text style={styles.signupLinkAccent}>Sign up</Text>
            </Text>
          </TouchableOpacity>

          {/* ── Guest entry ── */}
          <View style={styles.guestSection}>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or jump right in</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.guestPrimaryBtn}
              onPress={() => navigation.navigate("GuestNameScreen", { mode: "quickstart" })}
              activeOpacity={0.8}
            >
              <MaterialIcons name="bolt" size={18} color="#a5b4fc" />
              <Text style={styles.guestPrimaryBtnText}>Quick Start</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.guestSecondaryBtn}
              onPress={() => navigation.navigate("JoinDecisionScreen", {})}
              activeOpacity={0.8}
            >
              <MaterialIcons name="group-add" size={16} color="#64748b" />
              <Text style={styles.guestSecondaryBtnText}>Join with a Code</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
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
    marginBottom: 40,
  },
  logoText: {
    fontSize: 38,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
    color: "#6366f1",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 14,
    color: "#64748b",
    fontFamily: "Rubik_400Regular",
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
    marginBottom: 14,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
    fontFamily: "Rubik_500Medium",
  },

  // ── Links ──
  forgotLink: {
    alignSelf: "center",
    paddingVertical: 4,
    marginBottom: 10,
  },
  forgotLinkText: {
    color: "#94a3b8",
    fontSize: 13,
    fontFamily: "Rubik_400Regular",
  },
  signupLink: {
    textAlign: "center",
    color: "#64748b",
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
    marginTop: 4,
  },
  signupLinkAccent: {
    color: "#818cf8",
    fontFamily: "Rubik_500Medium",
    fontWeight: "600",
  },

  // ── Guest entry ──
  guestSection: {
    marginTop: 28,
    gap: 10,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#1e293b",
  },
  dividerText: {
    marginHorizontal: 10,
    fontSize: 12,
    color: "#334155",
    fontFamily: "Rubik_400Regular",
  },
  guestPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(99,102,241,0.12)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.25)",
    paddingVertical: 13,
    borderRadius: 10,
  },
  guestPrimaryBtnText: {
    color: "#a5b4fc",
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  guestSecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  guestSecondaryBtnText: {
    color: "#64748b",
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
  },
});

export default LoginScreen;
