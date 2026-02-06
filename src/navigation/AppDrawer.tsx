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
  Alert,
  Animated,
} from "react-native";
import HomeScreen from "../screens/HomeScreen";
import * as Linking from "expo-linking";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { Modal, Portal, Button, useTheme } from "react-native-paper";
import { supabase } from "../lib/supabase";
import { isDemoMode } from "../lib/demoMode";

const Drawer = createDrawerNavigator();

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
        `Failed to delete account: ${error.message || "Unknown error"}`
      );
    }
  };

  const renderItemWithIcon = (
    iconName: string,
    label: string,
    onPress?: () => void,
    labelColor = theme.colors.onBackground
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
        style={[
          styles.container,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <Text style={[styles.header, { color: theme.colors.onBackground }]}>
          Settings
        </Text>
        <View style={styles.divider} />

        <View style={{ flex: 1 }}>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={toggleTheme}
          >
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
            Linking.openSettings()
          )}

          {renderItemWithIcon("account-outline", "Profile", () =>
            navigation.navigate("ProfileScreen")
          )}

          {renderItemWithIcon(
            "logout",
            "Log Out",
            () => setLogoutConfirmVisible(true),
            theme.colors.error
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
            color: theme.dark
              ? theme.colors.onPrimary
              : theme.colors.error,
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
          headerRight: () => <View style={{ width: 44 }} />,
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
});

export default AppDrawer;
