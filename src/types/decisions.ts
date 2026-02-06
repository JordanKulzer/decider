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
