"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { cn } from "../cn";

/**
 * Charts — the reference's two data-viz units, alive:
 *
 *  · CashflowChart — paired bars spring up from the axis month by month
 *    (staggered), lift slightly on hover. Zero-line static.
 *  · StatisticDonut — slices DRAW themselves (dashoffset spring, staggered)
 *    and the legend rows fade-up one by one.
 *
 * Reduced motion: everything renders settled, no transitions. In-view
 * has a timeout failsafe — charts can never stay invisible.
 */

export interface CashflowMonth {
  label: string;
  /** Positive units above the axis (income / collected). */
  up: number;
  /** Positive units below the axis (expense / billed-outstanding). */
  down: number;
}

/** Pretty-prints a compact money axis label, e.g. 4K / 8K / 1.2M. */
export function compactKes(cents: number): string {
  const v = cents / 100;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}K`;
  return `${Math.round(v)}`;
}

const SPRING = { type: "spring", stiffness: 120, damping: 20, mass: 0.9 } as const;

const kesFull = new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 });

export function CashflowChart({
  months,
  upLabel = "Income",
  downLabel = "Expense",
  className,
}: {
  months: CashflowMonth[];
  upLabel?: string;
  downLabel?: string;
  className?: string;
}) {
  // Hover: one tooltip per chart, anchored over the hovered month's column;
  // the other months dim so the hovered pair reads.
  const [hovered, setHovered] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });
  const reduced = useReducedMotion();
  const [forced, setForced] = useState(false);
  useEffect(() => {
    if (inView || reduced) return;
    const t = window.setTimeout(() => setForced(true), 1200);
    return () => window.clearTimeout(t);
  }, [inView, reduced]);
  const grown = inView || reduced || forced;

  const max = Math.max(...months.map((m) => Math.max(m.up, m.down)), 1);
  const ticks = [4, 3, 2, 1, 0, -1, -2, -3, -4].map((n) => n * (max / 4));

  return (
    <figure className={cn("w-full", className)}>
      <figcaption className="mb-s3 flex items-center justify-end gap-s4 text-[12px] font-medium text-ink-700">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-xs bg-pine-800" />
          {upLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-xs bg-lime-300" />
          {downLabel}
        </span>
      </figcaption>
      <div className="flex gap-2" ref={ref}>
        {/* Y axis */}
        <div className="flex shrink-0 flex-col justify-between py-0 text-right font-mono text-[10px] text-ink-400" aria-hidden>
          {ticks.map((t, i) => (
            <span key={i} className="leading-none">
              {t === 0 ? "0" : compactKes(Math.abs(t))}
            </span>
          ))}
        </div>
        {/* Plot */}
        <div className="relative min-w-0 flex-1">
          {/* gridlines */}
          <div aria-hidden className="absolute inset-0 flex flex-col justify-between">
            {ticks.map((t, i) => (
              <div key={i} className={cn("h-px w-full", t === 0 ? "bg-paper-400" : "bg-paper-200")} />
            ))}
          </div>
          {/* bars */}
          <div className="relative flex h-[220px] items-stretch">
            {months.map((m, i) => {
              const upPct = (m.up / max) * 50;
              const downPct = (m.down / max) * 50;
              const total = m.up + m.down;
              const delay = reduced ? 0 : 0.08 + i * 0.07;
              const grow = grown
                ? { height: `${Math.max(upPct, total === 0 ? 0 : 1.5)}%` }
                : { height: "0%" };
              const growDown = grown
                ? { height: `${Math.max(downPct, total === 0 ? 0 : 1.5)}%` }
                : { height: "0%" };
              const dim = hovered !== null && hovered !== i;
              return (
                <div
                  key={i}
                  className="flex min-w-0 flex-1 cursor-default flex-col items-center"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                >
                  {/* upper half — income (deep pine), springs up from the axis */}
                  <div className="relative flex w-full flex-1 flex-col justify-end">
                    <motion.div
                      className="mx-auto w-[46%] origin-bottom rounded-t-[6px] bg-pine-800 group-hover:bg-pine-700"
                      initial={false}
                      animate={{ ...grow, opacity: dim ? 0.35 : 1 }}
                      transition={{ ...SPRING, delay }}
                      style={{ transformOrigin: "bottom" }}
                      role="img"
                      aria-label={`${m.label}: ${upLabel} ${compactKes(m.up)}`}
                    />
                  </div>
                  {/* zero line gap */}
                  <div aria-hidden className="h-px w-full shrink-0 bg-paper-400" />
                  {/* lower half — expense (lime), springs down from the axis */}
                  <div className="relative flex w-full flex-1 flex-col justify-start">
                    <motion.div
                      className="mx-auto w-[46%] origin-top rounded-b-[6px] bg-lime-300 group-hover:bg-lime-400"
                      initial={false}
                      animate={{ ...growDown, opacity: dim ? 0.35 : 1 }}
                      transition={{ ...SPRING, delay: delay + 0.06 }}
                      style={{ transformOrigin: "top" }}
                      role="img"
                      aria-label={`${m.label}: ${downLabel} ${compactKes(m.down)}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {/* The hover tooltip — anchored over the hovered month, floats above
              the plot. Pointer-events none so it never flickers. */}
          {hovered !== null && months[hovered] ? (
            <motion.div
              key={hovered}
              initial={reduced ? false : { opacity: 0, y: 6, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              transition={reduced ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
              className="pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-sm border border-border bg-surface px-3 py-2 shadow-2"
              style={{ left: `${((hovered + 0.5) / months.length) * 100}%` }}
              role="status"
            >
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{months[hovered].label}</p>
              <p className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-ink-950">
                <span aria-hidden className="h-2 w-2 rounded-xs bg-pine-800" />
                {upLabel} <span className="numeral tabular-nums">{kesFull.format(months[hovered].up / 100)}</span>
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[12px] font-semibold text-ink-950">
                <span aria-hidden className="h-2 w-2 rounded-xs bg-lime-300" />
                {downLabel} <span className="numeral tabular-nums">{kesFull.format(months[hovered].down / 100)}</span>
              </p>
            </motion.div>
          ) : null}
          {/* X labels */}
          <div className="mt-2 flex">
            {months.map((m, i) => (
              <span key={i} className="min-w-0 flex-1 text-center text-[11px] text-muted">
                {m.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

export interface DonutSlice {
  label: string;
  value: number; // units (cents)
  /** Override the auto palette (pine → lime → grays). */
  color?: string;
}

const PALETTE = ["var(--pine-800)", "var(--lime-300)", "var(--paper-300)", "var(--pine-300)", "var(--paper-400)", "var(--lime-200)"];

export function StatisticDonut({
  slices,
  centerLabel,
  centerValue,
  size = 190,
  thickness = 26,
  className,
}: {
  slices: DonutSlice[];
  centerLabel?: string;
  centerValue?: React.ReactNode;
  size?: number;
  thickness?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });
  const reduced = useReducedMotion();
  const [forced, setForced] = useState(false);
  // Hover: the hovered slice pops out; the center swaps to its value.
  const [hovered, setHovered] = useState<number | null>(null);
  useEffect(() => {
    if (inView || reduced) return;
    const t = window.setTimeout(() => setForced(true), 1200);
    return () => window.clearTimeout(t);
  }, [inView, reduced]);
  const drawn = inView || reduced || forced;

  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;

  const hov = hovered !== null ? slices[hovered] : undefined;
  const hovPct = hov && total > 0 ? Math.round((hov.value / total) * 100) : 0;

  return (
    <figure className={cn("flex items-center justify-center", className)}>
      <div className="relative" style={{ width: size, height: size }} ref={ref}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution donut chart">
          {/* quiet base ring */}
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--paper-200)" strokeWidth={thickness} />
          {total > 0 &&
            slices.map((s, i) => {
              const frac = s.value / total;
              const dash = Math.max(frac * c - 3, 0.5);
              const offset = -acc * c;
              acc += frac;
              if (s.value <= 0) return null;
              // The draw-in: dashoffset runs the full circle → the slice arc,
              // so each slice sweeps on like a pen. Hover: the slice thickens
              // IN PLACE (stroke grows outward) — never translated. Moving the
              // arc tears the ring at the slice boundaries; thickening doesn't.
              return (
                <motion.circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color ?? PALETTE[i % PALETTE.length]}
                  strokeWidth={hovered === i ? thickness + 6 : thickness}
                  strokeLinecap="butt"
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  initial={false}
                  animate={{
                    strokeDasharray: `${dash} ${c - dash}`,
                    strokeDashoffset: offset,
                    opacity: hovered !== null && hovered !== i ? 0.35 : 1,
                  }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : {
                          type: "spring",
                          stiffness: 60,
                          damping: 18,
                          delay: hovered === null ? 0.1 + i * 0.15 : 0,
                        }
                  }
                  style={{ cursor: "default" }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                />
              );
            })}
        </svg>
        {/* Center: total at rest, hovered slice's share on hover. */}
        <motion.figcaption
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
          initial={false}
          animate={{ opacity: drawn ? 1 : 0, scale: drawn ? 1 : 0.92 }}
          transition={reduced ? { duration: 0 } : { delay: 0.35, type: "spring", stiffness: 160, damping: 18 }}
        >
          {hov ? (
            <>
              <span className="max-w-[110px] truncate text-[11px] font-semibold text-pine-700">{hov.label}</span>
              <span className="numeral mt-0.5 text-[22px] font-semibold text-ink-950">{hovPct}%</span>
              <span className="numeral mt-0.5 text-[11.5px] text-muted">{kesFull.format(hov.value / 100)}</span>
            </>
          ) : (
            <>
              {centerLabel ? <span className="text-[11px] text-muted">{centerLabel}</span> : null}
              <span className="numeral mt-0.5 text-[22px] font-semibold text-ink-950">{centerValue}</span>
            </>
          )}
        </motion.figcaption>
      </div>
    </figure>
  );
}

/** Legend row for the donut: percent chip + label + value. Rows fade-up staggered. */
export function DonutLegend({
  slices,
  total,
}: {
  slices: DonutSlice[];
  total: number;
}) {
  const reduced = useReducedMotion();
  const kes = new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 });
  const pctColor = (i: number): string => {
    const frac = total > 0 ? slices[i]!.value / total : 0;
    if (frac >= 0.5) return "bg-pine-800 text-white";
    if (frac >= 0.12) return "bg-lime-100 text-pine-800";
    return "bg-paper-200 text-ink-700";
  };
  return (
    <ul className="grid gap-s2.5">
      {slices.map((s, i) => {
        const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
        return (
          <motion.li
          key={i}
          className="flex items-center gap-s3 text-[13px]"
          {...(reduced
            ? {}
            : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.3 + i * 0.1, duration: 0.35 } })}
        >
            <span className={cn("grid h-8 w-9 shrink-0 place-items-center rounded-sm text-[11px] font-semibold tabular-nums", pctColor(i))}>
              {pct}%
            </span>
            <span className="min-w-0 flex-1 truncate font-medium text-ink-900">{s.label}</span>
            <span className="numeral shrink-0 font-semibold text-ink-950">{kes.format(s.value / 100)}</span>
          </motion.li>
        );
      })}
    </ul>
  );
}
