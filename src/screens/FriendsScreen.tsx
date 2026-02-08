import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { TextInput as PaperInput, useTheme } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { supabase } from "../lib/supabase";
import { isDemoMode, DEMO_USER_ID } from "../lib/demoMode";
import {
  mockFetchFriends,
  mockFetchFriendRequests,
  mockSearchUsers,
  mockSendFriendRequest,
  mockAcceptFriendRequest,
  mockDeclineFriendRequest,
  mockRemoveFriend,
} from "../lib/mockData";
import * as friendsApi from "../lib/friends";
import type { Friend, FriendRequest } from "../types/decisions";

type Tab = "friends" | "requests" | "add";

const FriendsScreen = () => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>("friends");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{ id: string; username: string; email: string; isFriend: boolean }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const gradientColors = useMemo(() => {
    return theme.dark
      ? (["#121212", "#1d1d1d", "#2b2b2d"] as const)
      : (["#fdfcf9", "#e0e7ff"] as const);
  }, [theme.dark]);

  const loadData = useCallback(async () => {
    setLoading(true);
    let currentUserId: string | null = null;

    if (isDemoMode()) {
      currentUserId = DEMO_USER_ID;
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      currentUserId = user.id;
    }

    setUserId(currentUserId);

    try {
      if (isDemoMode()) {
        const [friendsData, requestsData] = await Promise.all([
          mockFetchFriends(currentUserId),
          mockFetchFriendRequests(currentUserId),
        ]);
        setFriends(friendsData);
        setRequests(requestsData);
      } else {
        const [friendsData, requestsData] = await Promise.all([
          friendsApi.fetchFriends(currentUserId),
          friendsApi.fetchFriendRequests(currentUserId),
        ]);
        setFriends(friendsData);
        setRequests(requestsData);
      }
    } catch (err) {
      console.error("Error loading friends:", err);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

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
      } else if (userId) {
        const results = await friendsApi.searchUsers(query, userId);
        setSearchResults(results);
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
      } else {
        await friendsApi.sendFriendRequest(userId, toUserId);
      }
      Toast.show({
        type: "success",
        text1: "Request sent!",
        position: "bottom",
      });
      // Update UI to show pending
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
      } else {
        await friendsApi.acceptFriendRequest(request.id);
      }
      Toast.show({
        type: "success",
        text1: `Added ${request.from_username}!`,
        position: "bottom",
      });
      loadData();
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
      } else {
        await friendsApi.declineFriendRequest(request.id);
      }
      loadData();
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
              } else if (userId) {
                await friendsApi.removeFriend(userId, friend.friend_id);
              }
              Toast.show({
                type: "info",
                text1: "Friend removed",
                position: "bottom",
              });
              loadData();
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

  const renderTab = (tab: Tab, label: string, count?: number) => {
    const isActive = activeTab === tab;
    return (
      <TouchableOpacity
        key={tab}
        style={[
          styles.tab,
          {
            backgroundColor: isActive
              ? theme.colors.primary
              : "transparent",
            borderColor: theme.colors.primary,
          },
        ]}
        onPress={() => setActiveTab(tab)}
      >
        <Text
          style={[
            styles.tabText,
            { color: isActive ? "#fff" : theme.colors.primary },
          ]}
        >
          {label}
        </Text>
        {count !== undefined && count > 0 && (
          <View
            style={[
              styles.tabBadge,
              {
                backgroundColor: isActive
                  ? "#fff"
                  : theme.colors.primary,
              },
            ]}
          >
            <Text
              style={[
                styles.tabBadgeText,
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

  const renderFriendItem = ({ item }: { item: Friend }) => {
    const initial = item.friend_username?.charAt(0).toUpperCase() || "?";

    return (
      <TouchableOpacity
        style={[
          styles.friendCard,
          {
            backgroundColor: (theme as any).custom?.card || theme.colors.surface,
            borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
          },
        ]}
        onLongPress={() => handleRemoveFriend(item)}
      >
        <View
          style={[
            styles.avatar,
            { backgroundColor: theme.colors.primary },
          ]}
        >
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.friendInfo}>
          <Text style={[styles.friendName, { color: theme.colors.onBackground }]}>
            {item.friend_username}
          </Text>
          <Text style={[styles.friendEmail, { color: theme.colors.onSurfaceVariant }]}>
            {item.friend_email}
          </Text>
        </View>
        <Icon name="more-vert" size={20} color={theme.colors.onSurfaceVariant} />
      </TouchableOpacity>
    );
  };

  const renderRequestItem = ({ item }: { item: FriendRequest }) => {
    const initial = item.from_username?.charAt(0).toUpperCase() || "?";

    return (
      <View
        style={[
          styles.requestCard,
          {
            backgroundColor: (theme as any).custom?.card || theme.colors.surface,
            borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
          },
        ]}
      >
        <View
          style={[
            styles.avatar,
            { backgroundColor: "#f59e0b" },
          ]}
        >
          <Text style={styles.avatarText}>{initial}</Text>
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
            <Icon name="check" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.declineButton, { backgroundColor: theme.colors.error }]}
            onPress={() => handleDeclineRequest(item)}
          >
            <Icon name="close" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSearchResult = ({
    item,
  }: {
    item: { id: string; username: string; email: string; isFriend: boolean };
  }) => {
    const initial = item.username?.charAt(0).toUpperCase() || "?";

    return (
      <View
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
            styles.avatar,
            { backgroundColor: item.isFriend ? "#22c55e" : theme.colors.onSurfaceVariant },
          ]}
        >
          <Text style={styles.avatarText}>{initial}</Text>
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
            <Icon name="check" size={14} color="#22c55e" />
            <Text style={[styles.friendBadgeText, { color: "#22c55e" }]}>
              Friends
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => handleSendRequest(item.id)}
          >
            <Icon name="person-add" size={16} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <View style={styles.container}>
        {/* Tabs */}
        <View style={styles.tabRow}>
          {renderTab("friends", "Friends", friends.length)}
          {renderTab("requests", "Requests", requests.length)}
          {renderTab("add", "Add")}
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : activeTab === "friends" ? (
          friends.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon
                name="people-outline"
                size={64}
                color={theme.colors.onSurfaceVariant}
                style={{ opacity: 0.4, marginBottom: 16 }}
              />
              <Text style={[styles.emptyTitle, { color: theme.colors.onBackground }]}>
                No friends yet
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.colors.onSurfaceVariant }]}>
                Add friends to easily invite them to your decisions
              </Text>
              <TouchableOpacity
                style={[styles.emptyButton, { backgroundColor: theme.colors.primary }]}
                onPress={() => setActiveTab("add")}
              >
                <Icon name="person-add" size={18} color="#fff" />
                <Text style={styles.emptyButtonText}>Add Friends</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={friends}
              renderItem={renderFriendItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            />
          )
        ) : activeTab === "requests" ? (
          requests.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon
                name="mail-outline"
                size={64}
                color={theme.colors.onSurfaceVariant}
                style={{ opacity: 0.4, marginBottom: 16 }}
              />
              <Text style={[styles.emptyTitle, { color: theme.colors.onBackground }]}>
                No pending requests
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.colors.onSurfaceVariant }]}>
                Friend requests will appear here
              </Text>
            </View>
          ) : (
            <FlatList
              data={requests}
              renderItem={renderRequestItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            />
          )
        ) : (
          <View style={styles.addSection}>
            <PaperInput
              label="Search by username or email"
              mode="outlined"
              value={searchQuery}
              onChangeText={handleSearch}
              left={<PaperInput.Icon icon="magnify" />}
              style={styles.searchInput}
              theme={{ colors: { primary: theme.colors.primary } }}
            />

            {searching ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.primary}
                style={{ marginTop: 20 }}
              />
            ) : searchResults.length > 0 ? (
              <FlatList
                data={searchResults}
                renderItem={renderSearchResult}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              />
            ) : searchQuery.length >= 2 ? (
              <View style={styles.noResults}>
                <Text style={[styles.noResultsText, { color: theme.colors.onSurfaceVariant }]}>
                  No users found for "{searchQuery}"
                </Text>
              </View>
            ) : (
              <View style={styles.searchHint}>
                <Icon
                  name="search"
                  size={48}
                  color={theme.colors.onSurfaceVariant}
                  style={{ opacity: 0.3, marginBottom: 12 }}
                />
                <Text style={[styles.searchHintText, { color: theme.colors.onSurfaceVariant }]}>
                  Search for friends by username or email
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    gap: 6,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingBottom: 20,
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  requestCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  friendEmail: {
    fontSize: 12,
    fontFamily: "Rubik_400Regular",
    marginTop: 2,
  },
  requestActions: {
    flexDirection: "row",
    gap: 8,
  },
  acceptButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  declineButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  friendBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  friendBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
    fontFamily: "Rubik_600SemiBold",
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
    fontFamily: "Rubik_400Regular",
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
  },
  emptyButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  addSection: {
    flex: 1,
  },
  searchInput: {
    backgroundColor: "transparent",
    marginBottom: 16,
  },
  noResults: {
    alignItems: "center",
    paddingTop: 40,
  },
  noResultsText: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
  },
  searchHint: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  searchHintText: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
    textAlign: "center",
  },
});

export default FriendsScreen;
