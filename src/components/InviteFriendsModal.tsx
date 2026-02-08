import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Share,
} from "react-native";
import { useTheme } from "react-native-paper";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import * as Clipboard from "expo-clipboard";
import { isDemoMode } from "../lib/demoMode";
import { mockGetInvitableFriends, mockJoinDecision } from "../lib/mockData";
import { getInvitableFriends, inviteFriendToDecision } from "../lib/friends";
import type { Friend } from "../types/decisions";

interface InviteFriendsModalProps {
  visible: boolean;
  onClose: () => void;
  decisionId: string;
  decisionTitle: string;
  inviteCode: string;
  userId: string;
  onInvited?: () => void;
}

const InviteFriendsModal: React.FC<InviteFriendsModalProps> = ({
  visible,
  onClose,
  decisionId,
  decisionTitle,
  inviteCode,
  userId,
  onInvited,
}) => {
  const theme = useTheme();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState<string | null>(null);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) {
      loadFriends();
      setInvitedIds(new Set());
    }
  }, [visible, decisionId, userId]);

  const loadFriends = async () => {
    setLoading(true);
    try {
      if (isDemoMode()) {
        const data = await mockGetInvitableFriends(userId, decisionId);
        setFriends(data);
      } else {
        const data = await getInvitableFriends(userId, decisionId);
        setFriends(data);
      }
    } catch (err) {
      console.error("Error loading friends:", err);
    }
    setLoading(false);
  };

  const handleInviteFriend = async (friend: Friend) => {
    setInviting(friend.friend_id);
    try {
      if (isDemoMode()) {
        await mockJoinDecision(decisionId, friend.friend_id);
      } else {
        await inviteFriendToDecision(decisionId, friend.friend_id);
      }

      setInvitedIds((prev) => new Set([...prev, friend.friend_id]));
      Toast.show({
        type: "success",
        text1: `Invited ${friend.friend_username}!`,
        position: "bottom",
      });
      onInvited?.();
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Failed to invite",
        text2: err.message,
        position: "bottom",
      });
    }
    setInviting(null);
  };

  const handleCopyCode = async () => {
    await Clipboard.setStringAsync(inviteCode);
    Toast.show({
      type: "success",
      text1: "Code copied!",
      text2: inviteCode,
      position: "bottom",
    });
  };

  const handleShare = async () => {
    try {
      const message = `Join my decision "${decisionTitle}" on Decider!\n\nUse code: ${inviteCode}\n\nOr open: deciderapp://decision/${decisionId}`;
      await Share.share({
        message,
        title: `Join "${decisionTitle}" on Decider`,
      });
    } catch (err) {
      console.error("Share error:", err);
    }
  };

  const truncatedTitle =
    decisionTitle.length > 30
      ? decisionTitle.substring(0, 30) + "..."
      : decisionTitle;

  const renderFriendItem = (item: Friend) => {
    const initial = item.friend_username?.charAt(0).toUpperCase() || "?";
    const isInvited = invitedIds.has(item.friend_id);
    const isInviting = inviting === item.friend_id;

    return (
      <View
        key={item.id}
        style={[
          styles.friendRow,
          { backgroundColor: theme.colors.surfaceVariant },
        ]}
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
        </View>
        {isInvited ? (
          <View style={[styles.invitedBadge, { backgroundColor: "#22c55e20" }]}>
            <Icon name="check" size={14} color="#22c55e" />
            <Text style={[styles.invitedText, { color: "#22c55e" }]}>
              Invited
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.inviteButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => handleInviteFriend(item)}
            disabled={isInviting}
          >
            {isInviting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Icon name="person-add" size={16} color="#fff" />
                <Text style={styles.inviteButtonText}>Invite</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View
          style={[
            styles.container,
            { backgroundColor: theme.colors.surface },
          ]}
          onStartShouldSetResponder={() => true}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.onBackground }]}>
              Invite to Decision
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="close" size={24} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
              {truncatedTitle}
            </Text>

            {/* Invite Code Section */}
            <View
              style={[
                styles.codeSection,
                {
                  backgroundColor: (theme as any).custom?.card || theme.colors.surfaceVariant,
                  borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
                },
              ]}
            >
              <View style={styles.codeHeader}>
                <Icon name="vpn-key" size={20} color={theme.colors.primary} />
                <Text style={[styles.codeLabel, { color: theme.colors.onSurfaceVariant }]}>
                  Invite Code
                </Text>
              </View>
              <Text style={[styles.codeText, { color: theme.colors.onBackground }]}>
                {inviteCode}
              </Text>
              <View style={styles.codeActions}>
                <TouchableOpacity
                  style={[styles.codeAction, { borderColor: theme.colors.primary }]}
                  onPress={handleCopyCode}
                >
                  <Icon name="content-copy" size={16} color={theme.colors.primary} />
                  <Text style={[styles.codeActionText, { color: theme.colors.primary }]}>
                    Copy
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.codeAction, { backgroundColor: theme.colors.primary }]}
                  onPress={handleShare}
                >
                  <Icon name="share" size={16} color="#fff" />
                  <Text style={[styles.codeActionText, { color: "#fff" }]}>
                    Share
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Friends Section */}
            <View style={styles.friendsSection}>
              <Text style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>
                Invite Friends
              </Text>

              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
              ) : friends.length === 0 ? (
                <View style={styles.emptyState}>
                  <Icon
                    name="people-outline"
                    size={48}
                    color={theme.colors.onSurfaceVariant}
                    style={{ opacity: 0.4, marginBottom: 12 }}
                  />
                  <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                    No friends to invite. Add friends or share the code above!
                  </Text>
                </View>
              ) : (
                <View style={styles.friendsList}>
                  {friends.map((friend) => renderFriendItem(friend))}
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  container: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    paddingTop: 16,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  closeButton: {
    padding: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  codeSection: {
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  codeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  codeLabel: {
    fontSize: 12,
    fontWeight: "500",
    fontFamily: "Rubik_500Medium",
  },
  codeText: {
    fontSize: 28,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
    letterSpacing: 4,
    textAlign: "center",
    marginBottom: 16,
  },
  codeActions: {
    flexDirection: "row",
    gap: 12,
  },
  codeAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    gap: 6,
  },
  codeActionText: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  friendsSection: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
    marginBottom: 12,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  friendsList: {
    gap: 8,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 15,
    fontWeight: "500",
    fontFamily: "Rubik_500Medium",
  },
  invitedBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  invitedText: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  inviteButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  inviteButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
});

export default InviteFriendsModal;
