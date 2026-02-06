import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  TextInput,
  ScrollView,
} from "react-native";
import { useTheme } from "react-native-paper";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { supabase } from "../lib/supabase";
import { isDemoMode } from "../lib/demoMode";
import { removeMember, transferOrganizer } from "../lib/decisions";
import type { DecisionMember } from "../types/decisions";

interface OrganizerMenuProps {
  decisionId: string;
  decisionTitle: string;
  currentPhase: "constraints" | "options" | "voting" | "locked";
  members?: DecisionMember[];
  currentUserId?: string;
  showVoteStatus?: boolean;
  onRevertToConstraints?: () => void;
  onRevertToOptions?: () => void;
  onAdvanceToOptions?: () => void;
  onAdvanceToVoting?: () => void;
  onDeleted?: () => void;
  onRenamed?: () => void;
  onMemberChanged?: () => void;
}

const OrganizerMenu: React.FC<OrganizerMenuProps> = ({
  decisionId,
  decisionTitle,
  currentPhase,
  members = [],
  currentUserId,
  showVoteStatus,
  onRevertToConstraints,
  onRevertToOptions,
  onAdvanceToOptions,
  onAdvanceToVoting,
  onDeleted,
  onRenamed,
  onMemberChanged,
}) => {
  const theme = useTheme();
  const [menuVisible, setMenuVisible] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  const [newTitle, setNewTitle] = useState(decisionTitle);
  const [membersVisible, setMembersVisible] = useState(false);
  const [selectedMember, setSelectedMember] = useState<DecisionMember | null>(null);
  const [manageMemberVisible, setManageMemberVisible] = useState(false);

  const truncatedTitle =
    decisionTitle.length > 25
      ? decisionTitle.substring(0, 25) + "..."
      : decisionTitle;

  const handleMemberPress = (member: DecisionMember) => {
    if (member.user_id === currentUserId) return; // Can't manage yourself
    setSelectedMember(member);
    setManageMemberVisible(true);
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
              setManageMemberVisible(false);
              setMembersVisible(false);
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

  const handleDeleteDecision = () => {
    setMenuVisible(false);
    Alert.alert(
      "Delete Decision",
      "Are you sure you want to permanently delete this decision? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (isDemoMode()) {
                Toast.show({
                  type: "info",
                  text1: "Demo mode",
                  text2: "Cannot delete in demo mode",
                  position: "bottom",
                });
                return;
              }

              const { error } = await supabase
                .from("decisions")
                .delete()
                .eq("id", decisionId);

              if (error) throw error;

              Toast.show({
                type: "success",
                text1: "Decision deleted",
                position: "bottom",
              });
              onDeleted?.();
            } catch (err: any) {
              Toast.show({
                type: "error",
                text1: "Failed to delete",
                text2: err.message,
                position: "bottom",
              });
            }
          },
        },
      ]
    );
  };

  const handleRename = async () => {
    if (!newTitle.trim() || newTitle === decisionTitle) {
      setRenameVisible(false);
      return;
    }

    try {
      if (isDemoMode()) {
        Toast.show({
          type: "info",
          text1: "Demo mode",
          text2: "Cannot rename in demo mode",
          position: "bottom",
        });
        setRenameVisible(false);
        return;
      }

      const { error } = await supabase
        .from("decisions")
        .update({ title: newTitle.trim() })
        .eq("id", decisionId);

      if (error) throw error;

      Toast.show({
        type: "success",
        text1: "Decision renamed",
        position: "bottom",
      });
      setRenameVisible(false);
      onRenamed?.();
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Failed to rename",
        text2: err.message,
        position: "bottom",
      });
    }
  };

  const handleAdvanceToOptions = () => {
    setMenuVisible(false);
    Alert.alert(
      "Open for Options?",
      "This will move the decision to the options phase. Members will be able to submit options based on the constraints set.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: () => onAdvanceToOptions?.(),
        },
      ]
    );
  };

  const handleAdvanceToVoting = () => {
    setMenuVisible(false);
    Alert.alert(
      "Start Voting?",
      "This will move the decision to the voting phase. No more options can be added after this point.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start Voting",
          onPress: () => onAdvanceToVoting?.(),
        },
      ]
    );
  };

  const menuItems = [
    {
      icon: "group" as const,
      label: `Members (${members.length})`,
      onPress: () => {
        setMenuVisible(false);
        setMembersVisible(true);
      },
    },
    {
      icon: "edit" as const,
      label: `Rename "${truncatedTitle}"`,
      onPress: () => {
        setMenuVisible(false);
        setNewTitle(decisionTitle);
        setRenameVisible(true);
      },
    },
    ...(currentPhase === "constraints"
      ? [
          {
            icon: "arrow-forward" as const,
            label: "Open for Options",
            onPress: handleAdvanceToOptions,
          },
        ]
      : []),
    ...(currentPhase === "options"
      ? [
          {
            icon: "how-to-vote" as const,
            label: "Start Voting",
            onPress: handleAdvanceToVoting,
          },
        ]
      : []),
    ...(currentPhase === "options" || currentPhase === "voting"
      ? [
          {
            icon: "replay" as const,
            label: "Back to Constraints",
            onPress: () => {
              setMenuVisible(false);
              onRevertToConstraints?.();
            },
            color: theme.colors.error,
          },
        ]
      : []),
    ...(currentPhase === "voting"
      ? [
          {
            icon: "undo" as const,
            label: "Back to Options",
            onPress: () => {
              setMenuVisible(false);
              onRevertToOptions?.();
            },
            color: theme.colors.error,
          },
        ]
      : []),
    {
      icon: "delete" as const,
      label: `Delete "${truncatedTitle}"`,
      onPress: handleDeleteDecision,
      color: theme.colors.error,
    },
  ];

  return (
    <>
      <TouchableOpacity
        style={styles.menuButton}
        onPress={() => setMenuVisible(true)}
      >
        <Icon name="more-vert" size={24} color={theme.colors.onSurfaceVariant} />
      </TouchableOpacity>

      {/* Menu Modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View
            style={[
              styles.menuContainer,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <Text
              style={[styles.menuTitle, { color: theme.colors.onSurfaceVariant }]}
            >
              Organizer Options
            </Text>
            {menuItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.menuItem}
                onPress={item.onPress}
              >
                <Icon
                  name={item.icon}
                  size={20}
                  color={item.color || theme.colors.onBackground}
                />
                <Text
                  style={[
                    styles.menuItemText,
                    { color: item.color || theme.colors.onBackground },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Rename Modal */}
      <Modal
        visible={renameVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setRenameVisible(false)}
        >
          <View
            style={[
              styles.renameContainer,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <Text
              style={[styles.renameTitle, { color: theme.colors.onBackground }]}
            >
              Rename Decision
            </Text>
            <TextInput
              style={[
                styles.renameInput,
                {
                  backgroundColor: theme.colors.surfaceVariant,
                  color: theme.colors.onBackground,
                },
              ]}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Enter new title"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              autoFocus
            />
            <View style={styles.renameButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setRenameVisible(false)}
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
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  { backgroundColor: theme.colors.primary },
                ]}
                onPress={handleRename}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Members Modal */}
      <Modal
        visible={membersVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMembersVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setMembersVisible(false)}
        >
          <View
            style={[
              styles.membersContainer,
              { backgroundColor: theme.colors.surface },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <Text
              style={[styles.membersTitle, { color: theme.colors.onBackground }]}
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
                const canTap = !isCurrentUser;

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

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setMembersVisible(false)}
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

      {/* Manage Member Modal */}
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
              style={styles.manageCancelButton}
              onPress={() => setManageMemberVisible(false)}
            >
              <Text
                style={[
                  styles.manageCancelButtonText,
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
  menuButton: {
    padding: 4,
    paddingRight: 12,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  menuContainer: {
    width: "100%",
    maxWidth: 300,
    borderRadius: 12,
    padding: 8,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  menuTitle: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: "Rubik_500Medium",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  menuItemText: {
    fontSize: 15,
    fontFamily: "Rubik_400Regular",
  },
  renameContainer: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 16,
    padding: 20,
  },
  renameTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
    fontFamily: "Rubik_600SemiBold",
  },
  renameInput: {
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    fontFamily: "Rubik_400Regular",
    marginBottom: 16,
  },
  renameButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelButtonText: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
  },
  saveButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  membersContainer: {
    width: "100%",
    maxWidth: 340,
    maxHeight: "70%",
    borderRadius: 16,
    padding: 20,
  },
  membersTitle: {
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
  manageCancelButton: {
    padding: 12,
    alignItems: "center",
    marginTop: 4,
  },
  manageCancelButtonText: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
  },
});

export default OrganizerMenu;
