import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { TextInput as PaperInput, useTheme } from "react-native-paper";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import { CONSTRAINT_TYPES } from "../../assets/constants/decisionTypes";
import type { ConstraintType } from "../types/decisions";
import ProBadge from "./ProBadge";
import { useSubscription } from "../context/SubscriptionContext";

interface ConstraintInputProps {
  onSubmit: (type: ConstraintType, value: Record<string, any>, weight?: number) => void;
  disabled?: boolean;
  showWeighting?: boolean;
}

const ConstraintInput: React.FC<ConstraintInputProps> = ({
  onSubmit,
  disabled,
  showWeighting = false,
}) => {
  const theme = useTheme();
  const { tier } = useSubscription();
  const [selectedType, setSelectedType] = useState<ConstraintType | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [weight, setWeight] = useState(1);

  const isPro = tier === "pro";
  const canUseWeighting = showWeighting && isPro;

  const handleSubmit = () => {
    if (!selectedType || !inputValue.trim()) return;

    let value: Record<string, any>;
    switch (selectedType) {
      case "budget_max":
        value = { max: parseFloat(inputValue) || 0, currency: "USD" };
        break;
      case "distance":
        value = { max: parseFloat(inputValue) || 0 };
        break;
      case "duration":
        value = { max: parseFloat(inputValue) || 0 };
        break;
      case "exclusion":
        value = { text: inputValue.trim() };
        break;
      case "date_range":
        value = { text: inputValue.trim() };
        break;
      default:
        value = { text: inputValue.trim() };
    }

    onSubmit(selectedType, value, canUseWeighting ? weight : undefined);
    setInputValue("");
    setSelectedType(null);
    setWeight(1);
  };

  return (
    <View style={styles.container}>
      <Text
        style={[styles.label, { color: theme.colors.onSurfaceVariant }]}
      >
        Add a constraint
      </Text>

      {/* Type selector */}
      <View style={styles.typeRow}>
        {CONSTRAINT_TYPES.map((ct) => {
          const selected = selectedType === ct.key;
          return (
            <TouchableOpacity
              key={ct.key}
              style={[
                styles.typeChip,
                {
                  backgroundColor: selected
                    ? theme.colors.primary
                    : (theme as any).custom?.card || theme.colors.surface,
                  borderColor: selected
                    ? theme.colors.primary
                    : (theme as any).custom?.cardBorder || theme.colors.outline,
                },
              ]}
              onPress={() =>
                setSelectedType(selected ? null : (ct.key as ConstraintType))
              }
              disabled={disabled}
            >
              <Icon
                name={ct.icon}
                size={14}
                color={selected ? "#fff" : theme.colors.onSurfaceVariant}
              />
              <Text
                style={{
                  color: selected ? "#fff" : theme.colors.onSurfaceVariant,
                  fontSize: 11,
                  fontWeight: "500",
                  fontFamily: "Rubik_500Medium",
                }}
              >
                {ct.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Value input (shown when type is selected) */}
      {selectedType && (
        <>
          <View style={styles.inputRow}>
            <PaperInput
              label={
                CONSTRAINT_TYPES.find((c) => c.key === selectedType)
                  ?.placeholder || "Value"
              }
              mode="outlined"
              value={inputValue}
              onChangeText={setInputValue}
              keyboardType={
                selectedType === "budget_max" ||
                selectedType === "distance" ||
                selectedType === "duration"
                  ? "numeric"
                  : "default"
              }
              style={styles.input}
              theme={{ colors: { primary: "#2563eb" } }}
              dense
            />
            <TouchableOpacity
              style={[
                styles.addButton,
                { backgroundColor: theme.colors.primary },
              ]}
              onPress={handleSubmit}
              disabled={!inputValue.trim()}
            >
              <Icon name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Weight selector (Pro feature) */}
          {showWeighting && (
            <View style={styles.weightSection}>
              <View style={styles.weightLabelRow}>
                <Text style={[styles.weightLabel, { color: theme.colors.onSurfaceVariant }]}>
                  Importance
                </Text>
                <ProBadge />
              </View>
              <View style={styles.weightRow}>
                {[1, 2, 3, 4, 5].map((w) => (
                  <TouchableOpacity
                    key={w}
                    style={[
                      styles.weightButton,
                      {
                        backgroundColor: weight === w
                          ? theme.colors.primary
                          : (theme as any).custom?.card || theme.colors.surface,
                        borderColor: weight === w
                          ? theme.colors.primary
                          : (theme as any).custom?.cardBorder || theme.colors.outline,
                        opacity: isPro ? 1 : 0.5,
                      },
                    ]}
                    onPress={() => isPro && setWeight(w)}
                    disabled={!isPro}
                  >
                    <Text
                      style={{
                        color: weight === w ? "#fff" : theme.colors.onSurfaceVariant,
                        fontSize: 13,
                        fontWeight: "600",
                        fontFamily: "Rubik_500Medium",
                      }}
                    >
                      {w}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!isPro && (
                <Text style={[styles.proHint, { color: theme.colors.onSurfaceVariant }]}>
                  Upgrade to Pro to weight constraints
                </Text>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 8,
    fontFamily: "Rubik_500Medium",
  },
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "transparent",
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  weightSection: {
    marginTop: 12,
  },
  weightLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  weightLabel: {
    fontSize: 12,
    fontWeight: "500",
    fontFamily: "Rubik_500Medium",
  },
  weightRow: {
    flexDirection: "row",
    gap: 8,
  },
  weightButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  proHint: {
    fontSize: 11,
    marginTop: 6,
    fontStyle: "italic",
    fontFamily: "Rubik_400Regular",
  },
});

export default ConstraintInput;
