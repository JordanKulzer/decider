import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
} from "react-native";
import { TextInput as PaperInput, useTheme, Modal, Portal, Button } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { MaterialIcons as Icon, MaterialCommunityIcons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import Constants from "expo-constants";
import { supabase } from "../lib/supabase";
import { isDemoMode, DEMO_USER, DEMO_USER_ID } from "../lib/demoMode";
import { useSubscription } from "../context/SubscriptionContext";
import { mockFetchFriends, mockFetchFriendRequests } from "../lib/mockData";

type EditField = "username" | "password" | null;

interface ProfileScreenProps {
  isDarkTheme: boolean;
  toggleTheme: () => void;
  onLogout: () => void;
}

const ProfileScreen = ({ isDarkTheme, toggleTheme, onLogout }: ProfileScreenProps) => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { isProUser } = useSubscription();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [friendCount, setFriendCount] = useState(0);
  const [requestCount, setRequestCount] = useState(0);

  // Edit state
  const [editField, setEditField] = useState<EditField>(null);
  const [editValue, setEditValue] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const appVersion = Constants.expoConfig?.version || "1.0.0";

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

  const handleEditStart = (field: EditField) => {
    if (field === "username") {
      setEditValue(profile?.username || "");
    } else if (field === "password") {
      setNewPassword("");
      setConfirmPassword("");
    }
    setEditField(field);
  };

  const handleEditCancel = () => {
    setEditField(null);
    setEditValue("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleEditSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      if (editField === "username") {
        if (!editValue.trim()) {
          Toast.show({ type: "error", text1: "Username cannot be empty", position: "bottom" });
          setSaving(false);
          return;
        }

        if (isDemoMode()) {
          setProfile((prev: any) => ({ ...prev, username: editValue.trim() }));
          Toast.show({ type: "success", text1: "Username updated", position: "bottom" });
        } else {
          const { error } = await supabase
            .from("users")
            .update({ username: editValue.trim() })
            .eq("id", user.id);

          if (error) {
            if (error.code === "23505") {
              Toast.show({ type: "error", text1: "Username already taken", position: "bottom" });
              setSaving(false);
              return;
            }
            throw error;
          }
          setProfile((prev: any) => ({ ...prev, username: editValue.trim() }));
          Toast.show({ type: "success", text1: "Username updated", position: "bottom" });
        }
      } else if (editField === "password") {
        if (newPassword.length < 6) {
          Toast.show({ type: "error", text1: "Password must be at least 6 characters", position: "bottom" });
          setSaving(false);
          return;
        }
        if (newPassword !== confirmPassword) {
          Toast.show({ type: "error", text1: "Passwords do not match", position: "bottom" });
          setSaving(false);
          return;
        }

        if (isDemoMode()) {
          Toast.show({ type: "success", text1: "Password updated", position: "bottom" });
        } else {
          const { error } = await supabase.auth.updateUser({ password: newPassword });
          if (error) throw error;
          Toast.show({ type: "success", text1: "Password updated", position: "bottom" });
        }
      }

      handleEditCancel();
    } catch (err: any) {
      console.error("Update error:", err);
      Toast.show({
        type: "error",
        text1: "Update failed",
        text2: err.message,
        position: "bottom"
      });
    }
    setSaving(false);
  };

  const handleLogout = () => {
    Alert.alert(
      "Log Out",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log Out",
          style: "destructive",
          onPress: async () => {
            if (isDemoMode()) {
              onLogout();
              return;
            }
            try {
              await supabase.auth.signOut();
              onLogout();
            } catch (err) {
              console.error("Logout failed", err);
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all your data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (isDemoMode()) {
              onLogout();
              return;
            }
            try {
              const { data: { user: authUser } } = await supabase.auth.getUser();
              if (!authUser) return;

              await supabase
                .from("users")
                .update({ deleted_at: new Date().toISOString() })
                .eq("id", authUser.id);

              await supabase.from("decision_members").delete().eq("user_id", authUser.id);
              await supabase.auth.signOut({ scope: "global" });
              onLogout();
            } catch (error: any) {
              Alert.alert("Error", `Failed to delete account: ${error.message || "Unknown error"}`);
            }
          },
        },
      ]
    );
  };

  const handleSuggestion = () => {
    Linking.openURL("mailto:feedback@decider.app?subject=App Suggestion");
  };

  const handlePrivacyPolicy = () => {
    Linking.openURL("https://decider.app/privacy");
  };

  const handleHelpCenter = () => {
    Linking.openURL("https://decider.app/help");
  };

  const renderSettingRow = (
    icon: string,
    label: string,
    onPress: () => void,
    options?: {
      rightText?: string;
      rightIcon?: string;
      iconColor?: string;
      labelColor?: string;
      showChevron?: boolean;
      rightComponent?: React.ReactNode;
    }
  ) => {
    const { rightText, rightIcon, iconColor, labelColor, showChevron = true, rightComponent } = options || {};

    return (
      <TouchableOpacity style={styles.settingRow} onPress={onPress} activeOpacity={0.7}>
        <Icon name={icon as any} size={22} color={iconColor || theme.colors.onSurfaceVariant} />
        <Text style={[styles.settingLabel, { color: labelColor || theme.colors.onBackground }]}>
          {label}
        </Text>
        {rightComponent}
        {rightText && (
          <Text style={[styles.settingValue, { color: theme.colors.onSurfaceVariant }]}>
            {rightText}
          </Text>
        )}
        {rightIcon && (
          <Icon name={rightIcon as any} size={20} color={theme.colors.onSurfaceVariant} />
        )}
        {showChevron && !rightComponent && (
          <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
        )}
      </TouchableOpacity>
    );
  };

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
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
      >
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

        {/* Account Section */}
        <Text style={[styles.sectionHeader, { color: theme.colors.onSurfaceVariant }]}>
          ACCOUNT
        </Text>
        <View
          style={[
            styles.card,
            {
              backgroundColor: (theme as any).custom?.card || theme.colors.surface,
              borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
            },
          ]}
        >
          {renderSettingRow("person", "Username", () => handleEditStart("username"), {
            rightText: profile?.username,
          })}
          {renderSettingRow("lock", "Password", () => handleEditStart("password"), {
            rightText: "••••••••",
          })}
        </View>

        {/* Preferences Section */}
        <Text style={[styles.sectionHeader, { color: theme.colors.onSurfaceVariant }]}>
          PREFERENCES
        </Text>
        <View
          style={[
            styles.card,
            {
              backgroundColor: (theme as any).custom?.card || theme.colors.surface,
              borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
            },
          ]}
        >
          {renderSettingRow(
            isDarkTheme ? "dark-mode" : "light-mode",
            isDarkTheme ? "Dark Mode" : "Light Mode",
            toggleTheme,
            {
              showChevron: false,
              rightComponent: (
                <TouchableOpacity
                  style={[
                    styles.themeToggle,
                    { backgroundColor: theme.colors.primary },
                  ]}
                  onPress={toggleTheme}
                >
                  <MaterialCommunityIcons
                    name={isDarkTheme ? "weather-night" : "weather-sunny"}
                    size={16}
                    color="#fff"
                  />
                </TouchableOpacity>
              ),
            }
          )}
        </View>

        {/* Premium Section */}
        <Text style={[styles.sectionHeader, { color: theme.colors.onSurfaceVariant }]}>
          PREMIUM
        </Text>
        <TouchableOpacity
          style={[
            styles.premiumCard,
            {
              backgroundColor: isProUser ? "rgba(245, 158, 11, 0.1)" : `${theme.colors.primary}15`,
              borderColor: isProUser ? "#f59e0b" : theme.colors.primary,
            },
          ]}
          onPress={() => navigation.navigate("SubscriptionScreen")}
          activeOpacity={0.8}
        >
          <View style={styles.premiumContent}>
            <MaterialCommunityIcons
              name={isProUser ? "crown" : "star-outline"}
              size={28}
              color={isProUser ? "#f59e0b" : theme.colors.primary}
            />
            <View style={styles.premiumText}>
              <Text style={[styles.premiumTitle, { color: theme.colors.onBackground }]}>
                {isProUser ? "Decider Pro" : "Upgrade to Pro"}
              </Text>
              <Text style={[styles.premiumSubtitle, { color: theme.colors.onSurfaceVariant }]}>
                {isProUser ? "Manage your subscription" : "Unlock unlimited decisions & more"}
              </Text>
            </View>
          </View>
          <Icon name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
        </TouchableOpacity>

        {/* Support Section */}
        <Text style={[styles.sectionHeader, { color: theme.colors.onSurfaceVariant }]}>
          SUPPORT
        </Text>
        <View
          style={[
            styles.card,
            {
              backgroundColor: (theme as any).custom?.card || theme.colors.surface,
              borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
            },
          ]}
        >
          {renderSettingRow("help-outline", "Help Center", handleHelpCenter)}
          {renderSettingRow("lightbulb-outline", "Send Suggestion", handleSuggestion)}
          {renderSettingRow("policy", "Privacy Policy", handlePrivacyPolicy)}
        </View>

        {/* Account Actions */}
        <Text style={[styles.sectionHeader, { color: theme.colors.onSurfaceVariant }]}>
          ACCOUNT ACTIONS
        </Text>
        <View
          style={[
            styles.card,
            {
              backgroundColor: (theme as any).custom?.card || theme.colors.surface,
              borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
            },
          ]}
        >
          {renderSettingRow("logout", "Log Out", handleLogout, {
            iconColor: theme.colors.error,
            labelColor: theme.colors.error,
            showChevron: false,
          })}
          {renderSettingRow("delete-forever", "Delete Account", handleDeleteAccount, {
            iconColor: theme.colors.error,
            labelColor: theme.colors.error,
            showChevron: false,
          })}
        </View>

        {/* Version */}
        <Text style={[styles.version, { color: theme.colors.onSurfaceVariant }]}>
          Version {appVersion}
        </Text>
      </ScrollView>

      {/* Edit Modal */}
      <Portal>
        <Modal
          visible={editField !== null}
          onDismiss={handleEditCancel}
          contentContainerStyle={[
            styles.modalContainer,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <Text style={[styles.modalTitle, { color: theme.colors.onBackground }]}>
            {editField === "username" && "Change Username"}
            {editField === "password" && "Change Password"}
          </Text>

          {editField === "password" ? (
            <>
              <PaperInput
                label="New Password"
                mode="outlined"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                style={styles.modalInput}
                theme={{ colors: { primary: theme.colors.primary } }}
              />
              <PaperInput
                label="Confirm Password"
                mode="outlined"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                style={styles.modalInput}
                theme={{ colors: { primary: theme.colors.primary } }}
              />
            </>
          ) : (
            <PaperInput
              label="Username"
              mode="outlined"
              value={editValue}
              onChangeText={setEditValue}
              autoCapitalize="none"
              style={styles.modalInput}
              theme={{ colors: { primary: theme.colors.primary } }}
            />
          )}

          <View style={styles.modalActions}>
            <Button onPress={handleEditCancel} disabled={saving}>
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleEditSave}
              loading={saving}
              disabled={saving}
            >
              Save
            </Button>
          </View>
        </Modal>
      </Portal>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
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
  sectionHeader: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 16,
    marginLeft: 4,
    fontFamily: "Rubik_500Medium",
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(128, 128, 128, 0.2)",
  },
  settingLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Rubik_400Regular",
  },
  settingValue: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
    marginRight: 4,
  },
  themeToggle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  premiumCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  premiumContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  premiumText: {
    flex: 1,
  },
  premiumTitle: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Rubik_600SemiBold",
  },
  premiumSubtitle: {
    fontSize: 13,
    fontFamily: "Rubik_400Regular",
    marginTop: 2,
  },
  version: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Rubik_400Regular",
    marginTop: 32,
    marginBottom: 16,
  },
  modalContainer: {
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: "transparent",
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 8,
  },
});

export default ProfileScreen;
