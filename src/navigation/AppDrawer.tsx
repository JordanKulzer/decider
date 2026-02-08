import React, { useEffect, useRef, useState } from "react";
import {
  createDrawerNavigator,
  DrawerContentScrollView,
} from "@react-navigation/drawer";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  Animated,
  Alert,
} from "react-native";
import HomeScreen from "../screens/HomeScreen";
import * as Linking from "expo-linking";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { Modal, Portal, Button, useTheme } from "react-native-paper";
import { supabase } from "../lib/supabase";
import { isDemoMode } from "../lib/demoMode";
import { useSubscription } from "../context/SubscriptionContext";

const Drawer = createDrawerNavigator();

// Profile Header Button Component
const ProfileHeaderButton = ({
  navigation,
  username,
}: {
  navigation: any;
  username?: string;
}) => {
  const theme = useTheme();
  const { isProUser, profile } = useSubscription();

  const initial =
    profile?.username?.charAt(0)?.toUpperCase() ||
    username?.charAt(0)?.toUpperCase() ||
    "?";

  return (
    <TouchableOpacity
      style={styles.profileButton}
      onPress={() => navigation.navigate("ProfileScreen")}
    >
      <View
        style={[
          styles.profileAvatar,
          {
            backgroundColor: isProUser ? "#f59e0b" : theme.colors.primary,
          },
        ]}
      >
        <Text style={styles.profileAvatarText}>{initial}</Text>
      </View>
      {isProUser && (
        <View style={styles.proCrown}>
          <MaterialCommunityIcons name="crown" size={10} color="#f59e0b" />
        </View>
      )}
    </TouchableOpacity>
  );
};

const AppDrawerContent = ({
  userId,
  onLogout,
  isDarkTheme,
  toggleTheme,
  navigation,
}: {
  userId: string;
  onLogout: () => void;
  isDarkTheme: boolean;
  toggleTheme: () => void;
  navigation: any;
}) => {
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const theme = useTheme();
  const { tier, isProUser } = useSubscription();
  const logoutAnim = useRef(new Animated.Value(600)).current;
  const deleteAnim = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    Animated.timing(logoutAnim, {
      toValue: logoutConfirmVisible ? 0 : 600,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [logoutConfirmVisible]);

  useEffect(() => {
    Animated.timing(deleteAnim, {
      toValue: deleteConfirmVisible ? 0 : 600,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [deleteConfirmVisible]);

  const handleLogout = async () => {
    setLogoutConfirmVisible(false);
    if (isDemoMode()) {
      onLogout();
      return;
    }
    try {
      await supabase.auth.signOut();
      onLogout();
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const handleDeleteAccount = async () => {
    if (isDemoMode()) {
      setDeleteConfirmVisible(false);
      onLogout();
      return;
    }
    try {
      setDeleteConfirmVisible(false);
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("User not found");

      await supabase
        .from("users")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", user.id);

      // Remove from all decision memberships
      await supabase.from("decision_members").delete().eq("user_id", user.id);

      await supabase.auth.signOut({ scope: "global" });
      onLogout();
    } catch (error: any) {
      Alert.alert(
        "Error",
        `Failed to delete account: ${error.message || "Unknown error"}`,
      );
    }
  };

  const renderItemWithIcon = (
    iconName: React.ComponentProps<typeof MaterialCommunityIcons>["name"],
    label: string,
    onPress?: () => void,
    labelColor = theme.colors.onBackground,
  ) => (
    <TouchableOpacity style={styles.settingItem} onPress={onPress}>
      <View style={styles.iconContainer}>
        <MaterialCommunityIcons name={iconName} size={20} color={labelColor} />
      </View>
      <Text style={[styles.settingLabel, { color: labelColor }]}>{label}</Text>
    </TouchableOpacity>
  );

  const dividerColor = theme.dark ? "#333" : "#eee";

  const dialogCardStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: theme.dark ? "#444" : "#ccc",
    borderLeftWidth: 5,
    borderLeftColor: theme.colors.primary,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    marginHorizontal: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <DrawerContentScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Text style={[styles.header, { color: theme.colors.onBackground }]}>
          Settings
        </Text>
        <View style={styles.divider} />

        <View style={{ flex: 1 }}>
          <TouchableOpacity style={styles.settingItem} onPress={toggleTheme}>
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name={isDarkTheme ? "weather-night" : "weather-sunny"}
                size={20}
                color={theme.colors.onBackground}
              />
            </View>
            <Text
              style={[
                styles.settingLabel,
                { color: theme.colors.onBackground },
              ]}
            >
              {isDarkTheme ? "Dark Mode" : "Light Mode"}
            </Text>
          </TouchableOpacity>

          {renderItemWithIcon("bell-outline", "Notifications", () =>
            Linking.openSettings(),
          )}

          {renderItemWithIcon("account-outline", "Profile", () =>
            navigation.navigate("ProfileScreen"),
          )}

          {/* Subscription with tier indicator */}
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => navigation.navigate("SubscriptionScreen")}
          >
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name={isProUser ? "crown" : "star-outline"}
                size={20}
                color={isProUser ? "#f59e0b" : theme.colors.onBackground}
              />
            </View>
            <Text
              style={[
                styles.settingLabel,
                { color: theme.colors.onBackground },
              ]}
            >
              Subscription
            </Text>
            <View
              style={[
                styles.tierBadge,
                {
                  backgroundColor: isProUser
                    ? "rgba(245, 158, 11, 0.15)"
                    : theme.colors.surfaceVariant,
                },
              ]}
            >
              <Text
                style={[
                  styles.tierBadgeText,
                  {
                    color: isProUser
                      ? "#f59e0b"
                      : theme.colors.onSurfaceVariant,
                  },
                ]}
              >
                {isProUser ? "PRO" : "FREE"}
              </Text>
            </View>
          </TouchableOpacity>

          {renderItemWithIcon(
            "logout",
            "Log Out",
            () => setLogoutConfirmVisible(true),
            theme.colors.error,
          )}
        </View>
      </DrawerContentScrollView>

      <View style={{ paddingHorizontal: 16 }}>
        <Button
          icon="delete"
          mode="outlined"
          onPress={() => setDeleteConfirmVisible(true)}
          textColor={theme.colors.error}
          style={{
            backgroundColor: theme.dark ? theme.colors.error : "#ffe5e5",
            marginBottom: 12,
            borderColor: theme.colors.error,
          }}
          contentStyle={{ paddingVertical: 8 }}
          labelStyle={{
            fontWeight: "600",
            color: theme.dark ? theme.colors.onPrimary : theme.colors.error,
            fontFamily: "Rubik_500Medium",
          }}
        >
          Delete Account
        </Button>
      </View>

      <Portal>
        <Modal
          visible={logoutConfirmVisible}
          onDismiss={() => setLogoutConfirmVisible(false)}
          contentContainerStyle={{ backgroundColor: "transparent" }}
        >
          <Animated.View style={[dialogCardStyle]}>
            <Text
              style={[styles.modalTitle, { color: theme.colors.onSurface }]}
            >
              Confirm Logout
            </Text>
            <View
              style={{
                height: 1,
                backgroundColor: dividerColor,
                marginBottom: 20,
              }}
            />
            <Text
              style={[
                styles.modalSubtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Are you sure you want to log out?
            </Text>
            <View style={styles.modalButtonRow}>
              <Button onPress={() => setLogoutConfirmVisible(false)}>
                Cancel
              </Button>
              <Button
                onPress={handleLogout}
                mode="text"
                textColor={theme.colors.error}
                labelStyle={{ fontSize: 16 }}
              >
                Log Out
              </Button>
            </View>
          </Animated.View>
        </Modal>

        <Modal
          visible={deleteConfirmVisible}
          onDismiss={() => setDeleteConfirmVisible(false)}
          contentContainerStyle={{ backgroundColor: "transparent" }}
        >
          <Animated.View style={[dialogCardStyle]}>
            <Text
              style={[styles.modalTitle, { color: theme.colors.onSurface }]}
            >
              Delete Account
            </Text>
            <View
              style={{
                height: 1,
                backgroundColor: dividerColor,
                marginBottom: 20,
              }}
            />
            <Text
              style={[
                styles.modalSubtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              This will permanently delete your account and data. Continue?
            </Text>
            <View style={styles.modalButtonRow}>
              <Button onPress={() => setDeleteConfirmVisible(false)}>
                Cancel
              </Button>
              <Button
                onPress={handleDeleteAccount}
                mode="text"
                textColor={theme.colors.error}
                labelStyle={{ fontSize: 16 }}
              >
                Delete
              </Button>
            </View>
          </Animated.View>
        </Modal>
      </Portal>
    </View>
  );
};

const AppDrawer = ({
  userId,
  onLogout,
  isDarkTheme,
  toggleTheme,
}: {
  userId: string;
  onLogout: () => void;
  isDarkTheme: boolean;
  toggleTheme: () => void;
}) => {
  const theme = useTheme();

  return (
    <Drawer.Navigator
      {...({
        id: "MainDrawer",
        drawerContent: (props: any) => (
          <AppDrawerContent
            {...props}
            userId={userId}
            onLogout={onLogout}
            isDarkTheme={isDarkTheme}
            toggleTheme={toggleTheme}
            navigation={props.navigation}
          />
        ),
        screenOptions: ({ navigation }: { navigation: any }) => ({
          headerTitle: () => (
            <Text
              style={{
                fontSize: 22,
                fontWeight: "700",
                fontFamily: "Rubik_600SemiBold",
                color: theme.colors.primary,
                letterSpacing: -0.5,
              }}
            >
              Decider
            </Text>
          ),
          headerTitleAlign: "center" as const,
          headerStyle: {
            backgroundColor: theme.colors.surface,
            shadowOpacity: 0,
            elevation: 0,
          },
          headerLeft: () => (
            <TouchableOpacity
              style={{ paddingLeft: 16 }}
              onPress={() => navigation.toggleDrawer()}
            >
              <MaterialCommunityIcons
                name="menu"
                size={28}
                color={theme.colors.onBackground}
              />
            </TouchableOpacity>
          ),
          headerRight: () => <ProfileHeaderButton navigation={navigation} />,
        }),
      } as unknown as React.ComponentProps<typeof Drawer.Navigator>)}
    >
      <Drawer.Screen name="Home" component={HomeScreen} />
    </Drawer.Navigator>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    fontSize: 20,
    marginBottom: 10,
    textAlign: "center",
    paddingTop: 10,
    fontFamily: "Rubik_600SemiBold",
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(180,180,180,0.3)",
    minHeight: 60,
  },
  iconContainer: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontFamily: "Rubik_400Regular",
    flex: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
    fontFamily: "Rubik_600SemiBold",
  },
  modalSubtitle: {
    fontSize: 15,
    marginBottom: 20,
    fontFamily: "Rubik_400Regular",
  },
  modalButtonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(180,180,180,0.3)",
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tierBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  // Profile Header Button Styles
  profileButton: {
    paddingRight: 16,
    position: "relative",
  },
  profileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  proCrown: {
    position: "absolute",
    top: -2,
    right: 12,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 2,
  },
  // Menu Styles
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  menuContainer: {
    width: 280,
    height: "100%",
    paddingTop: 60,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  menuHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    gap: 12,
  },
  menuAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  menuAvatarText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  menuUserInfo: {
    flex: 1,
  },
  menuUsername: {
    fontSize: 17,
    fontWeight: "600",
    fontFamily: "Rubik_500Medium",
    marginBottom: 4,
  },
  menuTierRow: {
    flexDirection: "row",
  },
  menuTierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  menuTierText: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Rubik_600SemiBold",
  },
  menuDivider: {
    height: 1,
    marginVertical: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
  },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    fontFamily: "Rubik_500Medium",
  },
  menuItemHint: {
    fontSize: 12,
    fontFamily: "Rubik_400Regular",
    marginTop: 2,
  },
});

export default AppDrawer;
