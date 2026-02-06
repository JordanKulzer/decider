import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "react-native-paper";
import Icon from "react-native-vector-icons/MaterialIcons";
import Toast from "react-native-toast-message";
import { supabase } from "../lib/supabase";
import { isDemoMode, DEMO_USER_ID } from "../lib/demoMode";
import { submitVotes } from "../lib/decisions";
import type { DecisionOption } from "../types/decisions";

const TOTAL_POINTS = 10;

interface PointAllocationProps {
  decisionId: string;
  options: DecisionOption[];
  onVoteSubmitted: () => void;
}

const PointAllocation: React.FC<PointAllocationProps> = ({
  decisionId,
  options,
  onVoteSubmitted,
}) => {
  const theme = useTheme();
  const [allocations, setAllocations] = useState<Record<string, number>>(
    Object.fromEntries(options.map((o) => [o.id, 0]))
  );
  const [submitting, setSubmitting] = useState(false);

  const totalUsed = Object.values(allocations).reduce((a, b) => a + b, 0);
  const remaining = TOTAL_POINTS - totalUsed;

  const increment = (optionId: string) => {
    if (remaining <= 0) return;
    setAllocations((prev) => ({
      ...prev,
      [optionId]: (prev[optionId] || 0) + 1,
    }));
  };

  const decrement = (optionId: string) => {
    setAllocations((prev) => ({
      ...prev,
      [optionId]: Math.max(0, (prev[optionId] || 0) - 1),
    }));
  };

  const handleSubmit = async () => {
    if (remaining !== 0) {
      Toast.show({
        type: "error",
        text1: "Use all your points",
        text2: `You have ${remaining} points left to allocate.`,
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

      const votes = Object.entries(allocations).map(([optionId, value]) => ({
        option_id: optionId,
        value,
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

  return (
    <View style={styles.container}>
      <Text
        style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}
      >
        Distribute {TOTAL_POINTS} points across the options. More points =
        stronger preference.
      </Text>

      {/* Points remaining */}
      <View
        style={[
          styles.remainingBar,
          {
            backgroundColor:
              (theme as any).custom?.card || theme.colors.surface,
            borderColor:
              remaining === 0
                ? "#22c55e"
                : (theme as any).custom?.cardBorder || theme.colors.outline,
          },
        ]}
      >
        <Text
          style={[
            styles.remainingText,
            {
              color:
                remaining === 0
                  ? "#22c55e"
                  : theme.colors.onBackground,
            },
          ]}
        >
          {remaining === 0
            ? "All points allocated!"
            : `${remaining} point${remaining !== 1 ? "s" : ""} remaining`}
        </Text>
      </View>

      {/* Option cards with +/- */}
      {options.map((option) => {
        const points = allocations[option.id] || 0;
        return (
          <View
            key={option.id}
            style={[
              styles.optionRow,
              {
                backgroundColor:
                  (theme as any).custom?.card || theme.colors.surface,
                borderColor:
                  (theme as any).custom?.cardBorder || theme.colors.outline,
              },
            ]}
          >
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

            <View style={styles.controls}>
              <TouchableOpacity
                style={[
                  styles.controlButton,
                  { borderColor: theme.colors.primary },
                ]}
                onPress={() => decrement(option.id)}
                disabled={points === 0}
              >
                <Icon
                  name="remove"
                  size={18}
                  color={points === 0 ? "#94a3b8" : theme.colors.primary}
                />
              </TouchableOpacity>
              <Text
                style={[
                  styles.pointCount,
                  { color: theme.colors.onBackground },
                ]}
              >
                {points}
              </Text>
              <TouchableOpacity
                style={[
                  styles.controlButton,
                  { borderColor: theme.colors.primary },
                ]}
                onPress={() => increment(option.id)}
                disabled={remaining === 0}
              >
                <Icon
                  name="add"
                  size={18}
                  color={remaining === 0 ? "#94a3b8" : theme.colors.primary}
                />
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      {/* Submit */}
      <TouchableOpacity
        style={[
          styles.submitButton,
          {
            backgroundColor: theme.colors.primary,
            opacity: remaining === 0 && !submitting ? 1 : 0.5,
          },
        ]}
        onPress={handleSubmit}
        disabled={remaining !== 0 || submitting}
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
  remainingBar: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    marginBottom: 4,
  },
  remainingText: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
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
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 12,
  },
  controlButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  pointCount: {
    fontSize: 18,
    fontWeight: "700",
    minWidth: 24,
    textAlign: "center",
    fontFamily: "Rubik_600SemiBold",
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

export default PointAllocation;
