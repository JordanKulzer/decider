import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MaterialIcons } from "@expo/vector-icons";
import { getGuestDisplayName, setGuestDisplayName } from "../lib/guest";
import type { RootStackParamList } from "../types/navigation";

type NavProp  = NativeStackNavigationProp<RootStackParamList, "GuestNameScreen">;
type RouteProp = NativeStackScreenProps<RootStackParamList, "GuestNameScreen">["route"];

export default function GuestNameScreen() {
  const navigation = useNavigation<NavProp>();
  const route      = useRoute<RouteProp>();
  const { mode }   = route.params;

  const [name, setName]       = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Pre-fill from AsyncStorage on mount.
  useEffect(() => {
    getGuestDisplayName().then((stored) => {
      if (stored) setName(stored);
      setLoading(false);
      // Focus after data is ready so the keyboard appears with the value.
      setTimeout(() => inputRef.current?.focus(), 100);
    });
  }, []);

  async function handleContinue() {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Enter a name so others know who you are.");
      return;
    }
    if (trimmed.length > 30) {
      setError("Name must be 30 characters or fewer.");
      return;
    }

    setSaving(true);
    await setGuestDisplayName(trimmed);

    // Replace so Back from the destination doesn't return here.
    if (mode === "quickstart") {
      navigation.replace("QuickStartScreen");
    } else {
      navigation.replace("JoinDecisionScreen", {});
    }
  }

  const subtitle =
    mode === "quickstart"
      ? "You're about to start a quick decision. What should others call you?"
      : "You're about to join a decision. What should others call you?";

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* ── Nav bar ── */}
      <View style={styles.navBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialIcons name="arrow-back" size={22} color="#94a3b8" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>
          {mode === "quickstart" ? "Quick Start" : "Join Decision"}
        </Text>
        {/* Spacer keeps title centred */}
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {loading ? (
          <ActivityIndicator color="#6366f1" size="large" />
        ) : (
          <View style={styles.inner}>
            <Text style={styles.heading}>What's your name?</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>

            <TextInput
              ref={inputRef}
              style={[styles.input, error ? styles.inputError : null]}
              value={name}
              onChangeText={(t) => {
                setName(t);
                if (error) setError(null);
              }}
              placeholder="e.g. Jordan"
              placeholderTextColor="#475569"
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={30}
              returnKeyType="done"
              onSubmitEditing={handleContinue}
            />

            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.continueBtn, saving && styles.continueBtnDisabled]}
              onPress={handleContinue}
              disabled={saving}
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.continueBtnText}>Continue</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.hint}>No account needed.</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },

  // ── Nav bar ──
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  backBtn: {
    width: 40,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#e2e8f0",
    letterSpacing: -0.2,
  },

  // ── Body ──
  body: {
    flex: 1,
    justifyContent: "center",
  },
  inner: {
    paddingHorizontal: 28,
    paddingBottom: 48,
  },
  heading: {
    fontSize: 22,
    fontWeight: "700",
    color: "#f1f5f9",
    marginBottom: 8,
    fontFamily: "Rubik_600SemiBold",
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    lineHeight: 20,
    marginBottom: 28,
    fontFamily: "Rubik_400Regular",
  },

  // ── Input ──
  input: {
    backgroundColor: "#1e293b",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: "#f1f5f9",
    marginBottom: 6,
    fontFamily: "Rubik_500Medium",
  },
  inputError: {
    borderColor: "rgba(248,113,113,0.5)",
  },
  errorText: {
    fontSize: 13,
    color: "#f87171",
    marginBottom: 16,
    fontFamily: "Rubik_400Regular",
  },

  // ── Button ──
  continueBtn: {
    backgroundColor: "#6366f1",
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
    marginBottom: 14,
  },
  continueBtnDisabled: {
    opacity: 0.6,
  },
  continueBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  hint: {
    textAlign: "center",
    fontSize: 12,
    color: "#334155",
    fontFamily: "Rubik_400Regular",
  },
});
