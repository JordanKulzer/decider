import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useTheme } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { supabase } from "../lib/supabase";
import { isDemoMode, DEMO_USER, DEMO_USER_ID } from "../lib/demoMode";

const ProfileScreen = () => {
  const theme = useTheme();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const gradientColors = useMemo(() => {
    return theme.dark
      ? (["#121212", "#1d1d1d", "#2b2b2d"] as const)
      : (["#fdfcf9", "#e0e7ff"] as const);
  }, [theme.dark]);

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        if (isDemoMode()) {
          setUser(DEMO_USER);
          setProfile({
            username: "demo_user",
            email: "demo@decider.app",
            created_at: new Date().toISOString(),
          });
          setLoading(false);
          return;
        }

        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        if (!authUser) return;
        setUser(authUser);

        const { data } = await supabase
          .from("users")
          .select("username, email, created_at")
          .eq("id", authUser.id)
          .single();

        setProfile(data);
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
        <View
          style={[
            styles.avatar,
            { backgroundColor: theme.colors.primary },
          ]}
        >
          <Text style={styles.avatarText}>{initial}</Text>
        </View>

        <Text
          style={[
            styles.username,
            { color: theme.colors.onBackground },
          ]}
        >
          {profile?.username || "Unknown"}
        </Text>
        <Text
          style={[styles.email, { color: theme.colors.onSurfaceVariant }]}
        >
          {profile?.email || user?.email}
        </Text>

        <View
          style={[
            styles.card,
            {
              backgroundColor:
                (theme as any).custom?.card || theme.colors.surface,
              borderColor:
                (theme as any).custom?.cardBorder || theme.colors.outline,
            },
          ]}
        >
          <View style={styles.cardRow}>
            <Icon
              name="person"
              size={18}
              color={theme.colors.onSurfaceVariant}
            />
            <Text
              style={[
                styles.cardLabel,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Username
            </Text>
            <Text
              style={[
                styles.cardValue,
                { color: theme.colors.onBackground },
              ]}
            >
              {profile?.username}
            </Text>
          </View>
          <View style={styles.cardRow}>
            <Icon
              name="email"
              size={18}
              color={theme.colors.onSurfaceVariant}
            />
            <Text
              style={[
                styles.cardLabel,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Email
            </Text>
            <Text
              style={[
                styles.cardValue,
                { color: theme.colors.onBackground },
              ]}
            >
              {profile?.email}
            </Text>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    paddingTop: 40,
    paddingHorizontal: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarText: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  username: {
    fontSize: 22,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
    marginBottom: 24,
  },
  card: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 10,
  },
  cardLabel: {
    fontSize: 14,
    flex: 1,
    fontFamily: "Rubik_400Regular",
  },
  cardValue: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
});

export default ProfileScreen;
