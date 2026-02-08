import React, { useMemo } from "react";
import { View, Text, StyleSheet, TextInput } from "react-native";
import { useTheme } from "react-native-paper";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import type { Constraint } from "../types/decisions";

export interface OptionMetadata {
  price?: number;
  date?: string;
  distance?: number;
  duration?: number;
}

interface ValidationViolation {
  constraint_id: string;
  reason: string;
}

interface OptionMetadataInputProps {
  constraints: Constraint[];
  metadata: OptionMetadata;
  onMetadataChange: (metadata: OptionMetadata) => void;
  violations?: ValidationViolation[];
}

const OptionMetadataInput: React.FC<OptionMetadataInputProps> = ({
  constraints,
  metadata,
  onMetadataChange,
  violations = [],
}) => {
  const theme = useTheme();

  // Determine which fields to show based on constraint types
  const requiredFields = useMemo(() => {
    const fields = new Set<string>();
    constraints.forEach((c) => {
      switch (c.type) {
        case "budget_max":
          fields.add("price");
          break;
        case "date_range":
          fields.add("date");
          break;
        case "distance":
          fields.add("distance");
          break;
        case "duration":
          fields.add("duration");
          break;
      }
    });
    return fields;
  }, [constraints]);

  // Get constraint hints for each field
  const getHint = (field: string): string => {
    for (const c of constraints) {
      switch (field) {
        case "price":
          if (c.type === "budget_max") return `Max: $${c.value.max}`;
          break;
        case "date":
          if (c.type === "date_range") {
            const start = new Date(c.value.start).toLocaleDateString();
            const end = new Date(c.value.end).toLocaleDateString();
            return `${start} - ${end}`;
          }
          break;
        case "distance":
          if (c.type === "distance") return `Max: ${c.value.max} mi`;
          break;
        case "duration":
          if (c.type === "duration") return `Max: ${c.value.max} hrs`;
          break;
      }
    }
    return "";
  };

  // Check if a field has a violation
  const hasViolation = (field: string): boolean => {
    const constraintTypes: Record<string, string> = {
      price: "budget_max",
      date: "date_range",
      distance: "distance",
      duration: "duration",
    };
    const targetType = constraintTypes[field];
    return violations.some((v) =>
      constraints.find((c) => c.id === v.constraint_id && c.type === targetType)
    );
  };

  // Get violation message for a field
  const getViolationMessage = (field: string): string | null => {
    const constraintTypes: Record<string, string> = {
      price: "budget_max",
      date: "date_range",
      distance: "distance",
      duration: "duration",
    };
    const targetType = constraintTypes[field];
    const violation = violations.find((v) =>
      constraints.find((c) => c.id === v.constraint_id && c.type === targetType)
    );
    return violation?.reason || null;
  };

  if (requiredFields.size === 0) {
    return null;
  }

  const renderField = (
    field: string,
    icon: React.ComponentProps<typeof Icon>["name"],
    label: string,
    placeholder: string,
    keyboardType: "numeric" | "default" = "numeric",
    prefix?: string,
    suffix?: string
  ) => {
    if (!requiredFields.has(field)) return null;

    const value = metadata[field as keyof OptionMetadata];
    const isViolated = hasViolation(field);
    const hint = getHint(field);
    const violationMessage = getViolationMessage(field);

    return (
      <View key={field} style={styles.fieldContainer}>
        <View style={styles.labelRow}>
          <Icon
            name={icon}
            size={16}
            color={isViolated ? theme.colors.error : theme.colors.onSurfaceVariant}
          />
          <Text
            style={[
              styles.label,
              { color: isViolated ? theme.colors.error : theme.colors.onSurfaceVariant },
            ]}
          >
            {label}
          </Text>
          {hint && !isViolated && (
            <Text style={[styles.hint, { color: theme.colors.primary }]}>
              ({hint})
            </Text>
          )}
          {value !== undefined && !isViolated && (
            <Icon name="check-circle" size={14} color="#22c55e" style={styles.validIcon} />
          )}
        </View>
        <View
          style={[
            styles.inputWrapper,
            {
              backgroundColor: theme.colors.surfaceVariant,
              borderColor: isViolated ? theme.colors.error : "transparent",
              borderWidth: isViolated ? 1 : 0,
            },
          ]}
        >
          {prefix && (
            <Text style={[styles.prefix, { color: theme.colors.onSurfaceVariant }]}>
              {prefix}
            </Text>
          )}
          <TextInput
            style={[styles.input, { color: theme.colors.onBackground }]}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            keyboardType={keyboardType}
            value={value !== undefined ? String(value) : ""}
            onChangeText={(text) => {
              const parsed = keyboardType === "numeric" ? parseFloat(text) || undefined : text;
              onMetadataChange({ ...metadata, [field]: parsed || undefined });
            }}
          />
          {suffix && (
            <Text style={[styles.suffix, { color: theme.colors.onSurfaceVariant }]}>
              {suffix}
            </Text>
          )}
        </View>
        {isViolated && violationMessage && (
          <Text style={[styles.violationText, { color: theme.colors.error }]}>
            {violationMessage}
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>
        Option Details (for constraint validation)
      </Text>
      {renderField("price", "attach-money", "Price", "0.00", "numeric", "$")}
      {renderField("distance", "place", "Distance", "0", "numeric", undefined, "mi")}
      {renderField("duration", "schedule", "Duration", "0", "numeric", undefined, "hrs")}
      {renderField("date", "date-range", "Date", "YYYY-MM-DD", "default")}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Rubik_400Regular",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  fieldContainer: {
    gap: 4,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontFamily: "Rubik_500Medium",
  },
  hint: {
    fontSize: 11,
    fontFamily: "Rubik_400Regular",
  },
  validIcon: {
    marginLeft: "auto",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  prefix: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
    marginRight: 2,
  },
  suffix: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
    marginLeft: 4,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
    paddingVertical: 10,
  },
  violationText: {
    fontSize: 11,
    fontFamily: "Rubik_400Regular",
    marginLeft: 22,
  },
});

export default OptionMetadataInput;
