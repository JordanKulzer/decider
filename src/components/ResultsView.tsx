import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "react-native-paper";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import type {
  Result,
  DecisionOption,
  Vote,
  DecisionMember,
  Decision,
} from "../types/decisions";

interface ResultsViewProps {
  results: Result[];
  options: DecisionOption[];
  votes: Vote[];
  members: DecisionMember[];
  decision: Decision;
}

const ResultsView: React.FC<ResultsViewProps> = ({
  results,
  options,
  votes,
  members,
  decision,
}) => {
  const theme = useTheme();

  const getOptionTitle = (optionId: string) =>
    options.find((o) => o.id === optionId)?.title || "Unknown";

  const winner = results.find((r) => r.is_winner);
  const maxPoints = results.length > 0 ? results[0].total_points : 1;

  if (results.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon
          name="hourglass-empty"
          size={48}
          color={theme.colors.onSurfaceVariant}
          style={{ opacity: 0.4 }}
        />
        <Text
          style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}
        >
          Results are being calculated...
        </Text>
      </View>
    );
  }

  return (
    <View>
      <Text
        style={[styles.sectionTitle, { color: theme.colors.onBackground }]}
      >
        Decision Locked
      </Text>

      {/* Winner */}
      {winner && (
        <View
          style={[
            styles.winnerCard,
            {
              backgroundColor: theme.dark ? "#1a2e1a" : "#ecfdf5",
              borderColor: "#22c55e",
            },
          ]}
        >
          <Icon name="emoji-events" size={32} color="#f59e0b" />
          <Text
            style={[
              styles.winnerTitle,
              { color: theme.colors.onBackground },
            ]}
          >
            {getOptionTitle(winner.option_id)}
          </Text>
          <Text style={[styles.winnerPoints, { color: "#22c55e" }]}>
            {winner.total_points} points
            {winner.average_rank != null
              ? ` (avg rank: ${winner.average_rank.toFixed(1)})`
              : ""}
          </Text>
        </View>
      )}

      {/* Full rankings */}
      <Text
        style={[styles.rankingHeader, { color: theme.colors.onSurfaceVariant }]}
      >
        Full Results
      </Text>

      {results.map((result) => {
        const barWidth =
          maxPoints > 0
            ? Math.max(8, (result.total_points / maxPoints) * 100)
            : 8;

        return (
          <View key={result.option_id} style={styles.resultRow}>
            <View style={styles.rankColumn}>
              <Text
                style={[
                  styles.rankNumber,
                  {
                    color: result.is_winner
                      ? "#f59e0b"
                      : theme.colors.onSurfaceVariant,
                  },
                ]}
              >
                #{result.rank}
              </Text>
            </View>
            <View style={styles.resultContent}>
              <Text
                style={[
                  styles.resultTitle,
                  { color: theme.colors.onBackground },
                ]}
                numberOfLines={1}
              >
                {getOptionTitle(result.option_id)}
              </Text>
              <View style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    {
                      width: `${barWidth}%`,
                      backgroundColor: result.is_winner
                        ? "#22c55e"
                        : theme.colors.primary,
                    },
                  ]}
                />
              </View>
            </View>
            <Text
              style={[
                styles.resultPoints,
                { color: theme.colors.onBackground },
              ]}
            >
              {result.total_points}
            </Text>
          </View>
        );
      })}

      {/* Vote reveal (if enabled) */}
      {decision.reveal_votes_after_lock && votes.length > 0 && (
        <View style={styles.revealSection}>
          <Text
            style={[
              styles.revealHeader,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            Individual Votes
          </Text>
          {members.map((member) => {
            const memberVotes = votes.filter(
              (v) => v.user_id === member.user_id
            );
            if (memberVotes.length === 0) return null;

            return (
              <View key={member.id} style={styles.memberVoteRow}>
                <Text
                  style={[
                    styles.memberVoteName,
                    { color: theme.colors.onBackground },
                  ]}
                >
                  {member.username || "Unknown"}
                </Text>
                <View style={styles.memberVoteList}>
                  {memberVotes
                    .sort((a, b) => b.value - a.value)
                    .map((v) => (
                      <Text
                        key={v.option_id}
                        style={[
                          styles.memberVoteItem,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        {getOptionTitle(v.option_id)}: {v.value}
                        {decision.voting_mechanism === "point_allocation"
                          ? "pts"
                          : ""}
                      </Text>
                    ))}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
    fontFamily: "Rubik_600SemiBold",
  },
  winnerCard: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 20,
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  winnerTitle: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    fontFamily: "Rubik_600SemiBold",
  },
  winnerPoints: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  rankingHeader: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    fontFamily: "Rubik_500Medium",
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  rankColumn: {
    width: 30,
  },
  rankNumber: {
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  resultContent: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 4,
    fontFamily: "Rubik_500Medium",
  },
  barContainer: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(0,0,0,0.1)",
    overflow: "hidden",
  },
  bar: {
    height: "100%",
    borderRadius: 3,
  },
  resultPoints: {
    fontSize: 14,
    fontWeight: "700",
    minWidth: 30,
    textAlign: "right",
    fontFamily: "Rubik_600SemiBold",
  },
  revealSection: {
    marginTop: 20,
  },
  revealHeader: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    fontFamily: "Rubik_500Medium",
  },
  memberVoteRow: {
    marginBottom: 12,
  },
  memberVoteName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
    fontFamily: "Rubik_500Medium",
  },
  memberVoteList: {
    paddingLeft: 8,
  },
  memberVoteItem: {
    fontSize: 12,
    fontFamily: "Rubik_400Regular",
  },
});

export default ResultsView;
