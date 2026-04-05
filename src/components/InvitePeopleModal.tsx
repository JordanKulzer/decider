import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  SectionList,
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import Toast from "react-native-toast-message";
import { MaterialIcons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { searchInviteTargets, sendDecisionInvite, getRecentCollaborators } from "../lib/decisionInvites";
import { getInvitableFriends } from "../lib/friends";
import { fetchInviteGroups, bulkInviteGroup } from "../lib/inviteGroups";
import GroupEditModal from "./GroupEditModal";
import type { InviteTarget } from "../lib/decisionInvites";
import type { InviteGroup } from "../lib/inviteGroups";

// ─────────────────────────────────────────────────────────────────────────────

interface InvitePeopleModalProps {
  visible: boolean;
  onClose: () => void;
  decisionId: string;
  currentUserId: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function InvitePeopleModal({
  visible,
  onClose,
  decisionId,
  currentUserId,
}: InvitePeopleModalProps) {
  const [query,          setQuery]          = useState("");
  const [results,        setResults]        = useState<InviteTarget[]>([]);
  const [searching,      setSearching]      = useState(false);
  const [searchError,    setSearchError]    = useState<string | null>(null);
  // Tracks ids that have been invited during this modal session (optimistic)
  const [invitedIds,     setInvitedIds]     = useState<Set<string>>(new Set());
  const [sendingId,      setSendingId]      = useState<string | null>(null);
  const [friends,        setFriends]        = useState<InviteTarget[]>([]);
  const [recents,        setRecents]        = useState<InviteTarget[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [selfInfo,       setSelfInfo]       = useState<{ username: string; email: string } | null>(null);
  // ── Groups ──
  const [groups,         setGroups]         = useState<InviteGroup[] | null>(null);
  const [bulkInvitingId, setBulkInvitingId] = useState<string | null>(null);
  const [showGroupEdit,  setShowGroupEdit]  = useState(false);
  const [editingGroup,   setEditingGroup]   = useState<InviteGroup | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when modal closes; load friends + self profile when it opens
  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      setSearchError(null);
      setInvitedIds(new Set());
      setSendingId(null);
      setFriends([]);
      setRecents([]);
      setSelfInfo(null);
      setGroups(null);
      setBulkInvitingId(null);
      return;
    }
    setFriendsLoading(true);
    Promise.all([
      getInvitableFriends(currentUserId, decisionId),
      fetchInviteGroups(),
      supabase
        .from("users")
        .select("username, email")
        .eq("id", currentUserId)
        .single()
        .then(({ data }) => data),
    ])
      .then(async ([list, groupList, self]) => {
        const mappedFriends: InviteTarget[] = list.map((f) => ({
          id:       f.friend_id,
          username: f.friend_username ?? "Unknown",
          email:    f.friend_email ?? "",
          isFriend: true,
          status:   "none" as const,
        }));
        setFriends(mappedFriends);
        setGroups(groupList);
        if (self) setSelfInfo({ username: self.username, email: self.email ?? "" });

        // Fetch recents excluding current user + friends (avoid duplicates)
        const friendIdSet = new Set([currentUserId, ...mappedFriends.map((f) => f.id)]);
        try {
          const recentList = await getRecentCollaborators(currentUserId, decisionId, friendIdSet);
          setRecents(recentList);
        } catch {
          setRecents([]);
        }
      })
      .catch(() => { setFriends([]); setRecents([]); setGroups([]); })
      .finally(() => setFriendsLoading(false));
  }, [visible, currentUserId, decisionId]);

  // Debounced search
  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const found = await searchInviteTargets(decisionId, q, currentUserId);
      setResults(found);
    } catch (e: any) {
      setSearchError("Search failed — check your connection.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [decisionId, currentUserId]);

  function handleQueryChange(text: string) {
    setQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => runSearch(text), 300);
  }

  async function handleInvite(target: InviteTarget) {
    if (sendingId) return;
    setSendingId(target.id);
    try {
      await sendDecisionInvite(decisionId, target.id);
      // Only update UI state after confirmed server success
      setInvitedIds((prev) => new Set([...prev, target.id]));
    } catch (e: any) {
      const msg: string = e?.message ?? "";
      const friendlyMsg =
        msg.includes("organizer")        ? "Only the organizer can send invites" :
        msg.includes("already a member") ? "User is already in this decision" :
        msg.includes("locked")           ? "This decision is closed" :
                                           "Failed to send invite";
      Toast.show({ type: "error", text1: friendlyMsg, position: "bottom", visibilityTime: 3000 });
    } finally {
      setSendingId(null);
    }
  }

  // ── Bulk invite a saved group ────────────────────────────────────────────────
  async function handleBulkInvite(group: InviteGroup) {
    if (bulkInvitingId) return;
    setBulkInvitingId(group.id);
    try {
      const result = await bulkInviteGroup(decisionId, group.id);
      // Mark all group members as invited in local state (optimistic)
      if (result.invitedIds.length > 0) {
        setInvitedIds((prev) => new Set([...prev, ...result.invitedIds]));
      }
      const parts: string[] = [];
      if (result.invited > 0)        parts.push(`${result.invited} invited`);
      if (result.alreadyMember > 0)  parts.push(`${result.alreadyMember} already in plan`);
      if (result.alreadyInvited > 0) parts.push(`${result.alreadyInvited} already invited`);

      Toast.show({
        type:            result.invited > 0 ? "success" : "info",
        text1:           result.invited > 0 ? `Invited from ${group.name}` : group.name,
        text2:           parts.join(" · ") || "No one to invite",
        position:        "bottom",
        visibilityTime:  3500,
      });
    } catch (e: any) {
      Toast.show({
        type: "error",
        text1: "Bulk invite failed",
        text2: e?.message ?? "Please try again",
        position: "bottom",
      });
    } finally {
      setBulkInvitingId(null);
    }
  }

  // ── Groups section (rendered as ListHeaderComponent) ─────────────────────────
  function renderGroupsSection() {
    const hasGroups = groups !== null && groups.length > 0;

    return (
      <View>
        <View style={styles.sectionHeaderWithAction}>
          <Text style={styles.sectionLabel}>GROUPS</Text>
          <TouchableOpacity
            style={styles.sectionNewBtn}
            onPress={() => { setEditingGroup(null); setShowGroupEdit(true); }}
            hitSlop={8}
          >
            <MaterialIcons name="add" size={14} color="#6366f1" />
            <Text style={styles.sectionNewBtnText}>New</Text>
          </TouchableOpacity>
        </View>

        {groups === null ? (
          <ActivityIndicator
            size="small"
            color="#334155"
            style={{ marginLeft: 20, marginVertical: 10, alignSelf: "flex-start" }}
          />
        ) : !hasGroups ? (
          <TouchableOpacity
            style={styles.createGroupPrompt}
            onPress={() => { setEditingGroup(null); setShowGroupEdit(true); }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="group-add" size={15} color="#334155" />
            <Text style={styles.createGroupPromptText}>Save a group for quick inviting</Text>
          </TouchableOpacity>
        ) : (
          groups.map((group) => (
            <View key={group.id} style={styles.groupRow}>
              <View style={styles.groupRowInfo}>
                <View style={styles.groupIconWrap}>
                  <MaterialIcons name="group" size={15} color="#818cf8" />
                </View>
                <View>
                  <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
                  <Text style={styles.groupMeta}>
                    {group.memberCount === 0
                      ? "No members"
                      : `${group.memberCount} ${group.memberCount === 1 ? "person" : "people"}`}
                  </Text>
                </View>
              </View>
              <View style={styles.groupRowActions}>
                {group.memberCount > 0 && (
                  <TouchableOpacity
                    style={[
                      styles.inviteAllBtn,
                      bulkInvitingId === group.id && styles.inviteAllBtnDisabled,
                    ]}
                    onPress={() => handleBulkInvite(group)}
                    disabled={bulkInvitingId !== null}
                    activeOpacity={0.75}
                  >
                    {bulkInvitingId === group.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.inviteAllBtnText}>Invite all</Text>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => { setEditingGroup(group); setShowGroupEdit(true); }}
                  hitSlop={8}
                  style={styles.editGroupBtn}
                >
                  <MaterialIcons name="edit" size={14} color="#475569" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {/* Separator before friends/recents */}
        {(friends.length > 0 || recents.length > 0) && (
          <View style={styles.groupsSeparator} />
        )}
      </View>
    );
  }

  // ── Derived status for a result item ─────────────────────────────────────────
  function effectiveStatus(item: InviteTarget): "member" | "invited" | "none" {
    if (item.status === "member") return "member";
    if (item.status === "invited" || invitedIds.has(item.id)) return "invited";
    return "none";
  }

  // ── Render one result row ────────────────────────────────────────────────────
  function renderItem({ item }: { item: InviteTarget }) {
    const status   = effectiveStatus(item);
    const isSending = sendingId === item.id;
    const initial  = item.username.charAt(0).toUpperCase();

    return (
      <View style={styles.resultRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>

        <View style={styles.userInfo}>
          <Text style={styles.username} numberOfLines={1}>{item.username}</Text>
          {item.isFriend && status !== "member" && (
            <Text style={styles.friendTag}>Friend</Text>
          )}
        </View>

        {status === "member" ? (
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>Joined</Text>
          </View>
        ) : status === "invited" ? (
          <View style={[styles.statusBadge, styles.invitedBadge]}>
            <MaterialIcons name="check" size={12} color="#86efac" />
            <Text style={[styles.statusBadgeText, styles.invitedBadgeText]}>Invited</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.inviteBtn, isSending && styles.inviteBtnDisabled]}
            onPress={() => handleInvite(item)}
            disabled={isSending || !!sendingId}
            activeOpacity={0.75}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.inviteBtnText}>Invite</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ── Self-search detection ────────────────────────────────────────────────────
  // Returns true if the query looks like it's targeting the current user.
  // Mirrors the ilike.%query% pattern used by searchUsers so the detection
  // fires whenever the DB would have matched the user before the .neq exclusion.
  function looksLikeSelf(q: string): boolean {
    if (!selfInfo || !q.trim()) return false;
    const lower = q.trim().toLowerCase();
    return (
      selfInfo.username.toLowerCase().includes(lower) ||
      (selfInfo.email.length > 0 && selfInfo.email.toLowerCase().includes(lower))
    );
  }

  // ── Body content (inside the sheet) ─────────────────────────────────────────
  function renderBody() {
    // ── Idle (no query typed yet) ──────────────────────────────────────────────
    if (!query.trim()) {
      if (friendsLoading) {
        return (
          <View style={styles.centerState}>
            <ActivityIndicator size="small" color="#818cf8" />
          </View>
        );
      }

      const sections: { title: string; data: InviteTarget[] }[] = [];
      if (friends.length > 0) sections.push({ title: "FRIENDS", data: friends });
      if (recents.length > 0) sections.push({ title: "RECENT", data: recents });

      return (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>{title}</Text>
            </View>
          )}
          ListHeaderComponent={renderGroupsSection()}
          ListEmptyComponent={
            sections.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <MaterialIcons name="person-add" size={22} color="#818cf8" />
                </View>
                <Text style={styles.emptyTitle}>Invite someone</Text>
                <Text style={styles.emptyHint}>Search by username or email above</Text>
              </View>
            ) : null
          }
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
        />
      );
    }

    // ── Searching ──────────────────────────────────────────────────────────────
    if (searching) {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator color="#818cf8" />
          <Text style={styles.loadingText}>Searching…</Text>
        </View>
      );
    }

    // ── Connection error ───────────────────────────────────────────────────────
    if (searchError) {
      return (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconWrap, styles.emptyIconError]}>
            <MaterialIcons name="wifi-off" size={22} color="#f87171" />
          </View>
          <Text style={styles.emptyTitle}>Search failed</Text>
          <Text style={styles.emptyHint}>Check your connection and try again</Text>
        </View>
      );
    }

    // ── Self-search ────────────────────────────────────────────────────────────
    if (looksLikeSelf(query)) {
      return (
        <View style={styles.emptyState}>
          <View style={styles.selfAvatar}>
            <Text style={styles.selfAvatarText}>
              {selfInfo!.username.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.emptyTitle}>That's you</Text>
          <Text style={styles.emptyHint}>You can't invite yourself to this decision</Text>
        </View>
      );
    }

    // ── No results ─────────────────────────────────────────────────────────────
    if (results.length === 0) {
      return (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <MaterialIcons name="search-off" size={22} color="#818cf8" />
          </View>
          <Text style={styles.emptyTitle}>No users found</Text>
          <Text style={styles.emptyHint}>Try another username or email</Text>
        </View>
      );
    }

    // ── All already joined ─────────────────────────────────────────────────────
    if (results.every((r) => effectiveStatus(r) === "member")) {
      return (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconWrap, styles.emptyIconSuccess]}>
            <MaterialIcons name="group" size={22} color="#86efac" />
          </View>
          <Text style={styles.emptyTitle}>Already in this decision</Text>
          <Text style={styles.emptyHint}>
            {results.length === 1
              ? `${results[0].username} has already joined`
              : "Everyone found has already joined"}
          </Text>
        </View>
      );
    }

    // ── All already invited (or joined) ───────────────────────────────────────
    if (results.every((r) => effectiveStatus(r) !== "none")) {
      return (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconWrap, styles.emptyIconPending]}>
            <MaterialIcons name="mark-email-read" size={22} color="#818cf8" />
          </View>
          <Text style={styles.emptyTitle}>Already invited</Text>
          <Text style={styles.emptyHint}>
            {results.length === 1
              ? `${results[0].username} has a pending invite`
              : "Everyone found already has a pending invite"}
          </Text>
        </View>
      );
    }

    // ── Results list ───────────────────────────────────────────────────────────
    return (
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    );
  }

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
          <View
            style={styles.sheet}
            onStartShouldSetResponder={() => true}
          >
            {/* ── Header ── */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Invite people</Text>
              <TouchableOpacity onPress={onClose} hitSlop={10}>
                <MaterialIcons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* ── Search input ── */}
            <View style={styles.searchWrap}>
              <MaterialIcons name="search" size={18} color="#475569" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Username or email…"
                placeholderTextColor="#3d5068"
                value={query}
                onChangeText={handleQueryChange}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>

            {/* ── Results ── */}
            <View style={styles.resultsArea}>
              {renderBody()}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Pressable>

      <GroupEditModal
        visible={showGroupEdit}
        onClose={() => setShowGroupEdit(false)}
        group={editingGroup}
        currentUserId={currentUserId}
        onSaved={(saved) => {
          setGroups((prev) => {
            if (!prev) return [saved];
            const idx = prev.findIndex((g) => g.id === saved.id);
            return idx >= 0
              ? prev.map((g) => (g.id === saved.id ? saved : g))
              : [saved, ...prev];
          });
        }}
        onDeleted={(groupId) => {
          setGroups((prev) => prev?.filter((g) => g.id !== groupId) ?? null);
        }}
      />
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
    flex: 1,
    maxHeight: "82%",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#f1f5f9",
    letterSpacing: -0.2,
  },

  // ── Search ──
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 11,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    color: "#f1f5f9",
    fontSize: 15,
  },

  // ── Results ──
  resultsArea: {
    flex: 1,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#2d3f52",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  sectionHeaderWithAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  sectionNewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  sectionNewBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6366f1",
  },

  // ── Group rows ──
  createGroupPrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginBottom: 4,
  },
  createGroupPromptText: {
    fontSize: 13,
    color: "#334155",
    fontWeight: "500",
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 9,
    gap: 10,
  },
  groupRowInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  groupIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(99,102,241,0.1)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  groupName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#e2e8f0",
  },
  groupMeta: {
    fontSize: 11,
    color: "#475569",
    marginTop: 1,
  },
  groupRowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inviteAllBtn: {
    backgroundColor: "#4f46e5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 72,
    alignItems: "center",
  },
  inviteAllBtnDisabled: {
    opacity: 0.6,
  },
  inviteAllBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  editGroupBtn: {
    padding: 4,
  },
  groupsSeparator: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 4,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#4f46e5",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  username: {
    fontSize: 14,
    fontWeight: "600",
    color: "#e2e8f0",
  },
  friendTag: {
    fontSize: 11,
    color: "#818cf8",
    marginTop: 1,
  },

  // ── Status / action ──
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    gap: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "500",
  },
  invitedBadge: {
    backgroundColor: "rgba(34,197,94,0.1)",
  },
  invitedBadgeText: {
    color: "#86efac",
  },
  inviteBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#4f46e5",
    minWidth: 62,
    alignItems: "center",
  },
  inviteBtnDisabled: {
    opacity: 0.6,
  },
  inviteBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },

  // ── Empty / loading states ────────────────────────────────────────────────────
  centerState: {
    alignItems: "center",
    paddingVertical: 28,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: "#64748b",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(99,102,241,0.1)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  emptyIconError: {
    backgroundColor: "rgba(248,113,113,0.1)",
    borderColor: "rgba(248,113,113,0.2)",
  },
  emptyIconSuccess: {
    backgroundColor: "rgba(134,239,172,0.1)",
    borderColor: "rgba(134,239,172,0.2)",
  },
  emptyIconPending: {
    backgroundColor: "rgba(99,102,241,0.12)",
    borderColor: "rgba(99,102,241,0.22)",
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#94a3b8",
    textAlign: "center",
  },
  emptyHint: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
  },
  selfAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  selfAvatarText: {
    color: "#64748b",
    fontSize: 20,
    fontWeight: "700",
  },
});
