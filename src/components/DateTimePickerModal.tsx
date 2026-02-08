import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
} from "react-native";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useTheme } from "react-native-paper";
import { MaterialIcons as Icon } from "@expo/vector-icons";

interface DateTimePickerModalProps {
  visible: boolean;
  value: Date;
  minimumDate?: Date;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
}

const DateTimePickerModal: React.FC<DateTimePickerModalProps> = ({
  visible,
  value,
  minimumDate,
  onConfirm,
  onCancel,
}) => {
  const theme = useTheme();
  const [tempDate, setTempDate] = useState(value);
  const [mode, setMode] = useState<"date" | "time">("date");

  // Reset temp date when modal opens
  useEffect(() => {
    if (visible) {
      setTempDate(value);
      setMode("date");
    }
  }, [visible, value]);

  const handleDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (date) {
      const updated = new Date(tempDate);
      if (mode === "date") {
        updated.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      } else {
        updated.setHours(date.getHours(), date.getMinutes());
      }
      setTempDate(updated);
    }
  };

  const handleConfirm = () => {
    if (mode === "date") {
      // Move to time selection
      setMode("time");
    } else {
      // Final confirm
      onConfirm(tempDate);
    }
  };

  const handleBack = () => {
    if (mode === "time") {
      setMode("date");
    } else {
      onCancel();
    }
  };

  const formatDisplayDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDisplayTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.container,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.onBackground }]}>
              {mode === "date" ? "Select Date" : "Select Time"}
            </Text>
            <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
              <Icon name="close" size={24} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          {/* Current selection display */}
          <View
            style={[
              styles.selectionDisplay,
              { backgroundColor: `${theme.colors.primary}15` },
            ]}
          >
            <View style={styles.selectionRow}>
              <TouchableOpacity
                style={[
                  styles.selectionItem,
                  mode === "date" && styles.selectionItemActive,
                  mode === "date" && { borderColor: theme.colors.primary },
                ]}
                onPress={() => setMode("date")}
              >
                <Icon
                  name="event"
                  size={20}
                  color={mode === "date" ? theme.colors.primary : theme.colors.onSurfaceVariant}
                />
                <Text
                  style={[
                    styles.selectionText,
                    { color: mode === "date" ? theme.colors.primary : theme.colors.onBackground },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {formatDisplayDate(tempDate)}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.selectionItem,
                  mode === "time" && styles.selectionItemActive,
                  mode === "time" && { borderColor: theme.colors.primary },
                ]}
                onPress={() => setMode("time")}
              >
                <Icon
                  name="schedule"
                  size={20}
                  color={mode === "time" ? theme.colors.primary : theme.colors.onSurfaceVariant}
                />
                <Text
                  style={[
                    styles.selectionText,
                    { color: mode === "time" ? theme.colors.primary : theme.colors.onBackground },
                  ]}
                >
                  {formatDisplayTime(tempDate)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Picker */}
          <View
            style={[
              styles.pickerContainer,
              {
                backgroundColor: theme.dark ? "#1a1a1a" : "#f5f5f5",
              },
            ]}
          >
            <DateTimePicker
              value={tempDate}
              mode={mode}
              display="spinner"
              minimumDate={mode === "date" ? minimumDate : undefined}
              onChange={handleDateChange}
              textColor={theme.colors.onBackground}
              themeVariant={theme.dark ? "dark" : "light"}
              style={styles.picker}
            />
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={handleBack}
            >
              <Text style={[styles.actionButtonText, { color: theme.colors.onSurfaceVariant }]}>
                {mode === "time" ? "Back" : "Cancel"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.confirmButton,
                { backgroundColor: theme.colors.primary },
              ]}
              onPress={handleConfirm}
            >
              <Text style={[styles.actionButtonText, { color: "#fff" }]}>
                {mode === "date" ? "Next" : "Confirm"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  container: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  closeButton: {
    padding: 4,
  },
  selectionDisplay: {
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  selectionRow: {
    flexDirection: "row",
    gap: 8,
  },
  selectionItem: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectionItemActive: {
    borderWidth: 2,
  },
  selectionText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
    textAlign: "center",
  },
  pickerContainer: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
  },
  picker: {
    height: 180,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelButton: {},
  confirmButton: {},
  actionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
});

export default DateTimePickerModal;
