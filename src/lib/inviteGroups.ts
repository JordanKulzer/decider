import { supabase } from "./supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GroupMember {
  id:       string;
  username: string;
  email:    string;
}

export interface InviteGroup {
  id:          string;
  name:        string;
  createdAt:   string;
  memberCount: number;
  members:     GroupMember[];
}

export interface BulkInviteResult {
  invited:        number;
  alreadyMember:  number;
  alreadyInvited: number;
  /** IDs of users who received a new invite in this call. */
  invitedIds:     string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchInviteGroups(): Promise<InviteGroup[]> {
  const { data, error } = await supabase.rpc("get_invite_groups");
  if (error) throw error;
  return ((data as any[]) ?? []).map(mapGroup);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

export async function createInviteGroup(name: string): Promise<InviteGroup> {
  const { data, error } = await supabase.rpc("create_invite_group", { p_name: name });
  if (error) throw error;
  return mapGroup(data as any);
}

export async function renameInviteGroup(groupId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc("rename_invite_group", {
    p_group_id: groupId,
    p_name:     name,
  });
  if (error) throw error;
}

export async function deleteInviteGroup(groupId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_invite_group", { p_group_id: groupId });
  if (error) throw error;
}

export async function addGroupMember(groupId: string, memberUserId: string): Promise<void> {
  const { error } = await supabase.rpc("add_invite_group_member", {
    p_group_id:        groupId,
    p_member_user_id:  memberUserId,
  });
  if (error) throw error;
}

export async function removeGroupMember(groupId: string, memberUserId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_invite_group_member", {
    p_group_id:        groupId,
    p_member_user_id:  memberUserId,
  });
  if (error) throw error;
}

export async function bulkInviteGroup(
  decisionId: string,
  groupId:    string,
): Promise<BulkInviteResult> {
  const { data, error } = await supabase.rpc("bulk_invite_group", {
    p_decision_id: decisionId,
    p_group_id:    groupId,
  });
  if (error) throw error;
  const r = data as any;
  return {
    invited:        r.invited        ?? 0,
    alreadyMember:  r.alreadyMember  ?? 0,
    alreadyInvited: r.alreadyInvited ?? 0,
    invitedIds:     r.invitedIds     ?? [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function mapGroup(g: any): InviteGroup {
  return {
    id:          g.id,
    name:        g.name,
    createdAt:   g.created_at,
    memberCount: g.member_count ?? 0,
    members:     (g.members ?? []) as GroupMember[],
  };
}
