import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "react-native-paper";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import { formatCountdown, getCountdownUrgency } from "../utils/dateDisplay";

interface CountdownTimerProps {
  lockTime: string;
  onExpired?: () => void;
}

const CountdownTimer: React.FC<CountdownTimerProps> = ({
  lockTime,
  onExpired,
}) => {
  const theme = useTheme();
  const [display, setDisplay] = useState(formatCountdown(lockTime));
  const [urgency, setUrgency] = useState(getCountdownUrgency(lockTime));

  useEffect(() => {
    const update = () => {
      const newDisplay = formatCountdown(lockTime);
      const newUrgency = getCountdownUrgency(lockTime);
      setDisplay(newDisplay);
      setUrgency(newUrgency);

      if (newDisplay === "Locked" && onExpired) {
        onExpired();
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [lockTime]);

  const color =
    urgency === "critical"
      ? "#ef4444"
      : urgency === "warning"
      ? "#f59e0b"
      : theme.colors.onSurfaceVariant;

  return (
    <View style={styles.container}>
      <Icon name="schedule" size={18} color={color} />
      <Text style={[styles.text, { color }]}>
        {display === "Locked" ? "Decision Locked" : `Locks ${display}`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  text: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
});

export default CountdownTimer;
