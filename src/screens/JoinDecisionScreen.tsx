import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { TextInput as PaperInput, useTheme } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { supabase } from "../lib/supabase";
import { isDemoMode, DEMO_USER_ID } from "../lib/demoMode";
import {
  fetchDecisionDetail,
  fetchDecisionByInviteCode,
  joinDecision,
} from "../lib/decisions";
import { checkParticipantLimit } from "../lib/subscription";
import { formatLockTime } from "../utils/dateDisplay";
import UpgradePrompt from "../components/UpgradePrompt";
import { PHASE_LABELS } from "../../assets/constants/decisionTypes";
import type { Decision } from "../types/decisions";

const JoinDecisionScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const [inviteCode, setInviteCode] = useState(
    route.params?.inviteCode || ""
  );
  const [decision, setDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<string | undefined>();

  const gradientColors = useMemo(() => {
    return theme.dark
      ? (["#121212", "#1d1d1d", "#2b2b2d"] as const)
      : (["#fdfcf9", "#e0e7ff"] as const);
  }, [theme.dark]);

  // If navigated with decisionId (deep link), load directly
  useEffect(() => {
    if (route.params?.decisionId) {
      loadByDecisionId(route.params.decisionId);
    }
  }, [route.params?.decisionId]);

  const loadByDecisionId = async (decisionId: string) => {
    setLoading(true);
    try {
      const d = await fetchDecisionDetail(decisionId);
      setDecision(d);
    } catch {
      Toast.show({
        type: "error",
        text1: "Decision not found",
        position: "bottom",
      });
    }
    setLoading(false);
  };

  const handleLookup = async () => {
    if (!inviteCode.trim()) {
      Toast.show({
        type: "error",
        text1: "Enter an invite code",
        position: "bottom",
      });
      return;
    }

    setLoading(true);
    try {
      const d = await fetchDecisionByInviteCode(inviteCode.trim());
      if (!d) {
        Toast.show({
          type: "error",
          text1: "No decision found",
          text2: "Check the invite code and try again.",
          position: "bottom",
        });
      } else {
        setDecision(d);
      }
    } catch {
      Toast.show({
        type: "error",
        text1: "Lookup failed",
        position: "bottom",
      });
    }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!decision) return;

    setJoining(true);
    try {
      let currentUserId: string;

      if (isDemoMode()) {
        currentUserId = DEMO_USER_ID;
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        currentUserId = user.id;
      }

      // Check participant limit for the host's tier
      const participantCheck = await checkParticipantLimit(
        decision.id,
        decision.created_by
      );
      if (!participantCheck.allowed) {
        setUpgradeReason(participantCheck.reason);
        setShowUpgradePrompt(true);
        setJoining(false);
        return;
      }

      await joinDecision(decision.id, currentUserId);

      Toast.show({
        type: "success",
        text1: "Joined!",
        text2: `You're now part of "${decision.title}"`,
        position: "bottom",
      });

      navigation.replace("DecisionDetailScreen", {
        decisionId: decision.id,
      });
    } catch (err: any) {
      if (err.message?.includes("duplicate")) {
        Toast.show({
          type: "info",
          text1: "Already a member",
          position: "bottom",
        });
        navigation.replace("DecisionDetailScreen", {
          decisionId: decision.id,
        });
      } else {
        Toast.show({
          type: "error",
          text1: "Failed to join",
          text2: err.message || "Try again.",
          position: "bottom",
        });
      }
    }
    setJoining(false);
  };

  return (
    <>
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <View style={styles.container}>
        {!decision ? (
          // Invite code input
          <View style={styles.inputSection}>
            <Icon
              name="group-add"
              size={48}
              color={theme.colors.primary}
              style={{ alignSelf: "center", marginBottom: 16 }}
            />
            <Text
              style={[
                styles.heading,
                { color: theme.colors.onBackground },
              ]}
            >
              Join a Decision
            </Text>
            <Text
              style={[
                styles.subtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Enter the 6-character invite code shared by the organizer.
            </Text>

            <PaperInput
              label="Invite Code"
              mode="outlined"
              value={inviteCode}
              onChangeText={(text) => setInviteCode(text.toUpperCase())}
              maxLength={6}
              autoCapitalize="characters"
              style={styles.codeInput}
              theme={{ colors: { primary: "#2563eb" } }}
              contentStyle={styles.codeInputContent}
            />

            <TouchableOpacity
              style={[
                styles.lookupButton,
                {
                  backgroundColor: theme.colors.primary,
                  opacity: loading ? 0.6 : 1,
                },
              ]}
              onPress={handleLookup}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.lookupButtonText}>Look Up</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          // Decision preview
          <View style={styles.previewSection}>
            <Icon
              name="how-to-vote"
              size={48}
              color={theme.colors.primary}
              style={{ alignSelf: "center", marginBottom: 12 }}
            />
            <Text
              style={[
                styles.previewTitle,
                { color: theme.colors.onBackground },
              ]}
            >
              {decision.title}
            </Text>

            {decision.description ? (
              <Text
                style={[
                  styles.previewDesc,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {decision.description}
              </Text>
            ) : null}

            <View
              style={[
                styles.detailCard,
                {
                  backgroundColor:
                    (theme as any).custom?.card || theme.colors.surface,
                  borderColor:
                    (theme as any).custom?.cardBorder || theme.colors.outline,
                },
              ]}
            >
              <View style={styles.detailRow}>
                <Text
                  style={[
                    styles.detailLabel,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  Status
                </Text>
                <Text
                  style={[
                    styles.detailValue,
                    { color: theme.colors.onBackground },
                  ]}
                >
                  {PHASE_LABELS[decision.status]}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text
                  style={[
                    styles.detailLabel,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  Lock Time
                </Text>
                <Text
                  style={[
                    styles.detailValue,
                    { color: theme.colors.onBackground },
                  ]}
                >
                  {formatLockTime(decision.lock_time)}
                </Text>
              </View>
              {decision.type_label ? (
                <View style={styles.detailRow}>
                  <Text
                    style={[
                      styles.detailLabel,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    Category
                  </Text>
                  <Text
                    style={[
                      styles.detailValue,
                      { color: theme.colors.onBackground },
                    ]}
                  >
                    {decision.type_label.charAt(0).toUpperCase() +
                      decision.type_label.slice(1)}
                  </Text>
                </View>
              ) : null}
            </View>

            <TouchableOpacity
              style={[
                styles.joinButton,
                {
                  backgroundColor: theme.colors.primary,
                  opacity: joining ? 0.6 : 1,
                },
              ]}
              onPress={handleJoin}
              disabled={joining}
            >
              {joining ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.joinButtonText}>Join Decision</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setDecision(null)}
            >
              <Text
                style={[
                  styles.cancelButtonText,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Try a different code
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </LinearGradient>

    <UpgradePrompt
      visible={showUpgradePrompt}
      onClose={() => setShowUpgradePrompt(false)}
      onUpgrade={() => {
        setShowUpgradePrompt(false);
        navigation.navigate("SubscriptionScreen" as any);
      }}
      feature="Join Decision"
      reason={upgradeReason}
    />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  inputSection: {
    paddingBottom: 40,
  },
  heading: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
    fontFamily: "Rubik_600SemiBold",
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
    fontFamily: "Rubik_400Regular",
  },
  codeInput: {
    marginBottom: 16,
    backgroundColor: "transparent",
  },
  codeInputContent: {
    textAlign: "center",
    fontSize: 24,
    letterSpacing: 8,
    fontFamily: "Rubik_600SemiBold",
  },
  lookupButton: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  lookupButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  previewSection: {
    paddingBottom: 40,
  },
  previewTitle: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
    fontFamily: "Rubik_600SemiBold",
  },
  previewDesc: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
    fontFamily: "Rubik_400Regular",
  },
  detailCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  joinButton: {
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 12,
  },
  joinButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  cancelButton: {
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
  },
});

export default JoinDecisionScreen;
