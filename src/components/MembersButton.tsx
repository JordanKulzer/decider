import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Alert,
  Modal,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "react-native-paper";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { removeMember, transferOrganizer, leaveDecision } from "../lib/decisions";
import { fetchFriends, sendFriendRequest } from "../lib/friends";
import { isDemoMode } from "../lib/demoMode";
import { mockSendFriendRequest } from "../lib/mockData";
import InvitePeopleModal from "./InvitePeopleModal";
import type { DecisionMember } from "../types/decisions";

interface MembersButtonProps {
  members: DecisionMember[];
  decisionId: string;
  decisionTitle: string;
  currentUserId: string;
  isOrganizer: boolean;
  showVoteStatus?: boolean;
  onMemberChanged?: () => void;
  onLeft?: () => void;
}

const MembersButton: React.FC<MembersButtonProps> = ({
  members,
  decisionId,
  decisionTitle,
  currentUserId,
  isOrganizer,
  showVoteStatus,
  onMemberChanged,
  onLeft,
}) => {
  const theme = useTheme();
  const [modalVisible, setModalVisible]   = useState(false);
  const [showInvite, setShowInvite]       = useState(false);
  const [friendIds, setFriendIds]         = useState<Set<string>>(new Set());
  const [sentRequestIds, setSentRequestIds] = useState<Set<string>>(new Set());
  const [sendingRequest, setSendingRequest] = useState<string | null>(null);

  useEffect(() => {
    if (modalVisible && currentUserId) {
      loadFriendIds();
    }
  }, [modalVisible, currentUserId]);

  const loadFriendIds = async () => {
    try {
      if (isDemoMode()) return;
      const friends = await fetchFriends(currentUserId);
      setFriendIds(new Set(friends.map((f) => f.friend_id)));
    } catch {
      // non-critical
    }
  };

  const truncatedTitle =
    decisionTitle.length > 25
      ? decisionTitle.substring(0, 25) + "..."
      : decisionTitle;

  // ── Leave ──────────────────────────────────────────────────────────────────
  const handleLeaveDecision = () => {
    Alert.alert(
      `Leave "${truncatedTitle}"?`,
      "You won't be able to rejoin unless invited again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              await leaveDecision(decisionId, currentUserId);
              Toast.show({ type: "success", text1: "Left decision", position: "bottom" });
              setModalVisible(false);
              onLeft?.();
            } catch (err: any) {
              Toast.show({ type: "error", text1: "Failed to leave", text2: err.message, position: "bottom" });
            }
          },
        },
      ]
    );
  };

  // ── Manage member (host long-press) ────────────────────────────────────────
  const handleMemberLongPress = (member: DecisionMember) => {
    Alert.alert(
      member.username || "Member",
      undefined,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Make Organizer",
          onPress: () => confirmTransfer(member),
        },
        {
          text: "Remove from decision",
          style: "destructive",
          onPress: () => confirmRemove(member),
        },
      ]
    );
  };

  const confirmRemove = (member: DecisionMember) => {
    Alert.alert(
      "Remove member",
      `Remove ${member.username || "this member"} from "${truncatedTitle}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await removeMember(decisionId, member.user_id);
              Toast.show({ type: "success", text1: "Member removed", position: "bottom" });
              onMemberChanged?.();
            } catch (err: any) {
              Toast.show({ type: "error", text1: "Failed to remove", text2: err.message, position: "bottom" });
            }
          },
        },
      ]
    );
  };

  const confirmTransfer = (member: DecisionMember) => {
    Alert.alert(
      "Transfer organizer role",
      `Make ${member.username || "this member"} the new organizer? You will become a regular member.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Transfer",
          onPress: async () => {
            try {
              await transferOrganizer(decisionId, member.user_id);
              Toast.show({ type: "success", text1: "Role transferred", position: "bottom" });
              onMemberChanged?.();
            } catch (err: any) {
              Toast.show({ type: "error", text1: "Failed to transfer", text2: err.message, position: "bottom" });
            }
          },
        },
      ]
    );
  };

  // ── Add friend ────────────────────────────────────────────────────────────
  const handleAddFriend = async (memberId: string, memberName: string) => {
    setSendingRequest(memberId);
    try {
      if (isDemoMode()) {
        await mockSendFriendRequest(currentUserId, memberId);
      } else {
        await sendFriendRequest(currentUserId, memberId);
      }
      setSentRequestIds((prev) => new Set([...prev, memberId]));
      Toast.show({ type: "success", text1: `Friend request sent to ${memberName}!`, position: "bottom" });
    } catch (err: any) {
      Toast.show({ type: "error", text1: "Failed to send request", text2: err.message, position: "bottom" });
    }
    setSendingRequest(null);
  };

  return (
    <>
      {/* ── Header Button ── */}
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => setModalVisible(true)}
      >
        <Icon name="group" size={24} color={theme.colors.onSurfaceVariant} />
        <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
          <Text style={styles.badgeText}>{members.length}</Text>
        </View>
      </TouchableOpacity>

      {/* ── Members Modal ── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setModalVisible(false)}
        >
          <Pressable
            style={[styles.modalContainer, { backgroundColor: theme.colors.surface }]}
            onPress={() => {/* absorb — prevent backdrop from firing on inner taps */}}
          >
            {/* ── Header ── */}
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.onBackground }]}>
                Members
              </Text>
              <View style={[styles.memberCount, { backgroundColor: `${theme.colors.primary}20` }]}>
                <Text style={[styles.memberCountText, { color: theme.colors.primary }]}>
                  {members.length}
                </Text>
              </View>
            </View>

            {/* ── Invite button — organizers only ── */}
            {!!currentUserId && isOrganizer && (
              <TouchableOpacity
                style={[styles.inviteRow, { backgroundColor: `${theme.colors.primary}12`, borderColor: `${theme.colors.primary}25` }]}
                onPress={() => { setModalVisible(false); setShowInvite(true); }}
                activeOpacity={0.75}
              >
                <Icon name="person-add-alt" size={17} color={theme.colors.primary} />
                <Text style={[styles.inviteRowText, { color: theme.colors.primary }]}>
                  Invite people
                </Text>
                <Icon name="chevron-right" size={18} color={theme.colors.primary} style={styles.inviteChevron} />
              </TouchableOpacity>
            )}

            {/* ── Divider ── */}
            <View style={[styles.divider, { backgroundColor: theme.colors.surfaceVariant }]} />

            {/* ── Member list ── */}
            <ScrollView style={styles.membersList} showsVerticalScrollIndicator={false}>
              {members.map((member) => {
                const isCurrentUser    = member.user_id === currentUserId;
                const isMemberOrganizer = member.role === "organizer";
                const canRemove        = isOrganizer && !isCurrentUser;
                const initial          = member.username
                  ? member.username.charAt(0).toUpperCase()
                  : "?";

                return (
                  <Pressable
                    key={member.id}
                    onLongPress={canRemove ? () => handleMemberLongPress(member) : undefined}
                    delayLongPress={400}
                    style={({ pressed }) => [
                      styles.memberRow,
                      { backgroundColor: theme.colors.surfaceVariant },
                      pressed && canRemove && styles.memberRowPressed,
                    ]}
                  >
                    {/* Avatar */}
                    <View style={[
                      styles.avatar,
                      { backgroundColor: isMemberOrganizer ? theme.colors.primary : "#334155" },
                    ]}>
                      <Text style={styles.avatarText}>{initial}</Text>
                    </View>

                    {/* Name + role */}
                    <View style={styles.memberInfo}>
                      <Text style={[styles.memberName, { color: theme.colors.onBackground }]} numberOfLines={1}>
                        {member.username || "Unknown"}
                        {isCurrentUser ? " (You)" : ""}
                      </Text>
                      {isMemberOrganizer && (
                        <Text style={[styles.roleTag, { color: theme.colors.primary }]}>Host</Text>
                      )}
                    </View>

                    {/* Vote status (if enabled) */}
                    {showVoteStatus && member.has_voted && (
                      <Icon name="check-circle" size={18} color="#22c55e" />
                    )}

                    {/* Add friend */}
                    {!isCurrentUser && !friendIds.has(member.user_id) && !sentRequestIds.has(member.user_id) && (
                      <TouchableOpacity
                        style={[styles.addFriendButton, { backgroundColor: `${theme.colors.primary}15` }]}
                        onPress={() => handleAddFriend(member.user_id, member.username || "this member")}
                        disabled={sendingRequest === member.user_id}
                        hitSlop={6}
                      >
                        {sendingRequest === member.user_id ? (
                          <ActivityIndicator size="small" color={theme.colors.primary} />
                        ) : (
                          <Icon name="person-add" size={15} color={theme.colors.primary} />
                        )}
                      </TouchableOpacity>
                    )}
                    {!isCurrentUser && sentRequestIds.has(member.user_id) && (
                      <View style={[styles.sentBadge, { backgroundColor: "#22c55e20" }]}>
                        <Icon name="check" size={13} color="#22c55e" />
                        <Text style={styles.sentBadgeText}>Sent</Text>
                      </View>
                    )}

                    {/* Long-press hint for host */}
                    {canRemove && (
                      <Icon name="more-horiz" size={18} color={theme.colors.onSurfaceVariant} style={styles.moreIcon} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* ── Leave button (non-hosts) ── */}
            {!isOrganizer && (
              <TouchableOpacity
                style={[styles.leaveButton, { backgroundColor: "rgba(239,68,68,0.08)" }]}
                onPress={handleLeaveDecision}
                activeOpacity={0.75}
              >
                <Icon name="logout" size={18} color={theme.colors.error} />
                <Text style={[styles.leaveButtonText, { color: theme.colors.error }]}>
                  Leave decision
                </Text>
              </TouchableOpacity>
            )}

            {/* ── Close ── */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={[styles.closeButtonText, { color: theme.colors.onSurfaceVariant }]}>
                Close
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Invite People Modal ── */}
      {!!currentUserId && (
        <InvitePeopleModal
          visible={showInvite}
          onClose={() => setShowInvite(false)}
          decisionId={decisionId}
          currentUserId={currentUserId}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  headerButton: {
    padding: 4,
    paddingLeft: 8,
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },

  // ── Overlay / modal ──
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContainer: {
    width: "100%",
    maxWidth: 340,
    maxHeight: "80%",
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  memberCount: {
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  memberCountText: {
    fontSize: 12,
    fontWeight: "700",
  },

  // ── Invite row ──
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  inviteRowText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  inviteChevron: {
    marginLeft: "auto",
  },

  // ── Divider ──
  divider: {
    height: 1,
    marginBottom: 12,
    opacity: 0.5,
  },

  // ── Member list ──
  membersList: {
    maxHeight: 320,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 11,
    borderRadius: 10,
    marginBottom: 6,
    gap: 11,
  },
  memberRowPressed: {
    opacity: 0.65,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  memberInfo: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    fontSize: 14,
    fontWeight: "500",
  },
  roleTag: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1,
  },
  addFriendButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  sentBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 3,
  },
  sentBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#22c55e",
  },
  moreIcon: {
    marginLeft: 2,
  },

  // ── Leave ──
  leaveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 13,
    borderRadius: 10,
    marginTop: 10,
  },
  leaveButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },

  // ── Close ──
  closeButton: {
    padding: 12,
    alignItems: "center",
    marginTop: 6,
  },
  closeButtonText: {
    fontSize: 14,
  },
});

export default MembersButton;
