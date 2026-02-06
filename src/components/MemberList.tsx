import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert } from "react-native";
import { useTheme } from "react-native-paper";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { removeMember, transferOrganizer } from "../lib/decisions";
import type { DecisionMember } from "../types/decisions";

interface MemberListProps {
  members: DecisionMember[];
  showVoteStatus?: boolean;
  isOrganizer?: boolean;
  currentUserId?: string;
  decisionId?: string;
  onMemberChanged?: () => void;
}

const MemberList: React.FC<MemberListProps> = ({
  members,
  showVoteStatus,
  isOrganizer,
  currentUserId,
  decisionId,
  onMemberChanged,
}) => {
  const theme = useTheme();
  const [selectedMember, setSelectedMember] = useState<DecisionMember | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const handleMemberPress = (member: DecisionMember) => {
    if (!isOrganizer || member.user_id === currentUserId) return;
    setSelectedMember(member);
    setModalVisible(true);
  };

  const handleRemoveMember = async () => {
    if (!selectedMember || !decisionId) return;

    Alert.alert(
      "Remove Member",
      `Are you sure you want to remove ${selectedMember.username || "this member"} from the decision?`,
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
              setModalVisible(false);
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
    if (!selectedMember || !decisionId) return;

    Alert.alert(
      "Transfer Organizer Role",
      `Are you sure you want to make ${selectedMember.username || "this member"} the new organizer? You will become a regular member.`,
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
              setModalVisible(false);
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
    <View style={styles.container}>
      <Text
        style={[styles.label, { color: theme.colors.onSurfaceVariant }]}
      >
        Members ({members.length})
        {isOrganizer && (
          <Text style={styles.hint}> — Tap to manage</Text>
        )}
      </Text>
      <View style={styles.avatarRow}>
        {members.map((member) => {
          const initial = member.username
            ? member.username.charAt(0).toUpperCase()
            : "?";
          const isMemberOrganizer = member.role === "organizer";
          const isCurrentUser = member.user_id === currentUserId;

          return (
            <TouchableOpacity
              key={member.id}
              style={styles.avatarContainer}
              onPress={() => handleMemberPress(member)}
              disabled={!isOrganizer || isCurrentUser}
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
              {showVoteStatus && member.has_voted && (
                <View style={styles.checkBadge}>
                  <Icon name="check-circle" size={14} color="#22c55e" />
                </View>
              )}
              <Text
                style={[
                  styles.memberName,
                  { color: theme.colors.onSurfaceVariant },
                ]}
                numberOfLines={1}
              >
                {member.username || "Unknown"}
              </Text>
              {isMemberOrganizer && (
                <Text style={[styles.roleTag, { color: theme.colors.primary }]}>
                  Host
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Member management modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <Text
              style={[styles.modalTitle, { color: theme.colors.onBackground }]}
            >
              {selectedMember?.username || "Member"}
            </Text>

            <TouchableOpacity
              style={[
                styles.modalButton,
                { backgroundColor: theme.colors.surfaceVariant },
              ]}
              onPress={handleTransferOrganizer}
            >
              <Icon name="swap-horiz" size={20} color={theme.colors.primary} />
              <Text
                style={[
                  styles.modalButtonText,
                  { color: theme.colors.onBackground },
                ]}
              >
                Make Organizer
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modalButton,
                { backgroundColor: "rgba(239, 68, 68, 0.1)" },
              ]}
              onPress={handleRemoveMember}
            >
              <Icon name="person-remove" size={20} color={theme.colors.error} />
              <Text
                style={[styles.modalButtonText, { color: theme.colors.error }]}
              >
                Remove from Decision
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setModalVisible(false)}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    fontFamily: "Rubik_500Medium",
  },
  hint: {
    fontSize: 11,
    fontWeight: "400",
    textTransform: "none",
    letterSpacing: 0,
  },
  avatarRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  avatarContainer: {
    alignItems: "center",
    width: 52,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  checkBadge: {
    position: "absolute",
    top: -2,
    right: 4,
  },
  memberName: {
    fontSize: 10,
    marginTop: 2,
    fontFamily: "Rubik_400Regular",
  },
  roleTag: {
    fontSize: 9,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
    fontFamily: "Rubik_600SemiBold",
  },
  modalButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 10,
  },
  modalButtonText: {
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

export default MemberList;
