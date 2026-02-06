import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { TextInput as PaperInput, useTheme } from "react-native-paper";
import Icon from "react-native-vector-icons/MaterialIcons";
import { CONSTRAINT_TYPES } from "../../assets/constants/decisionTypes";
import type { ConstraintType } from "../types/decisions";

interface ConstraintInputProps {
  onSubmit: (type: ConstraintType, value: Record<string, any>) => void;
  disabled?: boolean;
}

const ConstraintInput: React.FC<ConstraintInputProps> = ({
  onSubmit,
  disabled,
}) => {
  const theme = useTheme();
  const [selectedType, setSelectedType] = useState<ConstraintType | null>(null);
  const [inputValue, setInputValue] = useState("");

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

    onSubmit(selectedType, value);
    setInputValue("");
    setSelectedType(null);
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
});

export default ConstraintInput;
