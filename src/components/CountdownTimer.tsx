import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import { formatCountdown, getCountdownUrgency } from "../utils/dateDisplay";

interface CountdownTimerProps {
  closesAt: string;
  onExpired?: () => void;
  /** Reduces icon/text size and removes internal padding for use in compact status rows. */
  compact?: boolean;
}

const CountdownTimer: React.FC<CountdownTimerProps> = ({
  closesAt,
  onExpired,
  compact = false,
}) => {
  const [display, setDisplay] = useState(formatCountdown(closesAt));
  const [urgency, setUrgency] = useState(getCountdownUrgency(closesAt));

  useEffect(() => {
    const update = () => {
      const newDisplay = formatCountdown(closesAt);
      const newUrgency = getCountdownUrgency(closesAt);
      setDisplay(newDisplay);
      setUrgency(newUrgency);

      if (newDisplay === "Closed" && onExpired) {
        onExpired();
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [closesAt]);

  const color =
    urgency === "critical"
      ? "#ef4444"
      : urgency === "warning"
      ? "#f59e0b"
      : "#64748b";

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <Icon name="schedule" size={13} color={color} />
        <Text style={[styles.compactText, { color }]}>
          {display === "Closed" ? "Closed" : `Closes ${display}`}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Icon name="schedule" size={18} color={color} />
      <Text style={[styles.text, { color }]}>
        {display === "Closed" ? "Decision Closed" : `Closes ${display}`}
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
  compactContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  compactText: {
    fontSize: 12,
    fontWeight: "500",
    fontFamily: "Rubik_500Medium",
  },
});

export default CountdownTimer;
