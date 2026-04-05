import { MD3DarkTheme } from "react-native-paper";
import type { CustomTheme } from "./CustomTheme";

// ─────────────────────────────────────────────────────────────────────────────
// Unified dark-first palette — both themes use the same slate base so the
// app always looks consistent regardless of the user's OS color scheme.
//
// Palette reference (matches Quick Mode screens):
//   Background layers: #0f172a → #1e293b → #273549
//   Primary accent:    #6366f1 (indigo-500)
//   Text hierarchy:    #f1f5f9 / #cbd5e1 / #94a3b8 / #64748b
//   Success:           #22c55e
//   Warning:           #f59e0b
//   Danger:            #f87171
// ─────────────────────────────────────────────────────────────────────────────

const DARK_COLORS = {
  ...MD3DarkTheme.colors,
  primary: "#6366f1",
  primaryContainer: "#312e81",
  secondary: "#818cf8",
  background: "#0f172a",
  surface: "#1e293b",
  surfaceVariant: "#273549",
  onBackground: "#f1f5f9",
  onSurface: "#e2e8f0",
  onSurfaceVariant: "#94a3b8",
  outline: "#334155",
  outlineVariant: "#1e293b",
  error: "#f87171",
  onError: "#fff",
};

const DARK_CUSTOM = {
  card: "#1e293b",
  cardBorder: "rgba(255,255,255,0.07)",
  highlight: "#fcd34d",
  phaseActive: "#6366f1",
  phasePending: "#64748b",
  phaseComplete: "#22c55e",
};

// LightTheme is an alias for the dark palette — the app is always dark.
export const LightTheme: CustomTheme = {
  ...MD3DarkTheme,
  colors: DARK_COLORS,
  custom: DARK_CUSTOM,
};

export const DarkTheme: CustomTheme = {
  ...MD3DarkTheme,
  colors: DARK_COLORS,
  custom: DARK_CUSTOM,
};
