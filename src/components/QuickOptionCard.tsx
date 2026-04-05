import React, { memo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import type { LiveDecisionOptionView, ResponseType } from "../domain/decisionTypes";

interface QuickOptionCardProps {
  option: LiveDecisionOptionView;
  /** True when this option has the most 'im_in' responses right now. */
  isLeading: boolean;
  /** True when the decision is locked — all controls become inert. */
  isLocked: boolean;
  /** True when multiple options share the top im_in count at lock time. */
  isTied: boolean;
  /** True when multiple options are tied for the lead while the decision is still active. */
  isLiveTied?: boolean;
  /**
   * When true, suppresses the "Leading" status chip.
   * Used in race mode (earlyLockEnabled) where threshold-progress copy is more
   * meaningful than a relative rank label.
   * "Tied for lead" is still shown even when this is true.
   */
  suppressLeadingLabel?: boolean;
  /** True while a mutation for this option is in-flight. */
  isPending: boolean;
  /**
   * Minimum number of 'im_in' responses required for this option to win.
   * When set, a "{imInCount}/{minimumAttendees}" progress label is shown.
   * Null = no quorum configured.
   */
  minimumAttendees: number | null;
  /**
   * Human-readable progress toward the quorum threshold for the leading option.
   * e.g. "Needs 1 more" or null when threshold is met or not applicable.
   * Only rendered when this option is leading and the decision is not locked.
   */
  thresholdProgress?: string | null;
  onSetResponse: (response: ResponseType) => void;
  onToggleTopChoice: () => void;
}

const RESPONSE_LABELS: Record<ResponseType, string> = {
  im_in:      "I'm In",
  prefer_not: "Prefer Not",
  cant:       "Can't",
};

function QuickOptionCard({
  option,
  isLeading,
  isLocked,
  isTied,
  isLiveTied = false,
  suppressLeadingLabel = false,
  isPending,
  minimumAttendees,
  thresholdProgress,
  onSetResponse,
  onToggleTopChoice,
}: QuickOptionCardProps) {
  const { myResponse, myIsTopChoice, imInCount, topChoiceCount } = option;
  // Quorum progress: shown when minimumAttendees is set.
  const quorumMet = minimumAttendees !== null && imInCount >= minimumAttendees;

  const statusLabel = isLeading
    ? isLocked
      ? isTied ? "Tied" : "Most In"
      : isLiveTied ? "Tied for lead"
      : suppressLeadingLabel ? null
      : "Leading"
    : null;

  const canToggleTopChoice =
    !isLocked && (myResponse === "im_in" || myResponse === "prefer_not");

  return (
    <View style={[
      styles.card,
      isLeading && !isLocked && !isLiveTied && styles.cardLeading,
      isLeading && !isLocked && isLiveTied  && styles.cardLiveTied,
      isLocked && isLeading && !isTied && styles.cardWinner,
      isLocked && isLeading && isTied  && styles.cardTied,
    ]}>

      {/* ── Top row: title + imInCount + star ── */}
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={2}>
            {option.title}
          </Text>
          {statusLabel && (
            <View style={[
              styles.statusChip,
              isLocked && !isTied  && styles.statusChipWinner,
              isLocked && isTied   && styles.statusChipTied,
              !isLocked && !isLiveTied && styles.statusChipLeading,
              !isLocked && isLiveTied  && styles.statusChipTied,
            ]}>
              <Text style={[
                styles.statusChipText,
                isLocked && !isTied  && styles.statusChipTextWinner,
                isLocked && isTied   && styles.statusChipTextTied,
                !isLocked && !isLiveTied && styles.statusChipTextLeading,
                !isLocked && isLiveTied  && styles.statusChipTextTied,
              ]}>
                {statusLabel}
              </Text>
            </View>
          )}
          {/* Threshold progress — only on the leading card while active */}
          {thresholdProgress && isLeading && !isLocked && (
            <Text style={styles.thresholdProgress}>{thresholdProgress}</Text>
          )}
        </View>

        {/* im_in count + optional star */}
        <View style={styles.countCol}>
          <Text style={[
            styles.imInCount,
            isLocked && isLeading && !isTied && styles.imInCountWinner,
            isLocked && isLeading && isTied  && styles.imInCountTied,
          ]}>
            {imInCount}
          </Text>
          <Text style={styles.imInLabel}>in</Text>

          {/* Quorum met indicator — only show when threshold is actually reached */}
          {minimumAttendees !== null && !isLocked && quorumMet && (
            <Text style={styles.quorumLabelMet}>✓</Text>
          )}

          {canToggleTopChoice && (
            <TouchableOpacity
              style={styles.starBtn}
              onPress={onToggleTopChoice}
              disabled={isPending}
              hitSlop={8}
              accessibilityLabel={myIsTopChoice ? "Remove top choice" : "Mark as top choice"}
              accessibilityRole="button"
            >
              <MaterialIcons
                name={myIsTopChoice ? "star" : "star-border"}
                size={18}
                color={myIsTopChoice ? "#fbbf24" : "#475569"}
              />
            </TouchableOpacity>
          )}

          {/* Top choice aggregate — shown while active so tie outcomes feel legible */}
          {!isLocked && topChoiceCount > 0 && (
            <View style={styles.topChoiceCount}>
              <MaterialIcons name="star" size={10} color="#fbbf24" />
              <Text style={styles.topChoiceCountText}>{topChoiceCount}</Text>
            </View>
          )}

          {isLocked && myIsTopChoice && (
            <MaterialIcons name="star" size={16} color="#fbbf24" />
          )}
        </View>
      </View>

      {/* ── Response buttons (active only) ── */}
      {!isLocked && (
        <View style={styles.responseRow}>
          {(["im_in", "prefer_not", "cant"] as ResponseType[]).map((r) => {
            const isActive = myResponse === r;
            return (
              <TouchableOpacity
                key={r}
                style={[
                  styles.responseBtn,
                  isActive && responseActiveStyle(r),
                  isPending && styles.responseBtnDisabled,
                ]}
                onPress={() => onSetResponse(r)}
                disabled={isPending}
                activeOpacity={0.72}
                accessibilityLabel={RESPONSE_LABELS[r]}
                accessibilityRole="button"
              >
                {isPending && isActive ? (
                  <ActivityIndicator size={11} color={responsePendingColor(r)} />
                ) : (
                  <Text style={[
                    styles.responseBtnText,
                    isActive && responseActiveTextStyle(r),
                  ]}>
                    {RESPONSE_LABELS[r]}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Locked: show actor's response as a read-only chip ── */}
      {isLocked && myResponse && (
        <View style={styles.lockedResponseRow}>
          <View style={[styles.lockedResponseChip, responseActiveStyle(myResponse)]}>
            <Text style={[styles.lockedResponseText, responseActiveTextStyle(myResponse)]}>
              {RESPONSE_LABELS[myResponse]}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Style helpers ──────────────────────────────────────────────────────────────

function responseActiveStyle(r: ResponseType): object {
  switch (r) {
    case "im_in":      return styles.responseBtnImIn;
    case "prefer_not": return styles.responseBtnPreferNot;
    case "cant":       return styles.responseBtnCant;
  }
}

function responseActiveTextStyle(r: ResponseType): object {
  switch (r) {
    case "im_in":      return styles.responseBtnTextImIn;
    case "prefer_not": return styles.responseBtnTextPreferNot;
    case "cant":       return styles.responseBtnTextCant;
  }
}

function responsePendingColor(r: ResponseType): string {
  switch (r) {
    case "im_in":      return "#86efac";
    case "prefer_not": return "#fcd34d";
    case "cant":       return "#f87171";
  }
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    gap: 10,
  },
  cardLeading: {
    borderColor: "rgba(99,102,241,0.5)",
    borderWidth: 1.5,
    backgroundColor: "#1c1e3a",
  },
  cardLiveTied: {
    borderColor: "rgba(245,158,11,0.3)",
    borderWidth: 1.5,
    backgroundColor: "#1a1600",
  },
  cardWinner: {
    borderColor: "rgba(34,197,94,0.5)",
    borderWidth: 1.5,
    backgroundColor: "#0e2a1a",
  },
  cardTied: {
    borderColor: "rgba(245,158,11,0.45)",
    borderWidth: 1.5,
    backgroundColor: "#1c1600",
  },

  // ── Top row ──
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  titleWrap: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#e2e8f0",
    lineHeight: 20,
  },

  // Status chip
  statusChip: {
    alignSelf: "flex-start",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusChipLeading: {
    backgroundColor: "rgba(99,102,241,0.15)",
  },
  statusChipWinner: {
    backgroundColor: "rgba(34,197,94,0.15)",
  },
  statusChipTied: {
    backgroundColor: "rgba(245,158,11,0.15)",
  },
  statusChipText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusChipTextLeading: {
    color: "#818cf8",
  },
  statusChipTextWinner: {
    color: "#86efac",
  },
  statusChipTextTied: {
    color: "#fcd34d",
  },

  // Count column (right side)
  countCol: {
    alignItems: "center",
    gap: 2,
    minWidth: 36,
  },
  imInCount: {
    fontSize: 22,
    fontWeight: "700",
    color: "#f1f5f9",
    lineHeight: 26,
    textAlign: "center",
  },
  imInCountWinner: {
    color: "#86efac",
  },
  imInCountTied: {
    color: "#fcd34d",
  },
  imInLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  quorumLabelMet: {
    fontSize: 10,
    fontWeight: "700",
    color: "#86efac",
  },
  thresholdProgress: {
    fontSize: 11,
    fontWeight: "600",
    color: "#818cf8",
  },
  starBtn: {
    marginTop: 4,
    padding: 2,
  },
  topChoiceCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 2,
  },
  topChoiceCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fbbf24",
  },

  // ── Response buttons ──
  responseRow: {
    flexDirection: "row",
    gap: 6,
  },
  responseBtn: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  responseBtnDisabled: {
    opacity: 0.55,
  },
  responseBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
  },

  // Active states per response type
  responseBtnImIn: {
    backgroundColor: "rgba(34,197,94,0.14)",
    borderColor: "rgba(34,197,94,0.35)",
  },
  responseBtnPreferNot: {
    backgroundColor: "rgba(245,158,11,0.14)",
    borderColor: "rgba(245,158,11,0.35)",
  },
  responseBtnCant: {
    backgroundColor: "rgba(248,113,113,0.14)",
    borderColor: "rgba(248,113,113,0.35)",
  },
  responseBtnTextImIn: {
    color: "#86efac",
  },
  responseBtnTextPreferNot: {
    color: "#fcd34d",
  },
  responseBtnTextCant: {
    color: "#f87171",
  },

  // ── Locked response chip ──
  lockedResponseRow: {
    flexDirection: "row",
  },
  lockedResponseChip: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  lockedResponseText: {
    fontSize: 11,
    fontWeight: "600",
  },
});

export default memo(QuickOptionCard);
