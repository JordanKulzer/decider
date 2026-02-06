import React, { useState, useCallback, useMemo, useLayoutEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { TextInput as PaperInput, useTheme } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRoute, useNavigation } from "@react-navigation/native";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import * as Clipboard from "expo-clipboard";
import { supabase } from "../lib/supabase";
import { isDemoMode, DEMO_USER_ID } from "../lib/demoMode";
import {
  fetchDecisionDetail,
  fetchDecisionMembers,
  fetchConstraints,
  fetchOptions,
  fetchVotes,
  fetchResults,
  fetchComments,
  addConstraint,
  removeConstraint,
  addOption,
  removeOption,
  advancePhase,
  revertPhase,
  clearAdvanceVotes,
} from "../lib/decisions";
import { validateOptionAgainstConstraints } from "../utils/constraintValidation";
import { formatLockTime } from "../utils/dateDisplay";
import PhaseIndicator from "../components/PhaseIndicator";
import ConstraintInput from "../components/ConstraintInput";
import OptionCard from "../components/OptionCard";
import CountdownTimer from "../components/CountdownTimer";
import VotingInterface from "../components/VotingInterface";
import ResultsView from "../components/ResultsView";
import ConstraintsSummary from "../components/ConstraintsSummary";
import AdvanceVoteButton from "../components/AdvanceVoteButton";
import CommentSection from "../components/CommentSection";
import OrganizerMenu from "../components/OrganizerMenu";
import MembersButton from "../components/MembersButton";
import type {
  Decision,
  DecisionMember,
  Constraint,
  DecisionOption,
  Vote,
  Result,
  ConstraintType,
  Comment,
} from "../types/decisions";

const DecisionDetailScreen = () => {
  const theme = useTheme();
  const route = useRoute<any>();
  const navigation = useNavigation();
  const { decisionId } = route.params;

  const [decision, setDecision] = useState<Decision | null>(null);
  const [members, setMembers] = useState<DecisionMember[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [options, setOptions] = useState<DecisionOption[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Option submission form
  const [newOptionTitle, setNewOptionTitle] = useState("");
  const [newOptionDesc, setNewOptionDesc] = useState("");

  const gradientColors = useMemo(() => {
    return theme.dark
      ? (["#121212", "#1d1d1d", "#2b2b2d"] as const)
      : (["#fdfcf9", "#e0e7ff"] as const);
  }, [theme.dark]);

  const loadData = useCallback(async () => {
    setLoading(true);
    let currentUserId: string | null = null;

    if (isDemoMode()) {
      currentUserId = DEMO_USER_ID;
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      currentUserId = user.id;
    }

    setUserId(currentUserId);

    try {
      const [d, m, c, o, v, r, cmt] = await Promise.all([
        fetchDecisionDetail(decisionId),
        fetchDecisionMembers(decisionId),
        fetchConstraints(decisionId),
        fetchOptions(decisionId),
        fetchVotes(decisionId),
        fetchResults(decisionId),
        fetchComments(decisionId),
      ]);
      setDecision(d);
      setMembers(m);
      setConstraints(c);
      setOptions(o);
      setVotes(v);
      setResults(r);
      setComments(cmt);
    } catch (err) {
      console.error("Error loading decision:", err);
    }
    setLoading(false);
  }, [decisionId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const isOrganizer = decision?.created_by === userId;
  const currentMember = members.find((m) => m.user_id === userId);
  const hasVoted = currentMember?.has_voted || false;

  const handleAddConstraint = async (
    type: ConstraintType,
    value: Record<string, any>
  ) => {
    if (!userId || !decision) return;
    try {
      await addConstraint(decision.id, userId, type, value);
      await loadData();
      Toast.show({ type: "success", text1: "Constraint added", position: "bottom" });
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Failed to add constraint",
        text2: err.message,
        position: "bottom",
      });
    }
  };

  const handleRemoveConstraint = async (constraintId: string) => {
    try {
      await removeConstraint(constraintId);
      await loadData();
      Toast.show({ type: "success", text1: "Constraint removed", position: "bottom" });
    } catch (err: any) {
      Toast.show({ type: "error", text1: "Failed to remove", position: "bottom" });
    }
  };

  const handleAddOption = async () => {
    if (!userId || !decision || !newOptionTitle.trim()) return;

    const validation = validateOptionAgainstConstraints(
      { title: newOptionTitle, description: newOptionDesc || null, metadata: null },
      constraints
    );

    try {
      await addOption(
        decision.id,
        userId,
        newOptionTitle.trim(),
        newOptionDesc.trim() || null,
        null,
        validation.passes,
        validation.violations.length > 0 ? validation.violations : null
      );
      setNewOptionTitle("");
      setNewOptionDesc("");
      await loadData();
      Toast.show({ type: "success", text1: "Option added", position: "bottom" });
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Failed to add option",
        text2: err.message,
        position: "bottom",
      });
    }
  };

  const handleRemoveOption = async (optionId: string) => {
    try {
      await removeOption(optionId);
      await loadData();
      Toast.show({ type: "success", text1: "Option deleted", position: "bottom" });
    } catch (err: any) {
      Toast.show({ type: "error", text1: "Failed to remove", position: "bottom" });
    }
  };

  const handleAdvancePhase = async (newStatus: string) => {
    if (!decision) return;
    try {
      // Clear advance votes for the current phase
      const currentPhase = decision.status as "constraints" | "options";
      if (currentPhase === "constraints" || currentPhase === "options") {
        await clearAdvanceVotes(decision.id, currentPhase);
      }
      await advancePhase(decision.id, newStatus);
      await loadData();
      Toast.show({
        type: "success",
        text1: `Phase advanced`,
        position: "bottom",
      });
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Failed to advance",
        text2: err.message,
        position: "bottom",
      });
    }
  };

  const handleCopyInviteCode = async () => {
    if (!decision) return;
    await Clipboard.setStringAsync(decision.invite_code);
    Toast.show({
      type: "success",
      text1: "Invite code copied!",
      text2: decision.invite_code,
      position: "bottom",
    });
  };

  const handleVoteSubmitted = () => {
    loadData();
  };

  const handleRevertPhase = (targetStatus: "constraints" | "options") => {
    if (!decision) return;

    const warningMessages: Record<string, { title: string; message: string }> = {
      constraints: {
        title: "Go Back to Constraints?",
        message: "This will delete ALL options that have been submitted. This action cannot be undone.",
      },
      options: {
        title: "Go Back to Options?",
        message: "This will delete ALL votes that have been cast and reset voting for everyone. This action cannot be undone.",
      },
    };

    const { title, message } = warningMessages[targetStatus];

    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Go Back",
        style: "destructive",
        onPress: async () => {
          try {
            await revertPhase(decision.id, targetStatus);
            await loadData();
            Toast.show({
              type: "success",
              text1: `Reverted to ${targetStatus} phase`,
              position: "bottom",
            });
          } catch (err: any) {
            Toast.show({
              type: "error",
              text1: "Failed to revert",
              text2: err.message,
              position: "bottom",
            });
          }
        },
      },
    ]);
  };

  // Set up navigation header with members button and organizer menu
  useLayoutEffect(() => {
    if (!decision || !userId) {
      navigation.setOptions({ headerRight: () => null });
      return;
    }

    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {isOrganizer ? (
            <OrganizerMenu
              decisionId={decision.id}
              decisionTitle={decision.title}
              currentPhase={decision.status}
              members={members}
              currentUserId={userId}
              showVoteStatus={decision.status === "voting"}
              onRevertToConstraints={() => handleRevertPhase("constraints")}
              onRevertToOptions={() => handleRevertPhase("options")}
              onAdvanceToOptions={() => handleAdvancePhase("options")}
              onAdvanceToVoting={() => handleAdvancePhase("voting")}
              onDeleted={() => navigation.goBack()}
              onRenamed={loadData}
              onMemberChanged={loadData}
            />
          ) : (
            <MembersButton
              members={members}
              decisionId={decision.id}
              decisionTitle={decision.title}
              currentUserId={userId}
              isOrganizer={false}
              showVoteStatus={decision.status === "voting"}
              onMemberChanged={loadData}
              onLeft={() => navigation.goBack()}
            />
          )}
        </View>
      ),
    });
  }, [decision, userId, isOrganizer, members, navigation, loadData]);

  if (loading || !decision) {
    return (
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </LinearGradient>
    );
  }

  const canSubmitOptions =
    decision.option_submission === "anyone" || isOrganizer;
  const optionCount = options.length;
  const atMaxOptions = optionCount >= decision.max_options;

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Title */}
        <Text
          style={[styles.title, { color: theme.colors.onBackground }]}
        >
          {decision.title}
        </Text>

        <View style={styles.metaRow}>
          <CountdownTimer lockTime={decision.lock_time} onExpired={loadData} />
          <TouchableOpacity
            style={styles.inviteButton}
            onPress={handleCopyInviteCode}
          >
            <Icon name="content-copy" size={14} color={theme.colors.primary} />
            <Text
              style={[styles.inviteCode, { color: theme.colors.primary }]}
            >
              {decision.invite_code}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Phase Indicator */}
        <PhaseIndicator currentPhase={decision.status} />

        {/* Phase Content */}
        {decision.status === "constraints" && (
          <View style={styles.phaseContent}>
            <Text
              style={[
                styles.phaseTitle,
                { color: theme.colors.onBackground },
              ]}
            >
              Set Constraints
            </Text>
            <Text
              style={[
                styles.phaseHint,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Define limits before options are submitted. Budget, distance,
              exclusions — these are filters, not votes.
            </Text>

            <ConstraintInput onSubmit={handleAddConstraint} />

            {/* Existing constraints */}
            {constraints.map((c) => (
              <View
                key={c.id}
                style={[
                  styles.constraintItem,
                  {
                    backgroundColor:
                      (theme as any).custom?.card || theme.colors.surface,
                    borderColor:
                      (theme as any).custom?.cardBorder || theme.colors.outline,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.constraintType,
                      { color: theme.colors.onBackground },
                    ]}
                  >
                    {c.type.replace("_", " ").toUpperCase()}
                  </Text>
                  <Text
                    style={[
                      styles.constraintValue,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    {c.type === "budget_max"
                      ? `$${c.value.max}`
                      : c.type === "distance"
                      ? `${c.value.max} mi`
                      : c.type === "duration"
                      ? `${c.value.max} hrs`
                      : c.value.text || JSON.stringify(c.value)}
                  </Text>
                </View>
                {c.user_id === userId && (
                  <TouchableOpacity
                    onPress={() => handleRemoveConstraint(c.id)}
                  >
                    <Icon
                      name="close"
                      size={18}
                      color={theme.colors.onSurfaceVariant}
                    />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {/* Vote to advance (for all members) */}
            {userId && (
              <AdvanceVoteButton
                decisionId={decision.id}
                userId={userId}
                fromPhase="constraints"
                members={members}
              />
            )}
          </View>
        )}

        {decision.status === "options" && (
          <View style={styles.phaseContent}>
            <Text
              style={[
                styles.phaseTitle,
                { color: theme.colors.onBackground },
              ]}
            >
              Submit Options
            </Text>
            <Text
              style={[
                styles.phaseHint,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {optionCount}/{decision.max_options} options added.{" "}
              {canSubmitOptions
                ? "Add your suggestions."
                : "Only the organizer can add options."}
              {optionCount < 2 && " At least 2 options are needed to start voting."}
            </Text>

            {/* Constraints summary */}
            <ConstraintsSummary constraints={constraints} />

            {/* Option submission form */}
            {canSubmitOptions && !atMaxOptions && (
              <View style={styles.optionForm}>
                <PaperInput
                  label="Option title"
                  mode="outlined"
                  value={newOptionTitle}
                  onChangeText={setNewOptionTitle}
                  maxLength={50}
                  style={styles.input}
                  theme={{ colors: { primary: "#2563eb" } }}
                  dense
                />
                <PaperInput
                  label="Description (optional)"
                  mode="outlined"
                  value={newOptionDesc}
                  onChangeText={setNewOptionDesc}
                  style={styles.input}
                  theme={{ colors: { primary: "#2563eb" } }}
                  dense
                />
                <TouchableOpacity
                  style={[
                    styles.addOptionButton,
                    {
                      backgroundColor: theme.colors.primary,
                      opacity: newOptionTitle.trim() ? 1 : 0.5,
                    },
                  ]}
                  onPress={handleAddOption}
                  disabled={!newOptionTitle.trim()}
                >
                  <Icon name="add" size={18} color="#fff" />
                  <Text style={styles.addOptionText}>Add Option</Text>
                </TouchableOpacity>
              </View>
            )}

            {atMaxOptions && (
              <Text
                style={[
                  styles.maxNotice,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Maximum options reached.
              </Text>
            )}

            {/* Options list with comments */}
            {options.map((o) => (
              <View key={o.id}>
                <OptionCard
                  option={o}
                  showDelete={isOrganizer || o.submitted_by === userId}
                  onDelete={() => handleRemoveOption(o.id)}
                />
                {userId && (
                  <CommentSection
                    decisionId={decision.id}
                    userId={userId}
                    comments={comments}
                    targetId={o.id}
                    targetType="option"
                    onCommentAdded={loadData}
                  />
                )}
              </View>
            ))}

            {/* Vote to advance (for all members) */}
            {userId && options.length >= 2 && (
              <AdvanceVoteButton
                decisionId={decision.id}
                userId={userId}
                fromPhase="options"
                members={members}
              />
            )}

            {/* Advance to voting (organizer only) */}
            {isOrganizer && options.length >= 2 && (
              <TouchableOpacity
                style={[
                  styles.advanceButton,
                  { backgroundColor: theme.colors.primary },
                ]}
                onPress={() => handleAdvancePhase("voting")}
              >
                <Text style={styles.advanceButtonText}>Start Voting</Text>
                <Icon name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {decision.status === "voting" && (
          <View style={styles.phaseContent}>
            <Text
              style={[
                styles.phaseTitle,
                { color: theme.colors.onBackground },
              ]}
            >
              Vote
            </Text>

            {/* Constraints summary */}
            <ConstraintsSummary constraints={constraints} />

            {hasVoted ? (
              <View style={styles.votedNotice}>
                <Icon name="check-circle" size={24} color="#22c55e" />
                <Text
                  style={[
                    styles.votedText,
                    { color: theme.colors.onBackground },
                  ]}
                >
                  Your vote is in!
                </Text>
                <Text
                  style={[
                    styles.phaseHint,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  Waiting for others to vote. The decision locks at{" "}
                  {formatLockTime(decision.lock_time)}.
                </Text>
              </View>
            ) : (
              <VotingInterface
                decision={decision}
                options={options.filter((o) => o.passes_constraints)}
                onVoteSubmitted={handleVoteSubmitted}
              />
            )}

          </View>
        )}

        {decision.status === "locked" && (
          <View style={styles.phaseContent}>
            <ResultsView
              results={results}
              options={options}
              votes={votes}
              members={members}
              decision={decision}
            />
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    marginBottom: 4,
    fontSize: 22,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  inviteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  inviteCode: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 2,
    fontFamily: "Rubik_600SemiBold",
  },
  phaseContent: {
    marginTop: 12,
  },
  phaseTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
    fontFamily: "Rubik_600SemiBold",
  },
  phaseHint: {
    fontSize: 13,
    marginBottom: 12,
    fontFamily: "Rubik_400Regular",
  },
  constraintItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  constraintType: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    fontFamily: "Rubik_500Medium",
  },
  constraintValue: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
    marginTop: 2,
  },
  advanceButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 16,
    gap: 8,
  },
  advanceButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  optionForm: {
    marginBottom: 12,
  },
  input: {
    marginBottom: 6,
    backgroundColor: "transparent",
  },
  addOptionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 4,
  },
  addOptionText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
    fontFamily: "Rubik_500Medium",
  },
  maxNotice: {
    fontSize: 13,
    textAlign: "center",
    marginBottom: 12,
    fontFamily: "Rubik_400Regular",
  },
  votedNotice: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  votedText: {
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
});

export default DecisionDetailScreen;
