import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import Toast from "react-native-toast-message";
import { MaterialIcons } from "@expo/vector-icons";
import { searchUsers } from "../lib/friends";
import {
  createInviteGroup,
  renameInviteGroup,
  deleteInviteGroup,
  addGroupMember,
  removeGroupMember,
} from "../lib/inviteGroups";
import type { InviteGroup, GroupMember } from "../lib/inviteGroups";

// ─────────────────────────────────────────────────────────────────────────────

interface GroupEditModalProps {
  visible:   boolean;
  onClose:   () => void;
  /** null = new-group mode; non-null = edit existing group */
  group:     InviteGroup | null;
  currentUserId: string;
  onSaved:   (group: InviteGroup) => void;
  onDeleted: (groupId: string) => void;
}

type SearchUser = { id: string; username: string; email: string; isFriend: boolean };

// ─────────────────────────────────────────────────────────────────────────────

export default function GroupEditModal({
  visible,
  onClose,
  group,
  currentUserId,
  onSaved,
  onDeleted,
}: GroupEditModalProps) {
  const isNew = group === null;

  // ── Name ─────────────────────────────────────────────────────────────────────
  const [nameText,  setNameText]  = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  // ── Members ──────────────────────────────────────────────────────────────────
  // In new-group mode: accumulated locally; committed in one batch on Create.
  // In edit mode:      mutations hit the API immediately.
  const [localMembers, setLocalMembers] = useState<GroupMember[]>([]);
  const [removingId,   setRemovingId]   = useState<string | null>(null);

  // ── Add-member search ─────────────────────────────────────────────────────────
  const [showAddMember,    setShowAddMember]    = useState(false);
  const [addQuery,         setAddQuery]         = useState("");
  const [addResults,       setAddResults]       = useState<SearchUser[]>([]);
  const [addSearching,     setAddSearching]     = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Save state ────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);

  // ── Reset on open ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    setNameText(group?.name ?? "");
    setNameError(null);
    setLocalMembers(group?.members ?? []);
    setRemovingId(null);
    setShowAddMember(false);
    setAddQuery("");
    setAddResults([]);
    setSaving(false);
  }, [visible, group]);

  // ── Add-member debounced search ───────────────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setAddResults([]); return; }
    setAddSearching(true);
    try {
      const found = await searchUsers(q, currentUserId);
      // Exclude already-added members and self
      const excluded = new Set([currentUserId, ...localMembers.map((m) => m.id)]);
      setAddResults(found.filter((u) => !excluded.has(u.id)));
    } catch {
      setAddResults([]);
    } finally {
      setAddSearching(false);
    }
  }, [currentUserId, localMembers]);

  function handleAddQueryChange(text: string) {
    setAddQuery(text);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => runSearch(text), 300);
  }

  // ── Add member ────────────────────────────────────────────────────────────────
  async function handleSelectMember(user: SearchUser) {
    const member: GroupMember = { id: user.id, username: user.username, email: user.email };

    if (isNew) {
      // Accumulate locally; commit on Create
      setLocalMembers((prev) => [...prev, member]);
    } else {
      // Commit immediately in edit mode
      try {
        await addGroupMember(group!.id, user.id);
        const updated = [...localMembers, member];
        setLocalMembers(updated);
        onSaved({ ...group!, name: nameText.trim() || group!.name, members: updated, memberCount: updated.length });
      } catch (e: any) {
        Toast.show({ type: "error", text1: e?.message ?? "Failed to add member", position: "bottom" });
        return;
      }
    }
    setAddQuery("");
    setAddResults([]);
    setShowAddMember(false);
  }

  // ── Remove member ─────────────────────────────────────────────────────────────
  async function handleRemoveMember(memberId: string) {
    if (removingId) return;

    if (isNew) {
      setLocalMembers((prev) => prev.filter((m) => m.id !== memberId));
      return;
    }

    setRemovingId(memberId);
    try {
      await removeGroupMember(group!.id, memberId);
      const updated = localMembers.filter((m) => m.id !== memberId);
      setLocalMembers(updated);
      onSaved({ ...group!, name: nameText.trim() || group!.name, members: updated, memberCount: updated.length });
    } catch (e: any) {
      Toast.show({ type: "error", text1: e?.message ?? "Failed to remove member", position: "bottom" });
    } finally {
      setRemovingId(null);
    }
  }

  // ── Create (new-group mode) ───────────────────────────────────────────────────
  async function handleCreate() {
    const trimmed = nameText.trim();
    if (!trimmed) { setNameError("Name is required"); return; }
    setSaving(true);
    setNameError(null);
    try {
      const created = await createInviteGroup(trimmed);
      if (localMembers.length > 0) {
        await Promise.all(localMembers.map((m) => addGroupMember(created.id, m.id)));
      }
      onSaved({ ...created, members: localMembers, memberCount: localMembers.length });
      onClose();
    } catch (e: any) {
      setNameError(e?.message ?? "Failed to create group");
    } finally {
      setSaving(false);
    }
  }

  // ── Rename (edit mode) ────────────────────────────────────────────────────────
  async function handleSaveRename() {
    if (!group) return;
    const trimmed = nameText.trim();
    if (!trimmed) { setNameError("Name is required"); return; }
    if (trimmed === group.name) { onClose(); return; }
    setSaving(true);
    setNameError(null);
    try {
      await renameInviteGroup(group.id, trimmed);
      onSaved({ ...group, name: trimmed, members: localMembers, memberCount: localMembers.length });
      onClose();
    } catch (e: any) {
      setNameError(e?.message ?? "Failed to rename group");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete (edit mode) ────────────────────────────────────────────────────────
  function handleDelete() {
    if (!group) return;
    Alert.alert(
      "Delete group",
      `Delete "${group.name}"? This won't affect any existing invites.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteInviteGroup(group.id);
              onDeleted(group.id);
              onClose();
            } catch (e: any) {
              Toast.show({ type: "error", text1: e?.message ?? "Failed to delete", position: "bottom" });
            }
          },
        },
      ]
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.kavWrapper}
        >
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>

            {/* ── Header ── */}
            <View style={styles.header}>
              <Text style={styles.title}>{isNew ? "New Group" : "Edit Group"}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={10}>
                <MaterialIcons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
            >

              {/* ── Name input ── */}
              <Text style={styles.fieldLabel}>Group name</Text>
              <TextInput
                style={[styles.nameInput, nameError && styles.nameInputError]}
                placeholder="e.g. Friday Crew, Family, Work Lunch"
                placeholderTextColor="#3d5068"
                value={nameText}
                onChangeText={(t) => { setNameText(t); if (nameError) setNameError(null); }}
                maxLength={50}
                returnKeyType="done"
                autoCapitalize="words"
              />
              {nameError && <Text style={styles.fieldError}>{nameError}</Text>}

              {/* ── Members list ── */}
              <View style={styles.membersHeader}>
                <Text style={styles.fieldLabel}>
                  {localMembers.length === 0
                    ? "People"
                    : `People · ${localMembers.length}`}
                </Text>
              </View>

              {localMembers.length === 0 ? (
                <Text style={styles.emptyMembers}>
                  No one added yet — use the button below to add people.
                </Text>
              ) : (
                localMembers.map((m) => (
                  <View key={m.id} style={styles.memberRow}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>
                        {m.username.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.memberName} numberOfLines={1}>{m.username}</Text>
                    <TouchableOpacity
                      onPress={() => handleRemoveMember(m.id)}
                      disabled={removingId === m.id}
                      hitSlop={8}
                      style={styles.removeBtn}
                    >
                      {removingId === m.id ? (
                        <ActivityIndicator size="small" color="#475569" />
                      ) : (
                        <MaterialIcons name="close" size={15} color="#475569" />
                      )}
                    </TouchableOpacity>
                  </View>
                ))
              )}

              {/* ── Add member toggle ── */}
              {!showAddMember ? (
                <TouchableOpacity
                  style={styles.addMemberTrigger}
                  onPress={() => setShowAddMember(true)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="person-add" size={15} color="#6366f1" />
                  <Text style={styles.addMemberTriggerText}>Add person</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.addMemberSearch}>
                  <View style={styles.searchWrap}>
                    <MaterialIcons name="search" size={16} color="#475569" />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Username or email…"
                      placeholderTextColor="#3d5068"
                      value={addQuery}
                      onChangeText={handleAddQueryChange}
                      autoFocus
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="search"
                    />
                    <TouchableOpacity
                      onPress={() => { setShowAddMember(false); setAddQuery(""); setAddResults([]); }}
                      hitSlop={8}
                    >
                      <MaterialIcons name="close" size={16} color="#475569" />
                    </TouchableOpacity>
                  </View>

                  {addSearching ? (
                    <ActivityIndicator size="small" color="#818cf8" style={styles.searchSpinner} />
                  ) : addResults.length > 0 ? (
                    addResults.slice(0, 6).map((u) => (
                      <TouchableOpacity
                        key={u.id}
                        style={styles.searchResultRow}
                        onPress={() => handleSelectMember(u)}
                        activeOpacity={0.75}
                      >
                        <View style={styles.memberAvatar}>
                          <Text style={styles.memberAvatarText}>
                            {u.username.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.searchResultInfo}>
                          <Text style={styles.memberName}>{u.username}</Text>
                          {u.isFriend && <Text style={styles.friendTag}>Friend</Text>}
                        </View>
                        <MaterialIcons name="add" size={18} color="#818cf8" />
                      </TouchableOpacity>
                    ))
                  ) : addQuery.trim() ? (
                    <Text style={styles.noSearchResults}>No users found</Text>
                  ) : null}
                </View>
              )}

            </ScrollView>

            {/* ── Footer actions ── */}
            <View style={styles.footer}>
              {isNew ? (
                <TouchableOpacity
                  style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
                  onPress={handleCreate}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Create group</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
                    onPress={handleSaveRename}
                    disabled={saving}
                    activeOpacity={0.8}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Save</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={handleDelete}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.deleteBtnText}>Delete group</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

          </View>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  kavWrapper: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#111827",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    maxHeight: "85%",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#f1f5f9",
    letterSpacing: -0.2,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 6,
  },

  // ── Name ──
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 4,
  },
  nameInput: {
    backgroundColor: "#1e293b",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#f1f5f9",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  nameInputError: {
    borderColor: "rgba(248,113,113,0.4)",
  },
  fieldError: {
    fontSize: 12,
    color: "#f87171",
    marginTop: 4,
  },

  // ── Members ──
  membersHeader: {
    marginTop: 18,
    marginBottom: 2,
  },
  emptyMembers: {
    fontSize: 13,
    color: "#334155",
    marginBottom: 8,
    lineHeight: 18,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 10,
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#312e81",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  memberAvatarText: {
    color: "#a5b4fc",
    fontSize: 13,
    fontWeight: "700",
  },
  memberName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#cbd5e1",
  },
  removeBtn: {
    padding: 4,
  },

  // ── Add member ──
  addMemberTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
  },
  addMemberTriggerText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6366f1",
  },
  addMemberSearch: {
    marginTop: 8,
    gap: 4,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    color: "#f1f5f9",
    fontSize: 14,
  },
  searchSpinner: {
    marginVertical: 8,
    alignSelf: "center",
  },
  searchResultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 10,
  },
  searchResultInfo: {
    flex: 1,
    minWidth: 0,
  },
  friendTag: {
    fontSize: 11,
    color: "#818cf8",
    marginTop: 1,
  },
  noSearchResults: {
    fontSize: 13,
    color: "#334155",
    marginVertical: 8,
    textAlign: "center",
  },

  // ── Footer ──
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: "#4f46e5",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  deleteBtn: {
    alignItems: "center",
    paddingVertical: 8,
  },
  deleteBtnText: {
    color: "#f87171",
    fontSize: 14,
    fontWeight: "500",
  },
});
