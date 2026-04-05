import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from "react-native";
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
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Icon name="workspace-premium" size={32} color="#fff" />
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <Text style={styles.title}>Upgrade to Pro</Text>

          {feature && (
            <Text style={styles.feature}>{feature}</Text>
          )}

          {reason && (
            <Text style={styles.reason}>{reason}</Text>
          )}

          {/* Benefits */}
          <View style={styles.benefits}>
            {[
              "Unlimited active decisions",
              "Unlimited participants",
              "Silent voting mode",
              "Constraint weighting",
              "Full decision history",
            ].map((text) => (
              <View key={text} style={styles.benefit}>
                <Icon name="check-circle" size={20} color="#22c55e" />
                <Text style={styles.benefitText}>{text}</Text>
              </View>
            ))}
          </View>

          {/* Price */}
          <View style={styles.priceContainer}>
            <Text style={styles.price}>$4.99</Text>
            <Text style={styles.priceUnit}>/month</Text>
          </View>

          {/* Buttons */}
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={onUpgrade}
            activeOpacity={0.8}
          >
            <Icon name="workspace-premium" size={20} color="#fff" />
            <Text style={styles.upgradeButtonText}>Upgrade to Pro</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={styles.laterButton}>
            <Text style={styles.laterButtonText}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
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
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
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
    backgroundColor: "#7c3aed",
  },
  closeButton: {
    position: "absolute",
    right: 0,
    top: 0,
    padding: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
    color: "#f1f5f9",
    marginBottom: 8,
  },
  feature: {
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
    color: "#818cf8",
    marginBottom: 4,
  },
  reason: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
    textAlign: "center",
    marginBottom: 20,
    color: "#94a3b8",
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
    color: "#cbd5e1",
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 20,
  },
  price: {
    fontSize: 34,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
    color: "#f1f5f9",
  },
  priceUnit: {
    fontSize: 15,
    fontFamily: "Rubik_400Regular",
    marginLeft: 4,
    color: "#64748b",
  },
  upgradeButton: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
    backgroundColor: "#7c3aed",
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
    color: "#64748b",
  },
});

export default UpgradePrompt;
