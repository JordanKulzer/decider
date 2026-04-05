import { supabase } from "./supabase";
import { searchUsers } from "./friends";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DecisionInvite {
  id: string;
  decisionId: string;
  inviterId: string;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
  decisionTitle: string;
  decisionStatus: string;
  decisionMode: string | null;
  decisionClosesAt: string | null;
  inviterUsername: string;
}

export interface OutgoingInvite {
  id: string;
  decisionId: string;
  inviteeId: string;
  status: "pending";
  createdAt: string;
  inviteeUsername: string;
  inviteeEmail: string;
}

export type InviteTargetStatus = "none" | "invited" | "member";

export interface InviteTarget {
  id: string;
  username: string;
  email: string;
  isFriend: boolean;
  status: InviteTargetStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Send invite
// ─────────────────────────────────────────────────────────────────────────────

export async function sendDecisionInvite(
  decisionId: string,
  inviteeId: string
): Promise<void> {
  console.log("[invite] sendDecisionInvite →", { decisionId, inviteeId });
  const { data, error } = await supabase.rpc("send_decision_invite", {
    p_decision_id: decisionId,
    p_invitee_id:  inviteeId,
  });
  if (error) {
    console.warn("[invite] sendDecisionInvite failed:", {
      message: error.message,
      details: error.details,
      hint:    error.hint,
      code:    error.code,
    });
    throw error;
  }
  console.log("[invite] sendDecisionInvite succeeded:", data);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch pending invites for current user (inbox)
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchPendingInvites(userId: string): Promise<DecisionInvite[]> {
  console.log("[invite] fetchPendingInvites →", { userId });
  const { data, error } = await supabase.rpc("get_pending_invites", {
    p_user_id: userId,
  });
  if (error) {
    console.warn("[invite] fetchPendingInvites failed:", error.message);
    throw error;
  }

  const result = ((data as any[]) ?? []).map((row: any) => ({
    id:                row.id,
    decisionId:        row.decision_id,
    inviterId:         row.inviter_id,
    status:            row.status,
    createdAt:         row.created_at,
    decisionTitle:     row.decision_title,
    decisionStatus:    row.decision_status,
    decisionMode:      row.decision_mode,
    decisionClosesAt:  row.decision_closes_at,
    inviterUsername:   row.inviter_username,
  }));
  console.log("[invite] fetchPendingInvites →", result.length, "pending");
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// List outgoing pending invites for a decision (organizer view)
// ─────────────────────────────────────────────────────────────────────────────

export async function listOutgoingInvites(decisionId: string): Promise<OutgoingInvite[]> {
  console.log("[invite] listOutgoingInvites →", { decisionId });
  const { data, error } = await supabase.rpc("list_decision_invites", {
    p_decision_id: decisionId,
  });
  if (error) {
    console.warn("[invite] listOutgoingInvites failed:", error.message);
    throw error;
  }

  const result = ((data as any[]) ?? []).map((row: any) => ({
    id:               row.id,
    decisionId:       row.decision_id,
    inviteeId:        row.invitee_id,
    status:           row.status,
    createdAt:        row.created_at,
    inviteeUsername:  row.invitee_username,
    inviteeEmail:     row.invitee_email,
  }));
  console.log("[invite] listOutgoingInvites →", result.length, "pending");
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Respond to invite (accept / decline)
// ─────────────────────────────────────────────────────────────────────────────

export async function respondDecisionInvite(
  inviteId: string,
  accept: boolean
): Promise<void> {
  console.log("[invite] respondDecisionInvite →", { inviteId, accept });
  const { error } = await supabase.rpc("respond_decision_invite", {
    p_invite_id: inviteId,
    p_accept:    accept,
  });
  if (error) {
    console.warn("[invite] respondDecisionInvite failed:", error.message);
    throw error;
  }
  console.log("[invite] respondDecisionInvite succeeded");
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancel a pending invite (organizer)
// ─────────────────────────────────────────────────────────────────────────────

export async function cancelDecisionInvite(inviteId: string): Promise<void> {
  console.log("[invite] cancelDecisionInvite →", { inviteId });
  const { error } = await supabase.rpc("cancel_decision_invite", {
    p_invite_id: inviteId,
  });
  if (error) {
    console.warn("[invite] cancelDecisionInvite failed:", error.message);
    throw error;
  }
  console.log("[invite] cancelDecisionInvite succeeded");
}

// ─────────────────────────────────────────────────────────────────────────────
// Search users to invite — enriched with member/invite status
// ─────────────────────────────────────────────────────────────────────────────

export async function searchInviteTargets(
  decisionId: string,
  query: string,
  currentUserId: string
): Promise<InviteTarget[]> {
  if (!query.trim()) return [];

  // Run user search + member list + pending invites in parallel.
  const [users, membersResult, invitesResult] = await Promise.all([
    searchUsers(query, currentUserId),
    supabase
      .from("decision_members")
      .select("actor_user_id")
      .eq("decision_id", decisionId),
    supabase
      .from("decision_invites")
      .select("invitee_id")
      .eq("decision_id", decisionId)
      .eq("status", "pending"),
  ]);

  const memberIds = new Set<string>(
    (membersResult.data ?? []).map((m: any) => m.actor_user_id).filter(Boolean)
  );

  const invitedIds = new Set<string>(
    (invitesResult.data ?? []).map((i: any) => i.invitee_id)
  );

  return users.map((u) => ({
    id:       u.id,
    username: u.username,
    email:    u.email,
    isFriend: u.isFriend,
    status:   memberIds.has(u.id)
      ? "member"
      : invitedIds.has(u.id)
      ? "invited"
      : "none",
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent collaborators — people from the user's other decisions, de-duped
// against an exclusion set (friends, current-decision members, etc.)
// ─────────────────────────────────────────────────────────────────────────────

export async function getRecentCollaborators(
  userId: string,
  decisionId: string,
  excludeIds: Set<string>
): Promise<InviteTarget[]> {
  // Phase 1 (parallel):
  //   a) Other decisions this user has been a member of
  //   b) Current-decision members
  //   c) Pending outgoing invites for current decision
  const [myMemberships, membersResult, invitesResult] = await Promise.all([
    supabase
      .from("decision_members")
      .select("decision_id")
      .neq("decision_id", decisionId)
      .eq("actor_user_id", userId)
      .limit(30),
    supabase
      .from("decision_members")
      .select("actor_user_id")
      .eq("decision_id", decisionId),
    supabase
      .from("decision_invites")
      .select("invitee_id")
      .eq("decision_id", decisionId)
      .eq("status", "pending"),
  ]);

  const decisionIds = (myMemberships.data ?? []).map((m: any) => m.decision_id);
  if (!decisionIds.length) return [];

  const memberIds = new Set<string>(
    (membersResult.data ?? []).map((m: any) => m.actor_user_id).filter(Boolean)
  );
  const invitedIds = new Set<string>(
    (invitesResult.data ?? []).map((i: any) => i.invitee_id)
  );

  // Phase 2: co-members from those decisions
  const { data: coMembers } = await supabase
    .from("decision_members")
    .select("actor_user_id")
    .in("decision_id", decisionIds)
    .limit(60);

  // Collect unique co-member IDs, excluding self and excludeIds
  const seen = new Set<string>();
  for (const m of coMembers ?? []) {
    const col = m.actor_user_id;
    if (col && col !== userId && !excludeIds.has(col)) seen.add(col);
  }
  const uniqueIds = [...seen].slice(0, 8);

  if (!uniqueIds.length) return [];

  // Phase 3: fetch profiles
  const { data: profiles } = await supabase
    .from("users")
    .select("id, username, email")
    .in("id", uniqueIds);

  return (profiles ?? []).map((u: any) => ({
    id:       u.id,
    username: u.username ?? "Unknown",
    email:    u.email ?? "",
    isFriend: false,
    status:   (memberIds.has(u.id)
      ? "member"
      : invitedIds.has(u.id)
      ? "invited"
      : "none") as InviteTargetStatus,
  }));
}
