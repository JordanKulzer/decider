import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Pressable, Text, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import HomeScreen from "../screens/HomeScreen";
import { useSubscription } from "../context/SubscriptionContext";
import { useNotifications } from "../context/NotificationContext";

const Stack = createNativeStackNavigator();

const ProfileHeaderButton = ({
  navigation,
}: {
  navigation: any;
}) => {
  const { isProUser, profile } = useSubscription();
  const { friendRequestCount } = useNotifications();

  const initial = profile?.username?.charAt(0)?.toUpperCase() || "?";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.profileButton,
        pressed && { opacity: 0.7 },
      ]}
      hitSlop={8}
      onPress={() => navigation.navigate("ProfileScreen")}
    >
      <View
        style={[
          styles.profileAvatar,
          isProUser && styles.profileAvatarPro,
          { backgroundColor: isProUser ? "#f59e0b" : "#4338ca" },
        ]}
      >
        <Text style={styles.profileAvatarText}>{initial}</Text>
      </View>

      {/* ── Social badge: pending friend requests ── */}
      {friendRequestCount > 0 && (
        <View style={styles.socialBadge}>
          <Text style={styles.socialBadgeText}>
            {friendRequestCount > 9 ? "9+" : String(friendRequestCount)}
          </Text>
        </View>
      )}

      {isProUser && (
        <View style={styles.proCrown}>
          <MaterialCommunityIcons name="crown" size={10} color="#f59e0b" />
        </View>
      )}
    </Pressable>
  );
};

const AppDrawer = (_props: {
  userId: string;
  onLogout: () => void;
  isDarkTheme: boolean;
  toggleTheme: () => void;
}) => {
  return (
    <Stack.Navigator
      screenOptions={({ navigation }) => ({
        headerTitle: () => (
          <Text style={styles.headerTitle}>Decider</Text>
        ),
        headerTitleAlign: "center",
        headerStyle: {
          backgroundColor: "#1e293b",
        },
        headerShadowVisible: false,
        headerLeft: () => null,
        headerRight: () => <ProfileHeaderButton navigation={navigation} />,
      })}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
    color: "#6366f1",
    letterSpacing: -0.5,
  },
  profileButton: {
    paddingRight: 16,
    position: "relative",
  },
  profileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(99,102,241,0.45)",
  },
  profileAvatarPro: {
    borderColor: "rgba(245,158,11,0.5)",
  },
  profileAvatarText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
    letterSpacing: 0.2,
  },
  // ── Social badge (friend requests) ──
  socialBadge: {
    position: "absolute",
    top: -3,
    right: 12,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#1e293b",
  },
  socialBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 12,
  },
  proCrown: {
    position: "absolute",
    top: -4,
    right: 13,
    backgroundColor: "#1e293b",
    borderRadius: 8,
    padding: 2,
  },
});

export default AppDrawer;
