import React, { useMemo, useState } from "react";
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
  useColorScheme,
} from "react-native";
import { TextInput as PaperInput, useTheme } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "../lib/supabase";
import { MaterialIcons as Icon } from "@expo/vector-icons";

const SignUpScreen = ({ navigation }: { navigation: any }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  const theme = useTheme();
  const scheme = useColorScheme();
  const isDark = scheme === "dark";

  const gradientColors = useMemo(
    () =>
      theme.dark
        ? (["#121212", "#1d1d1d", "#2b2b2d"] as [string, string, ...string[]])
        : (["#fdfcf9", "#e0e7ff"] as [string, string]),
    [theme.dark]
  );

  const checkUsernameAvailable = async (
    usernameToCheck: string
  ): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id")
        .eq("username", usernameToCheck)
        .maybeSingle();

      if (error) return false;
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
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.logoText, { color: theme.colors.primary }]}>
              Decider
            </Text>

            <Text
              style={[styles.title, { color: theme.colors.onBackground }]}
            >
              Create your account
            </Text>

            <PaperInput
              label="Username"
              mode="outlined"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              style={styles.input}
              theme={{ colors: { primary: "#2563eb" } }}
              right={
                username ? (
                  <PaperInput.Icon
                    icon="close"
                    onPress={() => setUsername("")}
                    color="#2563eb"
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
              theme={{ colors: { primary: "#2563eb" } }}
              right={
                email ? (
                  <PaperInput.Icon
                    icon="close"
                    onPress={() => setEmail("")}
                    color="#2563eb"
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
              theme={{ colors: { primary: "#2563eb" } }}
              right={
                password ? (
                  <PaperInput.Icon
                    icon={showPassword ? "eye-off" : "eye"}
                    onPress={() => setShowPassword(!showPassword)}
                    color="#2563eb"
                  />
                ) : null
              }
            />

            {error ? (
              <View
                style={[
                  styles.errorBox,
                  { backgroundColor: isDark ? "#331111" : "#ffe6e6" },
                ]}
              >
                <Text
                  style={{
                    color: isDark ? "#ff6666" : "#cc0000",
                    textAlign: "center",
                  }}
                >
                  {error}
                </Text>
              </View>
            ) : null}

            <TouchableOpacity style={styles.button} onPress={handleSignup}>
              <Text style={styles.buttonText}>Sign Up</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Icon name="arrow-back" size={16} color="#2563eb" />
              <Text style={styles.backButtonText}>Back to Login</Text>
            </TouchableOpacity>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    marginTop: 60,
  },
  logoText: {
    fontSize: 40,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
    textAlign: "center",
    letterSpacing: -1,
    marginBottom: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
    fontFamily: "Rubik_600SemiBold",
  },
  input: {
    marginBottom: 10,
    backgroundColor: "transparent",
  },
  button: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 16,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
    fontFamily: "Rubik_500Medium",
  },
  errorBox: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    color: "#2563eb",
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 6,
    fontFamily: "Rubik_400Regular",
  },
});

export default SignUpScreen;
