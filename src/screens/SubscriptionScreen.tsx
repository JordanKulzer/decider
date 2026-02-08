import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { useTheme } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { useSubscription } from "../context/SubscriptionContext";
import ProBadge from "../components/ProBadge";

const PRO_FEATURES = [
  {
    icon: "all-inclusive",
    title: "Unlimited Decisions",
    description: "Create as many active decisions as you need",
  },
  {
    icon: "groups",
    title: "Unlimited Participants",
    description: "Invite any number of people to your decisions",
  },
  {
    icon: "history",
    title: "Unlimited History",
    description: "Access your complete decision history forever",
  },
  {
    icon: "visibility-off",
    title: "Silent Voting",
    description: "Hide vote counts until decisions are finalized",
  },
  {
    icon: "tune",
    title: "Constraint Weighting",
    description: "Assign importance levels to different constraints",
  },
];

const SubscriptionScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { tier, subscriptionStatus, loading, refreshSubscription } = useSubscription();

  const gradientColors = useMemo(() => {
    return theme.dark
      ? (["#121212", "#1d1d1d", "#2b2b2d"] as const)
      : (["#fdfcf9", "#e0e7ff"] as const);
  }, [theme.dark]);

  const isPro = tier === "pro";

  const handleUpgrade = () => {
    // Stubbed for now - would integrate with payment provider
    Toast.show({
      type: "info",
      text1: "Coming Soon",
      text2: "Payment integration will be available soon!",
      position: "bottom",
    });
  };

  const handleManageSubscription = () => {
    // Stubbed for now - would open subscription management
    Toast.show({
      type: "info",
      text1: "Manage Subscription",
      text2: "Subscription management coming soon!",
      position: "bottom",
    });
  };

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: theme.colors.onBackground }]}>
              {isPro ? "You're on Pro" : "Upgrade to Pro"}
            </Text>
            {isPro && <ProBadge size="large" />}
          </View>
          <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
            {isPro
              ? "Thank you for supporting Decider!"
              : "Unlock all features and remove limits"}
          </Text>
        </View>

        {/* Price Card */}
        {!isPro && (
          <View
            style={[
              styles.priceCard,
              {
                backgroundColor: theme.colors.primary,
              },
            ]}
          >
            <Text style={styles.priceLabel}>Pro Plan</Text>
            <View style={styles.priceRow}>
              <Text style={styles.price}>$4.99</Text>
              <Text style={styles.pricePeriod}>/month</Text>
            </View>
            <Text style={styles.priceHint}>Cancel anytime</Text>
          </View>
        )}

        {/* Current Plan Status (for Pro users) */}
        {isPro && (
          <View
            style={[
              styles.statusCard,
              {
                backgroundColor: (theme as any).custom?.card || theme.colors.surface,
                borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
              },
            ]}
          >
            <View style={styles.statusRow}>
              <Text style={[styles.statusLabel, { color: theme.colors.onSurfaceVariant }]}>
                Status
              </Text>
              <Text style={[styles.statusValue, { color: theme.colors.primary }]}>
                {subscriptionStatus === "active" ? "Active" : subscriptionStatus}
              </Text>
            </View>
          </View>
        )}

        {/* Features List */}
        <Text style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>
          {isPro ? "Your Pro Features" : "What's Included"}
        </Text>

        <View
          style={[
            styles.featuresCard,
            {
              backgroundColor: (theme as any).custom?.card || theme.colors.surface,
              borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
            },
          ]}
        >
          {PRO_FEATURES.map((feature, index) => (
            <View
              key={feature.title}
              style={[
                styles.featureRow,
                index < PRO_FEATURES.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: (theme as any).custom?.cardBorder || theme.colors.outline,
                },
              ]}
            >
              <View
                style={[
                  styles.featureIcon,
                  { backgroundColor: `${theme.colors.primary}20` },
                ]}
              >
                <Icon name={feature.icon as any} size={20} color={theme.colors.primary} />
              </View>
              <View style={styles.featureContent}>
                <Text style={[styles.featureTitle, { color: theme.colors.onBackground }]}>
                  {feature.title}
                </Text>
                <Text style={[styles.featureDesc, { color: theme.colors.onSurfaceVariant }]}>
                  {feature.description}
                </Text>
              </View>
              <Icon
                name={isPro ? "check-circle" : "lock"}
                size={20}
                color={isPro ? "#22c55e" : theme.colors.onSurfaceVariant}
              />
            </View>
          ))}
        </View>

        {/* Free Tier Comparison (for non-Pro) */}
        {!isPro && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>
              Free Tier Limits
            </Text>
            <View
              style={[
                styles.limitsCard,
                {
                  backgroundColor: (theme as any).custom?.card || theme.colors.surface,
                  borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
                },
              ]}
            >
              <View style={styles.limitRow}>
                <Text style={[styles.limitLabel, { color: theme.colors.onSurfaceVariant }]}>
                  Active decisions
                </Text>
                <Text style={[styles.limitValue, { color: theme.colors.onBackground }]}>
                  2
                </Text>
              </View>
              <View style={styles.limitRow}>
                <Text style={[styles.limitLabel, { color: theme.colors.onSurfaceVariant }]}>
                  Participants per decision
                </Text>
                <Text style={[styles.limitValue, { color: theme.colors.onBackground }]}>
                  5
                </Text>
              </View>
              <View style={styles.limitRow}>
                <Text style={[styles.limitLabel, { color: theme.colors.onSurfaceVariant }]}>
                  Decision history
                </Text>
                <Text style={[styles.limitValue, { color: theme.colors.onBackground }]}>
                  7 days
                </Text>
              </View>
            </View>
          </>
        )}

        {/* Action Button */}
        <TouchableOpacity
          style={[
            styles.actionButton,
            {
              backgroundColor: isPro ? (theme as any).custom?.card || theme.colors.surface : theme.colors.primary,
              borderWidth: isPro ? 1 : 0,
              borderColor: theme.colors.primary,
            },
          ]}
          onPress={isPro ? handleManageSubscription : handleUpgrade}
        >
          <Text
            style={[
              styles.actionButtonText,
              { color: isPro ? theme.colors.primary : "#fff" },
            ]}
          >
            {isPro ? "Manage Subscription" : "Upgrade to Pro"}
          </Text>
        </TouchableOpacity>

        {!isPro && (
          <Text style={[styles.disclaimer, { color: theme.colors.onSurfaceVariant }]}>
            Subscription renews automatically. Cancel anytime in your app store settings.
          </Text>
        )}
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Rubik_400Regular",
  },
  priceCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
  },
  priceLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  price: {
    color: "#fff",
    fontSize: 48,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  pricePeriod: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 18,
    fontFamily: "Rubik_400Regular",
    marginLeft: 4,
  },
  priceHint: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    marginTop: 8,
    fontFamily: "Rubik_400Regular",
  },
  statusCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusLabel: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
  },
  statusValue: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
    textTransform: "capitalize",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
    fontFamily: "Rubik_500Medium",
  },
  featuresCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
    overflow: "hidden",
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13,
    fontFamily: "Rubik_400Regular",
  },
  limitsCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  limitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  limitLabel: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
  },
  limitValue: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  actionButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  actionButtonText: {
    fontSize: 17,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  disclaimer: {
    fontSize: 12,
    textAlign: "center",
    fontFamily: "Rubik_400Regular",
  },
});

export default SubscriptionScreen;
