import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { TextInput as PaperInput, useTheme } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import Icon from "react-native-vector-icons/MaterialIcons";
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
  addConstraint,
  removeConstraint,
  addOption,
  removeOption,
  advancePhase,
} from "../lib/decisions";
import { validateOptionAgainstConstraints } from "../utils/constraintValidation";
import { formatLockTime } from "../utils/dateDisplay";
import PhaseIndicator from "../components/PhaseIndicator";
import ConstraintInput from "../components/ConstraintInput";
import OptionCard from "../components/OptionCard";
import MemberList from "../components/MemberList";
import CountdownTimer from "../components/CountdownTimer";
import VotingInterface from "../components/VotingInterface";
import ResultsView from "../components/ResultsView";
import type {
  Decision,
  DecisionMember,
  Constraint,
  DecisionOption,
  Vote,
  Result,
  ConstraintType,
} from "../types/decisions";

const DecisionDetailScreen = () => {
  const theme = useTheme();
  const route = useRoute<any>();
  const { decisionId } = route.params;

  const [decision, setDecision] = useState<Decision | null>(null);
  const [members, setMembers] = useState<DecisionMember[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [options, setOptions] = useState<DecisionOption[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [results, setResults] = useState<Result[]>([]);
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
      const [d, m, c, o, v, r] = await Promise.all([
        fetchDecisionDetail(decisionId),
        fetchDecisionMembers(decisionId),
        fetchConstraints(decisionId),
        fetchOptions(decisionId),
        fetchVotes(decisionId),
        fetchResults(decisionId),
      ]);
      setDecision(d);
      setMembers(m);
      setConstraints(c);
      setOptions(o);
      setVotes(v);
      setResults(r);
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
    } catch (err: any) {
      Toast.show({ type: "error", text1: "Failed to remove", position: "bottom" });
    }
  };

  const handleAdvancePhase = async (newStatus: string) => {
    if (!decision) return;
    try {
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
        {/* Title + Invite Code */}
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

            {/* Advance button (organizer only) */}
            {isOrganizer && (
              <TouchableOpacity
                style={[
                  styles.advanceButton,
                  { backgroundColor: theme.colors.primary },
                ]}
                onPress={() => handleAdvancePhase("options")}
              >
                <Text style={styles.advanceButtonText}>
                  Open for Options
                </Text>
                <Icon name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
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
            </Text>

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

            {/* Options list */}
            {options.map((o) => (
              <OptionCard
                key={o.id}
                option={o}
                showDelete={isOrganizer}
                onDelete={() => handleRemoveOption(o.id)}
              />
            ))}

            {/* Advance button (organizer only) */}
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

        {/* Members (always visible) */}
        <MemberList
          members={members}
          showVoteStatus={decision.status === "voting"}
        />
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
    fontSize: 22,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
    marginBottom: 4,
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
