import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "react-native-paper";
import { MaterialIcons as Icon } from "@expo/vector-icons";
import { fetchUserPastDecisions, PastDecisionSummary } from "../lib/decisions";

interface DuplicateDecisionModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (decision: PastDecisionSummary) => void;
  userId: string;
}

const DuplicateDecisionModal: React.FC<DuplicateDecisionModalProps> = ({
  visible,
  onClose,
  onSelect,
  userId,
}) => {
  const theme = useTheme();
  const [pastDecisions, setPastDecisions] = useState<PastDecisionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible && userId) {
      setLoading(true);
      fetchUserPastDecisions(userId)
        .then((data) => {
          setPastDecisions(data);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Error fetching past decisions:", err);
          setLoading(false);
        });
    }
  }, [visible, userId]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const renderItem = ({ item }: { item: PastDecisionSummary }) => (
    <TouchableOpacity
      style={[
        styles.item,
        {
          backgroundColor: (theme as any).custom?.card || theme.colors.surface,
          borderColor: (theme as any).custom?.cardBorder || theme.colors.outline,
        },
      ]}
      onPress={() => onSelect(item)}
      activeOpacity={0.7}
    >
      <View style={styles.itemHeader}>
        <Text
          style={[styles.itemTitle, { color: theme.colors.onBackground }]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        <Text style={[styles.itemDate, { color: theme.colors.onSurfaceVariant }]}>
          {formatDate(item.created_at)}
        </Text>
      </View>
      <View style={styles.itemMeta}>
        <View style={styles.metaItem}>
          <Icon name="filter-list" size={14} color={theme.colors.onSurfaceVariant} />
          <Text style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>
            {item.constraint_count} constraint{item.constraint_count !== 1 ? "s" : ""}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Icon name="list" size={14} color={theme.colors.onSurfaceVariant} />
          <Text style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>
            {item.option_count} option{item.option_count !== 1 ? "s" : ""}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Icon
            name={item.voting_mechanism === "point_allocation" ? "stars" : "format-list-numbered"}
            size={14}
            color={theme.colors.onSurfaceVariant}
          />
          <Text style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>
            {item.voting_mechanism === "point_allocation" ? "Points" : "Ranking"}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.container,
            { backgroundColor: theme.colors.background },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.onBackground }]}>
              Start from past decision
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="close" size={24} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
            Select a decision to copy its settings, constraints, and options
          </Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : pastDecisions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Icon name="history" size={48} color={theme.colors.onSurfaceVariant} />
              <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                No past decisions found
              </Text>
              <Text style={[styles.emptyHint, { color: theme.colors.onSurfaceVariant }]}>
                Create some decisions first, then you can duplicate them here.
              </Text>
            </View>
          ) : (
            <FlatList
              data={pastDecisions}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  container: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  closeButton: {
    padding: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Rubik_400Regular",
    marginBottom: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
    marginTop: 8,
  },
  emptyHint: {
    fontSize: 13,
    fontFamily: "Rubik_400Regular",
    textAlign: "center",
  },
  list: {
    gap: 10,
    paddingBottom: 20,
  },
  item: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
    flex: 1,
    marginRight: 8,
  },
  itemDate: {
    fontSize: 12,
    fontFamily: "Rubik_400Regular",
  },
  itemMeta: {
    flexDirection: "row",
    gap: 16,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    fontFamily: "Rubik_400Regular",
  },
});

export default DuplicateDecisionModal;
