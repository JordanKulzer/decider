import { supabase } from "./supabase";
import { isDemoMode } from "./demoMode";
import * as mock from "./mockData";
import { Decision, DecisionMember, Constraint, DecisionOption, Vote, Result, AdvanceVote, Comment } from "../types/decisions";

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
  value: Record<string, any>,
  weight: number = 1
) => {
  if (isDemoMode()) return mock.mockAddConstraint(decisionId, userId, type, value);

  const { data, error } = await supabase
    .from("constraints")
    .insert([{ decision_id: decisionId, user_id: userId, type, value, weight }])
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

export const revertPhase = async (
  decisionId: string,
  targetStatus: "constraints" | "options"
) => {
  if (isDemoMode()) return mock.mockRevertPhase(decisionId, targetStatus);

  // If reverting to constraints, delete all options (which cascades to votes)
  if (targetStatus === "constraints") {
    const { error: optionsError } = await supabase
      .from("options")
      .delete()
      .eq("decision_id", decisionId);
    if (optionsError) throw optionsError;
  }

  // If reverting to options, delete all votes and reset has_voted flags
  if (targetStatus === "options") {
    const { error: votesError } = await supabase
      .from("votes")
      .delete()
      .eq("decision_id", decisionId);
    if (votesError) throw votesError;

    const { error: membersError } = await supabase
      .from("decision_members")
      .update({ has_voted: false })
      .eq("decision_id", decisionId);
    if (membersError) throw membersError;

    // Also delete results if any
    const { error: resultsError } = await supabase
      .from("results")
      .delete()
      .eq("decision_id", decisionId);
    if (resultsError) throw resultsError;
  }

  // Update the status
  const { error: statusError } = await supabase
    .from("decisions")
    .update({ status: targetStatus })
    .eq("id", decisionId);

  if (statusError) throw statusError;
};

// ─── ADVANCE VOTES ───

export const fetchAdvanceVotes = async (
  decisionId: string,
  fromPhase: "constraints" | "options"
): Promise<AdvanceVote[]> => {
  if (isDemoMode()) return mock.mockFetchAdvanceVotes(decisionId, fromPhase);

  const { data, error } = await supabase
    .from("advance_votes")
    .select(`
      id, decision_id, user_id, from_phase, created_at,
      users:user_id (username)
    `)
    .eq("decision_id", decisionId)
    .eq("from_phase", fromPhase);

  if (error) throw error;

  return (data || []).map((v: any) => ({
    id: v.id,
    decision_id: v.decision_id,
    user_id: v.user_id,
    from_phase: v.from_phase,
    created_at: v.created_at,
    username: v.users?.username,
  }));
};

export const submitAdvanceVote = async (
  decisionId: string,
  userId: string,
  fromPhase: "constraints" | "options"
) => {
  if (isDemoMode()) return mock.mockSubmitAdvanceVote(decisionId, userId, fromPhase);

  const { error } = await supabase
    .from("advance_votes")
    .insert([{ decision_id: decisionId, user_id: userId, from_phase: fromPhase }]);

  if (error) throw error;
};

export const removeAdvanceVote = async (
  decisionId: string,
  userId: string,
  fromPhase: "constraints" | "options"
) => {
  if (isDemoMode()) return mock.mockRemoveAdvanceVote(decisionId, userId, fromPhase);

  const { error } = await supabase
    .from("advance_votes")
    .delete()
    .eq("decision_id", decisionId)
    .eq("user_id", userId)
    .eq("from_phase", fromPhase);

  if (error) throw error;
};

export const clearAdvanceVotes = async (
  decisionId: string,
  fromPhase: "constraints" | "options"
) => {
  if (isDemoMode()) return mock.mockClearAdvanceVotes(decisionId, fromPhase);

  const { error } = await supabase
    .from("advance_votes")
    .delete()
    .eq("decision_id", decisionId)
    .eq("from_phase", fromPhase);

  if (error) throw error;
};

// ─── COMMENTS ───

export const fetchComments = async (
  decisionId: string
): Promise<Comment[]> => {
  if (isDemoMode()) return mock.mockFetchComments(decisionId);

  const { data, error } = await supabase
    .from("comments")
    .select(`
      id, decision_id, user_id, option_id, constraint_id, parent_id, content, created_at, deleted_at, deleted_by,
      users:user_id (username)
    `)
    .eq("decision_id", decisionId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const comments = (data || []).map((c: any) => ({
    id: c.id,
    decision_id: c.decision_id,
    user_id: c.user_id,
    option_id: c.option_id,
    constraint_id: c.constraint_id,
    parent_id: c.parent_id,
    content: c.content,
    created_at: c.created_at,
    deleted_at: c.deleted_at,
    deleted_by: c.deleted_by,
    username: c.users?.username,
  }));

  // Organize into tree structure
  const commentMap = new Map<string, Comment>();
  const rootComments: Comment[] = [];

  comments.forEach((c: Comment) => {
    c.replies = [];
    commentMap.set(c.id, c);
  });

  comments.forEach((c: Comment) => {
    if (c.parent_id && commentMap.has(c.parent_id)) {
      commentMap.get(c.parent_id)!.replies!.push(c);
    } else if (!c.parent_id) {
      rootComments.push(c);
    }
  });

  return rootComments;
};

export const addComment = async (
  decisionId: string,
  userId: string,
  content: string,
  optionId: string | null,
  constraintId: string | null,
  parentId: string | null
) => {
  if (isDemoMode()) return mock.mockAddComment(decisionId, userId, content, optionId, constraintId, parentId);

  const { data, error } = await supabase
    .from("comments")
    .insert([{
      decision_id: decisionId,
      user_id: userId,
      content,
      option_id: optionId,
      constraint_id: constraintId,
      parent_id: parentId,
    }])
    .select()
    .single();

  if (error) throw error;
  return data as Comment;
};

export const removeComment = async (commentId: string) => {
  if (isDemoMode()) return mock.mockRemoveComment(commentId);

  const { error } = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId);

  if (error) throw error;
};

export const softDeleteComment = async (
  commentId: string,
  deletedByUserId: string
) => {
  if (isDemoMode()) return mock.mockSoftDeleteComment?.(commentId, deletedByUserId);

  const { error } = await supabase
    .from("comments")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: deletedByUserId,
    })
    .eq("id", commentId);

  if (error) throw error;
};

// ─── MEMBER MANAGEMENT ───

export const removeMember = async (
  decisionId: string,
  userIdToRemove: string
) => {
  if (isDemoMode()) return mock.mockRemoveMember(decisionId, userIdToRemove);

  const { error } = await supabase
    .from("decision_members")
    .delete()
    .eq("decision_id", decisionId)
    .eq("user_id", userIdToRemove);

  if (error) throw error;
};

export const transferOrganizer = async (
  decisionId: string,
  newOrganizerId: string
) => {
  if (isDemoMode()) return mock.mockTransferOrganizer(decisionId, newOrganizerId);

  // Update the decision's created_by
  const { error: decisionError } = await supabase
    .from("decisions")
    .update({ created_by: newOrganizerId })
    .eq("id", decisionId);

  if (decisionError) throw decisionError;

  // Set old organizer to member
  const { error: oldOrgError } = await supabase
    .from("decision_members")
    .update({ role: "member" })
    .eq("decision_id", decisionId)
    .eq("role", "organizer");

  if (oldOrgError) throw oldOrgError;

  // Set new organizer
  const { error: newOrgError } = await supabase
    .from("decision_members")
    .update({ role: "organizer" })
    .eq("decision_id", decisionId)
    .eq("user_id", newOrganizerId);

  if (newOrgError) throw newOrgError;
};

// ─── DECISION DUPLICATION ───

export interface PastDecisionSummary {
  id: string;
  title: string;
  created_at: string;
  constraint_count: number;
  option_count: number;
  voting_mechanism: string;
}

export const fetchUserPastDecisions = async (
  userId: string
): Promise<PastDecisionSummary[]> => {
  if (isDemoMode()) return mock.mockFetchUserPastDecisions?.(userId) || [];

  const { data, error } = await supabase
    .from("decisions")
    .select(`
      id, title, created_at, voting_mechanism,
      constraints:constraints(count),
      options:options(count)
    `)
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;

  return (data || []).map((d: any) => ({
    id: d.id,
    title: d.title,
    created_at: d.created_at,
    voting_mechanism: d.voting_mechanism,
    constraint_count: d.constraints?.[0]?.count || 0,
    option_count: d.options?.[0]?.count || 0,
  }));
};

export interface DuplicateDecisionResult {
  decision: Decision;
  constraintsCopied: number;
  optionsCopied: number;
}

export const duplicateDecision = async (
  sourceDecisionId: string,
  newTitle: string,
  newDescription: string | null,
  newLockTime: string,
  userId: string
): Promise<DuplicateDecisionResult> => {
  if (isDemoMode()) {
    return mock.mockDuplicateDecision?.(sourceDecisionId, newTitle, newDescription, newLockTime, userId) as DuplicateDecisionResult;
  }

  // Fetch source decision
  const { data: sourceDecision, error: sourceError } = await supabase
    .from("decisions")
    .select("*")
    .eq("id", sourceDecisionId)
    .single();

  if (sourceError) throw sourceError;

  // Generate new invite code
  const { data: codeData } = await supabase.rpc("generate_invite_code");
  const inviteCode = codeData || Math.random().toString(36).substring(2, 8).toUpperCase();

  // Create new decision with source settings
  const { data: newDecision, error: createError } = await supabase
    .from("decisions")
    .insert([{
      title: newTitle,
      description: newDescription,
      type_label: sourceDecision.type_label,
      created_by: userId,
      lock_time: newLockTime,
      status: "constraints", // Always start in constraints phase
      voting_mechanism: sourceDecision.voting_mechanism,
      max_options: sourceDecision.max_options,
      option_submission: sourceDecision.option_submission,
      reveal_votes_after_lock: sourceDecision.reveal_votes_after_lock,
      invite_code: inviteCode,
    }])
    .select()
    .single();

  if (createError) throw createError;

  // Copy constraints
  const { data: sourceConstraints, error: constraintsError } = await supabase
    .from("constraints")
    .select("type, value")
    .eq("decision_id", sourceDecisionId);

  if (constraintsError) throw constraintsError;

  let constraintsCopied = 0;
  if (sourceConstraints && sourceConstraints.length > 0) {
    const newConstraints = sourceConstraints.map((c: any) => ({
      decision_id: newDecision.id,
      user_id: userId,
      type: c.type,
      value: c.value,
    }));

    const { error: insertConstraintsError } = await supabase
      .from("constraints")
      .insert(newConstraints);

    if (insertConstraintsError) throw insertConstraintsError;
    constraintsCopied = newConstraints.length;
  }

  // Copy options
  const { data: sourceOptions, error: optionsError } = await supabase
    .from("options")
    .select("title, description, metadata, passes_constraints, constraint_violations")
    .eq("decision_id", sourceDecisionId);

  if (optionsError) throw optionsError;

  let optionsCopied = 0;
  if (sourceOptions && sourceOptions.length > 0) {
    const newOptions = sourceOptions.map((o: any) => ({
      decision_id: newDecision.id,
      submitted_by: userId,
      title: o.title,
      description: o.description,
      metadata: o.metadata,
      passes_constraints: o.passes_constraints,
      constraint_violations: o.constraint_violations,
    }));

    const { error: insertOptionsError } = await supabase
      .from("options")
      .insert(newOptions);

    if (insertOptionsError) throw insertOptionsError;
    optionsCopied = newOptions.length;
  }

  return {
    decision: newDecision as Decision,
    constraintsCopied,
    optionsCopied,
  };
};
