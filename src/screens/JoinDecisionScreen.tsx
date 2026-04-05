import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from "react-native";
import { TextInput as PaperInput, useTheme } from "react-native-paper";
import { useNavigation, useRoute } from "@react-navigation/native";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { supabase } from "../lib/supabase";
import { isDemoMode, DEMO_USER_ID } from "../lib/demoMode";
import {
  fetchDecisionDetail,
  fetchDecisionByInviteCode,
  joinDecision,
} from "../lib/decisions";
import { checkParticipantLimit } from "../lib/subscription";
import { formatLockTime } from "../utils/dateDisplay";
import UpgradePrompt from "../components/UpgradePrompt";
import { PHASE_LABELS } from "../../assets/constants/decisionTypes";
import type { Decision } from "../types/decisions";
import { resolveDecisionActor } from "../lib/resolveDecisionActor";
import { getGuestDisplayName, setGuestDisplayName } from "../lib/guest";
import { decisionRepository } from "../lib/repositoryProvider";
import type { DecisionActor, QuickDecision } from "../domain/decisionTypes";

// ── Input theme — matches LoginScreen and the rest of the dark design system ──
const INPUT_THEME = {
  colors: {
    primary: "#6366f1",
    onSurfaceVariant: "#64748b",
    outline: "#334155",
    onSurface: "#f1f5f9",
    surface: "#1e293b",
    background: "#0f172a",
  },
};

// ── Category meta for the compact quick-mode preview ─────────────────────────

type IconName = React.ComponentProps<typeof Icon>["name"];

const CATEGORY_META: Record<string, { icon: IconName; color: string; label: string }> = {
  food:     { icon: "restaurant",     color: "#f97316", label: "Food"     },
  activity: { icon: "directions-run", color: "#22c55e", label: "Activity" },
  trip:     { icon: "flight",         color: "#38bdf8", label: "Trip"     },
  other:    { icon: "lightbulb",      color: "#a78bfa", label: "Other"    },
};

// ─── Adapter: QuickDecision → legacy Decision preview shape ──────────────────
function quickToLegacy(q: QuickDecision): Decision {
  return {
    id: q.id,
    title: q.title,
    description: null,
    type_label: q.category,
    created_by: q.createdBy,
    closes_at: q.closesAt,
    status: q.status,
    voting_mechanism: "point_allocation",
    max_options: 20,
    option_submission: "anyone",
    reveal_votes_after_lock: true,
    invite_code: q.inviteCode,
    created_at: q.createdAt,
    silent_voting: false,
    constraint_weights_enabled: false,
    mode: "quick",
  };
}

const JoinDecisionScreen = () => {
  const theme = useTheme(); // retained for advanced-mode preview
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const [inviteCode, setInviteCode] = useState(route.params?.inviteCode || "");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<string | undefined>();

  // ── Quick-mode join state ───────────────────────────────────────────────────
  const [alreadyMember, setAlreadyMember] = useState(false);
  const [storedDisplayName, setStoredDisplayName] = useState<string | null | undefined>(undefined);
  const [guestNameInput, setGuestNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  // ── Actor + stored display name resolved once on mount ─────────────────────
  const [actor, setActor] = useState<DecisionActor | null>(null);
  useEffect(() => {
    resolveDecisionActor().then(setActor);
    getGuestDisplayName().then(setStoredDisplayName);
  }, []);

  // Once actor is ready, auto-trigger any route-param driven action.
  useEffect(() => {
    if (!actor) return;

    if (route.params?.decisionId) {
      loadByDecisionId(route.params.decisionId, actor);
      return;
    }

    const paramCode = route.params?.inviteCode;
    if (paramCode && paramCode.trim().length === 6) {
      handleLookup(paramCode.trim().toUpperCase());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor]);

  // ── Load by decision ID (deep-link entry) ──────────────────────────────────
  const loadByDecisionId = async (decisionId: string, resolvedActor: DecisionActor) => {
    setLoading(true);
    try {
      const d = await fetchDecisionDetail(decisionId);
      if (d) {
        setDecision(d);
        setLoading(false);
        return;
      }
    } catch {
      // Fall through to quick-mode repository.
    }
    try {
      const { decisionId: dId, alreadyMember: wasAlready } =
        await decisionRepository.joinDecision({ decisionIdOrCode: decisionId, actor: resolvedActor });
      const liveState = await decisionRepository.getLiveDecisionState({ decisionId: dId, actor: resolvedActor });
      setAlreadyMember(wasAlready);

      if (wasAlready && liveState.decision.status !== "locked") {
        setLoading(false);
        navigation.replace("LiveDecisionScreen", { decisionId: dId });
        return;
      }

      setDecision(quickToLegacy(liveState.decision));
    } catch {
      setLookupError("Decision not found. It may have expired or be from another session.");
    }
    setLoading(false);
  };

  // ── Lookup by invite code ──────────────────────────────────────────────────
  const handleLookup = async (overrideCode?: string) => {
    if (!actor) return;
    const code = (overrideCode ?? inviteCode).trim().toUpperCase();
    if (code.length !== 6) {
      setLookupError("Enter the full 6-character invite code.");
      return;
    }

    setLoading(true);
    setLookupError(null);
    try {
      const d = await fetchDecisionByInviteCode(code);
      if (d) {
        setDecision(d);
        setLoading(false);
        return;
      }
    } catch {
      // Fall through to quick-mode repository.
    }
    try {
      const { decisionId, alreadyMember: wasAlready } =
        await decisionRepository.joinDecision({ decisionIdOrCode: code, actor });
      const liveState = await decisionRepository.getLiveDecisionState({ decisionId, actor });
      setAlreadyMember(wasAlready);

      if (wasAlready && liveState.decision.status !== "locked") {
        setLoading(false);
        navigation.replace("LiveDecisionScreen", { decisionId });
        return;
      }

      setDecision(quickToLegacy(liveState.decision));
    } catch {
      setLookupError("No decision found for that code. Check it and try again.");
    }
    setLoading(false);
  };

  // ── Join / resume ──────────────────────────────────────────────────────────
  const handleJoin = async () => {
    if (!decision || !actor) return;

    setJoining(true);
    try {
      if (decision.mode === "quick") {
        if (alreadyMember) {
          const target = decision.status !== "locked" ? "LiveDecisionScreen" : "DecisionDetailScreen";
          navigation.replace(target, { decisionId: decision.id });
          return;
        }

        let displayName: string | undefined = storedDisplayName ?? undefined;
        if (actor.kind === "guest" && !displayName) {
          const trimmed = guestNameInput.trim();
          if (!trimmed) {
            setNameError("Enter your name to join.");
            setJoining(false);
            return;
          }
          if (trimmed.length > 30) {
            setNameError("Name must be 30 characters or fewer.");
            setJoining(false);
            return;
          }
          await setGuestDisplayName(trimmed);
          displayName = trimmed;
        }

        await decisionRepository.joinDecision({
          decisionIdOrCode: decision.id,
          actor,
          displayName,
        });

        Toast.show({
          type: "success",
          text1: "Joined!",
          text2: `You're in "${decision.title}"`,
          position: "bottom",
        });

        const target = decision.status !== "locked" ? "LiveDecisionScreen" : "DecisionDetailScreen";
        navigation.replace(target, { decisionId: decision.id });
        return;
      }

      // ── Advanced mode: existing behavior ─────────────────────────────────
      let currentUserId: string;
      if (isDemoMode()) {
        currentUserId = DEMO_USER_ID;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        currentUserId = user.id;
      }

      const participantCheck = await checkParticipantLimit(decision.id, decision.created_by);
      if (!participantCheck.allowed) {
        setUpgradeReason(participantCheck.reason);
        setShowUpgradePrompt(true);
        setJoining(false);
        return;
      }

      await joinDecision(decision.id, currentUserId);

      Toast.show({
        type: "success",
        text1: "Joined!",
        text2: `You're now part of "${decision.title}"`,
        position: "bottom",
      });

      navigation.replace("DecisionDetailScreen", { decisionId: decision.id });
    } catch (err: any) {
      if (err.message?.includes("duplicate") || err.message?.includes("already")) {
        Toast.show({ type: "info", text1: "Already a member", position: "bottom" });
        const targetScreen =
          decision.mode === "quick" && decision.status !== "locked"
            ? "LiveDecisionScreen"
            : "DecisionDetailScreen";
        navigation.replace(targetScreen, { decisionId: decision.id });
      } else {
        Toast.show({
          type: "error",
          text1: "Failed to join",
          text2: err.message || "Try again.",
          position: "bottom",
        });
      }
    }
    setJoining(false);
  };

  const handleReset = () => {
    setDecision(null);
    setLookupError(null);
    setAlreadyMember(false);
    setNameError(null);
    setGuestNameInput("");
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <View style={styles.container}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {!decision ? (
              // ── Code entry ────────────────────────────────────────────────
              <View style={styles.inputSection}>
                <Text style={styles.heading}>Join a Decision</Text>
                <Text style={styles.subtitle}>
                  Enter the 6-character code from the organizer.
                </Text>

                <PaperInput
                  label="Invite Code"
                  mode="outlined"
                  value={inviteCode}
                  onChangeText={(text) => {
                    setInviteCode(text.toUpperCase());
                    if (lookupError) setLookupError(null);
                  }}
                  onSubmitEditing={() => handleLookup()}
                  returnKeyType="go"
                  maxLength={6}
                  autoCapitalize="characters"
                  autoFocus={!route.params?.inviteCode}
                  style={styles.codeInput}
                  theme={INPUT_THEME}
                  contentStyle={styles.codeInputContent}
                  error={!!lookupError}
                />

                {lookupError ? (
                  <Text style={styles.inlineError}>{lookupError}</Text>
                ) : null}

                <TouchableOpacity
                  style={[
                    styles.lookupButton,
                    { opacity: loading || inviteCode.trim().length !== 6 ? 0.5 : 1 },
                  ]}
                  onPress={() => handleLookup()}
                  disabled={loading || inviteCode.trim().length !== 6}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.lookupButtonText}>Look Up</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : decision.mode === "quick" ? (
              // ── Quick-mode preview ────────────────────────────────────────
              <QuickPreview
                decision={decision}
                alreadyMember={alreadyMember}
                actor={actor}
                storedDisplayName={storedDisplayName}
                guestNameInput={guestNameInput}
                nameError={nameError}
                joining={joining}
                onChangeGuestName={(t) => { setGuestNameInput(t); if (nameError) setNameError(null); }}
                onJoin={handleJoin}
                onReset={handleReset}
              />
            ) : (
              // ── Advanced-mode preview ─────────────────────────────────────
              <View style={styles.previewSection}>
                <Icon
                  name="how-to-vote"
                  size={48}
                  color={theme.colors.primary}
                  style={{ alignSelf: "center", marginBottom: 12 }}
                />
                <Text style={[styles.previewTitle, { color: theme.colors.onBackground }]}>
                  {decision.title}
                </Text>

                {decision.description ? (
                  <Text style={[styles.previewDesc, { color: theme.colors.onSurfaceVariant }]}>
                    {decision.description}
                  </Text>
                ) : null}

                <View
                  style={[
                    styles.detailCard,
                    {
                      backgroundColor: (theme as any).custom?.card || theme.colors.surface,
                      borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
                    },
                  ]}
                >
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: theme.colors.onSurfaceVariant }]}>
                      Status
                    </Text>
                    <Text style={[styles.detailValue, { color: theme.colors.onBackground }]}>
                      {PHASE_LABELS[decision.status]}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: theme.colors.onSurfaceVariant }]}>
                      Lock Time
                    </Text>
                    <Text style={[styles.detailValue, { color: theme.colors.onBackground }]}>
                      {formatLockTime(decision.closes_at)}
                    </Text>
                  </View>
                  {decision.type_label ? (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: theme.colors.onSurfaceVariant }]}>
                        Category
                      </Text>
                      <Text style={[styles.detailValue, { color: theme.colors.onBackground }]}>
                        {decision.type_label.charAt(0).toUpperCase() + decision.type_label.slice(1)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={[styles.joinButton, { opacity: joining ? 0.6 : 1 }]}
                  onPress={handleJoin}
                  disabled={joining}
                >
                  {joining ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.joinButtonText}>Join Decision</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelButton} onPress={handleReset}>
                  <Text style={styles.cancelButtonText}>Try a different code</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      <UpgradePrompt
        visible={showUpgradePrompt}
        onClose={() => setShowUpgradePrompt(false)}
        onUpgrade={() => {
          setShowUpgradePrompt(false);
          navigation.navigate("SubscriptionScreen" as any);
        }}
        feature="Join Decision"
        reason={upgradeReason}
      />
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// QuickPreview — local component, dark values hardcoded
// ─────────────────────────────────────────────────────────────────────────────

interface QuickPreviewProps {
  decision: Decision;
  alreadyMember: boolean;
  actor: DecisionActor | null;
  storedDisplayName: string | null | undefined;
  guestNameInput: string;
  nameError: string | null;
  joining: boolean;
  onChangeGuestName: (t: string) => void;
  onJoin: () => void;
  onReset: () => void;
}

function QuickPreview({
  decision,
  alreadyMember,
  actor,
  storedDisplayName,
  guestNameInput,
  nameError,
  joining,
  onChangeGuestName,
  onJoin,
  onReset,
}: QuickPreviewProps) {
  const catMeta = CATEGORY_META[decision.type_label ?? "other"] ?? CATEGORY_META.other;
  const isOpen = decision.status !== "locked";

  const needsName =
    actor?.kind === "guest" &&
    !alreadyMember &&
    storedDisplayName !== undefined &&
    !storedDisplayName;

  const ctaLabel = alreadyMember
    ? "Resume Decision"
    : isOpen
    ? "Enter Decision"
    : "View Results";

  return (
    <View style={styles.quickPreview}>
      {/* Category + status */}
      <View style={styles.qpMetaRow}>
        <View
          style={[
            styles.qpCategoryBadge,
            { backgroundColor: catMeta.color + "22", borderColor: catMeta.color + "44" },
          ]}
        >
          <Icon name={catMeta.icon} size={13} color={catMeta.color} />
          <Text style={[styles.qpCategoryText, { color: catMeta.color }]}>
            {catMeta.label}
          </Text>
        </View>

        <View style={[styles.qpStatusBadge, isOpen ? styles.qpStatusOpen : styles.qpStatusClosed]}>
          <Text style={[styles.qpStatusText, isOpen ? styles.qpStatusTextOpen : styles.qpStatusTextClosed]}>
            {isOpen ? "Open" : "Closed"}
          </Text>
        </View>
      </View>

      {/* Title */}
      <Text style={styles.qpTitle}>{decision.title}</Text>

      {/* Lock time */}
      {decision.closes_at ? (
        <Text style={styles.qpLockTime}>
          {isOpen
            ? `Closes ${formatLockTime(decision.closes_at)}`
            : `Closed ${formatLockTime(decision.closes_at)}`}
        </Text>
      ) : null}

      {/* Already-member indicator */}
      {alreadyMember && (
        <View style={styles.qpAlreadyMember}>
          <Icon name="check-circle" size={14} color="#86efac" />
          <Text style={styles.qpAlreadyMemberText}>
            You're already part of this decision
          </Text>
        </View>
      )}

      {/* Inline name input */}
      {needsName && (
        <View style={styles.qpNameSection}>
          <Text style={styles.qpNameLabel}>Your name in this decision</Text>
          <TextInput
            style={[styles.qpNameInput, nameError ? styles.qpNameInputError : null]}
            value={guestNameInput}
            onChangeText={onChangeGuestName}
            placeholder="e.g. Jordan"
            placeholderTextColor="#475569"
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={onJoin}
          />
          {nameError ? <Text style={styles.qpNameError}>{nameError}</Text> : null}
        </View>
      )}

      {/* CTA */}
      <TouchableOpacity
        style={[styles.joinButton, { opacity: joining ? 0.6 : 1 }]}
        onPress={onJoin}
        disabled={joining}
      >
        {joining ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.joinButtonText}>{ctaLabel}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={onReset}>
        <Text style={styles.cancelButtonText}>Try a different code</Text>
      </TouchableOpacity>
    </View>
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
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 40,
  },

  // ── Code entry ──
  inputSection: {},
  heading: {
    fontSize: 22,
    fontWeight: "700",
    color: "#f1f5f9",
    fontFamily: "Rubik_600SemiBold",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    lineHeight: 20,
    fontFamily: "Rubik_400Regular",
    marginBottom: 22,
  },
  codeInput: {
    backgroundColor: "#1e293b",
    marginBottom: 4,
  },
  inlineError: {
    fontSize: 13,
    color: "#f87171",
    marginBottom: 10,
    marginTop: 2,
    fontFamily: "Rubik_400Regular",
  },
  codeInputContent: {
    textAlign: "center",
    fontSize: 24,
    letterSpacing: 8,
    fontFamily: "Rubik_600SemiBold",
  },
  lookupButton: {
    backgroundColor: "#6366f1",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  lookupButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },

  // ── Shared ──
  joinButton: {
    backgroundColor: "#6366f1",
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 12,
  },
  joinButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    color: "#64748b",
    fontFamily: "Rubik_400Regular",
  },

  // ── Quick-mode preview (dark values hardcoded) ──
  quickPreview: {
    paddingTop: 4,
  },
  qpMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  qpCategoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  qpCategoryText: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  qpStatusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  qpStatusOpen: {
    backgroundColor: "rgba(34,197,94,0.12)",
  },
  qpStatusClosed: {
    backgroundColor: "rgba(100,116,139,0.12)",
  },
  qpStatusText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    fontFamily: "Rubik_600SemiBold",
  },
  qpStatusTextOpen: {
    color: "#86efac",
  },
  qpStatusTextClosed: {
    color: "#64748b",
  },
  qpTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#f1f5f9",
    fontFamily: "Rubik_600SemiBold",
    marginBottom: 6,
    lineHeight: 32,
  },
  qpLockTime: {
    fontSize: 13,
    color: "#64748b",
    fontFamily: "Rubik_400Regular",
    marginBottom: 20,
  },
  qpAlreadyMember: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(134,239,172,0.08)",
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(134,239,172,0.15)",
  },
  qpAlreadyMemberText: {
    fontSize: 13,
    color: "#86efac",
    fontWeight: "500",
    fontFamily: "Rubik_500Medium",
  },
  qpNameSection: {
    marginBottom: 20,
  },
  qpNameLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "500",
    fontFamily: "Rubik_500Medium",
    marginBottom: 7,
  },
  qpNameInput: {
    backgroundColor: "#1e293b",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: "#f1f5f9",
    fontFamily: "Rubik_500Medium",
  },
  qpNameInputError: {
    borderColor: "rgba(248,113,113,0.5)",
  },
  qpNameError: {
    fontSize: 12,
    color: "#f87171",
    marginTop: 5,
    fontFamily: "Rubik_400Regular",
  },

  // ── Advanced-mode preview (theme colors applied inline) ──
  previewSection: {
    paddingTop: 20,
    paddingBottom: 40,
  },
  previewTitle: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
    fontFamily: "Rubik_600SemiBold",
  },
  previewDesc: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
    fontFamily: "Rubik_400Regular",
  },
  detailCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
});

export default JoinDecisionScreen;
