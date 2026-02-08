import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { supabase } from "../lib/supabase";
import { isDemoMode, DEMO_USER_ID } from "../lib/demoMode";
import { fetchUserDecisions } from "../lib/decisions";
import { checkCanCreateDecision } from "../lib/subscription";
import { formatCountdown, getCountdownUrgency } from "../utils/dateDisplay";
import { PHASE_LABELS } from "../../assets/constants/decisionTypes";
import UpgradePrompt from "../components/UpgradePrompt";
import type { Decision, DecisionStatus } from "../types/decisions";

const STATUS_COLORS: Record<DecisionStatus, string> = {
  constraints: "#94a3b8",
  options: "#f59e0b",
  voting: "#2563eb",
  locked: "#22c55e",
};

const HomeScreen = () => {
  const [decisions, setDecisions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<string | undefined>();
  const theme = useTheme();
  const navigation = useNavigation<any>();

  const gradientColors = useMemo(() => {
    return theme.dark
      ? (["#121212", "#1d1d1d", "#2b2b2d"] as const)
      : (["#fdfcf9", "#e0e7ff"] as const);
  }, [theme.dark]);

  const handleCreateDecision = async () => {
    if (!userId) {
      navigation.navigate("CreateDecisionScreen");
      return;
    }
    try {
      const { allowed, reason } = await checkCanCreateDecision(userId);
      if (!allowed) {
        setUpgradeReason(reason);
        setShowUpgradePrompt(true);
        return;
      }
      navigation.navigate("CreateDecisionScreen");
    } catch (err) {
      console.error("Error checking tier:", err);
      // Allow navigation on error to not block users
      navigation.navigate("CreateDecisionScreen");
    }
  };

  const handleUpgrade = () => {
    setShowUpgradePrompt(false);
    navigation.navigate("SubscriptionScreen" as any);
  };

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        setLoading(true);
        let currentUserId: string | null = null;

        if (isDemoMode()) {
          currentUserId = DEMO_USER_ID;
        } else {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) return;
          currentUserId = user.id;
        }

        setUserId(currentUserId);

        try {
          const data = await fetchUserDecisions(currentUserId);
          setDecisions(data || []);
        } catch (err) {
          console.error("Error fetching decisions:", err);
        }
        setLoading(false);
      };
      load();
    }, [])
  );

  const activeDecisions = decisions.filter(
    (d) => d.decisions?.status !== "locked"
  );
  const resolvedDecisions = decisions.filter(
    (d) => d.decisions?.status === "locked"
  );

  const renderDecisionCard = ({ item }: { item: any }) => {
    const decision = item.decisions as Decision;
    if (!decision) return null;

    const statusColor = STATUS_COLORS[decision.status] || "#94a3b8";
    const urgency = getCountdownUrgency(decision.lock_time);
    const countdownColor =
      urgency === "critical"
        ? "#ef4444"
        : urgency === "warning"
        ? "#f59e0b"
        : theme.colors.onSurfaceVariant;

    return (
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: (theme as any).custom?.card || theme.colors.surface,
            borderColor:
              (theme as any).custom?.cardBorder || theme.colors.outline,
            borderLeftColor: statusColor,
          },
        ]}
        onPress={() =>
          navigation.navigate("DecisionDetailScreen", {
            decisionId: decision.id,
          })
        }
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text
            style={[styles.cardTitle, { color: theme.colors.onBackground }]}
            numberOfLines={1}
          >
            {decision.title}
          </Text>
          <View
            style={[styles.statusBadge, { backgroundColor: statusColor }]}
          >
            <Text style={styles.statusText}>
              {PHASE_LABELS[decision.status]}
            </Text>
          </View>
        </View>

        {decision.type_label ? (
          <Text
            style={[
              styles.typeLabel,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            {decision.type_label.charAt(0).toUpperCase() +
              decision.type_label.slice(1)}
          </Text>
        ) : null}

        <View style={styles.cardFooter}>
          <View style={styles.footerItem}>
            <Icon
              name="schedule"
              size={14}
              color={countdownColor}
            />
            <Text style={[styles.footerText, { color: countdownColor }]}>
              {formatCountdown(decision.lock_time)}
            </Text>
          </View>
          <View style={styles.footerItem}>
            <Icon
              name={
                decision.voting_mechanism === "point_allocation"
                  ? "touch-app"
                  : "sort"
              }
              size={14}
              color={theme.colors.onSurfaceVariant}
            />
            <Text
              style={[
                styles.footerText,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {decision.voting_mechanism === "point_allocation"
                ? "Points"
                : "Ranking"}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = (title: string, count: number) => (
    <Text
      style={[styles.sectionHeader, { color: theme.colors.onSurfaceVariant }]}
    >
      {title} ({count})
    </Text>
  );

  return (
    <>
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : decisions.length === 0 ? (
        <View style={styles.centered}>
          <Icon
            name="how-to-vote"
            size={64}
            color={theme.colors.onSurfaceVariant}
            style={{ opacity: 0.4, marginBottom: 16 }}
          />
          <Text
            style={[
              styles.emptyTitle,
              { color: theme.colors.onBackground },
            ]}
          >
            No decisions yet
          </Text>
          <Text
            style={[
              styles.emptySubtitle,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            Create a new decision or join one with an invite code.
          </Text>
          <View style={styles.emptyButtons}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: theme.colors.primary },
              ]}
              onPress={handleCreateDecision}
            >
              <Icon name="add" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>New Decision</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.secondaryButton,
                {
                  borderColor: theme.colors.primary,
                },
              ]}
              onPress={() => navigation.navigate("JoinDecisionScreen", {})}
            >
              <Icon name="group-add" size={18} color={theme.colors.primary} />
              <Text
                style={[
                  styles.secondaryButtonText,
                  { color: theme.colors.primary },
                ]}
              >
                Join by Code
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <FlatList
          data={[]}
          renderItem={null}
          keyExtractor={() => "header"}
          ListHeaderComponent={
            <View style={styles.listContainer}>
              {/* Action buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    { backgroundColor: theme.colors.primary, flex: 1 },
                  ]}
                  onPress={handleCreateDecision}
                >
                  <Icon name="add" size={18} color="#fff" />
                  <Text style={styles.primaryButtonText}>New Decision</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.secondaryButton,
                    { borderColor: theme.colors.primary, flex: 1 },
                  ]}
                  onPress={() =>
                    navigation.navigate("JoinDecisionScreen", {})
                  }
                >
                  <Icon
                    name="group-add"
                    size={18}
                    color={theme.colors.primary}
                  />
                  <Text
                    style={[
                      styles.secondaryButtonText,
                      { color: theme.colors.primary },
                    ]}
                  >
                    Join by Code
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Active Decisions */}
              {activeDecisions.length > 0 && (
                <>
                  {renderSectionHeader("Active", activeDecisions.length)}
                  {activeDecisions.map((item, index) => (
                    <View key={item.decision_id || index}>
                      {renderDecisionCard({ item })}
                    </View>
                  ))}
                </>
              )}

              {/* Resolved Decisions */}
              {resolvedDecisions.length > 0 && (
                <>
                  {renderSectionHeader("Resolved", resolvedDecisions.length)}
                  {resolvedDecisions.map((item, index) => (
                    <View key={item.decision_id || index}>
                      {renderDecisionCard({ item })}
                    </View>
                  ))}
                </>
              )}
            </View>
          }
        />
      )}
    </LinearGradient>

      <UpgradePrompt
        visible={showUpgradePrompt}
        onClose={() => setShowUpgradePrompt(false)}
        onUpgrade={handleUpgrade}
        feature="Create More Decisions"
        reason={upgradeReason}
      />
    </>
  );
};

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 6,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
    fontFamily: "Rubik_500Medium",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 6,
  },
  secondaryButtonText: {
    fontWeight: "600",
    fontSize: 14,
    fontFamily: "Rubik_500Medium",
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 4,
    fontFamily: "Rubik_500Medium",
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 5,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
    fontFamily: "Rubik_500Medium",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Rubik_500Medium",
  },
  typeLabel: {
    fontSize: 12,
    marginBottom: 8,
    fontFamily: "Rubik_400Regular",
  },
  cardFooter: {
    flexDirection: "row",
    gap: 16,
  },
  footerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  footerText: {
    fontSize: 12,
    fontFamily: "Rubik_400Regular",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
    fontFamily: "Rubik_600SemiBold",
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
    fontFamily: "Rubik_400Regular",
  },
  emptyButtons: {
    flexDirection: "row",
    gap: 12,
  },
});

export default HomeScreen;
