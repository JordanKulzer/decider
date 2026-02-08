import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "react-native-paper";
import { MaterialIcons as Icon } from "@expo/vector-icons";

interface ProBadgeProps {
  size?: "small" | "medium";
}

const ProBadge: React.FC<ProBadgeProps> = ({ size = "small" }) => {
  const theme = useTheme();
  const isSmall = size === "small";

  return (
    <View
      style={[
        styles.badge,
        isSmall ? styles.badgeSmall : styles.badgeMedium,
        { backgroundColor: "#8b5cf6" },
      ]}
    >
      <Icon
        name="workspace-premium"
        size={isSmall ? 10 : 14}
        color="#fff"
      />
      <Text style={[styles.text, isSmall ? styles.textSmall : styles.textMedium]}>
        PRO
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 4,
    gap: 2,
  },
  badgeSmall: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  badgeMedium: {
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  text: {
    color: "#fff",
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  textSmall: {
    fontSize: 9,
  },
  textMedium: {
    fontSize: 11,
  },
});

export default ProBadge;
