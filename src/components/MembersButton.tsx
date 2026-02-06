import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  ScrollView,
} from "react-native";
import { useTheme } from "react-native-paper";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { removeMember, transferOrganizer, leaveDecision } from "../lib/decisions";
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
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedMember, setSelectedMember] = useState<DecisionMember | null>(null);
  const [manageMemberVisible, setManageMemberVisible] = useState(false);

  const truncatedTitle =
    decisionTitle.length > 25
      ? decisionTitle.substring(0, 25) + "..."
      : decisionTitle;

  const handleMemberPress = (member: DecisionMember) => {
    const isCurrentUser = member.user_id === currentUserId;
    const isMemberOrganizer = member.role === "organizer";

    // If current user taps themselves and they're not the organizer, offer to leave
    if (isCurrentUser && !isOrganizer) {
      handleLeaveDecision();
      return;
    }

    // If organizer taps another member, show management options
    if (isOrganizer && !isCurrentUser) {
      setSelectedMember(member);
      setManageMemberVisible(true);
    }
  };

  const handleLeaveDecision = () => {
    Alert.alert(
      `Leave "${truncatedTitle}"?`,
      "Are you sure you want to leave this decision? You won't be able to rejoin unless invited again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              await leaveDecision(decisionId, currentUserId);
              Toast.show({
                type: "success",
                text1: "Left decision",
                position: "bottom",
              });
              setModalVisible(false);
              onLeft?.();
            } catch (err: any) {
              Toast.show({
                type: "error",
                text1: "Failed to leave",
                text2: err.message,
                position: "bottom",
              });
            }
          },
        },
      ]
    );
  };

  const handleRemoveMember = async () => {
    if (!selectedMember) return;

    Alert.alert(
      "Remove Member",
      `Are you sure you want to remove ${selectedMember.username || "this member"} from "${truncatedTitle}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await removeMember(decisionId, selectedMember.user_id);
              Toast.show({
                type: "success",
                text1: "Member removed",
                position: "bottom",
              });
              setManageMemberVisible(false);
              setSelectedMember(null);
              onMemberChanged?.();
            } catch (err: any) {
              Toast.show({
                type: "error",
                text1: "Failed to remove member",
                text2: err.message,
                position: "bottom",
              });
            }
          },
        },
      ]
    );
  };

  const handleTransferOrganizer = async () => {
    if (!selectedMember) return;

    Alert.alert(
      "Transfer Organizer Role",
      `Are you sure you want to make ${selectedMember.username || "this member"} the new organizer of "${truncatedTitle}"? You will become a regular member.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Transfer",
          onPress: async () => {
            try {
              await transferOrganizer(decisionId, selectedMember.user_id);
              Toast.show({
                type: "success",
                text1: "Organizer role transferred",
                position: "bottom",
              });
              setManageMemberVisible(false);
              setSelectedMember(null);
              onMemberChanged?.();
            } catch (err: any) {
              Toast.show({
                type: "error",
                text1: "Failed to transfer role",
                text2: err.message,
                position: "bottom",
              });
            }
          },
        },
      ]
    );
  };

  return (
    <>
      {/* Header Button */}
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => setModalVisible(true)}
      >
        <Icon name="group" size={24} color={theme.colors.onSurfaceVariant} />
        <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
          <Text style={styles.badgeText}>{members.length}</Text>
        </View>
      </TouchableOpacity>

      {/* Members Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View
            style={[
              styles.modalContainer,
              { backgroundColor: theme.colors.surface },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <Text
              style={[styles.modalTitle, { color: theme.colors.onBackground }]}
            >
              Members ({members.length})
            </Text>

            <ScrollView style={styles.membersList}>
              {members.map((member) => {
                const initial = member.username
                  ? member.username.charAt(0).toUpperCase()
                  : "?";
                const isMemberOrganizer = member.role === "organizer";
                const isCurrentUser = member.user_id === currentUserId;
                const canTap = (isOrganizer && !isCurrentUser) || (isCurrentUser && !isOrganizer);

                return (
                  <TouchableOpacity
                    key={member.id}
                    style={[
                      styles.memberRow,
                      { backgroundColor: theme.colors.surfaceVariant },
                    ]}
                    onPress={() => handleMemberPress(member)}
                    disabled={!canTap}
                  >
                    <View
                      style={[
                        styles.avatar,
                        {
                          backgroundColor: isMemberOrganizer
                            ? theme.colors.primary
                            : theme.colors.onSurfaceVariant,
                        },
                      ]}
                    >
                      <Text style={styles.avatarText}>{initial}</Text>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text
                        style={[
                          styles.memberName,
                          { color: theme.colors.onBackground },
                        ]}
                      >
                        {member.username || "Unknown"}
                        {isCurrentUser && " (You)"}
                      </Text>
                      {isMemberOrganizer && (
                        <Text
                          style={[styles.roleTag, { color: theme.colors.primary }]}
                        >
                          Host
                        </Text>
                      )}
                    </View>
                    {showVoteStatus && member.has_voted && (
                      <Icon name="check-circle" size={20} color="#22c55e" />
                    )}
                    {canTap && (
                      <Icon
                        name="chevron-right"
                        size={20}
                        color={theme.colors.onSurfaceVariant}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Leave button for non-organizers */}
            {!isOrganizer && (
              <TouchableOpacity
                style={[
                  styles.leaveButton,
                  { backgroundColor: "rgba(239, 68, 68, 0.1)" },
                ]}
                onPress={handleLeaveDecision}
              >
                <Icon name="logout" size={20} color={theme.colors.error} />
                <Text
                  style={[styles.leaveButtonText, { color: theme.colors.error }]}
                >
                  Leave "{truncatedTitle}"
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}
            >
              <Text
                style={[
                  styles.closeButtonText,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Manage Member Modal (for organizers) */}
      <Modal
        visible={manageMemberVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setManageMemberVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setManageMemberVisible(false)}
        >
          <View
            style={[
              styles.manageContainer,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <Text
              style={[styles.manageTitle, { color: theme.colors.onBackground }]}
            >
              {selectedMember?.username || "Member"}
            </Text>

            <TouchableOpacity
              style={[
                styles.manageButton,
                { backgroundColor: theme.colors.surfaceVariant },
              ]}
              onPress={handleTransferOrganizer}
            >
              <Icon name="swap-horiz" size={20} color={theme.colors.primary} />
              <Text
                style={[
                  styles.manageButtonText,
                  { color: theme.colors.onBackground },
                ]}
              >
                Make Organizer
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.manageButton,
                { backgroundColor: "rgba(239, 68, 68, 0.1)" },
              ]}
              onPress={handleRemoveMember}
            >
              <Icon name="person-remove" size={20} color={theme.colors.error} />
              <Text
                style={[styles.manageButtonText, { color: theme.colors.error }]}
              >
                Remove from "{truncatedTitle}"
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setManageMemberVisible(false)}
            >
              <Text
                style={[
                  styles.cancelButtonText,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
    fontFamily: "Rubik_600SemiBold",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContainer: {
    width: "100%",
    maxWidth: 340,
    maxHeight: "70%",
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
    fontFamily: "Rubik_600SemiBold",
  },
  membersList: {
    maxHeight: 300,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
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
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: "500",
    fontFamily: "Rubik_500Medium",
  },
  roleTag: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  leaveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 10,
    marginTop: 8,
  },
  leaveButtonText: {
    fontSize: 15,
    fontWeight: "500",
    fontFamily: "Rubik_500Medium",
  },
  closeButton: {
    padding: 12,
    alignItems: "center",
    marginTop: 8,
  },
  closeButtonText: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
  },
  manageContainer: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  manageTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
    fontFamily: "Rubik_600SemiBold",
  },
  manageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 10,
  },
  manageButtonText: {
    fontSize: 15,
    fontWeight: "500",
    fontFamily: "Rubik_500Medium",
  },
  cancelButton: {
    padding: 12,
    alignItems: "center",
    marginTop: 4,
  },
  cancelButtonText: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
  },
});

export default MembersButton;
