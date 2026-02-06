import React, { useState, useEffect } from "react";
import {
  View,
  ActivityIndicator,
  TouchableOpacity,
  StatusBar,
  Text,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme as NavigationDarkTheme,
} from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { supabase } from "./src/lib/supabase";
import * as Notifications from "expo-notifications";
import AppDrawer from "./src/navigation/AppDrawer";
import LoginScreen from "./src/screens/LoginScreen";
import SignUpScreen from "./src/screens/SignUpScreen";
import ForgotPasswordScreen from "./src/screens/ForgotPasswordScreen";
import ResetPasswordScreen from "./src/screens/ResetPasswordScreen";
import CreateDecisionScreen from "./src/screens/CreateDecisionScreen";
import DecisionDetailScreen from "./src/screens/DecisionDetailScreen";
import JoinDecisionScreen from "./src/screens/JoinDecisionScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import HeaderLogo from "./src/components/HeaderLogo";
import Icon from "react-native-vector-icons/MaterialIcons";
import { Provider as PaperProvider } from "react-native-paper";
import Toast from "react-native-toast-message";
import { getToastConfig } from "./src/components/ToastConfig";
import { LightTheme, DarkTheme } from "./assets/constants/theme";
import * as Linking from "expo-linking";
import {
  Rubik_400Regular,
  Rubik_500Medium,
  Rubik_600SemiBold,
} from "@expo-google-fonts/rubik";
import { useFonts } from "expo-font";
import { enableDemoMode, disableDemoMode, DEMO_USER } from "./src/lib/demoMode";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const Stack = createNativeStackNavigator();

const MainScreen = ({
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
  return (
    <AppDrawer
      userId={userId}
      onLogout={onLogout}
      isDarkTheme={isDarkTheme}
      toggleTheme={toggleTheme}
    />
  );
};

const App: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);

  const paperTheme = isDarkTheme ? DarkTheme : LightTheme;
  const navigationTheme = isDarkTheme ? NavigationDarkTheme : DefaultTheme;
  const toastConfig = getToastConfig(isDarkTheme);

  // Load saved theme preference
  useEffect(() => {
    const loadTheme = async () => {
      const savedTheme = await AsyncStorage.getItem("theme");
      if (savedTheme === "dark") setIsDarkTheme(true);
      if (savedTheme === "light") setIsDarkTheme(false);
    };
    loadTheme();
  }, []);

  const toggleTheme = async () => {
    const next = !isDarkTheme;
    setIsDarkTheme(next);
    await AsyncStorage.setItem("theme", next ? "dark" : "light");
  };

  // Deep link handling for password recovery
  useEffect(() => {
    const handleDeepLink = async ({ url }: { url: string }) => {
      if (!url) return;

      const parsed = new URL(url);
      const hash = parsed.hash.startsWith("#")
        ? parsed.hash.substring(1)
        : parsed.hash;
      const params = new URLSearchParams(hash);

      const type = params.get("type");
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");

      if (type === "recovery" && access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
        setRecoveryMode(true);
      }
    };

    const sub = Linking.addEventListener("url", handleDeepLink);
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => sub.remove();
  }, []);

  // Auth session management
  useEffect(() => {
    let isCancelled = false;

    const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

    const safeGetSession = async (attempt = 1): Promise<any | null> => {
      try {
        const result = (await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 5000)
          ),
        ])) as Awaited<ReturnType<typeof supabase.auth.getSession>>;

        const data = result?.data;
        const error = result?.error;

        if (error) {
          if (
            error.message?.includes("Invalid Refresh Token") ||
            error.message?.includes("Refresh Token Not Found")
          ) {
            await supabase.auth.signOut();
            return null;
          }
        }

        if (data?.session) return data.session;
        return null;
      } catch (err: any) {
        if (err.message === "timeout" && attempt < 3) {
          await wait(2000);
          return safeGetSession(attempt + 1);
        }
        if (
          err.message?.includes("Invalid Refresh Token") ||
          err.message?.includes("Refresh Token Not Found")
        ) {
          await supabase.auth.signOut();
          return null;
        }
        return null;
      }
    };

    const checkSession = async () => {
      const session = await safeGetSession();
      if (isCancelled) return;

      if (session?.user) {
        try {
          const { data: userData, error } = await supabase.auth.getUser();
          if (error || !userData?.user) {
            await supabase.auth.signOut();
            setUser(null);
            Toast.show({
              type: "error",
              text1: "Account Deleted",
              text2: "Your account no longer exists. Please sign up again.",
              position: "bottom",
            });
          } else {
            setUser(userData.user);
          }
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    };

    (async () => {
      await checkSession();

      const { data: listener } = supabase.auth.onAuthStateChange(
        async (_event, session) => {
          if (isCancelled) return;

          if (session?.user) {
            const { data: userData, error } = await supabase.auth.getUser();
            if (error || !userData?.user) {
              await supabase.auth.signOut();
              setUser(null);
            } else {
              setUser(userData.user);
            }
          } else {
            setUser(null);
            setRecoveryMode(false);
          }
          setLoading(false);
        }
      );

      return () => listener?.subscription.unsubscribe();
    })();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    try {
      disableDemoMode();
      await supabase.auth.signOut();
      setUser(null);
    } catch (error) {
      console.error("Error logging out: ", error);
    }
  };

  const handleDemoLogin = () => {
    enableDemoMode();
    setUser(DEMO_USER);
    setLoading(false);
  };

  const linking = {
    prefixes: ["deciderapp://", "https://decider-app.web.app"],
    config: {
      screens: {
        ResetPasswordScreen: "reset-password",
        JoinDecisionScreen: {
          path: "decision/:decisionId",
        },
      },
    },
  };

  const [fontsLoaded] = useFonts({
    Rubik_400Regular,
    Rubik_500Medium,
    Rubik_600SemiBold,
  });

  if (!fontsLoaded || loading) {
    return (
      <View
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar
        barStyle={isDarkTheme ? "light-content" : "dark-content"}
        backgroundColor={
          isDarkTheme ? DarkTheme.colors.surface : LightTheme.colors.surface
        }
      />
      <PaperProvider theme={paperTheme}>
        <NavigationContainer theme={navigationTheme} linking={linking}>
          <Stack.Navigator
            screenOptions={{
              headerShown: true,
              headerTitleAlign: "center",
              headerTitle: () => <HeaderLogo />,
              headerStyle: {
                backgroundColor: paperTheme.colors.surface,
              },
              headerShadowVisible: false,
              headerTintColor: paperTheme.colors.onBackground,
            }}
          >
            {recoveryMode ? (
              <Stack.Screen
                name="ResetPasswordScreen"
                options={{ headerShown: false }}
              >
                {({ navigation }) => (
                  <ResetPasswordScreen
                    navigation={navigation}
                    onResetComplete={() => setRecoveryMode(false)}
                  />
                )}
              </Stack.Screen>
            ) : user ? (
              <>
                <Stack.Screen name="Main" options={{ headerShown: false }}>
                  {() => (
                    <MainScreen
                      userId={user.id}
                      onLogout={handleLogout}
                      isDarkTheme={isDarkTheme}
                      toggleTheme={toggleTheme}
                    />
                  )}
                </Stack.Screen>

                {[
                  {
                    name: "CreateDecisionScreen",
                    component: CreateDecisionScreen,
                    title: "New Decision",
                  },
                  {
                    name: "DecisionDetailScreen",
                    component: DecisionDetailScreen,
                    title: null,
                  },
                  {
                    name: "JoinDecisionScreen",
                    component: JoinDecisionScreen,
                    title: "Join Decision",
                  },
                  {
                    name: "ProfileScreen",
                    component: ProfileScreen,
                    title: "Profile",
                  },
                ].map(({ name, component, title }) => (
                  <Stack.Screen
                    key={name}
                    name={name}
                    component={component}
                    options={({ navigation }) => ({
                      animation: "slide_from_right",
                      headerTitle: () => <HeaderLogo />,
                      headerTitleAlign: "center" as const,
                      headerStyle: {
                        backgroundColor: paperTheme.colors.surface,
                      },
                      headerShadowVisible: false,
                      headerBackTitleVisible: false,
                      headerTintColor: paperTheme.colors.onBackground,
                      title: title || undefined,
                      headerLeft: () => (
                        <TouchableOpacity
                          style={{
                            height: 30,
                            width: 30,
                            borderRadius: 20,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          onPress={() => navigation.goBack()}
                        >
                          <Icon
                            name="arrow-back"
                            size={24}
                            color={paperTheme.colors.onBackground}
                          />
                        </TouchableOpacity>
                      ),
                    })}
                  />
                ))}
              </>
            ) : (
              <>
                <Stack.Screen
                  name="Login"
                  options={{ headerShown: false }}
                >
                  {(props: any) => (
                    <LoginScreen {...props} onDemoLogin={handleDemoLogin} />
                  )}
                </Stack.Screen>
                <Stack.Screen
                  name="Signup"
                  component={SignUpScreen}
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="ForgotPassword"
                  component={ForgotPasswordScreen}
                  options={{ headerShown: false }}
                />
              </>
            )}
          </Stack.Navigator>
        </NavigationContainer>
        <Toast config={toastConfig} position="bottom" bottomOffset={60} />
      </PaperProvider>
    </GestureHandlerRootView>
  );
};

export default App;
