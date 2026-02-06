import { MD3LightTheme, MD3DarkTheme } from "react-native-paper";
import type { CustomTheme } from "./CustomTheme";

export const LightTheme: CustomTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#2563eb",
    background: "#ffffff",
    surface: "#f5f5f5",
    onBackground: "#000000",
    onSurface: "#333333",
    error: "#FF3B30",
  },
  custom: {
    card: "#eaeaea",
    cardBorder: "#cccccc",
    highlight: "#ffd166",
    phaseActive: "#2563eb",
    phasePending: "#94a3b8",
    phaseComplete: "#22c55e",
  },
};

export const DarkTheme: CustomTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#3b82f6",
    background: "#121212",
    surface: "#1e1e1e",
    onBackground: "#ffffff",
    onSurface: "#dddddd",
    error: "#FF453A",
  },
  custom: {
    card: "#2a2a2a",
    cardBorder: "#444444",
    highlight: "#f4c430",
    phaseActive: "#3b82f6",
    phasePending: "#64748b",
    phaseComplete: "#22c55e",
  },
};
