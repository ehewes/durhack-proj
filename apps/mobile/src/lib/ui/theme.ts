import { useColorScheme } from "react-native";

// Neutral surfaces, one accent, borders before shadows (anti-slop skill).
const light = {
  background: "#ffffff",
  surface: "#f6f6f4",
  border: "#e2e2de",
  text: "#1a1a18",
  textSecondary: "#5f5f5a",
  accent: "#2f5bd3",
} as const;

const dark: Record<keyof typeof light, string> = {
  background: "#111110",
  surface: "#1b1b1a",
  border: "#2e2e2c",
  text: "#ededeb",
  textSecondary: "#a3a39e",
  accent: "#7c9cf0",
};

export type Colors = Record<keyof typeof light, string>;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 6, md: 8 } as const;
export const type = {
  title: { fontSize: 24, lineHeight: 32, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
} as const;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}
