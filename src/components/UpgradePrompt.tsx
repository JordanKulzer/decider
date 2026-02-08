import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from "react-native";
import { useTheme } from "react-native-paper";
import { MaterialIcons as Icon } from "@expo/vector-icons";

interface UpgradePromptProps {
  visible: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  feature?: string;
  reason?: string;
}

const UpgradePrompt: React.FC<UpgradePromptProps> = ({
  visible,
  onClose,
  onUpgrade,
  feature,
  reason,
}) => {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.container,
            { backgroundColor: theme.colors.background },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: "#8b5cf6" }]}>
              <Icon name="workspace-premium" size={32} color="#fff" />
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="close" size={24} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <Text style={[styles.title, { color: theme.colors.onBackground }]}>
            Upgrade to Pro
          </Text>

          {feature && (
            <Text style={[styles.feature, { color: theme.colors.primary }]}>
              {feature}
            </Text>
          )}

          {reason && (
            <Text style={[styles.reason, { color: theme.colors.onSurfaceVariant }]}>
              {reason}
            </Text>
          )}

          {/* Benefits */}
          <View style={styles.benefits}>
            <View style={styles.benefit}>
              <Icon name="check-circle" size={20} color="#22c55e" />
              <Text style={[styles.benefitText, { color: theme.colors.onBackground }]}>
                Unlimited active decisions
              </Text>
            </View>
            <View style={styles.benefit}>
              <Icon name="check-circle" size={20} color="#22c55e" />
              <Text style={[styles.benefitText, { color: theme.colors.onBackground }]}>
                Unlimited participants
              </Text>
            </View>
            <View style={styles.benefit}>
              <Icon name="check-circle" size={20} color="#22c55e" />
              <Text style={[styles.benefitText, { color: theme.colors.onBackground }]}>
                Silent voting mode
              </Text>
            </View>
            <View style={styles.benefit}>
              <Icon name="check-circle" size={20} color="#22c55e" />
              <Text style={[styles.benefitText, { color: theme.colors.onBackground }]}>
                Constraint weighting
              </Text>
            </View>
            <View style={styles.benefit}>
              <Icon name="check-circle" size={20} color="#22c55e" />
              <Text style={[styles.benefitText, { color: theme.colors.onBackground }]}>
                Full decision history
              </Text>
            </View>
          </View>

          {/* Price */}
          <View style={styles.priceContainer}>
            <Text style={[styles.price, { color: theme.colors.onBackground }]}>
              $4.99
            </Text>
            <Text style={[styles.priceUnit, { color: theme.colors.onSurfaceVariant }]}>
              /month
            </Text>
          </View>

          {/* Buttons */}
          <TouchableOpacity
            style={[styles.upgradeButton, { backgroundColor: "#8b5cf6" }]}
            onPress={onUpgrade}
            activeOpacity={0.8}
          >
            <Icon name="workspace-premium" size={20} color="#fff" />
            <Text style={styles.upgradeButtonText}>Upgrade to Pro</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={styles.laterButton}>
            <Text style={[styles.laterButtonText, { color: theme.colors.onSurfaceVariant }]}>
              Maybe later
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  container: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  header: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 16,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButton: {
    position: "absolute",
    right: 0,
    top: 0,
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
    marginBottom: 8,
  },
  feature: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
    marginBottom: 4,
  },
  reason: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
    textAlign: "center",
    marginBottom: 20,
  },
  benefits: {
    width: "100%",
    gap: 10,
    marginBottom: 20,
  },
  benefit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  benefitText: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 20,
  },
  price: {
    fontSize: 36,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  priceUnit: {
    fontSize: 16,
    fontFamily: "Rubik_400Regular",
    marginLeft: 4,
  },
  upgradeButton: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  upgradeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  laterButton: {
    paddingVertical: 12,
    marginTop: 8,
  },
  laterButtonText: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
  },
});

export default UpgradePrompt;
