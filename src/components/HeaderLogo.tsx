import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "react-native-paper";

const HeaderLogo = () => {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.logoText, { color: theme.colors.primary }]}>
        Decider
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    height: 44,
  },
  logoText: {
    fontSize: 22,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
    letterSpacing: -0.5,
  },
});

export default HeaderLogo;
