import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
} from "react-native";
import { useTheme } from "react-native-paper";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { addComment, removeComment } from "../lib/decisions";
import type { Comment } from "../types/decisions";

interface CommentSectionProps {
  decisionId: string;
  userId: string;
  comments: Comment[];
  targetId: string;
  targetType: "option" | "constraint";
  onCommentAdded: () => void;
}

const CommentSection: React.FC<CommentSectionProps> = ({
  decisionId,
  userId,
  comments,
  targetId,
  targetType,
  onCommentAdded,
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Filter comments for this target
  const targetComments = comments.filter((c) =>
    targetType === "option"
      ? c.option_id === targetId
      : c.constraint_id === targetId
  );

  const totalCount = targetComments.reduce(
    (acc, c) => acc + 1 + (c.replies?.length || 0),
    0
  );

  const handleSubmit = async () => {
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      await addComment(
        decisionId,
        userId,
        newComment.trim(),
        targetType === "option" ? targetId : null,
        targetType === "constraint" ? targetId : null,
        replyingTo
      );
      setNewComment("");
      setReplyingTo(null);
      onCommentAdded();
      Toast.show({
        type: "success",
        text1: "Comment added",
        position: "bottom",
      });
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Failed to add comment",
        text2: err.message,
        position: "bottom",
      });
    }
    setSubmitting(false);
  };

  const handleDelete = async (commentId: string) => {
    try {
      await removeComment(commentId);
      onCommentAdded();
      Toast.show({
        type: "success",
        text1: "Comment deleted",
        position: "bottom",
      });
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Failed to delete",
        position: "bottom",
      });
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const renderComment = (comment: Comment, isReply = false) => (
    <View
      key={comment.id}
      style={[
        styles.commentItem,
        isReply && styles.replyItem,
        {
          backgroundColor: isReply
            ? "transparent"
            : (theme as any).custom?.card || theme.colors.surface,
        },
      ]}
    >
      <View style={styles.commentHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {comment.username?.charAt(0).toUpperCase() || "?"}
          </Text>
        </View>
        <Text
          style={[styles.username, { color: theme.colors.onBackground }]}
        >
          {comment.username || "Unknown"}
        </Text>
        <Text style={[styles.time, { color: theme.colors.onSurfaceVariant }]}>
          {formatTime(comment.created_at)}
        </Text>
        {comment.user_id === userId && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDelete(comment.id)}
          >
            <Icon name="close" size={14} color={theme.colors.error} />
          </TouchableOpacity>
        )}
      </View>
      <Text
        style={[styles.commentText, { color: theme.colors.onBackground }]}
      >
        {comment.content}
      </Text>
      <TouchableOpacity
        style={styles.replyButton}
        onPress={() => setReplyingTo(comment.id)}
      >
        <Icon name="reply" size={14} color={theme.colors.primary} />
        <Text style={[styles.replyButtonText, { color: theme.colors.primary }]}>
          Reply
        </Text>
      </TouchableOpacity>

      {/* Render replies */}
      {comment.replies?.map((reply) => renderComment(reply, true))}
    </View>
  );

  if (!expanded) {
    return (
      <TouchableOpacity
        style={styles.toggleButton}
        onPress={() => setExpanded(true)}
      >
        <Icon name="chat-bubble-outline" size={14} color={theme.colors.primary} />
        <Text style={[styles.toggleText, { color: theme.colors.primary }]}>
          {totalCount > 0 ? `${totalCount} comment${totalCount !== 1 ? "s" : ""}` : "Add comment"}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.toggleButton}
        onPress={() => setExpanded(false)}
      >
        <Icon name="expand-less" size={14} color={theme.colors.primary} />
        <Text style={[styles.toggleText, { color: theme.colors.primary }]}>
          Hide comments
        </Text>
      </TouchableOpacity>

      {/* Comments list */}
      {targetComments.map((comment) => renderComment(comment))}

      {/* Input area */}
      <View style={styles.inputArea}>
        {replyingTo && (
          <View
            style={[
              styles.replyingBanner,
              { backgroundColor: theme.colors.surfaceVariant },
            ]}
          >
            <Text
              style={[
                styles.replyingText,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Replying to comment
            </Text>
            <TouchableOpacity onPress={() => setReplyingTo(null)}>
              <Icon name="close" size={14} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputRow}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.surfaceVariant,
                color: theme.colors.onBackground,
              },
            ]}
            placeholder="Add a comment..."
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={newComment}
            onChangeText={setNewComment}
            multiline
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              {
                backgroundColor: newComment.trim()
                  ? theme.colors.primary
                  : theme.colors.surfaceVariant,
              },
            ]}
            onPress={handleSubmit}
            disabled={!newComment.trim() || submitting}
          >
            <Icon
              name="send"
              size={18}
              color={newComment.trim() ? "#fff" : theme.colors.onSurfaceVariant}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  toggleText: {
    fontSize: 12,
    fontFamily: "Rubik_400Regular",
  },
  commentItem: {
    padding: 10,
    borderRadius: 8,
    marginTop: 6,
  },
  replyItem: {
    marginLeft: 24,
    marginTop: 4,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: "#ddd",
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  username: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
  time: {
    fontSize: 10,
    fontFamily: "Rubik_400Regular",
    flex: 1,
  },
  deleteButton: {
    padding: 2,
  },
  commentText: {
    fontSize: 13,
    fontFamily: "Rubik_400Regular",
    marginTop: 4,
    marginLeft: 28,
  },
  replyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    marginLeft: 28,
  },
  replyButtonText: {
    fontSize: 11,
    fontFamily: "Rubik_400Regular",
  },
  inputArea: {
    marginTop: 8,
  },
  replyingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 6,
    borderRadius: 6,
    marginBottom: 4,
  },
  replyingText: {
    fontSize: 11,
    fontFamily: "Rubik_400Regular",
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: "Rubik_400Regular",
    maxHeight: 80,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default CommentSection;
