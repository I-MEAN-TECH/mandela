"use client";

import { forwardRef } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * Button — the reference system's button family: 12px rounded rectangles,
 * flat fills, no gradients. primary = deep pine (the confident action),
 * vivid = lime (the ONE bright moment per screen), secondary = white card,
 * ghost = quiet text. 48px min height (mobile-design), AA contrast,
 * reduced-motion aware.
 */
const variants = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover shadow-1 hover:shadow-2",
  /** Vivid — the ONE lime action per screen (BRAND.md rule 2). Dark label on lime. */
  vivid: "bg-accent text-on-accent hover:bg-accent-hover shadow-1 hover:shadow-2",
  secondary: "bg-surface text-text border border-border hover:bg-paper-100 shadow-1",
  ghost: "text-muted hover:text-text hover:bg-paper-100",
  danger: "bg-danger text-white hover:opacity-90 shadow-1",
} as const;

const sizes = {
  md: "h-12 px-s5 text-sm",           // 48px — default
  lg: "h-14 px-s6 text-md",           // 56px — the single primary on home screens
  sm: "h-10 px-s4 text-xs",           // 40px — desktop-dense tables only
  sm2: "h-8 px-s3 text-xs",           // 32px — dense links inside card headers
} as const;

export interface ButtonProps extends Omit<React.ComponentProps<typeof motion.button>, "children"> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  children?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, className = "", children, disabled, ...rest },
  ref
) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      ref={ref}
      whileTap={reduced ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.12 }}
      disabled={disabled || loading}
      className={[
        "inline-flex select-none items-center justify-center gap-s2 whitespace-nowrap rounded-sm font-medium",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      ].join(" ")}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </motion.button>
  );
});
