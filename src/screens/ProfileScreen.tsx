import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useTheme } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { MaterialIcons as Icon, MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { isDemoMode, DEMO_USER, DEMO_USER_ID } from "../lib/demoMode";
import { useSubscription } from "../context/SubscriptionContext";
import { mockFetchFriends, mockFetchFriendRequests } from "../lib/mockData";

const ProfileScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { isProUser } = useSubscription();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [friendCount, setFriendCount] = useState(0);
  const [requestCount, setRequestCount] = useState(0);

  const gradientColors = useMemo(() => {
    return theme.dark
      ? (["#121212", "#1d1d1d", "#2b2b2d"] as const)
      : (["#fdfcf9", "#e0e7ff"] as const);
  }, [theme.dark]);

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        setLoading(true);

        if (isDemoMode()) {
          setUser(DEMO_USER);
          setProfile({
            username: "demo_user",
            email: "demo@decider.app",
            created_at: new Date().toISOString(),
          });

          // Load friend counts
          const [friends, requests] = await Promise.all([
            mockFetchFriends(DEMO_USER_ID),
            mockFetchFriendRequests(DEMO_USER_ID),
          ]);
          setFriendCount(friends.length);
          setRequestCount(requests.length);
          setLoading(false);
          return;
        }

        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) return;
        setUser(authUser);

        const { data } = await supabase
          .from("users")
          .select("username, email, created_at")
          .eq("id", authUser.id)
          .single();

        setProfile(data);

        // TODO: Load real friend counts from Supabase
        setFriendCount(0);
        setRequestCount(0);

        setLoading(false);
      };
      load();
    }, [])
  );

  if (loading) {
    return (
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </LinearGradient>
    );
  }

  const initial = profile?.username
    ? profile.username.charAt(0).toUpperCase()
    : "?";

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <View style={styles.container}>
        {/* Profile Header */}
        <View style={styles.header}>
          <View
            style={[
              styles.avatar,
              { backgroundColor: isProUser ? "#f59e0b" : theme.colors.primary },
            ]}
          >
            <Text style={styles.avatarText}>{initial}</Text>
            {isProUser && (
              <View style={styles.proBadge}>
                <MaterialCommunityIcons name="crown" size={12} color="#f59e0b" />
              </View>
            )}
          </View>

          <Text style={[styles.username, { color: theme.colors.onBackground }]}>
            {profile?.username || "Unknown"}
          </Text>
          <Text style={[styles.email, { color: theme.colors.onSurfaceVariant }]}>
            {profile?.email || user?.email}
          </Text>

          {isProUser && (
            <View style={styles.proTag}>
              <MaterialCommunityIcons name="crown" size={14} color="#f59e0b" />
              <Text style={styles.proTagText}>PRO</Text>
            </View>
          )}
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          {/* Friends */}
          <TouchableOpacity
            style={[
              styles.menuCard,
              {
                backgroundColor: (theme as any).custom?.card || theme.colors.surface,
                borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
              },
            ]}
            onPress={() => navigation.navigate("FriendsScreen")}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, { backgroundColor: `${theme.colors.primary}15` }]}>
              <Icon name="people" size={24} color={theme.colors.primary} />
            </View>
            <View style={styles.menuContent}>
              <Text style={[styles.menuTitle, { color: theme.colors.onBackground }]}>
                Friends
              </Text>
              <Text style={[styles.menuSubtitle, { color: theme.colors.onSurfaceVariant }]}>
                {friendCount} {friendCount === 1 ? "friend" : "friends"}
                {requestCount > 0 && ` · ${requestCount} pending`}
              </Text>
            </View>
            {requestCount > 0 && (
              <View style={[styles.badge, { backgroundColor: theme.colors.error }]}>
                <Text style={styles.badgeText}>{requestCount}</Text>
              </View>
            )}
            <Icon name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>

          {/* Settings */}
          <TouchableOpacity
            style={[
              styles.menuCard,
              {
                backgroundColor: (theme as any).custom?.card || theme.colors.surface,
                borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
              },
            ]}
            onPress={() => navigation.navigate("SettingsScreen")}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, { backgroundColor: "rgba(128, 128, 128, 0.1)" }]}>
              <Icon name="settings" size={24} color={theme.colors.onSurfaceVariant} />
            </View>
            <View style={styles.menuContent}>
              <Text style={[styles.menuTitle, { color: theme.colors.onBackground }]}>
                Settings
              </Text>
              <Text style={[styles.menuSubtitle, { color: theme.colors.onSurfaceVariant }]}>
                Account, preferences, and more
              </Text>
            </View>
            <Icon name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    alignItems: "center",
    paddingVertical: 32,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatarText: {
    color: "#fff",
    fontSize: 40,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  proBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#fff",
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  username: {
    fontSize: 24,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
    marginBottom: 12,
  },
  proTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  proTagText: {
    color: "#f59e0b",
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  menuSection: {
    gap: 12,
    marginTop: 8,
  },
  menuCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
  },
  menuIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Rubik_600SemiBold",
    marginBottom: 2,
  },
  menuSubtitle: {
    fontSize: 13,
    fontFamily: "Rubik_400Regular",
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
});

export default ProfileScreen;
