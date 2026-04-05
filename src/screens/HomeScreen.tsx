import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  Pressable,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { isDemoMode, DEMO_USER_ID } from "../lib/demoMode";
import { fetchUserDecisions } from "../lib/decisions";
import { checkCanCreateDecision } from "../lib/subscription";
import { formatCountdown, getCountdownUrgency } from "../utils/dateDisplay";
import Toast from "react-native-toast-message";
import { decisionRepository } from "../lib/repositoryProvider";
import {
  fetchPendingInvites,
  respondDecisionInvite,
  type DecisionInvite,
} from "../lib/decisionInvites";
import {
  fetchFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
} from "../lib/friends";
import type { FriendRequest } from "../types/decisions";
import { getLastViewedSignatures, markDecisionViewed } from "../lib/lastViewed";
import UpgradePrompt from "../components/UpgradePrompt";

// ─────────────────────────────────────────────────────────────────────────────
// State palette — 5 meaningful states, no misleading colours
//
//  voting     indigo   — voting is open, action expected
//  collecting amber    — options phase, advanced mode
//  waiting    muted    — nothing added yet
//  setup      slate    — constraints / pre-voting setup
//  resolved   dim      — ended (no green: this isn't a success state)
// ─────────────────────────────────────────────────────────────────────────────

const BADGE: Record<string, { bg: string; fg: string }> = {
  voting:     { bg: "rgba(99,102,241,0.22)",  fg: "#a5b4fc" },
  collecting: { bg: "rgba(245,158,11,0.15)",  fg: "#fbbf24" },
  waiting:    { bg: "transparent",             fg: "#334155" },
  setup:      { bg: "rgba(71,85,105,0.2)",    fg: "#64748b" },
  resolved:   { bg: "rgba(71,85,105,0.14)",   fg: "#64748b" },
};

const BORDER: Record<string, string> = {
  voting:     "#6366f1",
  collecting: "#f59e0b",
  waiting:    "#1e2d3d",
  setup:      "#2d3f52",
  resolved:   "#253347",
};

/**
 * Maps DB status → user-facing label + palette key.
 * Labels are always user-facing — no internal/phase names.
 */
function cardStatus(
  status: string,
  mode: string | undefined | null,
  optionCount: number | null
): { label: string; key: string } {
  const count = optionCount ?? 0;

  if (status === "locked")      return { label: "Resolved",          key: "resolved"   };
  if (status === "voting")      return { label: "Voting open",       key: "voting"     };
  if (status === "constraints") return { label: "In setup",          key: "setup"      };

  // status === "options"
  if (count === 0)              return { label: "Waiting for options", key: "waiting"  };
  if (mode === "quick")         return { label: "Voting open",       key: "voting"     };
  return                               { label: "Adding options",    key: "collecting" };
}

/**
 * Produces a lightweight fingerprint of a decision's mutable state.
 * Comparing this against the stored last-viewed value tells us whether
 * anything worth surfacing has changed since the user last opened it.
 */
function decisionSignature(decision: any): string {
  const count = decision.options?.[0]?.count ?? 0;
  return `${decision.status}:${count}`;
}

// ─────────────────────────────────────────────────────────────────────────────

const HomeScreen = () => {
  const [decisions, setDecisions]           = useState<any[]>([]);
  const [loading, setLoading]               = useState(true);
  const [userId, setUserId]                 = useState<string | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [upgradeReason, setUpgradeReason]   = useState<string | undefined>();
  const [pendingInvites, setPendingInvites]         = useState<DecisionInvite[]>([]);
  const [pendingFriendRequests, setPendingFriendRequests] = useState<FriendRequest[]>([]);
  const [respondingId, setRespondingId]             = useState<string | null>(null);
  const [respondingFriendId, setRespondingFriendId] = useState<string | null>(null);
  const [viewedSigs, setViewedSigs]         = useState<Record<string, string>>({});
  const navigation = useNavigation<any>();

  // ── Per-card overflow menu ───────────────────────────────────────────────────
  const cardMenuBtnRefs = useRef<Record<string, View | null>>({});
  const [openMenuId,  setOpenMenuId]  = useState<string | null>(null);
  const [menuAnchorY, setMenuAnchorY] = useState(0);

  function handleOpenCardMenu(decisionId: string) {
    const ref = cardMenuBtnRefs.current[decisionId];
    if (!ref) return;
    (ref as any).measureInWindow((_x: number, y: number, _w: number, h: number) => {
      setMenuAnchorY(y + h + 4);
      setOpenMenuId(decisionId);
    });
  }

  function handleCloseCardMenu() {
    setOpenMenuId(null);
  }

  async function refreshDecisions(uid: string) {
    try {
      const data = await fetchUserDecisions(uid);
      setDecisions(data || []);
    } catch {}
  }

  function handleDeleteFromMenu() {
    const menuId = openMenuId;
    if (!menuId || !userId) return;
    handleCloseCardMenu();
    Alert.alert(
      "Delete decision",
      "This will permanently delete the decision and all votes. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await decisionRepository.deleteDecision({
                decisionId: menuId,
                actor: { kind: "user", userId },
              });
              await refreshDecisions(userId);
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Could not delete decision.");
            }
          },
        },
      ]
    );
  }

  function handleLeaveFromMenu() {
    const menuId = openMenuId;
    if (!menuId || !userId) return;
    handleCloseCardMenu();
    Alert.alert(
      "Leave decision",
      "You'll be removed from this decision and your votes will be cleared.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              await decisionRepository.leaveDecision({
                decisionId: menuId,
                actor: { kind: "user", userId },
              });
              await refreshDecisions(userId);
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Could not leave decision.");
            }
          },
        },
      ]
    );
  }

  // ── Data load ────────────────────────────────────────────────────────────────
  const handleCreateDecision = async () => {
    if (!userId) {
      navigation.navigate("QuickStartScreen" as any);
      return;
    }
    try {
      const { allowed, reason } = await checkCanCreateDecision(userId);
      if (!allowed) {
        setUpgradeReason(reason);
        setShowUpgradePrompt(true);
        return;
      }
      navigation.navigate("QuickStartScreen" as any);
    } catch {
      navigation.navigate("QuickStartScreen" as any);
    }
  };

  const handleUpgrade = () => {
    setShowUpgradePrompt(false);
    navigation.navigate("SubscriptionScreen" as any);
  };

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        setLoading(true);
        let currentUserId: string | null = null;

        if (isDemoMode()) {
          currentUserId = DEMO_USER_ID;
        } else {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) { setLoading(false); return; }
          currentUserId = user.id;
        }

        setUserId(currentUserId);
        try {
          const [decisionData, inviteData, friendRequestData, sigs] = await Promise.all([
            fetchUserDecisions(currentUserId),
            isDemoMode() ? Promise.resolve([]) : fetchPendingInvites(currentUserId).catch(() => []),
            isDemoMode() ? Promise.resolve([]) : fetchFriendRequests(currentUserId).catch(() => []),
            getLastViewedSignatures(),
          ]);
          setDecisions(decisionData || []);
          setPendingInvites(inviteData as DecisionInvite[]);
          setPendingFriendRequests(friendRequestData as FriendRequest[]);
          setViewedSigs(sigs);
        } catch (err) {
          console.error("Error fetching home data:", err);
        }
        setLoading(false);
      };
      load();
    }, [])
  );

  const activeDecisions   = decisions.filter((d) => d.decisions?.status !== "locked");
  const resolvedDecisions = decisions.filter((d) => d.decisions?.status === "locked");

  // ── Action group ─────────────────────────────────────────────────────────────
  const renderActionGroup = () => (
    <View style={styles.actionGroup}>
      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={handleCreateDecision}
        activeOpacity={0.85}
      >
        <Icon name="add" size={20} color="#fff" />
        <Text style={styles.primaryBtnText}>New Decision</Text>
      </TouchableOpacity>

      <View style={styles.actionDivider}>
        <View style={styles.actionDividerLine} />
        <Text style={styles.actionDividerText}>or</Text>
        <View style={styles.actionDividerLine} />
      </View>

      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={() => navigation.navigate("JoinDecisionScreen", {})}
        activeOpacity={0.7}
      >
        <Icon name="group-add" size={16} color="#818cf8" />
        <Text style={styles.secondaryBtnText}>Join by Code</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Decision card ─────────────────────────────────────────────────────────────
  const renderDecisionCard = (item: any, isResolved = false) => {
    const decision = item.decisions as any;
    if (!decision) return null;

    const optionCount = decision.options?.[0]?.count ?? null;
    const { label: statusLabel, key: statusKey } = cardStatus(
      decision.status, decision.mode, optionCount
    );

    const borderColor = BORDER[statusKey] ?? BORDER.voting;
    const badge       = BADGE[statusKey]  ?? BADGE.voting;
    const isWaiting   = statusKey === "waiting";

    const sig    = decisionSignature(decision);
    const stored = viewedSigs[decision.id];
    // Show indicator only if user has previously opened this decision and something changed
    const hasNew = stored !== undefined && stored !== sig;

    // Resolved and waiting cards get a muted timer — no urgency colouring
    const timerColor = isResolved || isWaiting
      ? "#475569"
      : (() => {
          const urgency = getCountdownUrgency(decision.closes_at);
          return urgency === "critical" ? "#ef4444" :
                 urgency === "warning"  ? "#f59e0b" : "#475569";
        })();

    // Resolved cards: show the actual close date (e.g. "Mar 15") instead of "Closed"
    const timerLabel = isResolved && decision.closes_at
      ? new Date(decision.closes_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : decision.closes_at
      ? formatCountdown(decision.closes_at)
      : "No deadline";

    return (
      <TouchableOpacity
        key={decision.id}
        style={[
          styles.card,
          { borderLeftColor: borderColor },
          isWaiting  && styles.cardWaiting,
          isResolved && styles.cardResolved,
        ]}
        onPress={() => {
          // Mark as viewed (optimistic update + async persist)
          const newSigs = { ...viewedSigs, [decision.id]: sig };
          setViewedSigs(newSigs);
          markDecisionViewed(decision.id, sig);
          if (decision.mode === "quick" && decision.status !== "locked") {
            navigation.navigate("LiveDecisionScreen" as any, { decisionId: decision.id });
          } else {
            navigation.navigate("DecisionDetailScreen", { decisionId: decision.id });
          }
        }}
        activeOpacity={0.7}
      >
        {/* ── Header: title · badge · kebab ── */}
        <View style={styles.cardHeader}>
          <Text
            style={[
              styles.cardTitle,
              isWaiting  && styles.cardTitleWaiting,
              isResolved && styles.cardTitleResolved,
            ]}
            numberOfLines={1}
          >
            {decision.title}
          </Text>

          <View style={styles.cardHeaderRight}>
            {hasNew && <View style={styles.newDot} />}
            <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.statusText, { color: badge.fg }]}>
                {statusLabel}
              </Text>
            </View>

            <TouchableOpacity
              ref={(r) => { cardMenuBtnRefs.current[decision.id] = r as any; }}
              onPress={() => handleOpenCardMenu(decision.id)}
              style={styles.cardMenuBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="More options"
              accessibilityRole="button"
            >
              <Icon name="more-vert" size={16} color="#3d5068" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Footer: type · timer · option count ── */}
        <View style={styles.cardFooter}>
          {decision.type_label ? (
            <View style={styles.footerItem}>
              <Text style={styles.footerTypeLabel}>
                {decision.type_label.charAt(0).toUpperCase() + decision.type_label.slice(1)}
              </Text>
            </View>
          ) : null}

          <View style={styles.footerItem}>
            <Icon name="schedule" size={13} color={timerColor} />
            <Text style={[styles.footerText, { color: timerColor }]}>
              {timerLabel}
            </Text>
          </View>

          {optionCount !== null && optionCount > 0 && (
            <View style={styles.footerItem}>
              <Icon name="list" size={13} color="#334155" />
              <Text style={[styles.footerText, { color: "#475569" }]}>
                {optionCount} {optionCount === 1 ? "option" : "options"}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // ── Decision invite handler ──────────────────────────────────────────────────
  async function handleRespondInvite(inviteId: string, accept: boolean) {
    if (respondingId) return;
    const invite = pendingInvites.find((i) => i.id === inviteId);
    setRespondingId(inviteId);
    setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
    try {
      await respondDecisionInvite(inviteId, accept);
      if (accept) {
        Toast.show({
          type: "success",
          text1: `Joined "${invite?.decisionTitle ?? "decision"}"`,
          position: "bottom",
          visibilityTime: 2500,
        });
        if (userId) {
          const data = await fetchUserDecisions(userId);
          setDecisions(data || []);
        }
      }
    } catch {
      if (userId) {
        const invites = await fetchPendingInvites(userId).catch(() => []);
        setPendingInvites(invites as DecisionInvite[]);
      }
    } finally {
      setRespondingId(null);
    }
  }

  // ── Friend request handler ───────────────────────────────────────────────────
  async function handleRespondFriendRequest(requestId: string, accept: boolean) {
    if (respondingFriendId) return;
    setRespondingFriendId(requestId);
    setPendingFriendRequests((prev) => prev.filter((r) => r.id !== requestId));
    try {
      if (accept) {
        await acceptFriendRequest(requestId);
        Toast.show({
          type: "success",
          text1: "Friend added",
          position: "bottom",
          visibilityTime: 2000,
        });
      } else {
        await declineFriendRequest(requestId);
      }
    } catch {
      if (userId) {
        const requests = await fetchFriendRequests(userId).catch(() => []);
        setPendingFriendRequests(requests as FriendRequest[]);
      }
    } finally {
      setRespondingFriendId(null);
    }
  }

  // ── Unified inbox section ────────────────────────────────────────────────────
  // Decision invites appear first (requires the most urgent action — joining a
  // plan before it closes). Friend requests follow. Within each group: newest first.
  const renderInbox = () => {
    const hasInvites  = pendingInvites.length > 0;
    const hasRequests = pendingFriendRequests.length > 0;
    if (!hasInvites && !hasRequests) return null;

    const totalCount = pendingInvites.length + pendingFriendRequests.length;
    const showGroupLabels = hasInvites && hasRequests;

    return (
      <View style={styles.inboxSection}>
        {/* Section header */}
        <View style={styles.inboxHeaderRow}>
          <Text style={styles.inboxHeaderLabel}>Inbox</Text>
          <View style={styles.inboxCountBadge}>
            <Text style={styles.inboxCountText}>{totalCount}</Text>
          </View>
        </View>

        {/* ── Decision invites ── */}
        {hasInvites && (
          <>
            {showGroupLabels && (
              <Text style={styles.inboxGroupLabel}>Decisions</Text>
            )}
            {pendingInvites.map((invite) => {
              const timeLabel = invite.decisionClosesAt
                ? formatCountdown(invite.decisionClosesAt)
                : null;
              const isResponding = respondingId === invite.id;
              return (
                <View key={invite.id} style={[styles.inboxRow, styles.inboxRowDecision]}>
                  <View style={styles.inboxRowAccent} />
                  <View style={styles.inboxRowContent}>
                    <Text style={styles.inboxRowTitle} numberOfLines={1}>
                      {invite.decisionTitle}
                    </Text>
                    <View style={styles.inboxRowMeta}>
                      <Text style={styles.inboxRowMetaText}>
                        from {invite.inviterUsername}
                      </Text>
                      {timeLabel ? (
                        <>
                          <Text style={styles.inboxMetaDot}>·</Text>
                          <Text style={styles.inboxRowMetaText}>{timeLabel}</Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.inboxRowActions}>
                    <TouchableOpacity
                      style={[styles.inboxSecondaryBtn, isResponding && { opacity: 0.4 }]}
                      onPress={() => handleRespondInvite(invite.id, false)}
                      disabled={!!respondingId}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.inboxSecondaryBtnText}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.inboxPrimaryBtn, styles.inboxPrimaryBtnDecision, isResponding && { opacity: 0.7 }]}
                      onPress={() => handleRespondInvite(invite.id, true)}
                      disabled={!!respondingId}
                      activeOpacity={0.75}
                      accessibilityLabel={`Join ${invite.decisionTitle}`}
                    >
                      {isResponding ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.inboxPrimaryBtnText}>Join</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ── Friend requests ── */}
        {hasRequests && (
          <>
            {showGroupLabels && (
              <Text style={[styles.inboxGroupLabel, hasInvites && { marginTop: 10 }]}>People</Text>
            )}
            {pendingFriendRequests.map((req) => {
              const isResponding = respondingFriendId === req.id;
              return (
                <View key={req.id} style={[styles.inboxRow, styles.inboxRowFriend]}>
                  <View style={[styles.inboxRowAccent, styles.inboxRowAccentFriend]} />
                  <View style={styles.inboxRowContent}>
                    <Text style={styles.inboxRowTitle} numberOfLines={1}>
                      {req.from_username ?? req.from_email ?? "Someone"}
                    </Text>
                    <Text style={styles.inboxRowMetaText}>wants to be friends</Text>
                  </View>
                  <View style={styles.inboxRowActions}>
                    <TouchableOpacity
                      style={[styles.inboxSecondaryBtn, isResponding && { opacity: 0.4 }]}
                      onPress={() => handleRespondFriendRequest(req.id, false)}
                      disabled={!!respondingFriendId}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.inboxSecondaryBtnText}>Ignore</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.inboxPrimaryBtn, styles.inboxPrimaryBtnFriend, isResponding && { opacity: 0.7 }]}
                      onPress={() => handleRespondFriendRequest(req.id, true)}
                      disabled={!!respondingFriendId}
                      activeOpacity={0.75}
                      accessibilityLabel={`Accept friend request from ${req.from_username ?? "user"}`}
                    >
                      {isResponding ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.inboxPrimaryBtnText}>Accept</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </View>
    );
  };

  // ── "Needs your input" — advanced-mode voting decisions the user hasn't voted on
  // Quick-mode decisions are excluded: has_voted is never updated by the quick-vote
  // mechanism, so it would incorrectly include decisions where all votes are spent.
  const needsInputDecisions = activeDecisions.filter((item) => {
    const d = item.decisions as any;
    if (!d || d.mode === "quick") return false;
    return d.status === "voting" && !item.has_voted;
  });

  const needsInputIds = new Set(needsInputDecisions.map((item) => item.decision_id));

  // "Active" shows everything else that is not locked and not in needs-input
  const remainingActiveDecisions = activeDecisions.filter(
    (item) => !needsInputIds.has(item.decision_id)
  );

  // ── Section header ────────────────────────────────────────────────────────────
  const renderSectionHeader = (title: string, count: number, isActive: boolean) => (
    <View style={styles.sectionHeaderRow}>
      <View style={[styles.sectionDot, { backgroundColor: isActive ? "#6366f1" : "#1e293b" }]} />
      <Text style={styles.sectionHeader}>{title}</Text>
      <Text style={styles.sectionCount}>{count}</Text>
    </View>
  );

  // ── Open menu item (for role lookup in modal) ─────────────────────────────────
  const openMenuItem = openMenuId
    ? decisions.find((d) => d.decisions?.id === openMenuId)
    : null;
  const openMenuIsOrganizer = openMenuItem?.role === "organizer";

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <View style={styles.screenBg}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#6366f1" />
          </View>
        ) : decisions.length === 0 && pendingInvites.length === 0 && pendingFriendRequests.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
              <Icon name="how-to-vote" size={32} color="#4f5f75" />
            </View>
            <Text style={styles.emptyTitle}>No decisions yet</Text>
            <Text style={styles.emptySubtitle}>
              Start one now or join a friend's with a code.
            </Text>

            <TouchableOpacity
              style={styles.emptyPrimaryBtn}
              onPress={handleCreateDecision}
              activeOpacity={0.85}
            >
              <Icon name="add" size={20} color="#fff" />
              <Text style={styles.emptyPrimaryBtnText}>New Decision</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.emptySecondaryBtn}
              onPress={() => navigation.navigate("JoinDecisionScreen", {})}
              activeOpacity={0.7}
            >
              <Icon name="group-add" size={16} color="#818cf8" />
              <Text style={styles.emptySecondaryBtnText}>Join by Code</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
          >
            {renderActionGroup()}
            {renderInbox()}

            {needsInputDecisions.length > 0 && (
              <View style={styles.section}>
                {renderSectionHeader("Needs your input", needsInputDecisions.length, true)}
                {needsInputDecisions.map((item, index) => (
                  <View key={item.decision_id || index}>
                    {renderDecisionCard(item, false)}
                  </View>
                ))}
              </View>
            )}

            {remainingActiveDecisions.length > 0 && (
              <View style={styles.section}>
                {renderSectionHeader("Active", remainingActiveDecisions.length, needsInputDecisions.length === 0)}
                {remainingActiveDecisions.map((item, index) => (
                  <View key={item.decision_id || index}>
                    {renderDecisionCard(item, false)}
                  </View>
                ))}
              </View>
            )}

            {resolvedDecisions.length > 0 && (
              <View style={[styles.section, styles.resolvedSection]}>
                {renderSectionHeader("Resolved", resolvedDecisions.length, false)}
                {resolvedDecisions.map((item, index) => (
                  <View key={item.decision_id || index}>
                    {renderDecisionCard(item, true)}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* ── Per-card overflow menu ── */}
      <Modal
        visible={openMenuId !== null}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={handleCloseCardMenu}
      >
        <Pressable style={styles.menuBackdrop} onPress={handleCloseCardMenu}>
          <View
            style={[styles.menuSheet, { top: menuAnchorY }]}
            onStartShouldSetResponder={() => true}
          >
            {openMenuIsOrganizer ? (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleDeleteFromMenu}
                activeOpacity={0.7}
              >
                <Icon name="delete-outline" size={17} color="#f87171" />
                <Text style={styles.menuItemTextDanger}>Delete decision</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleLeaveFromMenu}
                activeOpacity={0.7}
              >
                <Icon name="logout" size={17} color="#f87171" />
                <Text style={styles.menuItemTextDanger}>Leave decision</Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>

      <UpgradePrompt
        visible={showUpgradePrompt}
        onClose={() => setShowUpgradePrompt(false)}
        onUpgrade={handleUpgrade}
        feature="Create More Decisions"
        reason={upgradeReason}
      />
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screenBg: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  emptyContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 40,
    alignItems: "center",
  },
  listContainer: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 36,
  },

  // ── Unified inbox ─────────────────────────────────────────────────────────────
  inboxSection: {
    marginBottom: 20,
  },
  inboxHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  inboxHeaderLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  inboxCountBadge: {
    backgroundColor: "rgba(99,102,241,0.2)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  inboxCountText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#818cf8",
  },
  inboxGroupLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#334155",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 5,
    paddingHorizontal: 2,
  },
  inboxRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#131f2e",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    marginBottom: 6,
    minHeight: 52,
  },
  inboxRowDecision: {
    borderLeftColor: "rgba(99,102,241,0.3)",
  },
  inboxRowFriend: {
    borderLeftColor: "rgba(20,184,166,0.3)",
  },
  inboxRowAccent: {
    width: 3,
    alignSelf: "stretch",
    backgroundColor: "#6366f1",
    flexShrink: 0,
  },
  inboxRowAccentFriend: {
    backgroundColor: "#14b8a6",
  },
  inboxRowContent: {
    flex: 1,
    paddingHorizontal: 11,
    paddingVertical: 10,
    minWidth: 0,
  },
  inboxRowTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#cbd5e1",
    marginBottom: 1,
  },
  inboxRowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  inboxRowMetaText: {
    fontSize: 11,
    color: "#475569",
  },
  inboxMetaDot: {
    fontSize: 11,
    color: "#253347",
  },
  inboxRowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 10,
    flexShrink: 0,
  },
  inboxSecondaryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  inboxSecondaryBtnText: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "500",
  },
  inboxPrimaryBtn: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 7,
    minWidth: 56,
    alignItems: "center",
  },
  inboxPrimaryBtnDecision: {
    backgroundColor: "#4f46e5",
  },
  inboxPrimaryBtnFriend: {
    backgroundColor: "#0f766e",
  },
  inboxPrimaryBtnText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },

  // ── Action group ──────────────────────────────────────────────────────────────
  actionGroup: {
    backgroundColor: "#1e293b",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 20,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6366f1",
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  actionDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 10,
    gap: 10,
  },
  actionDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  actionDividerText: {
    fontSize: 12,
    color: "#334155",
    fontFamily: "Rubik_400Regular",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 9,
    gap: 6,
    backgroundColor: "rgba(129,140,248,0.07)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.18)",
  },
  secondaryBtnText: {
    color: "#818cf8",
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },

  // ── Section headers ───────────────────────────────────────────────────────────
  section: {
    marginBottom: 4,
  },
  resolvedSection: {
    opacity: 0.7,
    marginTop: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    marginTop: 6,
    gap: 8,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontFamily: "Rubik_600SemiBold",
    color: "#475569",
    flex: 1,
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
    color: "#334155",
  },

  // ── Decision cards ────────────────────────────────────────────────────────────
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 8,
    backgroundColor: "#1e293b",
    borderColor: "rgba(255,255,255,0.09)",
  },
  cardResolved: {
    backgroundColor: "#18222e",
  },
  cardWaiting: {
    backgroundColor: "#161e2a",
    borderColor: "rgba(255,255,255,0.04)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
    fontFamily: "Rubik_500Medium",
    color: "#e2e8f0",
  },
  cardTitleResolved: {
    color: "#94a3b8",
  },
  cardTitleWaiting: {
    color: "#64748b",
  },
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Rubik_500Medium",
  },
  cardMenuBtn: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  newDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#6366f1",
  },
  footerTypeLabel: {
    fontSize: 12,
    fontFamily: "Rubik_400Regular",
    color: "#334155",
  },
  cardFooter: {
    flexDirection: "row",
    gap: 14,
    marginTop: 4,
  },
  footerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  footerText: {
    fontSize: 12,
    fontFamily: "Rubik_400Regular",
  },

  // ── Per-card overflow menu ────────────────────────────────────────────────────
  menuBackdrop: {
    flex: 1,
  },
  menuSheet: {
    position: "absolute",
    right: 14,
    minWidth: 190,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuItemTextDanger: {
    fontSize: 14,
    color: "#f87171",
    fontWeight: "500",
  },

  // ── Empty state ───────────────────────────────────────────────────────────────
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "#1a2535",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    fontFamily: "Rubik_600SemiBold",
    color: "#e2e8f0",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 32,
    fontFamily: "Rubik_400Regular",
    color: "#475569",
    lineHeight: 20,
  },
  emptyPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6366f1",
    paddingVertical: 15,
    borderRadius: 12,
    gap: 8,
    marginBottom: 12,
    alignSelf: "stretch",
  },
  emptyPrimaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  emptySecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 12,
    gap: 7,
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.3)",
    backgroundColor: "rgba(99,102,241,0.07)",
  },
  emptySecondaryBtnText: {
    color: "#818cf8",
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
});

export default HomeScreen;
