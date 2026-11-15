import { StyleSheet, useColorScheme } from "react-native";

// iOS grouped palette: a grey page, white grouped surfaces, hairline separators and one accent.
// Depth comes from surface contrast and borders, never shadows or blur (anti-slop skill).
const light = {
  /** Page behind grouped sections (systemGroupedBackground). */
  background: "#f2f2f7",
  /** Sections, rows and cards (secondarySystemGroupedBackground). */
  surface: "#ffffff",
  /** Fills inside a surface: segmented tracks, chips, map placeholders. */
  fill: "#e9e9ee",
  border: "#d1d1d6",
  separator: "#c6c6c8",
  text: "#1a1a18",
  textSecondary: "#6c6c70",
  textTertiary: "#a1a1a6",
  accent: "#2f5bd3",
  onAccent: "#ffffff",
  /** Destructive actions only (delete everything). */
  danger: "#d70015",
} as const;

const dark: Record<keyof typeof light, string> = {
  background: "#000000",
  surface: "#1c1c1e",
  fill: "#2c2c2e",
  border: "#38383a",
  separator: "#38383a",
  text: "#ededeb",
  textSecondary: "#a1a1a6",
  textTertiary: "#6c6c70",
  accent: "#7c9cf0",
  onAccent: "#000000",
  danger: "#ff6961",
};

export type Colors = Record<keyof typeof light, string>;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 12 } as const;
export const hairline = StyleSheet.hairlineWidth;

/** iOS text styles (points). Line heights scale with Dynamic Type; font scaling stays on. */
export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: "700" },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 17, lineHeight: 22, fontWeight: "400" },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: "400" },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  /** Secondary explanatory text. Same size as footnote; Text tints it secondary. */
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  caption2: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
} as const;

export type TypeVariant = keyof typeof type;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}
