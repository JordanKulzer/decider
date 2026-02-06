import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useColorScheme,
} from "react-native";
import { TextInput as PaperInput, useTheme } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "../lib/supabase";

const LoginScreen = ({
  navigation,
  onDemoLogin,
}: {
  navigation: any;
  onDemoLogin?: () => void;
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const theme = useTheme();
  const scheme = useColorScheme();
  const isDark = scheme === "dark";

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

  const gradientColors = useMemo(() => {
    return theme.dark
      ? (["#121212", "#1d1d1d", "#2b2b2d"] as const)
      : (["#fdfcf9", "#e0e7ff"] as const);
  }, [theme.dark]);

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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.logoText, { color: theme.colors.primary }]}>
            Decider
          </Text>
          <Text
            style={[styles.tagline, { color: theme.colors.onSurfaceVariant }]}
          >
            Group decisions, resolved.
          </Text>

          <Text style={[styles.title, { color: theme.colors.onBackground }]}>
            Welcome!
          </Text>

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
            onChangeText={(text) => {
              setPassword(text);
              if (text === "" && email === "") setError("");
            }}
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

          <TouchableOpacity style={styles.button} onPress={handleLogin}>
            <Text style={styles.buttonText}>Login</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate("ForgotPassword")}
            style={styles.forgotPasswordContainer}
          >
            <Text style={styles.linkSmall}>Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate("Signup")}>
            <Text style={styles.linkText}>
              Don't have an account? Sign up
            </Text>
          </TouchableOpacity>

          {onDemoLogin && (
            <View style={styles.demoSection}>
              <View
                style={[
                  styles.dividerRow,
                  { borderColor: theme.colors.outlineVariant },
                ]}
              >
                <View
                  style={[
                    styles.dividerLine,
                    { backgroundColor: theme.colors.outlineVariant },
                  ]}
                />
                <Text
                  style={[
                    styles.dividerText,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  or
                </Text>
                <View
                  style={[
                    styles.dividerLine,
                    { backgroundColor: theme.colors.outlineVariant },
                  ]}
                />
              </View>
              <TouchableOpacity
                style={[
                  styles.demoButton,
                  { borderColor: theme.colors.primary },
                ]}
                onPress={onDemoLogin}
              >
                <Text
                  style={[
                    styles.demoButtonText,
                    { color: theme.colors.primary },
                  ]}
                >
                  Try Demo
                </Text>
              </TouchableOpacity>
              <Text
                style={[
                  styles.demoHint,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Explore the app with sample data
              </Text>
            </View>
          )}
        </ScrollView>
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
    marginBottom: 4,
  },
  tagline: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 32,
    fontFamily: "Rubik_400Regular",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 10,
    fontFamily: "Rubik_600SemiBold",
  },
  input: {
    marginBottom: 16,
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
  forgotPasswordContainer: {
    alignSelf: "center",
    marginBottom: 12,
  },
  linkSmall: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "500",
    fontFamily: "Rubik_500Medium",
  },
  errorBox: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  linkText: {
    textAlign: "center",
    color: "#2563eb",
    fontWeight: "500",
    fontSize: 14,
    marginTop: 4,
    fontFamily: "Rubik_400Regular",
  },
  demoSection: {
    marginTop: 24,
    alignItems: "center",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    width: "100%",
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 13,
    fontFamily: "Rubik_400Regular",
  },
  demoButton: {
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignItems: "center",
    width: "100%",
  },
  demoButtonText: {
    fontWeight: "600",
    fontSize: 16,
    fontFamily: "Rubik_500Medium",
  },
  demoHint: {
    fontSize: 12,
    marginTop: 8,
    fontFamily: "Rubik_400Regular",
  },
});

export default LoginScreen;
