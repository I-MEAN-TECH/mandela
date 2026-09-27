"use client";

/**
 * RoleCharts — Phase 5 (§8 component inventory): the four role-dashboard
 * graphs, one ink colour + semantic status colours, zero gradients, tabular
 * numerals, motion reveal with a reduced-motion + in-view failsafe (the
 * Charts.tsx contract — charts can never stay invisible).
 *
 *  · SparklineStrip  — n-day mini bars (teacher attendance, bursar week)
 *  · WeekdayHeatmap  — attendance grid, rows = learners, green/amber/red
 *  · FunnelBars      — admissions stages (counter)
 *  · RouteStrip      — stops with tick states (driver, text-first)
 *  · StandingsBars   — house points ranking (patron, §6.10)
 */

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { cn } from "../cn";

const SPRING = { type: "spring", stiffness: 120, damping: 20, mass: 0.9 } as const;

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });
  const reduced = useReducedMotion();
  const [forced, setForced] = useState(false);
  useEffect(() => {
    if (inView || reduced) return;
    const t = window.setTimeout(() => setForced(true), 1200);
    return () => window.clearTimeout(t);
  }, [inView, reduced]);
  return { ref, shown: inView || forced || Boolean(reduced) };
}

const NUM = { fontVariantNumeric: "tabular-nums" } as const;

/* ------------------------------------------------------------------ */

export interface SparkPoint {
  label: string;
  value: number;
  /** 0..1 — denominator for percentage-shaped series */
  of?: number;
}

/** n-day mini bars — one ink tone, today emphasized. */
export function SparklineStrip({
  points,
  label,
  className,
}: {
  points: SparkPoint[];
  label?: string;
  className?: string;
}) {
  const { ref, shown } = useReveal();
  const max = Math.max(1, ...points.map((p) => (p.of != null ? 100 : p.value)));
  return (
    <div ref={ref} className={cn("flex items-end gap-1.5", className)}>
      {points.map((p, i) => {
        const h = p.of != null ? Math.max(4, Math.round(p.of * 100)) : Math.max(4, Math.round((p.value / max) * 100));
        const isLast = i === points.length - 1;
        return (
          <div key={`${p.label}-${i}`} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="flex h-16 w-full items-end justify-center">
              <motion.div
                initial={{ height: 4, opacity: 0.4 }}
                animate={shown ? { height: `${h}%`, opacity: 1 } : { height: 4, opacity: 0.4 }}
                transition={{ ...SPRING, delay: shown ? i * 0.03 : 0 }}
                className={cn("w-full max-w-6 rounded-t-sm", isLast ? "bg-ink-950" : "bg-ink-300")}
              />
            </div>
            <span className="truncate text-[10px] text-muted" style={NUM}>{p.label}</span>
          </div>
        );
      })}
      {label ? <span className="sr-only">{label}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export type HeatMark = "present" | "absent" | "late" | "excused" | null;

export interface HeatRow {
  name: string;
  marks: HeatMark[];
}

/**
 * Attendance grid — rows = learners, cols = days. Green/amber/red by mark:
 * present → ok, late → warn, absent → danger, excused/null → neutral.
 * Scans horizontally: the row is the child's fortnight at a glance.
 */
export function WeekdayHeatmap({ rows, className }: { rows: HeatRow[]; className?: string }) {
  const cols = rows[0]?.marks.length ?? 0;
  const cell = (m: HeatMark) =>
    m === "present"
      ? "bg-ok-bg text-ok"
      : m === "late"
        ? "bg-warn-bg text-warn"
        : m === "absent"
          ? "bg-danger-bg text-danger"
          : "bg-paper-100 text-muted";
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-separate border-spacing-y-1 text-left" style={NUM}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="w-32 max-w-40 truncate pr-2 text-[12px] font-medium text-ink-900">{r.name}</td>
              {Array.from({ length: cols }, (_, d) => (
                <td key={d} className="px-0.5">
                  <span className={`grid h-5 w-5 place-items-center rounded-[4px] text-[9px] font-semibold ${cell(r.marks[d] ?? null)}`}>
                    {r.marks[d] === "present" ? "✓" : r.marks[d] === "absent" ? "✕" : r.marks[d] === "late" ? "L" : r.marks[d] === "excused" ? "E" : "·"}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export interface FunnelStage {
  stage: string;
  n: number;
}

/** Admissions stages — width-proportional bars, count right-aligned. */
export function FunnelBars({ stages, className }: { stages: FunnelStage[]; className?: string }) {
  const { ref, shown } = useReveal();
  const max = Math.max(1, ...stages.map((s) => s.n));
  return (
    <div ref={ref} className={cn("grid gap-2", className)} style={NUM}>
      {stages.map((s, i) => (
        <div key={s.stage} className="flex items-center gap-2">
          <span className="w-20 shrink-0 truncate text-[11px] capitalize text-muted">{s.stage}</span>
          <div className="h-5 flex-1 overflow-hidden rounded-sm bg-paper-100">
            <motion.div
              initial={{ width: 0 }}
              animate={shown ? { width: `${Math.max(6, (s.n / max) * 100)}%` } : { width: 0 }}
              transition={{ ...SPRING, delay: shown ? i * 0.04 : 0 }}
              className="h-full rounded-sm bg-ink-900"
            />
          </div>
          <span className="w-8 shrink-0 text-right text-[12px] font-semibold text-ink-950">{s.n}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export interface RouteStop {
  point: string;
  pickup_at: string | null;
  learners: number;
  ticked: boolean;
}

/**
 * Stops with tick states — the driver's chart is a list (§6.6 text-first):
 * a vertical strip, each stop a 48px row with time, learner count and the
 * tick state. The whole strip reads as the route at a glance.
 */
export function RouteStrip({ stops, className }: { stops: RouteStop[]; className?: string }) {
  return (
    <ol className={cn("relative grid gap-0", className)} style={NUM}>
      {stops.map((s, i) => (
        <li key={`${s.point}-${i}`} className="relative flex items-center gap-3 py-1.5 pl-6">
          {/* the strip line + node */}
          <span aria-hidden className="absolute left-[9px] top-0 h-full w-px bg-border" />
          <span
            aria-hidden
            className={`absolute left-[5px] top-1/2 grid h-[19px] w-[19px] -translate-y-1/2 place-items-center rounded-full border text-[10px] font-bold ${
              s.ticked ? "border-ok bg-ok-bg text-ok" : "border-border bg-surface text-muted"
            }`}
          >
            {s.ticked ? "✓" : i + 1}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-950">{s.point}</span>
          {s.pickup_at ? <span className="text-[11.5px] text-muted">{s.pickup_at}</span> : null}
          <span className="w-14 shrink-0 text-right text-[12px] font-semibold text-ink-900">{s.learners} kids</span>
        </li>
      ))}
    </ol>
  );
}

export interface StandingsRow {
  label: string;
  value: number;
}

/**
 * StandingsBars — §6.10 house standings: horizontal ranked bars, one ink
 * colour (leader darkest), tabular numerals, same reveal contract as the
 * other role charts.
 */
export function StandingsBars({ rows }: { rows: StandingsRow[] }) {
  const { ref, shown } = useReveal();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div ref={ref} className="grid gap-s2">
      {rows.map((r, i) => (
        <div key={r.label} className="flex items-center gap-s3">
          <span className="w-24 shrink-0 truncate text-[12.5px] font-semibold text-ink-900">{r.label}</span>
          <span className="relative h-s3 flex-1 overflow-hidden rounded-sm bg-paper-100">
            <motion.span
              aria-hidden
              className={"absolute inset-y-0 left-0 rounded-sm " + (i === 0 ? "bg-ink-900" : "bg-ink-300")}
              initial={shown ? undefined : { width: 0 }}
              animate={{ width: `${Math.max(3, (r.value / max) * 100)}%` }}
              transition={SPRING}
            />
          </span>
          <span className="w-14 shrink-0 text-right text-[12px] font-semibold tabular-nums text-ink-950">{r.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
