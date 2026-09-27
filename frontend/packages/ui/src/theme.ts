/**
 * Typed token constants — the TS mirror of tokens.css (v6, reference-derived).
 * NativeWind / Expo reads these directly (no CSS cascade there).
 * Import from `@mandela/ui/theme` in mobile code; web should prefer
 * Tailwind classes so CSS variables can theme per-school.
 *
 * Brand story (see tokens.css): the "green ledger" — sage canvas, white
 * shell, deep pine for text and primary actions, lime for the one vivid
 * moment. Chroma is meaning: green/amber/red = money & presence;
 * lime = navigation & energy. No gradients — flat color only.
 * Type: Poppins display + headings / Inter dense UI / Geist Mono labels.
 */
export const colors = {
  ink: {
    950: "#0d1f1a",
    900: "#16302a",
    800: "#24443c",
    700: "#2f4a42",
    600: "#5a716a",
    500: "#6d837b",
    400: "#93a69f",
    300: "#b8c6c0",
    200: "#cfdbd5",
  },
  paper: {
    50: "#f2f4ec",
    100: "#ecefe3",
    200: "#e2e7d8",
    300: "#dfe4d4",
    400: "#c8d0ba",
  },
  /** Lime — the vivid accent: active nav, the one bright button. */
  lime: {
    50: "#f6fbee",
    100: "#eef8d9",
    200: "#e0f3b8",
    300: "#cdea9b",
    400: "#aee26a",
    500: "#8de24f",
    600: "#6fc336",
    700: "#55992a",
  },
  /** Pine — the deep green family: deep panel + primary actions. */
  pine: {
    50: "#f0f7f4",
    100: "#ddeee7",
    200: "#c2e2d6",
    300: "#93cbb8",
    400: "#5aab92",
    500: "#378d73",
    600: "#246b56",
    700: "#1a5645",
    800: "#143d33",
    900: "#102e26",
    950: "#0b211b",
  },
  ok: "#1f9d5b",
  danger: "#d64550",
  warn: "#b7791f",
} as const;

/** Light/dark semantic pairs — pick by useColorScheme() at runtime. */
export const semantic = {
  light: {
    bg: "#edf0e5",
    surface: "#ffffff",
    border: colors.paper[300],
    text: colors.ink[900],
    textMuted: colors.ink[600],
    primary: colors.pine[700],
    primaryHover: colors.pine[600],
    onPrimary: "#ffffff",
    ring: colors.pine[500],
    brandDeep: "#123b31",
    brandDeepContrast: "#f2fbf5",
    accent: colors.lime[500],
    accentHover: colors.lime[600],
    accentSoft: colors.lime[100],
    onAccent: "#143d33",
    ok: colors.ok,
    okBg: "#e4f6ea",
    danger: colors.danger,
    dangerBg: "#fde8e8",
    warn: colors.warn,
    warnBg: "#fdf3dc",
  },
  dark: {
    bg: "#0a1512",
    surface: "#10241e",
    border: "#1e3a32",
    text: "#e9f5ee",
    textMuted: "#9db5ab",
    primary: colors.lime[400],
    primaryHover: colors.lime[300],
    onPrimary: "#0b211b",
    ring: colors.pine[400],
    brandDeep: "#0d1f1a",
    brandDeepContrast: "#e9f5ee",
    accent: colors.lime[400],
    accentHover: colors.lime[300],
    accentSoft: "#1c2f18",
    onAccent: "#0b211b",
    ok: "#4ad295",
    okBg: "#0e2b1f",
    danger: "#f28b82",
    dangerBg: "#2e1414",
    warn: "#f4b860",
    warnBg: "#2b2210",
  },
} as const;

export type MandelaTheme = (typeof semantic)["light"];

export const spacing = {
  s1: 4, s2: 8, s3: 12, s3h: 14, s4: 16,
  s5: 24, s6: 32, s7: 48, s8: 72, s9: 96,
  /** minimum touch target (mobile-design skill: 44px+, we ship 48px) */
  tap: 48,
} as const;

export const radius = { sm: 10, DEFAULT: 16, lg: 24, pill: 999 } as const;

/** fluid type — clamp() works on web; mobile uses the computed sizes */
export const type = {
  xs: 13, sm: 15, md: 17, lg: 22, xl: 34,
  num: 40,        // KPI numerals (max of --text-num clamp)
  display: 28,    // Poppins page titles (max of --text-display clamp)
  hero: 64,       // landing hero (max of --text-hero clamp)
} as const;

/** the three families, mirrored for NativeWind */
export const fontFamily = {
  sans: "Inter",
  display: "Poppins",
  mono: "Geist Mono",
} as const;
