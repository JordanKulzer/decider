import "dotenv/config";

export default {
  expo: {
    name: "Decider",
    slug: "decider",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    jsEngine: "hermes",
    scheme: "deciderapp",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#1a1a2e",
    },
    ios: {
      bundleIdentifier: "com.jkulzer.decider",
      supportsTablet: true,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSUserNotificationUsageDescription:
          "Decider uses notifications to alert you when decisions are about to lock and when results are in.",
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#1a1a2e",
      },
      package: "com.jkulzer.decider",
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: "decider-app.web.app",
              pathPrefix: "/decision/",
            },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      "expo-web-browser",
      "expo-font",
      "expo-notifications",
      "@react-native-community/datetimepicker",
      [
        "expo-build-properties",
        {
          ios: {
            deploymentTarget: "16.4",
            useModularHeaders: true,
          },
        },
      ],
    ],
    extra: {
      eas: {
        projectId: "PLACEHOLDER_EAS_PROJECT_ID",
      },
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    },
  },
};
