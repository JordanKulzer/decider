import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import CommentSection from "./CommentSection";
import type { Comment } from "../types/decisions";

interface DiscussionSheetProps {
  visible: boolean;
  onClose: () => void;
  decisionId: string;
  userId: string;
  displayName?: string | null;
  comments: Comment[];
  onCommentAdded: () => Promise<void> | void;
  isOrganizer?: boolean;
}

export default function DiscussionSheet({
  visible,
  onClose,
  decisionId,
  userId,
  displayName,
  comments,
  onCommentAdded,
  isOrganizer = false,
}: DiscussionSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.kavWrapper}
        >
          <View
            style={styles.sheet}
            onStartShouldSetResponder={() => true}
          >
            {/* ── Header ── */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <MaterialIcons name="chat-bubble-outline" size={14} color="#64748b" />
                <Text style={styles.title}>Notes</Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={12}>
                <MaterialIcons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* ── Comment thread + composer ── */}
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <CommentSection
                decisionId={decisionId}
                userId={userId}
                displayName={displayName}
                comments={comments}
                targetId={decisionId}
                targetType="decision"
                onCommentAdded={onCommentAdded}
                isOrganizer={isOrganizer}
                initiallyExpanded
                allowReplies={false}
                placeholder="Add a note…"
                emptyLabel="Add a note"
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  kavWrapper: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#111827",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    height: "88%",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#94a3b8",
    letterSpacing: -0.1,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
});
