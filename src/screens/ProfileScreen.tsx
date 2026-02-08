import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { TextInput as PaperInput, useTheme, Modal, Portal, Button } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { supabase } from "../lib/supabase";
import { isDemoMode, DEMO_USER, DEMO_USER_ID } from "../lib/demoMode";
import {
  mockFetchFriends,
  mockFetchFriendRequests,
  mockSearchUsers,
  mockSendFriendRequest,
  mockAcceptFriendRequest,
  mockDeclineFriendRequest,
  mockRemoveFriend,
} from "../lib/mockData";
import type { Friend, FriendRequest } from "../types/decisions";

type EditField = "username" | "email" | "password" | null;

const ProfileScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [editField, setEditField] = useState<EditField>(null);
  const [editValue, setEditValue] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  // Friends state
  const [friendsExpanded, setFriendsExpanded] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsTab, setFriendsTab] = useState<"friends" | "requests" | "add">("friends");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{ id: string; username: string; email: string; isFriend: boolean }>
  >([]);
  const [searching, setSearching] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const gradientColors = useMemo(() => {
    return theme.dark
      ? (["#121212", "#1d1d1d", "#2b2b2d"] as const)
      : (["#fdfcf9", "#e0e7ff"] as const);
  }, [theme.dark]);

  const loadFriends = useCallback(async (currentUserId: string) => {
    setFriendsLoading(true);
    try {
      if (isDemoMode()) {
        const [friendsData, requestsData] = await Promise.all([
          mockFetchFriends(currentUserId),
          mockFetchFriendRequests(currentUserId),
        ]);
        setFriends(friendsData);
        setRequests(requestsData);
      } else {
        // TODO: Implement real Supabase queries
        setFriends([]);
        setRequests([]);
      }
    } catch (err) {
      console.error("Error loading friends:", err);
    }
    setFriendsLoading(false);
  }, []);

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
          setUserId(DEMO_USER_ID);
          loadFriends(DEMO_USER_ID);
          setLoading(false);
          return;
        }

        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        if (!authUser) return;
        setUser(authUser);
        setUserId(authUser.id);

        const { data } = await supabase
          .from("users")
          .select("username, email, created_at")
          .eq("id", authUser.id)
          .single();

        setProfile(data);
        loadFriends(authUser.id);
        setLoading(false);
      };
      load();
    }, [loadFriends])
  );

  const handleEditStart = (field: EditField) => {
    if (field === "username") {
      setEditValue(profile?.username || "");
    } else if (field === "email") {
      setEditValue(profile?.email || user?.email || "");
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

          if (error) throw error;
          setProfile((prev: any) => ({ ...prev, username: editValue.trim() }));
          Toast.show({ type: "success", text1: "Username updated", position: "bottom" });
        }
      } else if (editField === "email") {
        if (!editValue.trim() || !editValue.includes("@")) {
          Toast.show({ type: "error", text1: "Invalid email address", position: "bottom" });
          setSaving(false);
          return;
        }

        if (isDemoMode()) {
          setProfile((prev: any) => ({ ...prev, email: editValue.trim() }));
          Toast.show({ type: "success", text1: "Email updated", position: "bottom" });
        } else {
          const { error } = await supabase.auth.updateUser({ email: editValue.trim() });
          if (error) throw error;

          await supabase
            .from("users")
            .update({ email: editValue.trim() })
            .eq("id", user.id);

          setProfile((prev: any) => ({ ...prev, email: editValue.trim() }));
          Toast.show({
            type: "success",
            text1: "Email updated",
            text2: "Check your inbox to confirm",
            position: "bottom"
          });
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

  // Friends handlers
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      if (isDemoMode() && userId) {
        const results = await mockSearchUsers(query, userId);
        setSearchResults(results);
      } else {
        setSearchResults([]);
      }
    } catch (err) {
      console.error("Search error:", err);
    }
    setSearching(false);
  };

  const handleSendRequest = async (toUserId: string) => {
    if (!userId) return;

    try {
      if (isDemoMode()) {
        await mockSendFriendRequest(userId, toUserId);
      }
      Toast.show({
        type: "success",
        text1: "Request sent!",
        position: "bottom",
      });
      setSearchResults((prev) =>
        prev.map((r) =>
          r.id === toUserId ? { ...r, isFriend: true } : r
        )
      );
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Failed to send request",
        text2: err.message,
        position: "bottom",
      });
    }
  };

  const handleAcceptRequest = async (request: FriendRequest) => {
    try {
      if (isDemoMode()) {
        await mockAcceptFriendRequest(request.id);
      }
      Toast.show({
        type: "success",
        text1: `Added ${request.from_username}!`,
        position: "bottom",
      });
      if (userId) loadFriends(userId);
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Failed to accept",
        text2: err.message,
        position: "bottom",
      });
    }
  };

  const handleDeclineRequest = async (request: FriendRequest) => {
    try {
      if (isDemoMode()) {
        await mockDeclineFriendRequest(request.id);
      }
      if (userId) loadFriends(userId);
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Failed to decline",
        text2: err.message,
        position: "bottom",
      });
    }
  };

  const handleRemoveFriend = async (friend: Friend) => {
    Alert.alert(
      "Remove Friend",
      `Are you sure you want to remove ${friend.friend_username}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              if (isDemoMode() && userId) {
                await mockRemoveFriend(userId, friend.friend_id);
              }
              Toast.show({
                type: "info",
                text1: "Friend removed",
                position: "bottom",
              });
              if (userId) loadFriends(userId);
            } catch (err: any) {
              Toast.show({
                type: "error",
                text1: "Failed to remove",
                text2: err.message,
                position: "bottom",
              });
            }
          },
        },
      ]
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

  const renderFriendItem = (item: Friend) => {
    const friendInitial = item.friend_username?.charAt(0).toUpperCase() || "?";

    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.friendCard,
          {
            backgroundColor: (theme as any).custom?.card || theme.colors.surface,
            borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
          },
        ]}
        onLongPress={() => handleRemoveFriend(item)}
      >
        <View style={[styles.friendAvatar, { backgroundColor: theme.colors.primary }]}>
          <Text style={styles.friendAvatarText}>{friendInitial}</Text>
        </View>
        <View style={styles.friendInfo}>
          <Text style={[styles.friendName, { color: theme.colors.onBackground }]}>
            {item.friend_username}
          </Text>
          <Text style={[styles.friendEmail, { color: theme.colors.onSurfaceVariant }]}>
            {item.friend_email}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderRequestItem = (item: FriendRequest) => {
    const requestInitial = item.from_username?.charAt(0).toUpperCase() || "?";

    return (
      <View
        key={item.id}
        style={[
          styles.friendCard,
          {
            backgroundColor: (theme as any).custom?.card || theme.colors.surface,
            borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
          },
        ]}
      >
        <View style={[styles.friendAvatar, { backgroundColor: "#f59e0b" }]}>
          <Text style={styles.friendAvatarText}>{requestInitial}</Text>
        </View>
        <View style={styles.friendInfo}>
          <Text style={[styles.friendName, { color: theme.colors.onBackground }]}>
            {item.from_username}
          </Text>
          <Text style={[styles.friendEmail, { color: theme.colors.onSurfaceVariant }]}>
            wants to be your friend
          </Text>
        </View>
        <View style={styles.requestActions}>
          <TouchableOpacity
            style={[styles.acceptButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => handleAcceptRequest(item)}
          >
            <Icon name="check" size={16} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.declineButton, { backgroundColor: theme.colors.error }]}
            onPress={() => handleDeclineRequest(item)}
          >
            <Icon name="close" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSearchResult = (item: { id: string; username: string; email: string; isFriend: boolean }) => {
    const searchInitial = item.username?.charAt(0).toUpperCase() || "?";

    return (
      <View
        key={item.id}
        style={[
          styles.friendCard,
          {
            backgroundColor: (theme as any).custom?.card || theme.colors.surface,
            borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
          },
        ]}
      >
        <View
          style={[
            styles.friendAvatar,
            { backgroundColor: item.isFriend ? "#22c55e" : theme.colors.onSurfaceVariant },
          ]}
        >
          <Text style={styles.friendAvatarText}>{searchInitial}</Text>
        </View>
        <View style={styles.friendInfo}>
          <Text style={[styles.friendName, { color: theme.colors.onBackground }]}>
            {item.username}
          </Text>
          <Text style={[styles.friendEmail, { color: theme.colors.onSurfaceVariant }]}>
            {item.email}
          </Text>
        </View>
        {item.isFriend ? (
          <View style={[styles.friendBadge, { backgroundColor: "#22c55e20" }]}>
            <Icon name="check" size={12} color="#22c55e" />
            <Text style={[styles.friendBadgeText, { color: "#22c55e" }]}>Added</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.addFriendButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => handleSendRequest(item.id)}
          >
            <Icon name="person-add" size={14} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderFriendsTab = (tab: "friends" | "requests" | "add", label: string, count?: number) => {
    const isActive = friendsTab === tab;
    return (
      <TouchableOpacity
        key={tab}
        style={[
          styles.friendsTab,
          {
            backgroundColor: isActive ? theme.colors.primary : "transparent",
            borderColor: theme.colors.primary,
          },
        ]}
        onPress={() => setFriendsTab(tab)}
      >
        <Text
          style={[
            styles.friendsTabText,
            { color: isActive ? "#fff" : theme.colors.primary },
          ]}
        >
          {label}
        </Text>
        {count !== undefined && count > 0 && (
          <View
            style={[
              styles.friendsTabBadge,
              { backgroundColor: isActive ? "#fff" : theme.colors.primary },
            ]}
          >
            <Text
              style={[
                styles.friendsTabBadgeText,
                { color: isActive ? theme.colors.primary : "#fff" },
              ]}
            >
              {count}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Profile Header */}
        <View style={styles.header}>
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
        </View>

        {/* Edit Profile Section */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: (theme as any).custom?.card || theme.colors.surface,
              borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: theme.colors.onBackground }]}>
            Account Settings
          </Text>

          <TouchableOpacity
            style={styles.cardRow}
            onPress={() => handleEditStart("username")}
          >
            <Icon name="person" size={18} color={theme.colors.onSurfaceVariant} />
            <Text style={[styles.cardLabel, { color: theme.colors.onSurfaceVariant }]}>
              Username
            </Text>
            <Text style={[styles.cardValue, { color: theme.colors.onBackground }]}>
              {profile?.username}
            </Text>
            <Icon name="edit" size={16} color={theme.colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cardRow}
            onPress={() => handleEditStart("email")}
          >
            <Icon name="email" size={18} color={theme.colors.onSurfaceVariant} />
            <Text style={[styles.cardLabel, { color: theme.colors.onSurfaceVariant }]}>
              Email
            </Text>
            <Text
              style={[styles.cardValue, { color: theme.colors.onBackground }]}
              numberOfLines={1}
            >
              {profile?.email}
            </Text>
            <Icon name="edit" size={16} color={theme.colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.cardRow, { borderBottomWidth: 0 }]}
            onPress={() => handleEditStart("password")}
          >
            <Icon name="lock" size={18} color={theme.colors.onSurfaceVariant} />
            <Text style={[styles.cardLabel, { color: theme.colors.onSurfaceVariant }]}>
              Password
            </Text>
            <Text style={[styles.cardValue, { color: theme.colors.onBackground }]}>
              ••••••••
            </Text>
            <Icon name="edit" size={16} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Friends Section */}
        <TouchableOpacity
          style={[
            styles.card,
            {
              backgroundColor: (theme as any).custom?.card || theme.colors.surface,
              borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
            },
          ]}
          onPress={() => setFriendsExpanded(!friendsExpanded)}
          activeOpacity={0.8}
        >
          <View style={styles.friendsHeader}>
            <Icon name="people" size={20} color={theme.colors.primary} />
            <Text style={[styles.cardTitle, { color: theme.colors.onBackground, marginBottom: 0 }]}>
              Friends
            </Text>
            {requests.length > 0 && (
              <View style={[styles.requestBadge, { backgroundColor: theme.colors.error }]}>
                <Text style={styles.requestBadgeText}>{requests.length}</Text>
              </View>
            )}
            <View style={{ flex: 1 }} />
            <Icon
              name={friendsExpanded ? "expand-less" : "expand-more"}
              size={24}
              color={theme.colors.onSurfaceVariant}
            />
          </View>
        </TouchableOpacity>

        {friendsExpanded && (
          <View
            style={[
              styles.friendsSection,
              {
                backgroundColor: (theme as any).custom?.card || theme.colors.surface,
                borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
              },
            ]}
          >
            {/* Friends Tabs */}
            <View style={styles.friendsTabRow}>
              {renderFriendsTab("friends", "Friends", friends.length)}
              {renderFriendsTab("requests", "Requests", requests.length)}
              {renderFriendsTab("add", "Add")}
            </View>

            {friendsLoading ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.primary}
                style={{ marginVertical: 20 }}
              />
            ) : friendsTab === "friends" ? (
              friends.length === 0 ? (
                <View style={styles.emptyFriends}>
                  <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                    No friends yet. Add some!
                  </Text>
                </View>
              ) : (
                <View style={styles.friendsList}>
                  {friends.map(renderFriendItem)}
                </View>
              )
            ) : friendsTab === "requests" ? (
              requests.length === 0 ? (
                <View style={styles.emptyFriends}>
                  <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                    No pending requests
                  </Text>
                </View>
              ) : (
                <View style={styles.friendsList}>
                  {requests.map(renderRequestItem)}
                </View>
              )
            ) : (
              <View style={styles.addFriendsSection}>
                <PaperInput
                  label="Search by username or email"
                  mode="outlined"
                  value={searchQuery}
                  onChangeText={handleSearch}
                  left={<PaperInput.Icon icon="magnify" />}
                  style={styles.searchInput}
                  dense
                  theme={{ colors: { primary: theme.colors.primary } }}
                />
                {searching ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primary}
                    style={{ marginTop: 12 }}
                  />
                ) : searchResults.length > 0 ? (
                  <View style={styles.friendsList}>
                    {searchResults.map(renderSearchResult)}
                  </View>
                ) : searchQuery.length >= 2 ? (
                  <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant, marginTop: 12 }]}>
                    No users found for "{searchQuery}"
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        )}
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
            {editField === "username" && "Edit Username"}
            {editField === "email" && "Edit Email"}
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
              label={editField === "username" ? "Username" : "Email"}
              mode="outlined"
              value={editValue}
              onChangeText={setEditValue}
              keyboardType={editField === "email" ? "email-address" : "default"}
              autoCapitalize={editField === "email" ? "none" : "words"}
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
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
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
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Rubik_600SemiBold",
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(128, 128, 128, 0.2)",
  },
  cardLabel: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
  },
  cardValue: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
    flex: 1,
    textAlign: "right",
    marginRight: 8,
  },
  friendsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  requestBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  requestBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  friendsSection: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    marginTop: -4,
  },
  friendsTabRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  friendsTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    gap: 4,
  },
  friendsTabText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  friendsTabBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  friendsTabBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  friendsList: {
    gap: 8,
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  friendAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  friendAvatarText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  friendEmail: {
    fontSize: 11,
    fontFamily: "Rubik_400Regular",
    marginTop: 1,
  },
  requestActions: {
    flexDirection: "row",
    gap: 6,
  },
  acceptButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  declineButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  friendBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 3,
  },
  friendBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  addFriendButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyFriends: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Rubik_400Regular",
    textAlign: "center",
  },
  addFriendsSection: {
    marginTop: 4,
  },
  searchInput: {
    backgroundColor: "transparent",
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
