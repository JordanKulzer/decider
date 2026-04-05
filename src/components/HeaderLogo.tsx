import React from "react";
import { Text, StyleSheet } from "react-native";

const HeaderLogo = () => (
  <Text style={styles.logoText}>Decider</Text>
);

const styles = StyleSheet.create({
  logoText: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
    letterSpacing: -0.5,
    color: "#6366f1",
  },
});

export default HeaderLogo;
