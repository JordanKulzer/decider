import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Pressable, Text, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "react-native-paper";
import HomeScreen from "../screens/HomeScreen";
import { useSubscription } from "../context/SubscriptionContext";

const Stack = createNativeStackNavigator();

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
    <Pressable
      style={({ pressed }) => [
        styles.profileButton,
        pressed && styles.noPressEffect,
      ]}
      hitSlop={8}
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
    </Pressable>
  );
};

const AppDrawer = (_props: {
  userId: string;
  onLogout: () => void;
  isDarkTheme: boolean;
  toggleTheme: () => void;
}) => {
  const theme = useTheme();

  return (
    <Stack.Navigator
      screenOptions={({ navigation }) => ({
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
        headerTitleAlign: "center",
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
        headerShadowVisible: false,
        headerLeft: () => null,
        headerRight: () => <ProfileHeaderButton navigation={navigation} />,
      })}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  profileButton: {
    paddingRight: 16,
    position: "relative",
    width: 30,
  },
  noPressEffect: {
    opacity: 1,
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
});

export default AppDrawer;
