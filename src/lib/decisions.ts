import { supabase } from "./supabase";
import { isDemoMode } from "./demoMode";
import * as mock from "./mockData";
import { Decision, DecisionMember, Constraint, DecisionOption, Vote, Result } from "../types/decisions";

export const fetchUserDecisions = async (userId: string) => {
  if (isDemoMode()) return mock.mockFetchUserDecisions(userId);

  const { data, error } = await supabase
    .from("decision_members")
    .select(
      `
      decision_id,
      role,
      has_voted,
      decisions (
        id, title, description, type_label, lock_time, status,
        voting_mechanism, created_by, invite_code, created_at
      )
    `
    )
    .eq("user_id", userId);

  if (error) throw error;
  return data;
};

export const fetchDecisionDetail = async (
  decisionId: string
): Promise<Decision> => {
  if (isDemoMode()) return mock.mockFetchDecisionDetail(decisionId);

  const { data, error } = await supabase
    .from("decisions")
    .select("*")
    .eq("id", decisionId)
    .single();

  if (error) throw error;
  return data as Decision;
};

export const fetchDecisionByInviteCode = async (
  inviteCode: string
): Promise<Decision | null> => {
  if (isDemoMode()) return mock.mockFetchDecisionByInviteCode(inviteCode);

  const { data, error } = await supabase
    .from("decisions")
    .select("*")
    .eq("invite_code", inviteCode.toUpperCase())
    .single();

  if (error) return null;
  return data as Decision;
};

export const fetchDecisionMembers = async (
  decisionId: string
): Promise<DecisionMember[]> => {
  if (isDemoMode()) return mock.mockFetchDecisionMembers(decisionId);

  const { data, error } = await supabase
    .from("decision_members")
    .select(
      `
      id, decision_id, user_id, role, has_voted, joined_at,
      users:user_id (username, email)
    `
    )
    .eq("decision_id", decisionId);

  if (error) throw error;

  return (data || []).map((m: any) => ({
    id: m.id,
    decision_id: m.decision_id,
    user_id: m.user_id,
    role: m.role,
    has_voted: m.has_voted,
    joined_at: m.joined_at,
    username: m.users?.username,
    email: m.users?.email,
  }));
};

export const fetchConstraints = async (
  decisionId: string
): Promise<Constraint[]> => {
  if (isDemoMode()) return mock.mockFetchConstraints(decisionId);

  const { data, error } = await supabase
    .from("constraints")
    .select("*")
    .eq("decision_id", decisionId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []) as Constraint[];
};

export const addConstraint = async (
  decisionId: string,
  userId: string,
  type: string,
  value: Record<string, any>
) => {
  if (isDemoMode()) return mock.mockAddConstraint(decisionId, userId, type, value);

  const { data, error } = await supabase
    .from("constraints")
    .insert([{ decision_id: decisionId, user_id: userId, type, value }])
    .select()
    .single();

  if (error) throw error;
  return data as Constraint;
};

export const removeConstraint = async (constraintId: string) => {
  if (isDemoMode()) return mock.mockRemoveConstraint(constraintId);

  const { error } = await supabase
    .from("constraints")
    .delete()
    .eq("id", constraintId);

  if (error) throw error;
};

export const fetchOptions = async (
  decisionId: string
): Promise<DecisionOption[]> => {
  if (isDemoMode()) return mock.mockFetchOptions(decisionId);

  const { data, error } = await supabase
    .from("options")
    .select("*")
    .eq("decision_id", decisionId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []) as DecisionOption[];
};

export const addOption = async (
  decisionId: string,
  userId: string,
  title: string,
  description: string | null,
  metadata: Record<string, any> | null,
  passesConstraints: boolean,
  constraintViolations: Array<{ constraint_id: string; reason: string }> | null
) => {
  if (isDemoMode()) return mock.mockAddOption(decisionId, userId, title, description, metadata, passesConstraints, constraintViolations);

  const { data, error } = await supabase
    .from("options")
    .insert([
      {
        decision_id: decisionId,
        submitted_by: userId,
        title,
        description,
        metadata,
        passes_constraints: passesConstraints,
        constraint_violations: constraintViolations,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as DecisionOption;
};

export const removeOption = async (optionId: string) => {
  if (isDemoMode()) return mock.mockRemoveOption(optionId);

  const { error } = await supabase
    .from("options")
    .delete()
    .eq("id", optionId);

  if (error) throw error;
};

export const fetchVotes = async (decisionId: string): Promise<Vote[]> => {
  if (isDemoMode()) return mock.mockFetchVotes(decisionId);

  const { data, error } = await supabase
    .from("votes")
    .select("*")
    .eq("decision_id", decisionId);

  if (error) throw error;
  return (data || []) as Vote[];
};

export const submitVotes = async (
  decisionId: string,
  userId: string,
  votes: Array<{ option_id: string; value: number }>
) => {
  if (isDemoMode()) return mock.mockSubmitVotes(decisionId, userId, votes);

  const voteRows = votes
    .filter((v) => v.value > 0)
    .map((v) => ({
      decision_id: decisionId,
      user_id: userId,
      option_id: v.option_id,
      value: v.value,
    }));

  const { error: voteError } = await supabase.from("votes").insert(voteRows);
  if (voteError) throw voteError;

  const { error: memberError } = await supabase
    .from("decision_members")
    .update({ has_voted: true })
    .eq("decision_id", decisionId)
    .eq("user_id", userId);
  if (memberError) throw memberError;
};

export const fetchResults = async (
  decisionId: string
): Promise<Result[]> => {
  if (isDemoMode()) return mock.mockFetchResults(decisionId);

  const { data, error } = await supabase
    .from("results")
    .select("*")
    .eq("decision_id", decisionId)
    .order("rank", { ascending: true });

  if (error) throw error;
  return (data || []) as Result[];
};

export const advancePhase = async (
  decisionId: string,
  newStatus: string
) => {
  if (isDemoMode()) return mock.mockAdvancePhase(decisionId, newStatus);

  const { error } = await supabase
    .from("decisions")
    .update({ status: newStatus })
    .eq("id", decisionId);

  if (error) throw error;
};

export const joinDecision = async (
  decisionId: string,
  userId: string
) => {
  if (isDemoMode()) return mock.mockJoinDecision(decisionId, userId);

  const { error } = await supabase
    .from("decision_members")
    .insert([
      {
        decision_id: decisionId,
        user_id: userId,
        role: "member",
      },
    ]);

  if (error) throw error;
};

export const leaveDecision = async (
  decisionId: string,
  userId: string
) => {
  if (isDemoMode()) return mock.mockLeaveDecision(decisionId, userId);

  const { error } = await supabase
    .from("decision_members")
    .delete()
    .eq("decision_id", decisionId)
    .eq("user_id", userId);

  if (error) throw error;
};
