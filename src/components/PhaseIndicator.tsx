import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "react-native-paper";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import { DECISION_PHASES, PHASE_LABELS } from "../../assets/constants/decisionTypes";
import type { DecisionStatus } from "../types/decisions";

interface PhaseIndicatorProps {
  currentPhase: DecisionStatus;
}

const PhaseIndicator: React.FC<PhaseIndicatorProps> = ({ currentPhase }) => {
  const theme = useTheme();
  const customTheme = theme as any;

  const phaseIndex = DECISION_PHASES.indexOf(currentPhase);

  return (
    <View style={styles.container}>
      {DECISION_PHASES.map((phase, index) => {
        const isComplete = index < phaseIndex;
        const isActive = index === phaseIndex;
        const color = isComplete
          ? customTheme.custom?.phaseComplete || "#22c55e"
          : isActive
          ? customTheme.custom?.phaseActive || theme.colors.primary
          : customTheme.custom?.phasePending || "#94a3b8";

        return (
          <React.Fragment key={phase}>
            {index > 0 && (
              <View
                style={[
                  styles.line,
                  {
                    backgroundColor: isComplete
                      ? customTheme.custom?.phaseComplete || "#22c55e"
                      : customTheme.custom?.phasePending || "#94a3b8",
                  },
                ]}
              />
            )}
            <View style={styles.step}>
              <View
                style={[
                  styles.circle,
                  {
                    backgroundColor: isComplete || isActive ? color : "transparent",
                    borderColor: color,
                  },
                ]}
              >
                {isComplete ? (
                  <Icon name="check" size={14} color="#fff" />
                ) : (
                  <Text
                    style={[
                      styles.circleText,
                      {
                        color: isActive ? "#fff" : color,
                      },
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.label,
                  {
                    color: isActive
                      ? theme.colors.onBackground
                      : theme.colors.onSurfaceVariant,
                    fontWeight: isActive ? "600" : "400",
                  },
                ]}
              >
                {PHASE_LABELS[phase]}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  step: {
    alignItems: "center",
    gap: 4,
  },
  circle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  circleText: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  label: {
    fontSize: 10,
    fontFamily: "Rubik_400Regular",
  },
  line: {
    flex: 1,
    height: 2,
    marginHorizontal: 4,
    marginBottom: 18,
  },
});

export default PhaseIndicator;
