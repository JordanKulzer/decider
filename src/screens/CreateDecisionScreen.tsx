import React, { useState, useMemo } from "react";
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
import DateTimePicker from "@react-native-community/datetimepicker";
import Toast from "react-native-toast-message";
import { supabase } from "../lib/supabase";
import { isDemoMode, DEMO_USER_ID } from "../lib/demoMode";
import { mockCreateDecision } from "../lib/mockData";
import { generateInviteCode, formatLockTime } from "../utils/dateDisplay";
import {
  DECISION_TYPES,
  VOTING_MECHANISMS,
} from "../../assets/constants/decisionTypes";

const CreateDecisionScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const isDark = useColorScheme() === "dark";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [typeLabel, setTypeLabel] = useState<string | null>(null);
  const [lockTime, setLockTime] = useState<Date>(
    new Date(Date.now() + 24 * 60 * 60 * 1000) // default: 24h from now
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [votingMechanism, setVotingMechanism] = useState<string>(
    "point_allocation"
  );
  const [optionSubmission, setOptionSubmission] = useState<string>("anyone");
  const [maxOptions, setMaxOptions] = useState(7);
  const [revealVotes, setRevealVotes] = useState(false);
  const [creating, setCreating] = useState(false);

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
          },
        ])
        .select("id, invite_code")
        .single();

      if (insertError) throw insertError;

      // Add organizer as first member
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
            Lock Time
          </Text>
          <Text
            style={[
              styles.sectionHint,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            When the decision auto-finalizes. No more changes after this.
          </Text>
          <TouchableOpacity
            style={[
              styles.dateButton,
              {
                backgroundColor:
                  (theme as any).custom?.card || theme.colors.surface,
                borderColor:
                  (theme as any).custom?.cardBorder || theme.colors.outline,
              },
            ]}
            onPress={() => setShowDatePicker(true)}
          >
            <Icon name="event" size={18} color={theme.colors.primary} />
            <Text
              style={[
                styles.dateButtonText,
                { color: theme.colors.onBackground },
              ]}
            >
              {formatLockTime(lockTime.toISOString())}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={lockTime}
              mode="date"
              minimumDate={new Date()}
              onChange={(event, date) => {
                setShowDatePicker(false);
                if (date) {
                  const updated = new Date(lockTime);
                  updated.setFullYear(
                    date.getFullYear(),
                    date.getMonth(),
                    date.getDate()
                  );
                  setLockTime(updated);
                  setShowTimePicker(true);
                }
              }}
            />
          )}

          {showTimePicker && (
            <DateTimePicker
              value={lockTime}
              mode="time"
              onChange={(event, date) => {
                setShowTimePicker(false);
                if (date) {
                  const updated = new Date(lockTime);
                  updated.setHours(date.getHours(), date.getMinutes());
                  setLockTime(updated);
                }
              }}
            />
          )}

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
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
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
});

export default CreateDecisionScreen;
