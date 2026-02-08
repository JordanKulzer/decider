import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "react-native-paper";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import {
  fetchAdvanceVotes,
  submitAdvanceVote,
  removeAdvanceVote,
} from "../lib/decisions";
import type { AdvanceVote, DecisionMember } from "../types/decisions";

interface AdvanceVoteButtonProps {
  decisionId: string;
  userId: string;
  fromPhase: "constraints" | "options";
  members: DecisionMember[];
  onThresholdReached?: () => void;
}

const AdvanceVoteButton: React.FC<AdvanceVoteButtonProps> = ({
  decisionId,
  userId,
  fromPhase,
  members,
  onThresholdReached,
}) => {
  const theme = useTheme();
  const [advanceVotes, setAdvanceVotes] = useState<AdvanceVote[]>([]);
  const [loading, setLoading] = useState(false);

  const loadVotes = async () => {
    try {
      const votes = await fetchAdvanceVotes(decisionId, fromPhase);
      setAdvanceVotes(votes);
    } catch (err) {
      console.error("Error loading advance votes:", err);
    }
  };

  useEffect(() => {
    loadVotes();
  }, [decisionId, fromPhase]);

  const hasVoted = advanceVotes.some((v) => v.user_id === userId);
  const voteCount = advanceVotes.length;
  const memberCount = members.length;
  const threshold = Math.ceil(memberCount / 2); // Majority required
  const thresholdReached = voteCount >= threshold;

  const handleVote = async () => {
    setLoading(true);
    try {
      if (hasVoted) {
        await removeAdvanceVote(decisionId, userId, fromPhase);
        Toast.show({
          type: "info",
          text1: "Vote removed",
          position: "bottom",
        });
      } else {
        await submitAdvanceVote(decisionId, userId, fromPhase);
        Toast.show({
          type: "success",
          text1: "Voted to advance!",
          position: "bottom",
        });
      }
      await loadVotes();
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Failed to vote",
        text2: err.message,
        position: "bottom",
      });
    }
    setLoading(false);
  };

  const nextPhase = fromPhase === "constraints" ? "Options" : "Voting";
  const voterNames = advanceVotes
    .map((v) => v.username || "Unknown")
    .join(", ");

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: (theme as any).custom?.card || theme.colors.surface,
            borderColor: thresholdReached
              ? "#22c55e"
              : (theme as any).custom?.cardBorder || theme.colors.outline,
          },
        ]}
      >
        <View style={styles.infoRow}>
          <Icon
            name="how-to-vote"
            size={20}
            color={thresholdReached ? "#22c55e" : theme.colors.primary}
          />
          <View style={styles.textContainer}>
            <Text style={[styles.title, { color: theme.colors.onBackground }]}>
              Ready to move to {nextPhase}?
            </Text>
            <Text
              style={[styles.count, { color: theme.colors.onSurfaceVariant }]}
            >
              {voteCount}/{memberCount} members voted ({threshold} needed)
            </Text>
            {voteCount > 0 && (
              <Text
                style={[styles.voters, { color: theme.colors.onSurfaceVariant }]}
                numberOfLines={1}
              >
                {voterNames}
              </Text>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.voteButton,
            {
              backgroundColor: hasVoted
                ? theme.colors.surfaceVariant
                : theme.colors.primary,
            },
          ]}
          onPress={handleVote}
          disabled={loading}
        >
          <Icon
            name={hasVoted ? "check" : "thumb-up"}
            size={16}
            color={hasVoted ? theme.colors.onSurfaceVariant : "#fff"}
          />
          <Text
            style={[
              styles.voteButtonText,
              {
                color: hasVoted ? theme.colors.onSurfaceVariant : "#fff",
              },
            ]}
          >
            {hasVoted ? "Voted" : "Ready"}
          </Text>
        </TouchableOpacity>
      </View>

      {thresholdReached && onThresholdReached && (
        <TouchableOpacity
          style={styles.advanceButton}
          onPress={onThresholdReached}
        >
          <Text style={styles.advanceButtonText}>Move to {nextPhase}</Text>
          <Icon name="arrow-forward" size={18} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 12,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  count: {
    fontSize: 12,
    fontFamily: "Rubik_400Regular",
    marginTop: 2,
  },
  voters: {
    fontSize: 11,
    fontFamily: "Rubik_400Regular",
    fontStyle: "italic",
    marginTop: 2,
  },
  voteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  voteButtonText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  advanceButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#22c55e",
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 10,
    gap: 8,
  },
  advanceButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
});

export default AdvanceVoteButton;
