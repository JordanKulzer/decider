import { DEMO_USER_ID } from "./demoMode";
import type {
  Decision,
  DecisionMember,
  Constraint,
  DecisionOption,
  Vote,
  Result,
} from "../types/decisions";

const OTHER_USER_1 = "demo-user-00000000-0000-0000-0000-000000000002";
const OTHER_USER_2 = "demo-user-00000000-0000-0000-0000-000000000003";
const OTHER_USER_3 = "demo-user-00000000-0000-0000-0000-000000000004";

// Lock time: 2 hours from now (so countdown timer works)
const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

// ─── Decision 1: Constraints phase (dinner) ───
const DECISION_1: Decision = {
  id: "demo-decision-001",
  title: "Friday Night Dinner",
  description: "Where should the group eat this Friday?",
  type_label: "dinner",
  created_by: DEMO_USER_ID,
  lock_time: oneDayFromNow,
  status: "constraints",
  voting_mechanism: "point_allocation",
  max_options: 5,
  option_submission: "anyone",
  reveal_votes_after_lock: false,
  invite_code: "FRD7KX",
  created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
};

const MEMBERS_1: DecisionMember[] = [
  {
    id: "dm-001",
    decision_id: "demo-decision-001",
    user_id: DEMO_USER_ID,
    role: "organizer",
    has_voted: false,
    joined_at: DECISION_1.created_at,
    username: "demo_user",
    email: "demo@decider.app",
  },
  {
    id: "dm-002",
    decision_id: "demo-decision-001",
    user_id: OTHER_USER_1,
    role: "member",
    has_voted: false,
    joined_at: DECISION_1.created_at,
    username: "alex_m",
    email: "alex@example.com",
  },
  {
    id: "dm-003",
    decision_id: "demo-decision-001",
    user_id: OTHER_USER_2,
    role: "member",
    has_voted: false,
    joined_at: DECISION_1.created_at,
    username: "jordan_k",
    email: "jordan@example.com",
  },
];

const CONSTRAINTS_1: Constraint[] = [
  {
    id: "con-001",
    decision_id: "demo-decision-001",
    user_id: DEMO_USER_ID,
    type: "budget_max",
    value: { max: 30 },
    created_at: DECISION_1.created_at,
    username: "demo_user",
  },
];

// ─── Decision 2: Options phase (weekend trip) ───
const DECISION_2: Decision = {
  id: "demo-decision-002",
  title: "Weekend Trip Destination",
  description: "Plan the group getaway for next month",
  type_label: "trip",
  created_by: OTHER_USER_1,
  lock_time: oneDayFromNow,
  status: "options",
  voting_mechanism: "forced_ranking",
  max_options: 6,
  option_submission: "anyone",
  reveal_votes_after_lock: true,
  invite_code: "WKN3TP",
  created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
};

const MEMBERS_2: DecisionMember[] = [
  {
    id: "dm-004",
    decision_id: "demo-decision-002",
    user_id: OTHER_USER_1,
    role: "organizer",
    has_voted: false,
    joined_at: DECISION_2.created_at,
    username: "alex_m",
    email: "alex@example.com",
  },
  {
    id: "dm-005",
    decision_id: "demo-decision-002",
    user_id: DEMO_USER_ID,
    role: "member",
    has_voted: false,
    joined_at: DECISION_2.created_at,
    username: "demo_user",
    email: "demo@decider.app",
  },
  {
    id: "dm-006",
    decision_id: "demo-decision-002",
    user_id: OTHER_USER_2,
    role: "member",
    has_voted: false,
    joined_at: DECISION_2.created_at,
    username: "jordan_k",
    email: "jordan@example.com",
  },
  {
    id: "dm-007",
    decision_id: "demo-decision-002",
    user_id: OTHER_USER_3,
    role: "member",
    has_voted: false,
    joined_at: DECISION_2.created_at,
    username: "sam_w",
    email: "sam@example.com",
  },
];

const CONSTRAINTS_2: Constraint[] = [
  {
    id: "con-002",
    decision_id: "demo-decision-002",
    user_id: OTHER_USER_1,
    type: "budget_max",
    value: { max: 500 },
    created_at: DECISION_2.created_at,
    username: "alex_m",
  },
  {
    id: "con-003",
    decision_id: "demo-decision-002",
    user_id: OTHER_USER_2,
    type: "distance",
    value: { max: 200 },
    created_at: DECISION_2.created_at,
    username: "jordan_k",
  },
];

const OPTIONS_2: DecisionOption[] = [
  {
    id: "opt-001",
    decision_id: "demo-decision-002",
    submitted_by: OTHER_USER_1,
    title: "Lake Tahoe cabin",
    description: "Cozy cabin with lake views, 3 bedrooms",
    metadata: null,
    passes_constraints: true,
    constraint_violations: null,
    created_at: DECISION_2.created_at,
    submitted_by_username: "alex_m",
  },
  {
    id: "opt-002",
    decision_id: "demo-decision-002",
    submitted_by: DEMO_USER_ID,
    title: "Santa Cruz beach house",
    description: "Right on the boardwalk, walkable to everything",
    metadata: null,
    passes_constraints: true,
    constraint_violations: null,
    created_at: DECISION_2.created_at,
    submitted_by_username: "demo_user",
  },
  {
    id: "opt-003",
    decision_id: "demo-decision-002",
    submitted_by: OTHER_USER_2,
    title: "Yosemite campsite",
    description: "Back to nature, campfire every night",
    metadata: null,
    passes_constraints: true,
    constraint_violations: null,
    created_at: DECISION_2.created_at,
    submitted_by_username: "jordan_k",
  },
];

// ─── Decision 3: Voting phase (team activity) ───
const DECISION_3: Decision = {
  id: "demo-decision-003",
  title: "Team Building Activity",
  description: "Pick an activity for next week's team outing",
  type_label: "activity",
  created_by: DEMO_USER_ID,
  lock_time: twoHoursFromNow,
  status: "voting",
  voting_mechanism: "point_allocation",
  max_options: 5,
  option_submission: "anyone",
  reveal_votes_after_lock: false,
  invite_code: "TMB9AV",
  created_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
};

const MEMBERS_3: DecisionMember[] = [
  {
    id: "dm-008",
    decision_id: "demo-decision-003",
    user_id: DEMO_USER_ID,
    role: "organizer",
    has_voted: false,
    joined_at: DECISION_3.created_at,
    username: "demo_user",
    email: "demo@decider.app",
  },
  {
    id: "dm-009",
    decision_id: "demo-decision-003",
    user_id: OTHER_USER_1,
    role: "member",
    has_voted: true,
    joined_at: DECISION_3.created_at,
    username: "alex_m",
    email: "alex@example.com",
  },
  {
    id: "dm-010",
    decision_id: "demo-decision-003",
    user_id: OTHER_USER_3,
    role: "member",
    has_voted: true,
    joined_at: DECISION_3.created_at,
    username: "sam_w",
    email: "sam@example.com",
  },
];

const CONSTRAINTS_3: Constraint[] = [
  {
    id: "con-004",
    decision_id: "demo-decision-003",
    user_id: DEMO_USER_ID,
    type: "budget_max",
    value: { max: 50 },
    created_at: DECISION_3.created_at,
    username: "demo_user",
  },
];

const OPTIONS_3: DecisionOption[] = [
  {
    id: "opt-004",
    decision_id: "demo-decision-003",
    submitted_by: DEMO_USER_ID,
    title: "Escape room",
    description: "Mystery-themed, 60 min challenge",
    metadata: null,
    passes_constraints: true,
    constraint_violations: null,
    created_at: DECISION_3.created_at,
    submitted_by_username: "demo_user",
  },
  {
    id: "opt-005",
    decision_id: "demo-decision-003",
    submitted_by: OTHER_USER_1,
    title: "Go-kart racing",
    description: "Indoor track, 3 races per person",
    metadata: null,
    passes_constraints: true,
    constraint_violations: null,
    created_at: DECISION_3.created_at,
    submitted_by_username: "alex_m",
  },
  {
    id: "opt-006",
    decision_id: "demo-decision-003",
    submitted_by: OTHER_USER_3,
    title: "Bowling + dinner",
    description: "2 games plus pizza at the alley",
    metadata: null,
    passes_constraints: true,
    constraint_violations: null,
    created_at: DECISION_3.created_at,
    submitted_by_username: "sam_w",
  },
  {
    id: "opt-007",
    decision_id: "demo-decision-003",
    submitted_by: OTHER_USER_1,
    title: "Trivia night",
    description: "Local pub trivia, teams of 4",
    metadata: null,
    passes_constraints: true,
    constraint_violations: null,
    created_at: DECISION_3.created_at,
    submitted_by_username: "alex_m",
  },
];

// ─── Decision 4: Locked phase (completed purchase decision) ───
const DECISION_4: Decision = {
  id: "demo-decision-004",
  title: "Group Gift for Sarah",
  description: "What should we get Sarah for her birthday?",
  type_label: "purchase",
  created_by: OTHER_USER_2,
  lock_time: yesterday,
  status: "locked",
  voting_mechanism: "point_allocation",
  max_options: 5,
  option_submission: "anyone",
  reveal_votes_after_lock: true,
  invite_code: "GFT2SH",
  created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
};

const MEMBERS_4: DecisionMember[] = [
  {
    id: "dm-011",
    decision_id: "demo-decision-004",
    user_id: OTHER_USER_2,
    role: "organizer",
    has_voted: true,
    joined_at: DECISION_4.created_at,
    username: "jordan_k",
    email: "jordan@example.com",
  },
  {
    id: "dm-012",
    decision_id: "demo-decision-004",
    user_id: DEMO_USER_ID,
    role: "member",
    has_voted: true,
    joined_at: DECISION_4.created_at,
    username: "demo_user",
    email: "demo@decider.app",
  },
  {
    id: "dm-013",
    decision_id: "demo-decision-004",
    user_id: OTHER_USER_1,
    role: "member",
    has_voted: true,
    joined_at: DECISION_4.created_at,
    username: "alex_m",
    email: "alex@example.com",
  },
];

const OPTIONS_4: DecisionOption[] = [
  {
    id: "opt-008",
    decision_id: "demo-decision-004",
    submitted_by: OTHER_USER_2,
    title: "Spa gift card",
    description: "$75 spa & wellness package",
    metadata: null,
    passes_constraints: true,
    constraint_violations: null,
    created_at: DECISION_4.created_at,
    submitted_by_username: "jordan_k",
  },
  {
    id: "opt-009",
    decision_id: "demo-decision-004",
    submitted_by: DEMO_USER_ID,
    title: "Instant camera",
    description: "Fujifilm Instax Mini with film pack",
    metadata: null,
    passes_constraints: true,
    constraint_violations: null,
    created_at: DECISION_4.created_at,
    submitted_by_username: "demo_user",
  },
  {
    id: "opt-010",
    decision_id: "demo-decision-004",
    submitted_by: OTHER_USER_1,
    title: "Cookbook + ingredients",
    description: "Her favorite chef's new cookbook plus a basket of ingredients",
    metadata: null,
    passes_constraints: true,
    constraint_violations: null,
    created_at: DECISION_4.created_at,
    submitted_by_username: "alex_m",
  },
];

const VOTES_4: Vote[] = [
  // jordan_k votes: spa 6, camera 2, cookbook 2
  { id: "v-001", decision_id: "demo-decision-004", user_id: OTHER_USER_2, option_id: "opt-008", value: 6, created_at: DECISION_4.created_at },
  { id: "v-002", decision_id: "demo-decision-004", user_id: OTHER_USER_2, option_id: "opt-009", value: 2, created_at: DECISION_4.created_at },
  { id: "v-003", decision_id: "demo-decision-004", user_id: OTHER_USER_2, option_id: "opt-010", value: 2, created_at: DECISION_4.created_at },
  // demo_user votes: spa 3, camera 5, cookbook 2
  { id: "v-004", decision_id: "demo-decision-004", user_id: DEMO_USER_ID, option_id: "opt-008", value: 3, created_at: DECISION_4.created_at },
  { id: "v-005", decision_id: "demo-decision-004", user_id: DEMO_USER_ID, option_id: "opt-009", value: 5, created_at: DECISION_4.created_at },
  { id: "v-006", decision_id: "demo-decision-004", user_id: DEMO_USER_ID, option_id: "opt-010", value: 2, created_at: DECISION_4.created_at },
  // alex_m votes: spa 4, camera 1, cookbook 5
  { id: "v-007", decision_id: "demo-decision-004", user_id: OTHER_USER_1, option_id: "opt-008", value: 4, created_at: DECISION_4.created_at },
  { id: "v-008", decision_id: "demo-decision-004", user_id: OTHER_USER_1, option_id: "opt-009", value: 1, created_at: DECISION_4.created_at },
  { id: "v-009", decision_id: "demo-decision-004", user_id: OTHER_USER_1, option_id: "opt-010", value: 5, created_at: DECISION_4.created_at },
];

const RESULTS_4: Result[] = [
  { id: "r-001", decision_id: "demo-decision-004", option_id: "opt-008", total_points: 13, average_rank: null, rank: 1, is_winner: true, option_title: "Spa gift card" },
  { id: "r-002", decision_id: "demo-decision-004", option_id: "opt-010", total_points: 9, average_rank: null, rank: 2, is_winner: false, option_title: "Cookbook + ingredients" },
  { id: "r-003", decision_id: "demo-decision-004", option_id: "opt-009", total_points: 8, average_rank: null, rank: 3, is_winner: false, option_title: "Instant camera" },
];

// ─── Aggregated data stores ───

const ALL_DECISIONS: Record<string, Decision> = {
  "demo-decision-001": DECISION_1,
  "demo-decision-002": DECISION_2,
  "demo-decision-003": DECISION_3,
  "demo-decision-004": DECISION_4,
};

const ALL_MEMBERS: Record<string, DecisionMember[]> = {
  "demo-decision-001": MEMBERS_1,
  "demo-decision-002": MEMBERS_2,
  "demo-decision-003": MEMBERS_3,
  "demo-decision-004": MEMBERS_4,
};

const ALL_CONSTRAINTS: Record<string, Constraint[]> = {
  "demo-decision-001": CONSTRAINTS_1,
  "demo-decision-002": CONSTRAINTS_2,
  "demo-decision-003": CONSTRAINTS_3,
  "demo-decision-004": [],
};

const ALL_OPTIONS: Record<string, DecisionOption[]> = {
  "demo-decision-001": [],
  "demo-decision-002": OPTIONS_2,
  "demo-decision-003": OPTIONS_3,
  "demo-decision-004": OPTIONS_4,
};

const ALL_VOTES: Record<string, Vote[]> = {
  "demo-decision-001": [],
  "demo-decision-002": [],
  "demo-decision-003": [],
  "demo-decision-004": VOTES_4,
};

const ALL_RESULTS: Record<string, Result[]> = {
  "demo-decision-001": [],
  "demo-decision-002": [],
  "demo-decision-003": [],
  "demo-decision-004": RESULTS_4,
};

// ─── Mock API functions ───

export const mockFetchUserDecisions = async (_userId: string) => {
  return Object.values(ALL_DECISIONS).map((d) => ({
    decision_id: d.id,
    role: ALL_MEMBERS[d.id]?.find((m) => m.user_id === _userId)?.role || "member",
    has_voted: ALL_MEMBERS[d.id]?.find((m) => m.user_id === _userId)?.has_voted || false,
    decisions: d,
  }));
};

export const mockFetchDecisionDetail = async (decisionId: string): Promise<Decision> => {
  const d = ALL_DECISIONS[decisionId];
  if (!d) throw new Error("Decision not found");
  return d;
};

export const mockFetchDecisionByInviteCode = async (inviteCode: string): Promise<Decision | null> => {
  return Object.values(ALL_DECISIONS).find(
    (d) => d.invite_code === inviteCode.toUpperCase()
  ) || null;
};

export const mockFetchDecisionMembers = async (decisionId: string): Promise<DecisionMember[]> => {
  return ALL_MEMBERS[decisionId] || [];
};

export const mockFetchConstraints = async (decisionId: string): Promise<Constraint[]> => {
  return ALL_CONSTRAINTS[decisionId] || [];
};

export const mockAddConstraint = async (
  decisionId: string,
  userId: string,
  type: string,
  value: Record<string, any>
): Promise<Constraint> => {
  const constraint: Constraint = {
    id: `con-demo-${Date.now()}`,
    decision_id: decisionId,
    user_id: userId,
    type: type as any,
    value,
    created_at: new Date().toISOString(),
    username: "demo_user",
  };
  if (!ALL_CONSTRAINTS[decisionId]) ALL_CONSTRAINTS[decisionId] = [];
  ALL_CONSTRAINTS[decisionId].push(constraint);
  return constraint;
};

export const mockRemoveConstraint = async (constraintId: string) => {
  for (const key of Object.keys(ALL_CONSTRAINTS)) {
    ALL_CONSTRAINTS[key] = ALL_CONSTRAINTS[key].filter((c) => c.id !== constraintId);
  }
};

export const mockFetchOptions = async (decisionId: string): Promise<DecisionOption[]> => {
  return ALL_OPTIONS[decisionId] || [];
};

export const mockAddOption = async (
  decisionId: string,
  userId: string,
  title: string,
  description: string | null,
  metadata: Record<string, any> | null,
  passesConstraints: boolean,
  constraintViolations: Array<{ constraint_id: string; reason: string }> | null
): Promise<DecisionOption> => {
  const option: DecisionOption = {
    id: `opt-demo-${Date.now()}`,
    decision_id: decisionId,
    submitted_by: userId,
    title,
    description,
    metadata,
    passes_constraints: passesConstraints,
    constraint_violations: constraintViolations,
    created_at: new Date().toISOString(),
    submitted_by_username: "demo_user",
  };
  if (!ALL_OPTIONS[decisionId]) ALL_OPTIONS[decisionId] = [];
  ALL_OPTIONS[decisionId].push(option);
  return option;
};

export const mockRemoveOption = async (optionId: string) => {
  for (const key of Object.keys(ALL_OPTIONS)) {
    ALL_OPTIONS[key] = ALL_OPTIONS[key].filter((o) => o.id !== optionId);
  }
};

export const mockFetchVotes = async (decisionId: string): Promise<Vote[]> => {
  return ALL_VOTES[decisionId] || [];
};

export const mockSubmitVotes = async (
  decisionId: string,
  userId: string,
  votes: Array<{ option_id: string; value: number }>
) => {
  if (!ALL_VOTES[decisionId]) ALL_VOTES[decisionId] = [];
  for (const v of votes) {
    if (v.value > 0) {
      ALL_VOTES[decisionId].push({
        id: `v-demo-${Date.now()}-${v.option_id}`,
        decision_id: decisionId,
        user_id: userId,
        option_id: v.option_id,
        value: v.value,
        created_at: new Date().toISOString(),
      });
    }
  }
  // Mark member as voted
  const members = ALL_MEMBERS[decisionId] || [];
  const member = members.find((m) => m.user_id === userId);
  if (member) member.has_voted = true;
};

export const mockFetchResults = async (decisionId: string): Promise<Result[]> => {
  return ALL_RESULTS[decisionId] || [];
};

export const mockAdvancePhase = async (decisionId: string, newStatus: string) => {
  const d = ALL_DECISIONS[decisionId];
  if (d) (d as any).status = newStatus;
};

export const mockJoinDecision = async (decisionId: string, userId: string) => {
  if (!ALL_MEMBERS[decisionId]) ALL_MEMBERS[decisionId] = [];
  ALL_MEMBERS[decisionId].push({
    id: `dm-demo-${Date.now()}`,
    decision_id: decisionId,
    user_id: userId,
    role: "member",
    has_voted: false,
    joined_at: new Date().toISOString(),
    username: "demo_user",
    email: "demo@decider.app",
  });
};

export const mockLeaveDecision = async (decisionId: string, userId: string) => {
  if (ALL_MEMBERS[decisionId]) {
    ALL_MEMBERS[decisionId] = ALL_MEMBERS[decisionId].filter(
      (m) => m.user_id !== userId
    );
  }
};

export const mockCreateDecision = async (
  decision: Omit<Decision, "id" | "created_at">
): Promise<Decision> => {
  const newDecision: Decision = {
    ...decision,
    id: `demo-decision-${Date.now()}`,
    created_at: new Date().toISOString(),
  };
  ALL_DECISIONS[newDecision.id] = newDecision;
  ALL_MEMBERS[newDecision.id] = [
    {
      id: `dm-demo-${Date.now()}`,
      decision_id: newDecision.id,
      user_id: decision.created_by,
      role: "organizer",
      has_voted: false,
      joined_at: newDecision.created_at,
      username: "demo_user",
      email: "demo@decider.app",
    },
  ];
  ALL_CONSTRAINTS[newDecision.id] = [];
  ALL_OPTIONS[newDecision.id] = [];
  ALL_VOTES[newDecision.id] = [];
  ALL_RESULTS[newDecision.id] = [];
  return newDecision;
};
