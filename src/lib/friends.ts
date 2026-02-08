import { supabase } from "./supabase";
import type { Friend, FriendRequest } from "../types/decisions";

// ─── FETCH FRIENDS ───

export const fetchFriends = async (userId: string): Promise<Friend[]> => {
  const { data, error } = await supabase
    .from("friendships")
    .select(`
      id, user_id, friend_id, status, created_at, updated_at,
      friend:friend_id (username, email)
    `)
    .eq("user_id", userId)
    .eq("status", "accepted");

  if (error) throw error;

  return (data || []).map((f: any) => ({
    id: f.id,
    user_id: f.user_id,
    friend_id: f.friend_id,
    status: f.status,
    created_at: f.created_at,
    updated_at: f.updated_at,
    friend_username: f.friend?.username,
    friend_email: f.friend?.email,
  }));
};

// ─── FETCH FRIEND REQUESTS ───

export const fetchFriendRequests = async (
  userId: string
): Promise<FriendRequest[]> => {
  const { data, error } = await supabase
    .from("friend_requests")
    .select(`
      id, from_user_id, to_user_id, status, created_at,
      from_user:from_user_id (username, email)
    `)
    .eq("to_user_id", userId)
    .eq("status", "pending");

  if (error) throw error;

  return (data || []).map((r: any) => ({
    id: r.id,
    from_user_id: r.from_user_id,
    to_user_id: r.to_user_id,
    status: r.status,
    created_at: r.created_at,
    from_username: r.from_user?.username,
    from_email: r.from_user?.email,
  }));
};

// ─── SEARCH USERS ───

export const searchUsers = async (
  query: string,
  currentUserId: string
): Promise<Array<{ id: string; username: string; email: string; isFriend: boolean }>> => {
  const { data, error } = await supabase
    .from("users")
    .select("id, username, email")
    .or(`username.ilike.%${query}%,email.ilike.%${query}%`)
    .neq("id", currentUserId)
    .is("deleted_at", null)
    .limit(20);

  if (error) throw error;

  // Check which are already friends
  const { data: friendships } = await supabase
    .from("friendships")
    .select("friend_id")
    .eq("user_id", currentUserId)
    .eq("status", "accepted");

  const friendIds = new Set((friendships || []).map((f: any) => f.friend_id));

  // Also check pending outgoing requests
  const { data: pendingRequests } = await supabase
    .from("friend_requests")
    .select("to_user_id")
    .eq("from_user_id", currentUserId)
    .eq("status", "pending");

  const pendingIds = new Set((pendingRequests || []).map((r: any) => r.to_user_id));

  return (data || []).map((u: any) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    isFriend: friendIds.has(u.id) || pendingIds.has(u.id),
  }));
};

// ─── SEND FRIEND REQUEST ───

export const sendFriendRequest = async (
  fromUserId: string,
  toUserId: string
) => {
  const { error } = await supabase
    .from("friend_requests")
    .insert([{ from_user_id: fromUserId, to_user_id: toUserId, status: "pending" }]);

  if (error) throw error;
};

// ─── ACCEPT FRIEND REQUEST ───

export const acceptFriendRequest = async (requestId: string) => {
  // Get request details
  const { data: request, error: fetchError } = await supabase
    .from("friend_requests")
    .select("from_user_id, to_user_id")
    .eq("id", requestId)
    .single();

  if (fetchError) throw fetchError;

  // Update request status
  const { error: updateError } = await supabase
    .from("friend_requests")
    .update({ status: "accepted" })
    .eq("id", requestId);

  if (updateError) throw updateError;

  // Create bidirectional friendship rows
  const { error: friendshipError } = await supabase
    .from("friendships")
    .insert([
      {
        user_id: request.from_user_id,
        friend_id: request.to_user_id,
        status: "accepted",
      },
      {
        user_id: request.to_user_id,
        friend_id: request.from_user_id,
        status: "accepted",
      },
    ]);

  if (friendshipError) throw friendshipError;
};

// ─── DECLINE FRIEND REQUEST ───

export const declineFriendRequest = async (requestId: string) => {
  const { error } = await supabase
    .from("friend_requests")
    .update({ status: "declined" })
    .eq("id", requestId);

  if (error) throw error;
};

// ─── REMOVE FRIEND ───

export const removeFriend = async (userId: string, friendId: string) => {
  // Delete both directions of the friendship
  const { error: error1 } = await supabase
    .from("friendships")
    .delete()
    .eq("user_id", userId)
    .eq("friend_id", friendId);

  if (error1) throw error1;

  const { error: error2 } = await supabase
    .from("friendships")
    .delete()
    .eq("user_id", friendId)
    .eq("friend_id", userId);

  if (error2) throw error2;
};

// ─── GET INVITABLE FRIENDS ───
// Returns friends who are NOT already members of the given decision

export const getInvitableFriends = async (
  userId: string,
  decisionId: string
): Promise<Friend[]> => {
  // Get all friends
  const friends = await fetchFriends(userId);

  // Get current decision members
  const { data: members, error } = await supabase
    .from("decision_members")
    .select("user_id")
    .eq("decision_id", decisionId);

  if (error) throw error;

  const memberIds = new Set((members || []).map((m: any) => m.user_id));

  // Filter out friends who are already members
  return friends.filter((f) => !memberIds.has(f.friend_id));
};

// ─── INVITE FRIEND TO DECISION ───
// Adds a friend directly as a member of the decision

export const inviteFriendToDecision = async (
  decisionId: string,
  friendId: string
) => {
  const { error } = await supabase
    .from("decision_members")
    .insert([{ decision_id: decisionId, user_id: friendId, role: "member" }]);

  if (error) throw error;
};
