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

const ResetPasswordScreen = ({
  navigation,
  onResetComplete,
}: {
  navigation: any;
  onResetComplete: () => void;
}) => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  const theme = useTheme();
  const scheme = useColorScheme();
  const isDark = scheme === "dark";

  const gradientColors = useMemo(() => {
    return theme.dark
      ? (["#121212", "#1d1d1d", "#2b2b2d"] as const)
      : (["#fdfcf9", "#e0e7ff"] as const);
  }, [theme.dark]);

  const handleResetPassword = async () => {
    if (!password || !confirmPassword) {
      setMessage({ text: "Please fill out both fields.", type: "error" });
      return;
    }
    if (password.length < 6) {
      setMessage({
        text: "Password must be at least 6 characters.",
        type: "error",
      });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ text: "Passwords do not match.", type: "error" });
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage({ text: error.message, type: "error" });
      } else {
        setMessage({
          text: "Password reset successfully! Redirecting...",
          type: "success",
        });
        setTimeout(() => onResetComplete(), 1500);
      }
    } catch {
      setMessage({ text: "Unexpected error occurred.", type: "error" });
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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.logoText, { color: theme.colors.primary }]}>
            Decider
          </Text>

          <Text style={[styles.title, { color: theme.colors.onBackground }]}>
            Set New Password
          </Text>

          <PaperInput
            label="New Password"
            mode="outlined"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            theme={{ colors: { primary: "#2563eb" } }}
            right={
              <PaperInput.Icon
                icon={showPassword ? "eye-off" : "eye"}
                onPress={() => setShowPassword(!showPassword)}
                color="#2563eb"
              />
            }
          />

          <PaperInput
            label="Confirm Password"
            mode="outlined"
            secureTextEntry={!showPassword}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            style={styles.input}
            theme={{ colors: { primary: "#2563eb" } }}
          />

          {message.text ? (
            <View
              style={[
                styles.messageBox,
                {
                  backgroundColor:
                    message.type === "success"
                      ? isDark
                        ? "#113311"
                        : "#d6f5d6"
                      : isDark
                      ? "#331111"
                      : "#ffe6e6",
                },
              ]}
            >
              <Text
                style={{
                  color:
                    message.type === "success"
                      ? isDark
                        ? "#99ff99"
                        : "#006600"
                      : isDark
                      ? "#ff6666"
                      : "#cc0000",
                  textAlign: "center",
                }}
              >
                {message.text}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.button}
            onPress={handleResetPassword}
          >
            <Text style={styles.buttonText}>Reset Password</Text>
          </TouchableOpacity>
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
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 20,
    fontFamily: "Rubik_600SemiBold",
  },
  input: {
    marginBottom: 16,
    backgroundColor: "transparent",
  },
  messageBox: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
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
});

export default ResetPasswordScreen;
