import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Share,
  Linking,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useNavigation, useRoute } from "@react-navigation/native";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { MaterialIcons } from "@expo/vector-icons";
import { formatCountdown } from "../utils/dateDisplay";
import { resolveDecisionActor } from "../lib/resolveDecisionActor";
import { decisionRepository } from "../lib/repositoryProvider";
import { fetchComments } from "../lib/decisions";
import CountdownTimer from "../components/CountdownTimer";
import QuickOptionCard from "../components/QuickOptionCard";
import MembersButton from "../components/MembersButton";
import DiscussionSheet from "../components/DiscussionSheet";
import type { DecisionActor, LiveDecisionState, QuickDecisionMember, QuickDecision, ResponseType } from "../domain/decisionTypes";
import type { RootStackParamList } from "../types/navigation";
import type { DecisionMember, Comment } from "../types/decisions";

type NavProp   = NativeStackNavigationProp<RootStackParamList, "LiveDecisionScreen">;
type RouteProp = NativeStackScreenProps<RootStackParamList, "LiveDecisionScreen">["route"];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps QuickDecisionMember[] (quick-mode domain type) to DecisionMember[]
 * (legacy advanced-mode type) so MembersButton can be reused without change.
 * Creator is marked as organizer; everyone else is "member".
 */
function mapToDecisionMembers(
  members: QuickDecisionMember[],
  decision: QuickDecision
): DecisionMember[] {
  return members.map((m) => ({
    id: m.id,
    decision_id: m.decisionId,
    user_id: m.actorUserId ?? m.actorGuestId ?? "",
    role:
      m.actorUserId === decision.createdBy ||
      m.actorGuestId === decision.createdBy
        ? ("organizer" as const)
        : ("member" as const),
    has_voted: m.hasResponded,
    joined_at: m.joinedAt,
    username: m.displayName ?? undefined,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility copy generators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a short reminder message the creator can share before lock.
 * Example: "Friday Night Dinner — locks in 12m. Pick what works: ABC123"
 */
function buildReminderText(decision: QuickDecision): string {
  const countdown = formatCountdown(decision.closesAt);
  const timeStr = countdown === "Closed" ? "closing now" : `locks ${countdown}`;
  return `${decision.title} — ${timeStr}. Pick what works: ${decision.inviteCode}`;
}

/**
 * Generates a shareable locked-plan summary.
 * Includes attendee names when available (members who responded are the best
 * proxy — individual per-option responses are not in the view model).
 * Example: "Locked: Las Palmas. Going: Jordan, Sam, Mia."
 * Fallback:  "Locked: Las Palmas. 3 people in."
 */
function buildResultText(
  decision: QuickDecision,
  lockedOption: { title: string; imInCount: number } | null,
  members: QuickDecisionMember[],
): string {
  if (!lockedOption) return `${decision.title} — no plan locked in.`;

  const names = members
    .filter((m) => m.hasResponded && m.displayName)
    .map((m) => m.displayName!)
    .join(", ");

  if (names) {
    return `Locked: ${lockedOption.title}. Going: ${names}.`;
  }
  const n = lockedOption.imInCount;
  return `Locked: ${lockedOption.title}. ${n} ${n === 1 ? "person" : "people"} in.`;
}

/**
 * Builds a Google Calendar "create event" URL for the locked plan.
 * Uses closesAt as the event start (or now+1h if already past), 1h duration.
 */
function buildCalendarUrl(decision: QuickDecision, optionTitle: string | null): string {
  const closesAt = new Date(decision.closesAt);
  const now = new Date();
  const eventStart = closesAt > now ? closesAt : new Date(now.getTime() + 60 * 60 * 1000);
  const eventEnd   = new Date(eventStart.getTime() + 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const title   = encodeURIComponent(optionTitle ? `${decision.title}: ${optionTitle}` : decision.title);
  const dates   = encodeURIComponent(`${fmt(eventStart)}/${fmt(eventEnd)}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DiscussionPreview — compact tap target shown inline in the option list footer
// ─────────────────────────────────────────────────────────────────────────────

function DiscussionPreview({
  commentCount,
  latestComment,
  onOpen,
}: {
  commentCount: number;
  latestComment: Comment | null;
  onOpen: () => void;
}) {
  const hasComments = commentCount > 0;
  return (
    <TouchableOpacity
      style={styles.discussionRow}
      onPress={onOpen}
      activeOpacity={0.72}
    >
      {/* Left: icon + label */}
      <View style={styles.discussionLeft}>
        <MaterialIcons name="chat-bubble-outline" size={13} color="#475569" />
        <Text style={styles.discussionLabel}>Notes</Text>
      </View>

      {/* Middle: preview or CTA */}
      <Text
        style={[styles.discussionPreviewText, !hasComments && styles.discussionCTA]}
        numberOfLines={1}
      >
        {hasComments && latestComment
          ? `${latestComment.username ?? "someone"}: ${latestComment.content}`
          : hasComments
          ? `${commentCount} note${commentCount !== 1 ? "s" : ""}`
          : "Add a note"}
      </Text>

      {/* Right: count badge + chevron */}
      <View style={styles.discussionRight}>
        {hasComments && (
          <View style={styles.discussionBadge}>
            <Text style={styles.discussionBadgeText}>{commentCount}</Text>
          </View>
        )}
        <MaterialIcons name="chevron-right" size={18} color="#475569" />
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ParticipantsSection — collapsible section below options, above Notes
// ─────────────────────────────────────────────────────────────────────────────

function ParticipantsSection({
  members,
  createdBy,
}: {
  members: QuickDecisionMember[];
  createdBy: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const respondedCount = members.filter((m) => m.hasResponded).length;
  const waitingCount   = members.length - respondedCount;

  const summaryText =
    waitingCount === 0
      ? "All responded"
      : respondedCount === 0
      ? `Waiting on ${waitingCount}`
      : `${respondedCount} responded · Waiting on ${waitingCount}`;

  return (
    <View style={styles.participantsSection}>
      <TouchableOpacity
        style={styles.participantsSectionHeader}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Collapse participants" : "Expand participants"}
      >
        <View style={styles.participantsSectionLeft}>
          <MaterialIcons name="people-outline" size={13} color="#475569" />
          <Text style={styles.participantsSectionLabel}>
            Participants ({members.length})
          </Text>
        </View>
        <View style={styles.participantsSectionRight}>
          <Text style={styles.participantsSummaryText}>{summaryText}</Text>
          <MaterialIcons
            name={expanded ? "expand-less" : "expand-more"}
            size={16}
            color="#475569"
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.participantsList}>
          {members.map((m) => {
            const isHost =
              m.actorUserId === createdBy || m.actorGuestId === createdBy;
            const name = m.displayName ?? (m.actorGuestId ? "Guest" : "Unknown");
            return (
              <View key={m.id} style={styles.participantRow}>
                <View
                  style={[
                    styles.participantDot,
                    m.hasResponded
                      ? styles.participantDotResponded
                      : styles.participantDotWaiting,
                  ]}
                />
                <Text style={styles.participantName} numberOfLines={1}>
                  {name}
                </Text>
                {isHost && (
                  <View style={styles.hostBadge}>
                    <Text style={styles.hostBadgeText}>host</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LiveDecisionScreen
// ─────────────────────────────────────────────────────────────────────────────

export default function LiveDecisionScreen() {
  const route      = useRoute<RouteProp>();
  const navigation = useNavigation<NavProp>();
  const { decisionId } = route.params;

  // ── Identity ────────────────────────────────────────────────────────────────
  const [actor, setActor] = useState<DecisionActor | null>(null);

  useEffect(() => {
    resolveDecisionActor().then(setActor);
  }, []);

  // ── Decision state ──────────────────────────────────────────────────────────
  const [decisionState, setDecisionState] = useState<LiveDecisionState | null>(null);
  const [loadError, setLoadError]         = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const refreshState = useCallback(async (currentActor?: DecisionActor) => {
    const resolvedActor = currentActor ?? actor;
    if (!resolvedActor) return;
    try {
      const next = await decisionRepository.getLiveDecisionState({
        decisionId,
        actor: resolvedActor,
      });
      setDecisionState(next);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e?.message ?? "Failed to load decision.");
    }
  }, [decisionId, actor]);

  // Initial load fires as soon as actor is known.
  useEffect(() => {
    if (!actor) return;
    refreshState(actor).finally(() => setInitialLoading(false));
    if (actor.kind === "user") {
      fetchComments(decisionId).then(setComments).catch(() => {});
    }
  }, [actor]);  // intentionally not including refreshState to avoid double-fire

  // ── Repository subscription ─────────────────────────────────────────────────
  // Fires whenever any actor mutates the decision. The screen re-fetches and
  // stays current. Own mutations already call refreshState() explicitly, so the
  // double-refresh is harmless — getLiveDecisionState is idempotent.
  //
  // Swap note: MockDecisionRepository notifies synchronously in-process.
  // SupabaseDecisionRepository will wrap a Realtime channel here — the
  // interface contract (subscribe returns unsubscribe fn) stays identical.
  useEffect(() => {
    if (!actor) return;
    const unsubscribe = decisionRepository.subscribeToDecision(decisionId, () => {
      refreshState();
    });
    return unsubscribe;
  }, [decisionId, actor, refreshState]);

  // ── Comments ────────────────────────────────────────────────────────────────
  const [comments, setComments] = useState<Comment[]>([]);

  const loadComments = useCallback(async () => {
    if (!actor || actor.kind !== "user") return;
    const data = await fetchComments(decisionId);
    setComments(data);
  }, [decisionId, actor]);

  // ── Setup phase ───────────────────────────────────────────────────────────────
  // State is local to the creator's setup session.
  // Quorum settings are sent atomically when "Start" is tapped.
  const [setupOptionInput, setSetupOptionInput]   = useState("");
  const [setupOptionError, setSetupOptionError]   = useState<string | null>(null);
  const [setupPending, setSetupPending]           = useState(false);
  const [editingOption, setEditingOption]         = useState<{ id: string; text: string } | null>(null);
  const [showAddInput, setShowAddInput]           = useState(false);
  const [setupMinAttendees, setSetupMinAttendees] = useState(0);
  const [setupEarlyLock, setSetupEarlyLock]       = useState(false);
  const [showMorePicker, setShowMorePicker]       = useState(false);

  // Sync quorum fields when state loads so the stepper reflects current values.
  useEffect(() => {
    if (!decisionState) return;
    setSetupMinAttendees(decisionState.decision.minimumAttendees ?? 0);
    setSetupEarlyLock(decisionState.decision.earlyLockEnabled);
  }, [decisionState?.decision.id]); // only on initial load per decision

  async function handleSetupAddOption() {
    if (!actor || !decisionState || setupPending) return;
    const trimmed = setupOptionInput.trim();
    if (!trimmed) { setSetupOptionError("Option can't be empty."); return; }
    setSetupPending(true);
    setSetupOptionError(null);
    try {
      await decisionRepository.addOption({ decisionId, actor, title: trimmed });
      setSetupOptionInput("");
      setShowAddInput(false);
      await refreshState();
    } catch (e: any) {
      setSetupOptionError(e?.message ?? "Could not add option.");
    } finally {
      setSetupPending(false);
    }
  }

  async function handleSetupDeleteOption(optionId: string) {
    if (!actor || !decisionState || setupPending) return;
    setSetupPending(true);
    try {
      await decisionRepository.deleteOption({ decisionId, optionId, actor });
      await refreshState();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not remove option.");
    } finally {
      setSetupPending(false);
    }
  }

  async function handleSetupSaveEdit() {
    if (!actor || !decisionState || !editingOption || setupPending) return;
    const trimmed = editingOption.text.trim();
    if (!trimmed) { setEditingOption({ ...editingOption, text: "" }); return; }
    setSetupPending(true);
    try {
      await decisionRepository.updateOption({ decisionId, optionId: editingOption.id, title: trimmed, actor });
      setEditingOption(null);
      await refreshState();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not update option.");
    } finally {
      setSetupPending(false);
    }
  }

  async function handleEndSetupPhase() {
    if (!actor || !decisionState || setupPending) return;
    setSetupPending(true);
    try {
      await decisionRepository.endSetupPhase({
        decisionId,
        actor,
        minimumAttendees: setupMinAttendees > 0 ? setupMinAttendees : null,
        earlyLockEnabled: setupMinAttendees > 0 ? setupEarlyLock : false,
      });
      await refreshState();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not share plan.");
    } finally {
      setSetupPending(false);
    }
  }

  // ── Discussion + response handlers ──────────────────────────────────────────
  const [showDiscussion, setShowDiscussion] = useState(false);

  // ── Response handlers ─────────────────────────────────────────────────────
  // pendingOptionId prevents double-taps and shows a spinner on the card.
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);

  async function handleSetResponse(optionId: string, response: ResponseType) {
    if (!actor || !decisionState || pendingOptionId !== null) return;
    setPendingOptionId(optionId);
    try {
      await decisionRepository.setOptionResponse({ decisionId, optionId, response, actor });
      await refreshState();
    } catch (e: any) {
      Alert.alert("Can't respond", e?.message ?? "Response failed.");
    } finally {
      setPendingOptionId(null);
    }
  }

  async function handleToggleTopChoice(optionId: string) {
    if (!actor || !decisionState || pendingOptionId !== null) return;
    setPendingOptionId(optionId);
    try {
      await decisionRepository.toggleTopChoice({ decisionId, optionId, actor });
      await refreshState();
    } catch (e: any) {
      Alert.alert("Can't update top choice", e?.message ?? "Update failed.");
    } finally {
      setPendingOptionId(null);
    }
  }

  // ── Admin: extend deadline ──────────────────────────────────────────────────
  // adminPending prevents repeated taps while an action is in-flight.
  const [adminPending, setAdminPending] = useState(false);

  function handleExtend() {
    if (adminPending) return;
    const extendOptions: Array<{ label: string; minutes: number }> = [
      { label: "+15 minutes", minutes: 15 },
      { label: "+30 minutes", minutes: 30 },
      { label: "+1 hour",     minutes: 60 },
      { label: "+1 day",      minutes: 60 * 24 },
    ];

    Alert.alert(
      "Extend deadline",
      "Add how much time?",
      [
        ...extendOptions.map(({ label, minutes }) => ({
          text: label,
          onPress: async () => {
            if (!actor) return;
            setAdminPending(true);
            try {
              await decisionRepository.extendDeadline({ decisionId, actor, minutesToAdd: minutes });
              await refreshState();
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Could not extend deadline.");
            } finally {
              setAdminPending(false);
            }
          },
        })),
        { text: "Cancel", style: "cancel" },
      ]
    );
  }

  // ── Admin: end early ────────────────────────────────────────────────────────
  function handleEndEarly() {
    if (adminPending) return;
    Alert.alert(
      "End plan now?",
      "Responses will close and the plan will lock.",
      [
        {
          text: "End Now",
          style: "destructive",
          onPress: async () => {
            if (!actor) return;
            setAdminPending(true);
            try {
              await decisionRepository.endDecisionEarly({ decisionId, actor });
              await refreshState();
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Could not end decision.");
            } finally {
              setAdminPending(false);
            }
          },
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  }

  // ── Action menu ──────────────────────────────────────────────────────────────
  const headerRef = useRef<View>(null);
  const [showMenu,   setShowMenu]   = useState(false);
  const [menuTopY,   setMenuTopY]   = useState(60);

  function openMenu() {
    headerRef.current?.measure((_x, _y, _w, height, _px, pageY) => {
      setMenuTopY(pageY + height);
      setShowMenu(true);
    });
  }

  function closeMenu() {
    setShowMenu(false);
  }

  async function handleDelete() {
    if (!actor || adminPending) return;
    closeMenu();
    Alert.alert(
      "Delete plan",
      "This will permanently delete this plan and all responses. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setAdminPending(true);
            try {
              await decisionRepository.deleteDecision({ decisionId, actor });
              navigation.navigate("Home" as any);
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Could not delete decision.");
              setAdminPending(false);
            }
          },
        },
      ]
    );
  }

  async function handleLeave() {
    if (!actor || adminPending) return;
    closeMenu();
    Alert.alert(
      "Leave plan",
      "You'll be removed from this plan and your responses will be cleared.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            setAdminPending(true);
            try {
              await decisionRepository.leaveDecision({ decisionId, actor });
              navigation.navigate("Home" as any);
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Could not leave decision.");
              setAdminPending(false);
            }
          },
        },
      ]
    );
  }

  // ── Copy invite code ─────────────────────────────────────────────────────────
  const [codeCopied, setCodeCopied] = useState(false);

  async function handleCopyCode(code: string) {
    await Clipboard.setStringAsync(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  // ── Remind group (creator, live phase) ──────────────────────────────────────
  async function handleRemindGroup() {
    if (!decisionState) return;
    const text = buildReminderText(decisionState.decision);
    try {
      await Share.share({ message: text });
    } catch {
      // user dismissed share sheet — no-op
    }
  }

  // ── Copy result (locked phase) ───────────────────────────────────────────────
  const [resultCopied, setResultCopied] = useState(false);

  async function handleCopyResult() {
    if (!decisionState) return;
    const { decision: d, members: m, options: opts } = decisionState;
    const lockedOption =
      (d.resolvedOptionId ? opts.find((o) => o.id === d.resolvedOptionId) : null)
      ?? opts[0]
      ?? null;
    const text = buildResultText(d, lockedOption, m);
    await Clipboard.setStringAsync(text);
    setResultCopied(true);
    setTimeout(() => setResultCopied(false), 2500);
  }

  // ── Add to calendar (locked phase) ──────────────────────────────────────────
  async function handleAddToCalendar() {
    if (!decisionState) return;
    const { decision: d, options: opts } = decisionState;
    const lockedOption =
      (d.resolvedOptionId ? opts.find((o) => o.id === d.resolvedOptionId) : null)
      ?? opts[0]
      ?? null;
    const url = buildCalendarUrl(d, lockedOption?.title ?? null);
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Can't open calendar", "Unable to open the calendar link.");
    }
  }

  // ── Rename ──────────────────────────────────────────────────────────────────
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameText,      setRenameText]      = useState("");
  const [renameError,     setRenameError]     = useState<string | null>(null);
  const [renameSaving,    setRenameSaving]    = useState(false);

  function handleOpenRename() {
    if (!decisionState) return;
    setRenameText(decisionState.decision.title);
    setRenameError(null);
    setShowRenameModal(true);
  }

  async function handleSaveRename() {
    if (!actor || renameSaving) return;
    const trimmed = renameText.trim();
    if (!trimmed) { setRenameError("Title can't be empty."); return; }
    setRenameSaving(true);
    setRenameError(null);
    try {
      await decisionRepository.renameDecision({ decisionId, actor, title: trimmed });
      await refreshState();
      setShowRenameModal(false);
    } catch (e: any) {
      setRenameError(e?.message ?? "Could not rename plan.");
    } finally {
      setRenameSaving(false);
    }
  }

  // ── Countdown expiry ─────────────────────────────────────────────────────────
  // CountdownTimer fires onExpired when it reaches "Locked".
  // Re-fetch to get the repository's locked state (deadline auto-apply).
  const handleCountdownExpired = useCallback(() => {
    refreshState();
  }, [refreshState]);

  // ── Render guards ────────────────────────────────────────────────────────────
  if (initialLoading || !actor) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#818cf8" size="large" />
      </View>
    );
  }

  if (loadError || !decisionState) {
    return (
      <View style={styles.centered}>
        <MaterialIcons name="error-outline" size={40} color="#f87171" />
        <Text style={styles.errorText}>{loadError ?? "Decision not found."}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => refreshState()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { decision, options, members, isCreator, isLocked, isSetupPhase, leaderOptionIds, ruleMessage, hasAnyResponse } = decisionState;
  const leaderSet      = new Set(leaderOptionIds);
  const mappedMembers  = mapToDecisionMembers(members, decision);
  const myDisplayName  = actor?.kind === "user"
    ? (members.find((m) => m.actorUserId === actor.userId)?.displayName ?? null)
    : null;

  // ── Threshold progress helper ───────────────────────────────────────────────
  function thresholdProgressFor(imInCount: number): string | null {
    // Only show per-option progress in race mode (earlyLockEnabled).
    // With deadline-only quorum, mid-session counts don't trigger anything,
    // so showing "Needs X more" implies a live lock trigger that doesn't exist.
    const n = decision.minimumAttendees;
    if (n === null || n <= 0 || !decision.earlyLockEnabled) return null;
    const needed = n - imInCount;
    if (needed <= 0) return null;
    return needed === 1 ? "Needs 1 more to lock" : `Needs ${needed} more to lock`;
  }

  // During active phase, use leaderOptionIds for live highlighting.
  // At lock time, use resolvedOptionId (always a single option or null).
  const isTied     = isLocked  && leaderOptionIds.length > 1;
  const isLiveTied = !isLocked && leaderOptionIds.length > 1;
  const resolvedOption = isLocked && decision.resolvedOptionId
    ? options.find(o => o.id === decision.resolvedOptionId) ?? null
    : null;
  // Fallback for when resolution hasn't run yet (status='locked' but
  // resolution_reason is still null — cron hasn't fired yet).
  const leader  = resolvedOption ?? (
    isLocked && leaderOptionIds.length === 1
      ? options.find(o => o.id === leaderOptionIds[0]) ?? null
      : null
  );

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <SafeAreaView style={styles.safeInner}>

        {/* ════════════════════════════════════════
            HEADER — two-row hierarchy
            Row 1 (nav):    ← back | title | more-vert
            Row 2 (status): timer | votes remaining  [active only]
        ════════════════════════════════════════ */}
        <View style={styles.header} ref={headerRef}>

          {/* ── Row 1: Navigation ── */}
          <View style={styles.navRow}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <MaterialIcons name="arrow-back" size={20} color="#94a3b8" />
            </TouchableOpacity>

            {isCreator && isSetupPhase ? (
              <TouchableOpacity
                style={styles.titleBtn}
                onPress={handleOpenRename}
                activeOpacity={0.75}
                accessibilityLabel="Rename decision"
                accessibilityRole="button"
              >
                <Text style={styles.navTitleEditable} numberOfLines={1}>{decision.title}</Text>
                <MaterialIcons name="edit" size={13} color="#475569" />
              </TouchableOpacity>
            ) : (
              <Text style={styles.navTitle} numberOfLines={1}>
                {decision.title}
              </Text>
            )}

            <MembersButton
              members={mappedMembers}
              decisionId={decisionId}
              decisionTitle={decision.title}
              currentUserId={actor.kind === "user" ? actor.userId : ""}
              isOrganizer={isCreator}
              showVoteStatus={false}
              onMemberChanged={refreshState}
              onLeft={() => navigation.goBack()}
            />

            <TouchableOpacity
              style={[styles.navAction, showMenu && styles.navActionActive]}
              onPress={openMenu}
              disabled={adminPending}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="More options"
              accessibilityRole="button"
            >
              <MaterialIcons name="more-vert" size={20} color={showMenu ? "#a5b4fc" : "#64748b"} />
            </TouchableOpacity>
          </View>

          {/* ── Row 2: Countdown (live) or locked pill ── */}
          {!isSetupPhase && (
            <View style={styles.statusRow}>
              {!isLocked ? (
                <>
                  <CountdownTimer
                    closesAt={decision.closesAt}
                    onExpired={handleCountdownExpired}
                    compact
                  />
                  {decision.earlyLockEnabled && decision.minimumAttendees !== null && decision.minimumAttendees > 0 && (
                    <Text style={styles.thresholdInlineText}>
                      — or sooner if {decision.minimumAttendees} say they're in
                    </Text>
                  )}
                </>
              ) : (
                <View style={styles.lockedPill}>
                  <MaterialIcons name="lock" size={11} color="#64748b" />
                  <Text style={styles.lockedPillText}>Locked</Text>
                </View>
              )}
            </View>
          )}

          {/* ── Row 3: Invite code — deeply secondary, creator + active only ── */}
          {isCreator && !isLocked && (
            <View style={styles.codeRow}>
              <Text style={styles.codeRowLabel}>Code</Text>
              <Text style={styles.codeRowValue}>{decision.inviteCode}</Text>
              <TouchableOpacity
                style={[styles.codeRowCopyBtn, codeCopied && styles.codeRowCopyBtnCopied]}
                onPress={() => handleCopyCode(decision.inviteCode)}
                hitSlop={8}
              >
                <MaterialIcons
                  name={codeCopied ? "check" : "content-copy"}
                  size={10}
                  color={codeCopied ? "#86efac" : "#2d3f52"}
                />
                <Text style={[styles.codeRowCopyText, codeCopied && styles.codeRowCopyTextCopied]}>
                  {codeCopied ? "Copied" : "Copy"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── ACTION MENU ── */}
        <Modal
          visible={showMenu}
          transparent
          animationType="none"
          statusBarTranslucent
          onRequestClose={closeMenu}
        >
          <Pressable style={styles.menuBackdrop} onPress={closeMenu}>
            <View
              style={[styles.menuSheet, { top: menuTopY }]}
              onStartShouldSetResponder={() => true}
            >
              {isCreator && !isLocked && (
                <>
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => { closeMenu(); handleRemindGroup(); }}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="share" size={17} color="#94a3b8" />
                    <Text style={styles.menuItemText}>Remind group</Text>
                  </TouchableOpacity>

                  <View style={styles.menuSep} />

                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => { closeMenu(); handleExtend(); }}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="schedule" size={17} color="#94a3b8" />
                    <Text style={styles.menuItemText}>Extend deadline</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => { closeMenu(); handleEndEarly(); }}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="lock-outline" size={17} color="#94a3b8" />
                    <Text style={styles.menuItemText}>End now</Text>
                  </TouchableOpacity>

                  <View style={styles.menuSep} />
                </>
              )}

              {isCreator ? (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleDelete}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="delete-outline" size={17} color="#f87171" />
                  <Text style={styles.menuItemTextDanger}>Delete plan</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleLeave}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="logout" size={17} color="#f87171" />
                  <Text style={styles.menuItemTextDanger}>Leave plan</Text>
                </TouchableOpacity>
              )}
            </View>
          </Pressable>
        </Modal>

        {/* ── RENAME MODAL ── */}
        <Modal
          visible={showRenameModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRenameModal(false)}
        >
          <Pressable
            style={styles.renameBackdrop}
            onPress={() => setShowRenameModal(false)}
          >
            <View style={styles.renameSheet} onStartShouldSetResponder={() => true}>
              <Text style={styles.renameTitle}>Rename plan</Text>
              <TextInput
                style={[styles.renameInput, renameError ? styles.renameInputError : null]}
                value={renameText}
                onChangeText={(t) => { setRenameText(t); if (renameError) setRenameError(null); }}
                placeholder="Plan title"
                placeholderTextColor="#475569"
                maxLength={60}
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                onSubmitEditing={handleSaveRename}
              />
              {renameError ? (
                <Text style={styles.renameErrorText}>{renameError}</Text>
              ) : null}
              <View style={styles.renameActions}>
                <TouchableOpacity
                  style={styles.renameCancelBtn}
                  onPress={() => setShowRenameModal(false)}
                  disabled={renameSaving}
                >
                  <Text style={styles.renameCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.renameSaveBtn, (!renameText.trim() || renameSaving) && styles.renameSaveBtnDisabled]}
                  onPress={handleSaveRename}
                  disabled={!renameText.trim() || renameSaving}
                >
                  {renameSaving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.renameSaveText}>Save</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Modal>

        {/* ── SETUP STATE INDICATOR (setup phase only) ── */}
        {isSetupPhase && !isLocked && (
          <View style={[styles.stateIndicator, styles.stateIndicatorSetup]}>
            <View style={styles.stateIndicatorDotSetup} />
            <Text style={[styles.stateIndicatorText, styles.stateIndicatorTextSetup]}>
              Not shared yet
            </Text>
          </View>
        )}

        {/* ── SETUP PHASE ── */}
        {/* Shown in place of the voting UI while setup_phase = true. */}
        {isSetupPhase && (
          isCreator ? (
            /* ── Creator staging area ── */
            <ScrollView
              style={styles.setupScroll}
              contentContainerStyle={styles.setupContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Options section */}
              <Text style={styles.setupSectionLabel}>Options</Text>

              {options.map((opt) => (
                <View key={opt.id} style={styles.setupOptionRow}>
                  {editingOption?.id === opt.id ? (
                    <TextInput
                      style={styles.setupOptionEditInput}
                      value={editingOption.text}
                      onChangeText={(t) => setEditingOption({ id: opt.id, text: t })}
                      onSubmitEditing={handleSetupSaveEdit}
                      onBlur={handleSetupSaveEdit}
                      autoFocus
                      returnKeyType="done"
                      maxLength={80}
                    />
                  ) : (
                    <TouchableOpacity
                      style={styles.setupOptionTextWrap}
                      onPress={() => setEditingOption({ id: opt.id, text: opt.title })}
                      activeOpacity={0.7}
                      disabled={setupPending}
                    >
                      <Text style={styles.setupOptionText}>{opt.title}</Text>
                      <MaterialIcons name="edit" size={13} color="#334155" />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => handleSetupDeleteOption(opt.id)}
                    disabled={setupPending}
                    hitSlop={8}
                    style={styles.setupDeleteBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${opt.title}`}
                  >
                    <MaterialIcons name="close" size={16} color="#475569" />
                  </TouchableOpacity>
                </View>
              ))}

              {/* Add option — collapsed button or expanded input */}
              {showAddInput ? (
                <View style={styles.setupAddRow}>
                  <TextInput
                    style={styles.setupAddInput}
                    placeholder="Option name…"
                    placeholderTextColor="#3d5068"
                    value={setupOptionInput}
                    onChangeText={(t) => { setSetupOptionInput(t); if (setupOptionError) setSetupOptionError(null); }}
                    onSubmitEditing={handleSetupAddOption}
                    returnKeyType="done"
                    editable={!setupPending}
                    maxLength={80}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={[styles.setupAddBtn, (!setupOptionInput.trim() || setupPending) && styles.setupAddBtnDisabled]}
                    onPress={handleSetupAddOption}
                    disabled={!setupOptionInput.trim() || setupPending}
                    accessibilityRole="button"
                    accessibilityLabel="Add option"
                  >
                    <MaterialIcons name="add" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.setupAddTrigger}
                  onPress={() => setShowAddInput(true)}
                  disabled={setupPending}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="add" size={16} color="#6366f1" />
                  <Text style={styles.setupAddTriggerText}>Add option</Text>
                </TouchableOpacity>
              )}
              {setupOptionError ? (
                <Text style={styles.setupErrorText}>{setupOptionError}</Text>
              ) : null}

              <Text style={styles.setupHint}>Add a few options, then share</Text>

              {/* Quorum section — chips */}
              <Text style={[styles.setupSectionLabel, { marginTop: 24 }]}>Plan locks when:</Text>
              <View style={styles.setupChipsRow}>
                {([0, 2, 3] as const).map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.setupChip, setupMinAttendees === n && styles.setupChipActive]}
                    onPress={() => {
                      setSetupMinAttendees(n);
                      if (n === 0) setSetupEarlyLock(false);
                    }}
                    disabled={setupPending}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.setupChipText, setupMinAttendees === n && styles.setupChipTextActive]}>
                      {n === 0 ? "No minimum" : `${n} people say they're in`}
                    </Text>
                  </TouchableOpacity>
                ))}
                {/* "More…" chip — replaces itself with the chosen value when >= 4 */}
                {setupMinAttendees >= 4 ? (
                  <TouchableOpacity
                    style={[styles.setupChip, styles.setupChipActive]}
                    onPress={() => setShowMorePicker(true)}
                    disabled={setupPending}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.setupChipText, styles.setupChipTextActive]}>
                      {setupMinAttendees} people say they're in
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.setupChip}
                    onPress={() => setShowMorePicker(true)}
                    disabled={setupPending}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.setupChipText}>More…</Text>
                  </TouchableOpacity>
                )}
              </View>

              {setupMinAttendees > 0 && (
                <TouchableOpacity
                  style={[styles.setupEarlyLockRow, setupEarlyLock && styles.setupEarlyLockRowActive]}
                  onPress={() => setSetupEarlyLock((v) => !v)}
                  disabled={setupPending}
                  activeOpacity={0.75}
                  accessibilityRole="checkbox"
                  accessibilityLabel="Lock as soon as threshold is met"
                >
                  <MaterialIcons
                    name={setupEarlyLock ? "check-box" : "check-box-outline-blank"}
                    size={18}
                    color={setupEarlyLock ? "#818cf8" : "#475569"}
                  />
                  <Text style={[styles.setupEarlyLockText, setupEarlyLock && styles.setupEarlyLockTextActive]}>
                    Lock as soon as threshold is met
                  </Text>
                </TouchableOpacity>
              )}

              {/* Share Plan CTA */}
              <TouchableOpacity
                style={[styles.startBtn, setupPending && styles.startBtnDisabled]}
                onPress={handleEndSetupPhase}
                disabled={setupPending}
                accessibilityRole="button"
              >
                {setupPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <MaterialIcons name="share" size={18} color="#fff" />
                    <Text style={styles.startBtnText}>Share Plan</Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={styles.startBtnSubtext}>People can join and respond</Text>

              {/* Invite code */}
              <View style={styles.setupCodeRow}>
                <Text style={styles.setupCodeLabel}>Invite code: </Text>
                <Text style={styles.setupCodeValue}>{decision.inviteCode}</Text>
              </View>
            </ScrollView>
          ) : (
            /* ── Participant waiting view ── */
            <View style={styles.setupWaiting}>
              <MaterialIcons name="hourglass-empty" size={36} color="#334155" />
              <Text style={styles.setupWaitingTitle}>Setting up…</Text>
              <Text style={styles.setupWaitingHint}>
                Waiting for the host to share the plan. You'll be able to respond once it goes live.
              </Text>
              {options.length > 0 && (
                <View style={styles.setupWaitingOptions}>
                  {options.map((opt) => (
                    <View key={opt.id} style={styles.setupWaitingOption}>
                      <Text style={styles.setupWaitingOptionText}>{opt.title}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )
        )}

        {/* ── LIVE SUMMARY BAR — status + lock rule in one line ── */}
        {!isSetupPhase && !isLocked && (
          <View style={styles.liveSummaryBar}>
            <View style={styles.liveSummaryDot} />
            <Text style={styles.liveSummaryText}>Live · {ruleMessage}</Text>
          </View>
        )}

        {/* ── RESULT BANNER (locked) ── */}
        {!isSetupPhase && isLocked && (
          <View style={[
            styles.resultBanner,
            decision.resolutionReason === "winner" || leader
              ? styles.winnerBanner
              : decision.resolutionReason === "no_quorum"
              ? styles.noQuorumBanner
              : styles.noVotesBanner,
          ]}>
            {decision.resolutionReason === "winner" && leader ? (
              // ── Resolved winner ──
              <>
                <Text style={styles.resultLabel}>Locked in</Text>
                <Text style={styles.winnerTitle}>{leader.title}</Text>
                <Text style={styles.winnerMeta}>
                  {leader.imInCount} {leader.imInCount === 1 ? "person" : "people"} in
                </Text>
              </>
            ) : decision.resolutionReason === "no_quorum" ? (
              // ── Quorum was set but not met ──
              <>
                <MaterialIcons name="people-outline" size={20} color="rgba(255,200,100,0.6)" />
                <Text style={styles.resultLabel}>Quorum not reached</Text>
                {decision.minimumAttendees !== null && (
                  <Text style={styles.winnerMeta}>
                    Needed {decision.minimumAttendees} people in
                  </Text>
                )}
              </>
            ) : decision.resolutionReason === "no_responses" || (!leader && !isTied) ? (
              // ── No im_in responses ──
              <>
                <MaterialIcons name="people-outline" size={20} color="rgba(255,255,255,0.3)" />
                <Text style={styles.resultLabel}>Nobody committed to a plan</Text>
              </>
            ) : isTied && !decision.resolvedOptionId ? (
              // ── Fallback: resolution not yet run (cron pending) ──
              <>
                <Text style={styles.resultLabel}>It's a tie</Text>
                <View style={styles.tiedList}>
                  {leaderOptionIds.map(id => {
                    const opt = options.find(o => o.id === id);
                    return opt ? (
                      <Text key={id} style={styles.tiedOptionTitle}>{opt.title}</Text>
                    ) : null;
                  })}
                </View>
              </>
            ) : leader ? (
              // ── Fallback: leading option while resolution is pending ──
              <>
                <Text style={styles.resultLabel}>Leading</Text>
                <Text style={styles.winnerTitle}>{leader.title}</Text>
                <Text style={styles.winnerMeta}>
                  {leader.imInCount} {leader.imInCount === 1 ? "person" : "people"} in
                </Text>
              </>
            ) : null}
          </View>
        )}

        {/* ── OPTION LIST (active/locked voting, not setup) ── */}
        {!isSetupPhase && <FlatList
          data={options}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, options.length === 0 && styles.listEmpty]}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            <View>
              {members.length > 1 && (
                <ParticipantsSection
                  members={members}
                  createdBy={decision.createdBy}
                />
              )}
              {actor?.kind === "user" && (
                <DiscussionPreview
                  commentCount={comments.reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0)}
                  latestComment={
                    comments
                      .flatMap((c) => [c, ...(c.replies ?? [])])
                      .filter((c) => !c.deleted_at)
                      .slice(-1)[0] ?? null
                  }
                  onOpen={() => setShowDiscussion(true)}
                />
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyHint}>
                No options were added.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <QuickOptionCard
              option={item}
              isLeading={leaderSet.has(item.id)}
              isLocked={isLocked}
              isTied={isTied}
              isLiveTied={isLiveTied}
              suppressLeadingLabel={decision.earlyLockEnabled && !isLocked}
              isPending={pendingOptionId === item.id}
              minimumAttendees={decision.minimumAttendees}
              thresholdProgress={thresholdProgressFor(item.imInCount)}
              onSetResponse={(response) => handleSetResponse(item.id, response)}
              onToggleTopChoice={() => handleToggleTopChoice(item.id)}
            />
          )}
        />}

        {/* ── POST-DECISION FOOTER (locked only) ── */}
        {!isSetupPhase && isLocked && (
          <View style={styles.lockedFooter}>
            <TouchableOpacity
              style={styles.startAnotherBtn}
              onPress={() => navigation.replace("QuickStartScreen")}
              accessibilityRole="button"
            >
              <MaterialIcons name="add" size={18} color="#fff" />
              <Text style={styles.startAnotherText}>Start Another Plan</Text>
            </TouchableOpacity>
            <View style={styles.lockedUtilRow}>
              <TouchableOpacity
                style={[styles.copyResultBtn, resultCopied && styles.copyResultBtnCopied]}
                onPress={handleCopyResult}
                accessibilityRole="button"
                accessibilityLabel="Copy result to clipboard"
              >
                <MaterialIcons
                  name={resultCopied ? "check" : "content-copy"}
                  size={15}
                  color={resultCopied ? "#86efac" : "#94a3b8"}
                />
                <Text style={[styles.copyResultText, resultCopied && styles.copyResultTextCopied]}>
                  {resultCopied ? "Copied" : "Copy result"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.calendarBtn}
                onPress={handleAddToCalendar}
                accessibilityRole="button"
                accessibilityLabel="Add to calendar"
              >
                <MaterialIcons name="calendar-today" size={15} color="#94a3b8" />
                <Text style={styles.calendarBtnText}>Add to calendar</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.homeBtn}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
            >
              <Text style={styles.homeBtnText}>Back to Home</Text>
            </TouchableOpacity>
          </View>
        )}

      </SafeAreaView>

      {/* ── Discussion sheet ── */}
      {actor?.kind === "user" && (
        <DiscussionSheet
          visible={showDiscussion}
          onClose={() => setShowDiscussion(false)}
          decisionId={decisionId}
          userId={actor.userId}
          displayName={myDisplayName}
          comments={comments}
          onCommentAdded={loadComments}
          isOrganizer={isCreator}
        />
      )}

      {/* ── MORE THRESHOLD PICKER ── */}
      <Modal
        visible={showMorePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMorePicker(false)}
      >
        <Pressable style={styles.pickerBackdrop} onPress={() => setShowMorePicker(false)}>
          <View style={styles.pickerSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>Plan locks when…</Text>
            {([4, 5, 6, 8, 10] as const).map((n) => (
              <TouchableOpacity
                key={n}
                style={[styles.pickerRow, setupMinAttendees === n && styles.pickerRowActive]}
                onPress={() => {
                  setSetupMinAttendees(n);
                  setShowMorePicker(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.pickerRowText, setupMinAttendees === n && styles.pickerRowTextActive]}>
                  {n} people say they're in
                </Text>
                {setupMinAttendees === n && (
                  <MaterialIcons name="check" size={18} color="#818cf8" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  safeInner: {
    flex: 1,
  },
  centered: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    color: "#f87171",
    fontSize: 15,
    textAlign: "center",
    marginTop: 12,
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#4f46e5",
    borderRadius: 8,
  },
  retryText: {
    color: "#fff",
    fontWeight: "600",
  },

  // ── Live summary bar — status + lock rule in one strip ──────────────────────
  liveSummaryBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: "rgba(34,197,94,0.05)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  liveSummaryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22c55e",
    flexShrink: 0,
  },
  liveSummaryText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#4ade80",
    flex: 1,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: "#111827",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },

  // Row 1: back | title | invite icon
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 6,
    minHeight: 48,
    gap: 8,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  navTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#f1f5f9",
    letterSpacing: -0.3,
  },
  titleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  },
  navTitleEditable: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#f1f5f9",
    letterSpacing: -0.3,
  },
  navAction: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    flexShrink: 0,
  },
  navActionActive: {
    backgroundColor: "rgba(99,102,241,0.18)",
  },
  // Row 2: timer (left) + vote count (right, muted secondary)
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  votesStatusText: {
    fontSize: 11,
    color: "#3d5068",
    fontWeight: "500",
  },

  adminBtnDisabled: {
    opacity: 0.35,
  },

  // ── Action menu ──────────────────────────────────────────────────────────────
  menuBackdrop: {
    flex: 1,
  },
  menuSheet: {
    position: "absolute",
    right: 10,
    minWidth: 210,
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
    paddingVertical: 13,
  },
  menuItemText: {
    fontSize: 14,
    color: "#cbd5e1",
    fontWeight: "500",
  },
  menuItemTextDanger: {
    fontSize: 14,
    color: "#f87171",
    fontWeight: "500",
  },
  menuSep: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginHorizontal: 12,
  },

  // ── Participants section (below options, above Notes) ────────────────────────
  participantsSection: {
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 2,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  participantsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  participantsSectionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  participantsSectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    letterSpacing: 0.2,
  },
  participantsSectionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  participantsSummaryText: {
    fontSize: 12,
    color: "#475569",
  },
  participantsList: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: 8,
  },
  participantDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  participantDotResponded: {
    backgroundColor: "#22c55e",
  },
  participantDotWaiting: {
    backgroundColor: "#334155",
  },
  participantName: {
    flex: 1,
    fontSize: 13,
    color: "#94a3b8",
  },
  hostBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: "rgba(99,102,241,0.15)",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.25)",
  },
  hostBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#818cf8",
    letterSpacing: 0.3,
  },

  // ── Invite code row — deeply secondary footer of header ──────────────────────
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 5,
    gap: 5,
  },
  codeRowLabel: {
    fontSize: 10,
    color: "#253347",
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  codeRowValue: {
    fontSize: 11,
    color: "#2d3f52",
    fontWeight: "600",
    letterSpacing: 1,
    flex: 1,
  },
  codeRowCopyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  codeRowCopyBtnCopied: {},
  codeRowCopyText: {
    fontSize: 10,
    color: "#253347",
    fontWeight: "500",
  },
  codeRowCopyTextCopied: {
    color: "#4ade80",
  },

  // ── Result banner ──
  resultBanner: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 4,
  },
  winnerBanner: {
    backgroundColor: "#14532d",
  },
  tieBanner: {
    backgroundColor: "#1e3a5f",
  },
  noVotesBanner: {
    backgroundColor: "#1e293b",
  },
  noQuorumBanner: {
    backgroundColor: "#2a1f0e",
  },
  resultLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "rgba(255,255,255,0.45)",
  },
  winnerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginTop: 2,
  },
  winnerMeta: {
    fontSize: 13,
    color: "rgba(255,255,255,0.35)",
    marginTop: 2,
  },
  tiedList: {
    marginTop: 6,
    gap: 4,
    alignItems: "center",
  },
  tiedOptionTitle: {
    fontSize: 15,
    color: "#fff",
    textAlign: "center",
  },

  // ── List ──
  list: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    flexGrow: 1,
  },
  listEmpty: {
    flex: 1,
    justifyContent: "flex-end",
  },
  emptyState: {
    paddingHorizontal: 2,
    paddingBottom: 10,
  },
  emptyHint: {
    color: "#2d3f52",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },

  // ── Rename modal ──
  renameBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  renameSheet: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 16,
  },
  renameTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#f1f5f9",
  },
  renameInput: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#f1f5f9",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
  },
  renameInputError: {
    borderColor: "rgba(248,113,113,0.45)",
  },
  renameErrorText: {
    color: "#f87171",
    fontSize: 12,
    marginTop: -6,
  },
  renameActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  renameCancelBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  renameCancelText: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "600",
  },
  renameSaveBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#4f46e5",
  },
  renameSaveBtnDisabled: {
    opacity: 0.45,
  },
  renameSaveText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },

  // ── Discussion preview ────────────────────────────────────────────────────────
  discussionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginTop: 8,
    gap: 8,
  },
  discussionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
  },
  discussionLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#475569",
    letterSpacing: 0.1,
  },
  discussionPreviewText: {
    flex: 1,
    fontSize: 12,
    color: "#334155",
    minWidth: 0,
  },
  discussionCTA: {
    color: "#475569",
    fontWeight: "400",
  },
  discussionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  discussionBadge: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  discussionBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },

  // ── Locked footer ──
  lockedFooter: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
    backgroundColor: "#1e293b",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 10,
  },
  startAnotherBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#4f46e5",
    borderRadius: 12,
    paddingVertical: 14,
  },
  startAnotherText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  lockedUtilRow: {
    flexDirection: "row",
    gap: 8,
  },
  copyResultBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  calendarBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  calendarBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#94a3b8",
  },
  copyResultBtnCopied: {
    borderColor: "rgba(134,239,172,0.25)",
    backgroundColor: "rgba(34,197,94,0.06)",
  },
  copyResultText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#94a3b8",
  },
  copyResultTextCopied: {
    color: "#86efac",
  },
  homeBtn: {
    alignItems: "center",
    paddingVertical: 8,
  },
  homeBtnText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "500",
  },

  // ── Setup phase ──────────────────────────────────────────────────────────────
  setupScroll: {
    flex: 1,
  },
  setupContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  setupSectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  setupOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    gap: 8,
  },
  setupOptionTextWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  setupOptionText: {
    flex: 1,
    fontSize: 14,
    color: "#e2e8f0",
    fontWeight: "500",
  },
  setupOptionEditInput: {
    flex: 1,
    fontSize: 14,
    color: "#f1f5f9",
    backgroundColor: "#141f2e",
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.45)",
  },
  setupDeleteBtn: {
    padding: 4,
  },
  setupAddTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 2,
    marginTop: 2,
  },
  setupAddTriggerText: {
    fontSize: 14,
    color: "#6366f1",
    fontWeight: "600",
  },
  setupAddRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  setupAddInput: {
    flex: 1,
    backgroundColor: "#141f2e",
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: "#f1f5f9",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.35)",
  },
  setupAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#4f46e5",
    alignItems: "center",
    justifyContent: "center",
  },
  setupAddBtnDisabled: {
    backgroundColor: "#1a2235",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  setupErrorText: {
    color: "#f87171",
    fontSize: 12,
    marginTop: 6,
    marginLeft: 2,
  },
  setupHint: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "500",
    marginTop: 10,
    marginBottom: 2,
  },
  setupChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  setupChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  setupChipActive: {
    backgroundColor: "rgba(99,102,241,0.15)",
    borderColor: "rgba(99,102,241,0.4)",
  },
  setupChipText: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "500",
  },
  setupChipTextActive: {
    color: "#818cf8",
    fontWeight: "600",
  },
  setupEarlyLockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginBottom: 10,
  },
  setupEarlyLockRowActive: {
    backgroundColor: "rgba(99,102,241,0.1)",
    borderColor: "rgba(99,102,241,0.25)",
  },
  setupEarlyLockText: {
    fontSize: 13,
    color: "#475569",
    flex: 1,
  },
  setupEarlyLockTextActive: {
    color: "#818cf8",
  },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#4f46e5",
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 20,
  },
  startBtnDisabled: {
    opacity: 0.55,
  },
  startBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  startBtnSubtext: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "500",
    textAlign: "center",
    marginTop: 8,
  },
  setupCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
    gap: 4,
  },
  setupCodeLabel: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "500",
  },
  setupCodeValue: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  // ── Setup phase: participant waiting view ────────────────────────────────────
  setupWaiting: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  setupWaitingTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: -0.2,
  },
  setupWaitingHint: {
    fontSize: 13,
    color: "#334155",
    textAlign: "center",
    lineHeight: 19,
  },
  setupWaitingOptions: {
    marginTop: 16,
    width: "100%",
    gap: 6,
  },
  setupWaitingOption: {
    backgroundColor: "#1e293b",
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  setupWaitingOptionText: {
    fontSize: 14,
    color: "#475569",
    fontWeight: "500",
  },

  // ── State indicator bar ──────────────────────────────────────────────────────
  stateIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  stateIndicatorSetup: {
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  stateIndicatorLive: {},
  stateIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stateIndicatorDotSetup: {
    backgroundColor: "#334155",
  },
  stateIndicatorDotLive: {},
  stateIndicatorText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  stateIndicatorTextSetup: {
    color: "#475569",
  },
  stateIndicatorTextLive: {},

  // ── Threshold hint inline (within statusRow) ────────────────────────────────
  thresholdInlineText: {
    fontSize: 11,
    color: "#334155",
    fontWeight: "500",
    flexShrink: 1,
    marginLeft: 4,
  },

  // ── Locked pill (header status row when locked) ──────────────────────────────
  lockedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  lockedPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
    letterSpacing: 0.2,
  },

  // ── More threshold picker (bottom sheet modal) ───────────────────────────────
  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: "#1e293b",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
  },
  pickerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  pickerTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  pickerRowActive: {
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  pickerRowText: {
    fontSize: 15,
    color: "#94a3b8",
    fontWeight: "500",
  },
  pickerRowTextActive: {
    color: "#a5b4fc",
    fontWeight: "600",
  },
});
