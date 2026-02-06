import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "react-native-paper";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { supabase } from "../lib/supabase";
import { isDemoMode, DEMO_USER_ID } from "../lib/demoMode";
import { submitVotes } from "../lib/decisions";
import type { DecisionOption } from "../types/decisions";

interface ForcedRankingProps {
  decisionId: string;
  options: DecisionOption[];
  onVoteSubmitted: () => void;
}

const ForcedRanking: React.FC<ForcedRankingProps> = ({
  decisionId,
  options,
  onVoteSubmitted,
}) => {
  const theme = useTheme();
  // rankings: optionId -> rank (1-based), null = unranked
  const [rankings, setRankings] = useState<Record<string, number | null>>(
    Object.fromEntries(options.map((o) => [o.id, null]))
  );
  const [submitting, setSubmitting] = useState(false);

  const assignedRanks = Object.values(rankings).filter(
    (r) => r !== null
  ) as number[];
  const nextRank = assignedRanks.length + 1;
  const allRanked = assignedRanks.length === options.length;

  const handleTapToRank = (optionId: string) => {
    const currentRank = rankings[optionId];

    if (currentRank !== null) {
      // Unrank: remove this rank and shift others down
      const removed = currentRank;
      const updated: Record<string, number | null> = {};
      for (const [id, rank] of Object.entries(rankings)) {
        if (id === optionId) {
          updated[id] = null;
        } else if (rank !== null && rank > removed) {
          updated[id] = rank - 1;
        } else {
          updated[id] = rank;
        }
      }
      setRankings(updated);
    } else {
      // Assign next rank
      setRankings((prev) => ({ ...prev, [optionId]: nextRank }));
    }
  };

  const handleSubmit = async () => {
    if (!allRanked) {
      Toast.show({
        type: "error",
        text1: "Rank all options",
        text2: "Tap each option to assign a rank.",
        position: "bottom",
      });
      return;
    }

    setSubmitting(true);
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

      const votes = Object.entries(rankings).map(([optionId, rank]) => ({
        option_id: optionId,
        value: rank as number,
      }));

      await submitVotes(decisionId, currentUserId, votes);

      Toast.show({
        type: "success",
        text1: "Vote submitted!",
        position: "bottom",
      });
      onVoteSubmitted();
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Vote failed",
        text2: err.message,
        position: "bottom",
      });
    }
    setSubmitting(false);
  };

  // Sort options: ranked first (by rank), unranked after
  const sortedOptions = [...options].sort((a, b) => {
    const ra = rankings[a.id];
    const rb = rankings[b.id];
    if (ra !== null && rb !== null) return ra - rb;
    if (ra !== null) return -1;
    if (rb !== null) return 1;
    return 0;
  });

  return (
    <View style={styles.container}>
      <Text
        style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}
      >
        Tap options in order of preference. First tap = #1 (best).
      </Text>

      <View style={styles.progressBar}>
        <Text
          style={[
            styles.progressText,
            {
              color: allRanked
                ? "#22c55e"
                : theme.colors.onBackground,
            },
          ]}
        >
          {allRanked
            ? "All options ranked!"
            : `${assignedRanks.length}/${options.length} ranked`}
        </Text>
      </View>

      {sortedOptions.map((option) => {
        const rank = rankings[option.id];
        const isRanked = rank !== null;

        return (
          <TouchableOpacity
            key={option.id}
            style={[
              styles.optionRow,
              {
                backgroundColor: isRanked
                  ? theme.dark
                    ? "#1e3a5f"
                    : "#e0edff"
                  : (theme as any).custom?.card || theme.colors.surface,
                borderColor: isRanked
                  ? theme.colors.primary
                  : (theme as any).custom?.cardBorder || theme.colors.outline,
              },
            ]}
            onPress={() => handleTapToRank(option.id)}
            activeOpacity={0.7}
          >
            {/* Rank badge */}
            <View
              style={[
                styles.rankBadge,
                {
                  backgroundColor: isRanked
                    ? theme.colors.primary
                    : "transparent",
                  borderColor: isRanked
                    ? theme.colors.primary
                    : theme.colors.onSurfaceVariant,
                },
              ]}
            >
              {isRanked ? (
                <Text style={styles.rankText}>{rank}</Text>
              ) : (
                <Text
                  style={[
                    styles.rankPlaceholder,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  -
                </Text>
              )}
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.optionTitle,
                  { color: theme.colors.onBackground },
                ]}
                numberOfLines={1}
              >
                {option.title}
              </Text>
              {option.description && (
                <Text
                  style={[
                    styles.optionDesc,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                  numberOfLines={1}
                >
                  {option.description}
                </Text>
              )}
            </View>

            {isRanked && (
              <Icon
                name="check"
                size={18}
                color={theme.colors.primary}
              />
            )}
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        style={[
          styles.submitButton,
          {
            backgroundColor: theme.colors.primary,
            opacity: allRanked && !submitting ? 1 : 0.5,
          },
        ]}
        onPress={handleSubmit}
        disabled={!allRanked || submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>Submit Vote</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  hint: {
    fontSize: 13,
    marginBottom: 4,
    fontFamily: "Rubik_400Regular",
  },
  progressBar: {
    alignItems: "center",
    paddingVertical: 8,
  },
  progressText: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 12,
  },
  rankBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  rankPlaceholder: {
    fontSize: 14,
    fontWeight: "700",
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  optionDesc: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: "Rubik_400Regular",
  },
  submitButton: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  submitText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
});

export default ForcedRanking;
