import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "react-native-paper";
import Icon from "react-native-vector-icons/MaterialIcons";
import type { DecisionMember } from "../types/decisions";

interface MemberListProps {
  members: DecisionMember[];
  showVoteStatus?: boolean;
}

const MemberList: React.FC<MemberListProps> = ({
  members,
  showVoteStatus,
}) => {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <Text
        style={[styles.label, { color: theme.colors.onSurfaceVariant }]}
      >
        Members ({members.length})
      </Text>
      <View style={styles.avatarRow}>
        {members.map((member) => {
          const initial = member.username
            ? member.username.charAt(0).toUpperCase()
            : "?";
          const isOrganizer = member.role === "organizer";

          return (
            <View key={member.id} style={styles.avatarContainer}>
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor: isOrganizer
                      ? theme.colors.primary
                      : theme.colors.onSurfaceVariant,
                  },
                ]}
              >
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
              {showVoteStatus && member.has_voted && (
                <View style={styles.checkBadge}>
                  <Icon name="check-circle" size={14} color="#22c55e" />
                </View>
              )}
              <Text
                style={[
                  styles.memberName,
                  { color: theme.colors.onSurfaceVariant },
                ]}
                numberOfLines={1}
              >
                {member.username || "Unknown"}
              </Text>
              {isOrganizer && (
                <Text style={[styles.roleTag, { color: theme.colors.primary }]}>
                  Host
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    fontFamily: "Rubik_500Medium",
  },
  avatarRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  avatarContainer: {
    alignItems: "center",
    width: 52,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  checkBadge: {
    position: "absolute",
    top: -2,
    right: 4,
  },
  memberName: {
    fontSize: 10,
    marginTop: 2,
    fontFamily: "Rubik_400Regular",
  },
  roleTag: {
    fontSize: 9,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
  },
});

export default MemberList;
