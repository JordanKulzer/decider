import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from "react-native";
import { TextInput as PaperInput, useTheme, Switch } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import Icon from "react-native-vector-icons/MaterialIcons";
import Toast from "react-native-toast-message";
import { supabase } from "../lib/supabase";
import { isDemoMode, DEMO_USER_ID } from "../lib/demoMode";
import { mockCreateDecision } from "../lib/mockData";
import { generateInviteCode, formatLockTime } from "../utils/dateDisplay";
import {
  DECISION_TYPES,
  VOTING_MECHANISMS,
} from "../../assets/constants/decisionTypes";
import DuplicateDecisionModal from "../components/DuplicateDecisionModal";
import DateTimePickerModal from "../components/DateTimePickerModal";
import ProBadge from "../components/ProBadge";
import UpgradePrompt from "../components/UpgradePrompt";
import { duplicateDecision, PastDecisionSummary } from "../lib/decisions";
import { useSubscription } from "../context/SubscriptionContext";

const CreateDecisionScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const isDark = useColorScheme() === "dark";
  const { tier } = useSubscription();

  const [title, setTitle] = useState("");
  const [silentVoting, setSilentVoting] = useState(false);
  const [constraintWeighting, setConstraintWeighting] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState("");
  const [description, setDescription] = useState("");
  const [typeLabel, setTypeLabel] = useState<string | null>(null);
  const [lockTime, setLockTime] = useState<Date>(
    new Date(Date.now() + 24 * 60 * 60 * 1000) // default: 24h from now
  );
  const [showDateTimeModal, setShowDateTimeModal] = useState(false);
  const [votingMechanism, setVotingMechanism] = useState<string>(
    "point_allocation"
  );
  const [optionSubmission, setOptionSubmission] = useState<string>("anyone");
  const [maxOptions, setMaxOptions] = useState(7);
  const [revealVotes, setRevealVotes] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedSourceDecision, setSelectedSourceDecision] = useState<PastDecisionSummary | null>(null);

  // Get current user ID
  useEffect(() => {
    const getUserId = async () => {
      if (isDemoMode()) {
        setUserId(DEMO_USER_ID);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        setUserId(user?.id || null);
      }
    };
    getUserId();
  }, []);

  const handleSelectPastDecision = (decision: PastDecisionSummary) => {
    setSelectedSourceDecision(decision);
    setShowDuplicateModal(false);
    // Pre-fill title with a modified version
    setTitle(`${decision.title} (copy)`);
    Toast.show({
      type: "info",
      text1: "Decision selected",
      text2: "Settings, constraints & options will be copied on create.",
      position: "bottom",
    });
  };

  const gradientColors = useMemo(() => {
    return theme.dark
      ? (["#121212", "#1d1d1d", "#2b2b2d"] as const)
      : (["#fdfcf9", "#e0e7ff"] as const);
  }, [theme.dark]);

  const handleCreate = async () => {
    if (!title.trim()) {
      Toast.show({
        type: "error",
        text1: "Title required",
        text2: "Give your decision a title.",
        position: "bottom",
      });
      return;
    }

    if (lockTime <= new Date()) {
      Toast.show({
        type: "error",
        text1: "Invalid lock time",
        text2: "Lock time must be in the future.",
        position: "bottom",
      });
      return;
    }

    setCreating(true);
    try {
      // If duplicating from a past decision
      if (selectedSourceDecision && userId) {
        const result = await duplicateDecision(
          selectedSourceDecision.id,
          title.trim(),
          description.trim() || null,
          lockTime.toISOString(),
          userId
        );

        Toast.show({
          type: "success",
          text1: "Decision created!",
          text2: `Copied ${result.constraintsCopied} constraints, ${result.optionsCopied} options`,
          position: "bottom",
        });

        navigation.replace("DecisionDetailScreen", {
          decisionId: result.decision.id,
        });
        return;
      }

      // Standard creation flow
      const inviteCode = generateInviteCode();

      if (isDemoMode()) {
        const decision = await mockCreateDecision({
          title: title.trim(),
          description: description.trim() || null,
          type_label: typeLabel,
          created_by: DEMO_USER_ID,
          lock_time: lockTime.toISOString(),
          status: "constraints",
          voting_mechanism: votingMechanism as any,
          max_options: maxOptions,
          option_submission: optionSubmission as any,
          reveal_votes_after_lock: revealVotes,
          invite_code: inviteCode,
          silent_voting: silentVoting,
          constraint_weights_enabled: constraintWeighting,
        });

        Toast.show({
          type: "success",
          text1: "Decision created!",
          text2: `Invite code: ${decision.invite_code}`,
          position: "bottom",
        });

        navigation.replace("DecisionDetailScreen", {
          decisionId: decision.id,
        });
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: decision, error: insertError } = await supabase
        .from("decisions")
        .insert([
          {
            title: title.trim(),
            description: description.trim() || null,
            type_label: typeLabel,
            created_by: user.id,
            lock_time: lockTime.toISOString(),
            status: "constraints",
            voting_mechanism: votingMechanism,
            max_options: maxOptions,
            option_submission: optionSubmission,
            reveal_votes_after_lock: revealVotes,
            invite_code: inviteCode,
            silent_voting: silentVoting,
            constraint_weights_enabled: constraintWeighting,
          },
        ])
        .select("id, invite_code")
        .single();

      if (insertError) throw insertError;

      // Add organizer as first member (trigger also does this, but keeping for safety)
      await supabase.from("decision_members").insert([
        {
          decision_id: decision.id,
          user_id: user.id,
          role: "organizer",
        },
      ]);

      Toast.show({
        type: "success",
        text1: "Decision created!",
        text2: `Invite code: ${decision.invite_code}`,
        position: "bottom",
      });

      navigation.replace("DecisionDetailScreen", {
        decisionId: decision.id,
      });
    } catch (err: any) {
      console.error("Create decision error:", err);
      Toast.show({
        type: "error",
        text1: "Failed to create",
        text2: err.message || "Try again.",
        position: "bottom",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Start from past decision button */}
          <TouchableOpacity
            style={[
              styles.duplicateButton,
              {
                backgroundColor: (theme as any).custom?.card || theme.colors.surface,
                borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
              },
            ]}
            onPress={() => setShowDuplicateModal(true)}
            activeOpacity={0.7}
          >
            <Icon name="content-copy" size={20} color={theme.colors.primary} />
            <View style={styles.duplicateButtonContent}>
              <Text style={[styles.duplicateButtonTitle, { color: theme.colors.onBackground }]}>
                Start from past decision
              </Text>
              <Text style={[styles.duplicateButtonHint, { color: theme.colors.onSurfaceVariant }]}>
                Copy settings, constraints & options from a previous decision
              </Text>
            </View>
            <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>

          {/* Selected source indicator */}
          {selectedSourceDecision && (
            <View
              style={[
                styles.selectedSource,
                { backgroundColor: `${theme.colors.primary}15` },
              ]}
            >
              <Icon name="check-circle" size={16} color={theme.colors.primary} />
              <Text style={[styles.selectedSourceText, { color: theme.colors.primary }]}>
                Copying from: {selectedSourceDecision.title}
              </Text>
              <TouchableOpacity onPress={() => setSelectedSourceDecision(null)}>
                <Icon name="close" size={16} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Title */}
          <Text
            style={[
              styles.sectionLabel,
              { color: theme.colors.onBackground },
            ]}
          >
            What's being decided?
          </Text>
          <PaperInput
            label="Decision title"
            mode="outlined"
            value={title}
            onChangeText={setTitle}
            maxLength={50}
            style={styles.input}
            theme={{ colors: { primary: "#2563eb" } }}
          />

          {/* Description */}
          <PaperInput
            label="Description (optional)"
            mode="outlined"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={2}
            style={styles.input}
            theme={{ colors: { primary: "#2563eb" } }}
          />

          {/* Type Label */}
          <Text
            style={[
              styles.sectionLabel,
              { color: theme.colors.onBackground },
            ]}
          >
            Category
          </Text>
          <View style={styles.chipRow}>
            {DECISION_TYPES.map((dt) => {
              const selected = typeLabel === dt.key;
              return (
                <TouchableOpacity
                  key={dt.key}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected
                        ? theme.colors.primary
                        : (theme as any).custom?.card || theme.colors.surface,
                      borderColor: selected
                        ? theme.colors.primary
                        : (theme as any).custom?.cardBorder ||
                          theme.colors.outline,
                    },
                  ]}
                  onPress={() =>
                    setTypeLabel(selected ? null : dt.key)
                  }
                >
                  <Icon
                    name={dt.icon}
                    size={16}
                    color={selected ? "#fff" : theme.colors.onSurfaceVariant}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: selected
                          ? "#fff"
                          : theme.colors.onSurfaceVariant,
                      },
                    ]}
                  >
                    {dt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Lock Time */}
          <Text
            style={[
              styles.sectionLabel,
              { color: theme.colors.onBackground },
            ]}
          >
            Deadline
          </Text>
          <Text
            style={[
              styles.sectionHint,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            When voting ends and the decision is finalized.
          </Text>

          {/* Quick preset buttons */}
          <View style={styles.presetRow}>
            {[
              { label: "1 hour", hours: 1 },
              { label: "Tomorrow", hours: 24 },
              { label: "2 days", hours: 48 },
              { label: "1 week", hours: 168 },
            ].map((preset) => {
              const presetDate = new Date(Date.now() + preset.hours * 60 * 60 * 1000);
              const isSelected = Math.abs(lockTime.getTime() - presetDate.getTime()) < 60 * 60 * 1000;
              return (
                <TouchableOpacity
                  key={preset.label}
                  style={[
                    styles.presetButton,
                    {
                      backgroundColor: isSelected
                        ? theme.colors.primary
                        : (theme as any).custom?.card || theme.colors.surface,
                      borderColor: isSelected
                        ? theme.colors.primary
                        : (theme as any).custom?.cardBorder || theme.colors.outline,
                    },
                  ]}
                  onPress={() => setLockTime(presetDate)}
                >
                  <Text
                    style={[
                      styles.presetButtonText,
                      { color: isSelected ? "#fff" : theme.colors.onSurfaceVariant },
                    ]}
                  >
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Custom date/time selector */}
          <TouchableOpacity
            style={[
              styles.dateButton,
              {
                backgroundColor: theme.colors.primary + "15",
                borderColor: theme.colors.primary,
                borderStyle: "dashed",
              },
            ]}
            onPress={() => setShowDateTimeModal(true)}
          >
            <Icon name="edit-calendar" size={20} color={theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.dateButtonLabel, { color: theme.colors.primary }]}>
                Custom date & time
              </Text>
              <Text
                style={[
                  styles.dateButtonText,
                  { color: theme.colors.onBackground },
                ]}
              >
                {formatLockTime(lockTime.toISOString())}
              </Text>
            </View>
            <Icon name="chevron-right" size={20} color={theme.colors.primary} />
          </TouchableOpacity>

          {/* Voting Mechanism */}
          <Text
            style={[
              styles.sectionLabel,
              { color: theme.colors.onBackground },
            ]}
          >
            How will people vote?
          </Text>
          {VOTING_MECHANISMS.map((vm) => {
            const selected = votingMechanism === vm.key;
            return (
              <TouchableOpacity
                key={vm.key}
                style={[
                  styles.settingCard,
                  {
                    backgroundColor: selected
                      ? theme.dark
                        ? "#1e3a5f"
                        : "#e0edff"
                      : (theme as any).custom?.card || theme.colors.surface,
                    borderColor: selected
                      ? theme.colors.primary
                      : (theme as any).custom?.cardBorder ||
                        theme.colors.outline,
                  },
                ]}
                onPress={() => setVotingMechanism(vm.key)}
              >
                <View style={styles.settingCardContent}>
                  <View
                    style={[
                      styles.radio,
                      {
                        borderColor: selected
                          ? theme.colors.primary
                          : theme.colors.onSurfaceVariant,
                      },
                    ]}
                  >
                    {selected && (
                      <View
                        style={[
                          styles.radioInner,
                          { backgroundColor: theme.colors.primary },
                        ]}
                      />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.settingCardTitle,
                        { color: theme.colors.onBackground },
                      ]}
                    >
                      {vm.label}
                    </Text>
                    <Text
                      style={[
                        styles.settingCardDesc,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      {vm.description}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Option Submission */}
          <Text
            style={[
              styles.sectionLabel,
              { color: theme.colors.onBackground },
            ]}
          >
            Who can submit options?
          </Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                {
                  backgroundColor:
                    optionSubmission === "anyone"
                      ? theme.colors.primary
                      : (theme as any).custom?.card || theme.colors.surface,
                  borderColor: theme.colors.primary,
                },
              ]}
              onPress={() => setOptionSubmission("anyone")}
            >
              <Text
                style={{
                  color: optionSubmission === "anyone" ? "#fff" : theme.colors.primary,
                  fontWeight: "600",
                  fontFamily: "Rubik_500Medium",
                }}
              >
                Anyone
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                {
                  backgroundColor:
                    optionSubmission === "organizer_only"
                      ? theme.colors.primary
                      : (theme as any).custom?.card || theme.colors.surface,
                  borderColor: theme.colors.primary,
                },
              ]}
              onPress={() => setOptionSubmission("organizer_only")}
            >
              <Text
                style={{
                  color:
                    optionSubmission === "organizer_only"
                      ? "#fff"
                      : theme.colors.primary,
                  fontWeight: "600",
                  fontFamily: "Rubik_500Medium",
                }}
              >
                Organizer Only
              </Text>
            </TouchableOpacity>
          </View>

          {/* Max Options */}
          <Text
            style={[
              styles.sectionLabel,
              { color: theme.colors.onBackground },
            ]}
          >
            Max options
          </Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={[
                styles.stepperButton,
                { borderColor: theme.colors.primary },
              ]}
              onPress={() => setMaxOptions(Math.max(2, maxOptions - 1))}
            >
              <Icon name="remove" size={20} color={theme.colors.primary} />
            </TouchableOpacity>
            <Text
              style={[
                styles.stepperValue,
                { color: theme.colors.onBackground },
              ]}
            >
              {maxOptions}
            </Text>
            <TouchableOpacity
              style={[
                styles.stepperButton,
                { borderColor: theme.colors.primary },
              ]}
              onPress={() => setMaxOptions(Math.min(10, maxOptions + 1))}
            >
              <Icon name="add" size={20} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Reveal Votes */}
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.switchLabel,
                  { color: theme.colors.onBackground },
                ]}
              >
                Reveal individual votes after lock
              </Text>
              <Text
                style={[
                  styles.switchHint,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Show how each person voted once the decision is final.
              </Text>
            </View>
            <Switch
              value={revealVotes}
              onValueChange={setRevealVotes}
              color={theme.colors.primary}
            />
          </View>

          {/* Silent Voting (Pro Feature) */}
          <TouchableOpacity
            style={[
              styles.switchRow,
              styles.proFeatureRow,
              {
                backgroundColor: tier !== "pro"
                  ? (theme.dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)")
                  : "transparent",
                borderColor: tier !== "pro"
                  ? (theme.dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)")
                  : "transparent",
              },
            ]}
            activeOpacity={tier === "pro" ? 1 : 0.7}
            onPress={() => {
              if (tier !== "pro") {
                setUpgradeFeature("Silent Voting");
                setShowUpgradePrompt(true);
              }
            }}
          >
            <View style={{ flex: 1, opacity: tier !== "pro" ? 0.6 : 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text
                  style={[
                    styles.switchLabel,
                    { color: theme.colors.onBackground },
                  ]}
                >
                  Silent voting
                </Text>
                <ProBadge />
              </View>
              <Text
                style={[
                  styles.switchHint,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Hide vote counts until the decision is finalized.
              </Text>
            </View>
            {tier === "pro" ? (
              <Switch
                value={silentVoting}
                onValueChange={setSilentVoting}
                color={theme.colors.primary}
              />
            ) : (
              <View style={styles.lockedSwitch}>
                <Icon name="lock" size={18} color={theme.colors.onSurfaceVariant} />
              </View>
            )}
          </TouchableOpacity>

          {/* Constraint Weighting (Pro Feature) */}
          <TouchableOpacity
            style={[
              styles.switchRow,
              styles.proFeatureRow,
              {
                backgroundColor: tier !== "pro"
                  ? (theme.dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)")
                  : "transparent",
                borderColor: tier !== "pro"
                  ? (theme.dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)")
                  : "transparent",
              },
            ]}
            activeOpacity={tier === "pro" ? 1 : 0.7}
            onPress={() => {
              if (tier !== "pro") {
                setUpgradeFeature("Constraint Weighting");
                setShowUpgradePrompt(true);
              }
            }}
          >
            <View style={{ flex: 1, opacity: tier !== "pro" ? 0.6 : 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text
                  style={[
                    styles.switchLabel,
                    { color: theme.colors.onBackground },
                  ]}
                >
                  Constraint weighting
                </Text>
                <ProBadge />
              </View>
              <Text
                style={[
                  styles.switchHint,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Assign importance levels (1-5) to constraints.
              </Text>
            </View>
            {tier === "pro" ? (
              <Switch
                value={constraintWeighting}
                onValueChange={setConstraintWeighting}
                color={theme.colors.primary}
              />
            ) : (
              <View style={styles.lockedSwitch}>
                <Icon name="lock" size={18} color={theme.colors.onSurfaceVariant} />
              </View>
            )}
          </TouchableOpacity>

          {/* Create Button */}
          <TouchableOpacity
            style={[
              styles.createButton,
              {
                backgroundColor: theme.colors.primary,
                opacity: creating ? 0.6 : 1,
              },
            ]}
            onPress={handleCreate}
            disabled={creating}
          >
            <Text style={styles.createButtonText}>
              {creating ? "Creating..." : "Create Decision"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Duplicate Decision Modal */}
      {userId && (
        <DuplicateDecisionModal
          visible={showDuplicateModal}
          onClose={() => setShowDuplicateModal(false)}
          onSelect={handleSelectPastDecision}
          userId={userId}
        />
      )}

      {/* Date Time Picker Modal */}
      <DateTimePickerModal
        visible={showDateTimeModal}
        value={lockTime}
        minimumDate={new Date()}
        onConfirm={(date) => {
          setLockTime(date);
          setShowDateTimeModal(false);
        }}
        onCancel={() => setShowDateTimeModal(false)}
      />

      {/* Upgrade Prompt */}
      <UpgradePrompt
        visible={showUpgradePrompt}
        onClose={() => setShowUpgradePrompt(false)}
        onUpgrade={() => {
          setShowUpgradePrompt(false);
          navigation.navigate("SubscriptionScreen" as any);
        }}
        feature={upgradeFeature}
        reason={`${upgradeFeature} is a Pro feature. Upgrade to unlock all Pro features.`}
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 16,
    fontFamily: "Rubik_500Medium",
  },
  sectionHint: {
    fontSize: 12,
    marginBottom: 8,
    fontFamily: "Rubik_400Regular",
  },
  input: {
    marginBottom: 4,
    backgroundColor: "transparent",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
    fontFamily: "Rubik_500Medium",
  },
  presetRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  presetButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  presetButtonText: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 12,
  },
  dateButtonLabel: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
    marginBottom: 2,
  },
  dateButtonText: {
    fontSize: 15,
    fontFamily: "Rubik_400Regular",
  },
  settingCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
  },
  settingCardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingCardTitle: {
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  settingCardDesc: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: "Rubik_400Regular",
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: "center",
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 4,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: {
    fontSize: 20,
    fontWeight: "700",
    minWidth: 30,
    textAlign: "center",
    fontFamily: "Rubik_600SemiBold",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 4,
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  switchHint: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: "Rubik_400Regular",
  },
  createButton: {
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 24,
  },
  createButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  duplicateButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    marginBottom: 8,
  },
  duplicateButtonContent: {
    flex: 1,
  },
  duplicateButtonTitle: {
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  duplicateButtonHint: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: "Rubik_400Regular",
  },
  selectedSource: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    gap: 8,
    marginBottom: 8,
  },
  selectedSourceText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    fontFamily: "Rubik_500Medium",
  },
  proFeatureRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    marginBottom: 0,
  },
  lockedSwitch: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(128,128,128,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default CreateDecisionScreen;
