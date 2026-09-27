"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../cn";

/**
 * Reveal — scroll-triggered entrance (the "staggered float-up" cue).
 * IntersectionObserver + one CSS class; children stay in the DOM (SEO/RSC
 * safe). Reduced-motion users see content immediately, no animation.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number; // ms
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    io.observe(el);
    // FAILSAFE — content must never be stuck invisible: background tabs,
    // print, and headless renders may never fire the observer. After a
    // beat, reveal regardless (the animation is decoration; the data is
    // the product).
    const fail = window.setTimeout(() => setShown(true), 1200);
    return () => {
      io.disconnect();
      window.clearTimeout(fail);
    };
  }, []);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={cn(
        "transition-all duration-[600ms] ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100",
        className,
      )}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

/**
 * CountUp — numbers arrive alive. Animates 0 → value on mount and
 * old → new whenever `value` changes (live refreshes). Always tabular.
 * Respect reduced motion: jump straight to the value.
 */
export function CountUp({
  value,
  format = (n: number) => Math.round(n).toLocaleString("en-KE"),
  duration = 900,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    const to = value;
    if (reduced || from === to) {
      fromRef.current = to;
      setDisplay(to);
      return;
    }
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4); // easeOutQuart
      const v = from + (to - from) * eased;
      setDisplay(v);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return <span className={cn("tabular-nums", className)}>{format(display)}</span>;
}

const kes = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 });

/** CountUpMoney — integer cents in (string-safe), animated Ksh out. */
export function CountUpMoney({ cents, className }: { cents: number | string; className?: string }) {
  return <CountUp value={Number(cents) / 100} format={(n) => `Ksh ${kes.format(n)}`} className={className} />;
}

/** Live — the "this screen is alive" indicator. Flat green dot, gentle pulse. */
export function Live({ label = "LIVE", className }: { label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-[11px] font-medium text-ok", className)} role="status">
      <span className="relative flex h-[7px] w-[7px]">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-ok" />
      </span>
      {label}
    </span>
  );
}
