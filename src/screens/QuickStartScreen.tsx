import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialIcons } from "@expo/vector-icons";
import { resolveDecisionActor } from "../lib/resolveDecisionActor";
import { getGuestDisplayName } from "../lib/guest";
import { decisionRepository } from "../lib/repositoryProvider";
import DateTimePickerModal from "../components/DateTimePickerModal";
import type {
  DecisionActor,
  QuickDecisionCategory,
} from "../domain/decisionTypes";
import type { RootStackParamList } from "../types/navigation";

type NavProp = NativeStackNavigationProp<
  RootStackParamList,
  "QuickStartScreen"
>;

// ─────────────────────────────────────────────────────────────────────────────
// Category definitions
// ─────────────────────────────────────────────────────────────────────────────

interface CategoryOption {
  value: QuickDecisionCategory;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
  hint: string;
}

const CATEGORIES: CategoryOption[] = [
  {
    value: "food",
    label: "Food",
    icon: "restaurant",
    color: "#f97316",
    hint: "Restaurants, delivery, snacks",
  },
  {
    value: "activity",
    label: "Activity",
    icon: "directions-run",
    color: "#22c55e",
    hint: "Games, outings, plans",
  },
  {
    value: "trip",
    label: "Trip",
    icon: "flight",
    color: "#38bdf8",
    hint: "Destinations, weekends away",
  },
  {
    value: "other",
    label: "Other",
    icon: "lightbulb",
    color: "#a78bfa",
    hint: "Anything else",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Duration presets
// ─────────────────────────────────────────────────────────────────────────────

type DurationPresetId = "2h" | "tonight" | "tomorrow" | "3d" | "1w" | "custom";

interface DurationPreset {
  id: DurationPresetId;
  label: string;
}

const DURATION_PRESETS: DurationPreset[] = [
  { id: "2h", label: "2 hours" },
  { id: "tonight", label: "Tonight" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "3d", label: "3 days" },
  { id: "1w", label: "1 week" },
  { id: "custom", label: "Custom…" },
];

function computeClosesAt(id: DurationPresetId, customDate: Date): Date {
  const now = new Date();
  switch (id) {
    case "2h":
      return new Date(now.getTime() + 2 * 60 * 60 * 1000);
    case "tonight": {
      const t = new Date(now);
      t.setHours(23, 0, 0, 0);
      // If it's already past 11pm, push to tomorrow night
      if (t <= now) t.setDate(t.getDate() + 1);
      return t;
    }
    case "tomorrow": {
      const t = new Date(now);
      t.setDate(t.getDate() + 1);
      t.setHours(23, 0, 0, 0);
      return t;
    }
    case "3d":
      return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    case "1w":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "custom":
      return customDate;
  }
}

function formatPreviewDate(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffH = Math.round(diffMs / (60 * 60 * 1000));
  const diffD = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (diffH < 24) return `Closes in ~${diffH}h`;
  if (diffD < 7) return `Closes in ${diffD} day${diffD === 1 ? "" : "s"}`;
  return `Closes ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// QuickStartScreen
// ─────────────────────────────────────────────────────────────────────────────

export default function QuickStartScreen() {
  const navigation = useNavigation<NavProp>();

  const [actor, setActor] = useState<DecisionActor | null>(null);
  const [creatingCategory, setCreatingCategory] =
    useState<QuickDecisionCategory | null>(null);
  const [customTitle, setCustomTitle] = useState("");
  const [titleError, setTitleError] = useState("");

  // Options and quorum settings are configured in LiveDecisionScreen during
  // the setup phase, not here. QuickStartScreen is intentionally minimal.

  // Duration selector state
  const [selectedDuration, setSelectedDuration] =
    useState<DurationPresetId>("2h");
  const [customDate, setCustomDate] = useState<Date>(
    new Date(Date.now() + 24 * 60 * 60 * 1000),
  );
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    resolveDecisionActor().then(setActor);
  }, []);

  const isGuest = actor?.kind === "guest";
  const anyCreating = creatingCategory !== null;

  const closesAt = computeClosesAt(selectedDuration, customDate);

  function handleDurationPress(id: DurationPresetId) {
    if (anyCreating) return;
    if (id === "custom") {
      setShowPicker(true);
    } else {
      setSelectedDuration(id);
    }
  }

  function handlePickerConfirm(date: Date) {
    setCustomDate(date);
    setSelectedDuration("custom");
    setShowPicker(false);
  }

  // ── Creation handler ───────────────────────────────────────────────────────
  async function handleSelectCategory(category: QuickDecisionCategory) {
    if (!actor || anyCreating) return;
    if (!customTitle.trim()) {
      setTitleError("TITLE");
      return;
    }

    setTitleError("");
    setCreatingCategory(category);
    try {
      const displayName =
        actor.kind === "guest"
          ? ((await getGuestDisplayName()) ?? undefined)
          : undefined;

      const { decision } = await decisionRepository.createQuickDecision({
        actor,
        category,
        displayName,
        title: customTitle.trim() || undefined,
        closesAt: closesAt.toISOString(),
        // Options and quorum settings are configured in setup phase inside
        // LiveDecisionScreen after creation.
      });

      navigation.replace("LiveDecisionScreen", { decisionId: decision.id });
    } catch (e: any) {
      setCreatingCategory(null);
      Alert.alert("Couldn't create plan", e?.message ?? "Try again.");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* ── Nav bar ── */}
      <View style={styles.navBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialIcons name="arrow-back" size={22} color="#94a3b8" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>New Plan</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.inner}>
        {/* ── Heading ── */}
        <View style={styles.heading}>
          <Text style={styles.title}>What's the plan?</Text>
          <Text style={styles.subtitle}>Pick a category to get started.</Text>
        </View>

        {/* ── Optional title input ── */}
        <View style={styles.titleInputWrap}>
          {titleError ? (
            <Text style={styles.titleErrorText}>{titleError}</Text>
          ) : (
            <Text style={styles.titleLabel}>TITLE</Text>
          )}
          <View style={styles.titleInputContainer}>
            <TextInput
              style={[styles.titleInput, titleError && styles.titleInputError]}
              placeholder="Friday Night Dinner, Weekend Trip, etc"
              placeholderTextColor="#3d5068"
              value={customTitle}
              autoCapitalize="words"
              onChangeText={(text) => {
                setCustomTitle(text);
                if (titleError) setTitleError("");
              }}
              maxLength={60}
              returnKeyType="done"
              editable={!anyCreating}
            />
            {titleError ? (
              <MaterialIcons
                name="error"
                size={20}
                color="#f87171"
                style={styles.titleInputIcon}
              />
            ) : null}
          </View>
          {/* <Text style={styles.titleErrorText}>{titleError}</Text> */}
        </View>

        {/* ── Duration selector ── */}
        <View style={styles.durationWrap}>
          <Text style={styles.durationLabel}>Duration</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.durationRow}
          >
            {DURATION_PRESETS.map((preset) => {
              const isSelected = selectedDuration === preset.id;
              return (
                <TouchableOpacity
                  key={preset.id}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() => handleDurationPress(preset.id)}
                  disabled={anyCreating}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      isSelected && styles.chipTextSelected,
                    ]}
                  >
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <Text style={styles.durationPreview}>
            {formatPreviewDate(closesAt)}
          </Text>
        </View>

        {/* ── Category grid ── */}
        <Text style={styles.categoriesLabel}>CATEGORIES</Text>
        <View style={styles.grid}>
          {CATEGORIES.map((cat) => {
            const isThisCreating = creatingCategory === cat.value;
            const isDisabled = anyCreating && !isThisCreating;

            return (
              <TouchableOpacity
                key={cat.value}
                style={[
                  styles.card,
                  { borderLeftColor: cat.color },
                  isThisCreating && styles.cardCreating,
                  isDisabled && styles.cardDisabled,
                ]}
                onPress={() => handleSelectCategory(cat.value)}
                disabled={isDisabled || anyCreating}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Start a ${cat.label} decision`}
                accessibilityState={{ disabled: isDisabled }}
              >
                {isThisCreating ? (
                  <View style={styles.cardCreatingInner}>
                    <ActivityIndicator color={cat.color} size="small" />
                    <Text
                      style={[styles.cardCreatingText, { color: cat.color }]}
                    >
                      Creating…
                    </Text>
                  </View>
                ) : (
                  <>
                    <View
                      style={[
                        styles.iconContainer,
                        { backgroundColor: cat.color + "22" },
                      ]}
                    >
                      <MaterialIcons
                        name={cat.icon}
                        size={26}
                        color={isDisabled ? "#475569" : cat.color}
                      />
                    </View>
                    <Text
                      style={[
                        styles.cardLabel,
                        isDisabled && styles.cardLabelDisabled,
                      ]}
                    >
                      {cat.label}
                    </Text>
                    <Text
                      style={[
                        styles.cardHint,
                        isDisabled && styles.cardHintDisabled,
                      ]}
                    >
                      {cat.hint}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Footer links ── */}
        <View style={styles.footer}>
          {/* <TouchableOpacity
            style={styles.advancedLink}
            onPress={() => navigation.navigate("CreateDecisionScreen")}
            disabled={anyCreating}
            accessibilityRole="link"
          >
            <Text
              style={[
                styles.advancedLinkText,
                anyCreating && styles.linkDisabled,
              ]}
            >
              Need more options? Try Advanced →
            </Text>
          </TouchableOpacity> */}

          {isGuest && (
            <TouchableOpacity
              style={styles.loginLink}
              onPress={() => navigation.navigate("Login")}
              disabled={anyCreating}
              accessibilityRole="link"
            >
              <Text
                style={[
                  styles.loginLinkText,
                  anyCreating && styles.linkDisabled,
                ]}
              >
                Log in to save history
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Custom date/time picker ── */}
      <DateTimePickerModal
        visible={showPicker}
        value={customDate}
        minimumDate={new Date(Date.now() + 5 * 60 * 1000)}
        onConfirm={handlePickerConfirm}
        onCancel={() => setShowPicker(false)}
      />
    </SafeAreaView>
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

  // ── Nav bar ──
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  backBtn: {
    width: 40,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#e2e8f0",
    letterSpacing: -0.2,
  },

  inner: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    justifyContent: "flex-start",
  },

  // ── Heading ──
  heading: {
    marginBottom: 20,
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#f1f5f9",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 19,
  },

  // ── Optional title ──
  titleInputWrap: {
    marginBottom: 12,
  },
  titleInputContainer: {
    position: "relative",
  },
  titleInput: {
    backgroundColor: "#141f2e",
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingRight: 40,
    color: "#f1f5f9",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  titleInputIcon: {
    position: "absolute",
    right: 12,
    top: 12,
  },
  titleInputError: {
    borderColor: "#f87171",
  },
  titleErrorText: {
    color: "#f87171",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  titleLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },

  // ── Duration selector ──
  durationWrap: {
    marginBottom: 12,
  },
  durationLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  categoriesLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  durationRow: {
    gap: 8,
    paddingLeft: 0,
    paddingRight: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  chipSelected: {
    backgroundColor: "#1d4ed8",
    borderColor: "#3b82f6",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748b",
  },
  chipTextSelected: {
    color: "#eff6ff",
    fontWeight: "600",
  },
  durationPreview: {
    fontSize: 11,
    color: "#334155",
    marginTop: 8,
  },

  // ── Grid ──
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "flex-start",
  },
  card: {
    width: "48%",
    backgroundColor: "#1e293b",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderLeftWidth: 3,
    alignItems: "flex-start",
    padding: 16,
    minHeight: 120,
    justifyContent: "center",
  },
  cardCreating: {
    opacity: 0.9,
    borderColor: "rgba(255,255,255,0.12)",
  },
  cardDisabled: {
    opacity: 0.3,
  },
  cardCreatingInner: {
    alignItems: "center",
    width: "100%",
    gap: 8,
  },
  cardCreatingText: {
    fontSize: 12,
    fontWeight: "600",
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#f1f5f9",
    marginBottom: 3,
  },
  cardLabelDisabled: {
    color: "#475569",
  },
  cardHint: {
    fontSize: 11,
    color: "#64748b",
    lineHeight: 15,
  },
  cardHintDisabled: {
    color: "#334155",
  },

  // ── Footer ──
  footer: {
    marginTop: 20,
    alignItems: "center",
    gap: 12,
  },
  advancedLink: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  advancedLinkText: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "500",
  },
  loginLink: {
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  loginLinkText: {
    fontSize: 12,
    color: "#334155",
  },
  linkDisabled: {
    opacity: 0.4,
  },
});
