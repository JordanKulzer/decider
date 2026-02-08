import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { useTheme } from "react-native-paper";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import type { DecisionOption } from "../types/decisions";

interface OptionCardProps {
  option: DecisionOption;
  onDelete?: () => void;
  showDelete?: boolean;
}

const OptionCard: React.FC<OptionCardProps> = ({
  option,
  onDelete,
  showDelete,
}) => {
  const theme = useTheme();

  const borderLeftColor = (theme as any).custom?.cardBorder || theme.colors.outline;

  const handleDelete = () => {
    Alert.alert(
      "Delete Option",
      `Are you sure you want to delete "${option.title}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: onDelete,
        },
      ]
    );
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: (theme as any).custom?.card || theme.colors.surface,
          borderColor:
            (theme as any).custom?.cardBorder || theme.colors.outline,
          borderLeftColor,
        },
      ]}
    >
      <View style={styles.header}>
        <Text
          style={[styles.title, { color: theme.colors.onBackground }]}
          numberOfLines={1}
        >
          {option.title}
        </Text>
        {showDelete && onDelete && (
          <TouchableOpacity onPress={handleDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="close" size={18} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
        )}
      </View>

      {option.description ? (
        <Text
          style={[
            styles.description,
            { color: theme.colors.onSurfaceVariant },
          ]}
          numberOfLines={2}
        >
          {option.description}
        </Text>
      ) : null}

    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 12,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
    fontFamily: "Rubik_500Medium",
  },
  description: {
    fontSize: 13,
    marginTop: 4,
    fontFamily: "Rubik_400Regular",
  },
});

export default OptionCard;
