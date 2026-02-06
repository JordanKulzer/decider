export const DECISION_TYPES = [
  { key: "dinner", label: "Dinner", icon: "restaurant" },
  { key: "trip", label: "Trip", icon: "flight" },
  { key: "activity", label: "Activity", icon: "sports-esports" },
  { key: "purchase", label: "Purchase", icon: "shopping-cart" },
  { key: "rule_change", label: "Rule Change", icon: "gavel" },
  { key: "other", label: "Other", icon: "category" },
] as const;

export const VOTING_MECHANISMS = [
  {
    key: "point_allocation",
    label: "Point Allocation",
    description: "Distribute 10 points across options",
  },
  {
    key: "forced_ranking",
    label: "Forced Ranking",
    description: "Rank all options from best to worst",
  },
] as const;

export const CONSTRAINT_TYPES = [
  { key: "budget_max", label: "Budget Maximum", icon: "attach-money", placeholder: "Max amount" },
  { key: "date_range", label: "Date Range", icon: "date-range", placeholder: "" },
  { key: "distance", label: "Max Distance", icon: "place", placeholder: "Max miles" },
  { key: "duration", label: "Max Duration", icon: "schedule", placeholder: "Max hours" },
  { key: "exclusion", label: "Hard Exclusion", icon: "block", placeholder: "e.g. no sushi" },
] as const;

export const DECISION_PHASES = ["constraints", "options", "voting", "locked"] as const;
export type DecisionPhase = (typeof DECISION_PHASES)[number];

export const PHASE_LABELS: Record<DecisionPhase, string> = {
  constraints: "Constraints",
  options: "Options",
  voting: "Voting",
  locked: "Locked",
};
