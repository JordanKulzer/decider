export type DecisionStatus = "constraints" | "options" | "voting" | "locked";
export type VotingMechanism = "point_allocation" | "forced_ranking";
export type OptionSubmissionMode = "anyone" | "organizer_only";
export type MemberRole = "organizer" | "member";
export type ConstraintType =
  | "budget_max"
  | "date_range"
  | "distance"
  | "duration"
  | "exclusion";
export type UserTier = "free" | "pro";
export type SubscriptionStatus = "none" | "active" | "canceled" | "past_due";

export interface Decision {
  id: string;
  title: string;
  description: string | null;
  type_label: string | null;
  created_by: string;
  lock_time: string;
  status: DecisionStatus;
  voting_mechanism: VotingMechanism;
  max_options: number;
  option_submission: OptionSubmissionMode;
  reveal_votes_after_lock: boolean;
  invite_code: string;
  created_at: string;
  silent_voting: boolean;
  constraint_weights_enabled: boolean;
}

export interface DecisionMember {
  id: string;
  decision_id: string;
  user_id: string;
  role: MemberRole;
  has_voted: boolean;
  joined_at: string;
  username?: string;
  email?: string;
}

export interface Constraint {
  id: string;
  decision_id: string;
  user_id: string;
  type: ConstraintType;
  value: Record<string, any>;
  weight: number;
  created_at: string;
  username?: string;
}

export interface DecisionOption {
  id: string;
  decision_id: string;
  submitted_by: string;
  title: string;
  description: string | null;
  metadata: Record<string, any> | null;
  passes_constraints: boolean;
  constraint_violations: Array<{
    constraint_id: string;
    reason: string;
  }> | null;
  created_at: string;
  submitted_by_username?: string;
}

export interface Vote {
  id: string;
  decision_id: string;
  user_id: string;
  option_id: string;
  value: number;
  created_at: string;
}

export interface Result {
  id: string;
  decision_id: string;
  option_id: string;
  total_points: number;
  average_rank: number | null;
  rank: number;
  is_winner: boolean;
  option_title?: string;
}

export interface AdvanceVote {
  id: string;
  decision_id: string;
  user_id: string;
  from_phase: "constraints" | "options";
  created_at: string;
  username?: string;
}

export interface Comment {
  id: string;
  decision_id: string;
  user_id: string;
  option_id: string | null;
  constraint_id: string | null;
  parent_id: string | null;
  content: string;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  username?: string;
  replies?: Comment[];
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  tier: UserTier;
  subscription_status: SubscriptionStatus;
  subscription_expires_at: string | null;
}

export interface Subscription {
  id: string;
  user_id: string;
  provider: string;
  provider_subscription_id: string | null;
  plan: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  created_at: string;
  canceled_at: string | null;
}

export const TIER_LIMITS = {
  free: {
    activeDecisions: 2,
    maxParticipants: 5,
    historyDays: 7,
    silentVoting: false,
    constraintWeighting: false,
  },
  pro: {
    activeDecisions: Infinity,
    maxParticipants: Infinity,
    historyDays: Infinity,
    silentVoting: true,
    constraintWeighting: true,
  },
} as const;

// Friends Feature
export type FriendshipStatus = "pending" | "accepted" | "blocked";

export interface Friend {
  id: string;
  user_id: string;
  friend_id: string;
  status: FriendshipStatus;
  created_at: string;
  updated_at: string;
  // Populated fields
  friend_username?: string;
  friend_email?: string;
}

export interface FriendRequest {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: FriendshipStatus;
  created_at: string;
  from_username?: string;
  from_email?: string;
}
