import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useTheme } from "react-native-paper";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import type { Constraint } from "../types/decisions";

interface ConstraintsSummaryProps {
  constraints: Constraint[];
  defaultExpanded?: boolean;
}

const ConstraintsSummary: React.FC<ConstraintsSummaryProps> = ({
  constraints,
  defaultExpanded = false,
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (constraints.length === 0) {
    return null;
  }

  const formatConstraintValue = (c: Constraint) => {
    switch (c.type) {
      case "budget_max":
        return `$${c.value.max} max`;
      case "distance":
        return `${c.value.max} mi max`;
      case "duration":
        return `${c.value.max} hrs max`;
      case "date_range":
      case "exclusion":
        return c.value.text;
      default:
        return JSON.stringify(c.value);
    }
  };

  const getConstraintIcon = (type: string): React.ComponentProps<typeof Icon>["name"] => {
    switch (type) {
      case "budget_max":
        return "attach-money";
      case "date_range":
        return "date-range";
      case "distance":
        return "place";
      case "duration":
        return "schedule";
      case "exclusion":
        return "block";
      default:
        return "info";
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: (theme as any).custom?.card || theme.colors.surface,
          borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Icon
            name="filter-list"
            size={18}
            color={theme.colors.onSurfaceVariant}
          />
          <Text
            style={[styles.headerText, { color: theme.colors.onSurfaceVariant }]}
          >
            {constraints.length} Constraint{constraints.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <Icon
          name={expanded ? "expand-less" : "expand-more"}
          size={20}
          color={theme.colors.onSurfaceVariant}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.constraintsList}>
          {constraints.map((c) => (
            <View key={c.id} style={styles.constraintRow}>
              <Icon
                name={getConstraintIcon(c.type)}
                size={14}
                color={theme.colors.onSurfaceVariant}
              />
              <Text
                style={[styles.constraintLabel, { color: theme.colors.onSurfaceVariant }]}
              >
                {c.type.replace("_", " ")}:
              </Text>
              <Text
                style={[styles.constraintValue, { color: theme.colors.onBackground }]}
              >
                {formatConstraintValue(c)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  constraintsList: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 6,
  },
  constraintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  constraintLabel: {
    fontSize: 12,
    fontFamily: "Rubik_400Regular",
    textTransform: "capitalize",
  },
  constraintValue: {
    fontSize: 12,
    fontWeight: "500",
    fontFamily: "Rubik_500Medium",
    flex: 1,
  },
});

export default ConstraintsSummary;
