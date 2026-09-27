import type { Config } from "tailwindcss";

/**
 * Tailwind preset — exposes Mandela tokens as utilities.
 * Consumed by apps/web AND apps/mobile (NativeWind v4), so a single
 * theme file drives all three surfaces.
 * v6: the green ledger — sage canvas, pine ramp, lime accent.
 */
export const mandelaPreset: Partial<Config> = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          950: "var(--ink-950)",
          900: "var(--ink-900)",
          800: "var(--ink-800)",
          700: "var(--ink-700)",
          600: "var(--ink-600)",
          500: "var(--ink-500)",
          400: "var(--ink-400)",
          300: "var(--ink-300)",
          200: "var(--ink-200)",
        },
        paper: {
          50: "var(--paper-50)",
          100: "var(--paper-100)",
          200: "var(--paper-200)",
          300: "var(--paper-300)",
          400: "var(--paper-400)",
        },
        lime: {
          50: "var(--lime-50)",
          100: "var(--lime-100)",
          200: "var(--lime-200)",
          300: "var(--lime-300)",
          400: "var(--lime-400)",
          500: "var(--lime-500)",
          600: "var(--lime-600)",
          700: "var(--lime-700)",
        },
        pine: {
          50: "var(--pine-50)",
          100: "var(--pine-100)",
          200: "var(--pine-200)",
          300: "var(--pine-300)",
          400: "var(--pine-400)",
          500: "var(--pine-500)",
          600: "var(--pine-600)",
          700: "var(--pine-700)",
          800: "var(--pine-800)",
          900: "var(--pine-900)",
          950: "var(--pine-950)",
        },
        // semantic — always use these in screens, never raw ramps
        bg: "var(--bg)",
        surface: "var(--surface)",
        border: "var(--border)",
        text: "var(--text)",
        muted: "var(--text-muted)",
        primary: "var(--primary)",
        "primary-hover": "var(--primary-hover)",
        "on-primary": "var(--on-primary)",
        ring: "var(--ring)",
        "brand-deep": "var(--brand-deep)",
        "brand-deep-contrast": "var(--brand-deep-contrast)",
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-soft": "var(--accent-soft)",
        "on-accent": "var(--on-accent)",
        ok: "var(--ok)",
        "ok-bg": "var(--ok-bg)",
        danger: "var(--danger)",
        "danger-bg": "var(--danger-bg)",
        warn: "var(--warn)",
        "warn-bg": "var(--warn-bg)",
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        sm: "var(--radius-sm)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        1: "var(--shadow-1)",
        2: "var(--shadow-2)",
        glow: "var(--shadow-glow)",
      },
      fontSize: {
        xs: "var(--text-xs)",
        sm: "var(--text-sm)",
        md: "var(--text-md)",
        lg: "var(--text-lg)",
        xl: "var(--text-xl)",
      },
      spacing: {
        tap: "var(--tap)",
        s1: "var(--s1)", s2: "var(--s2)", s3: "var(--s3)", s4: "var(--s4)",
        s5: "var(--s5)", s6: "var(--s6)", s7: "var(--s7)", s8: "var(--s8)",
      },
      transitionTimingFunction: {
        mandela: "cubic-bezier(.22,1,.36,1)",
      },
    },
  },
};

export default mandelaPreset;
