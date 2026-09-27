"use client";

import { ArrowRight } from "lucide-react";

import { Card, CardHead, StatusPill } from "@mandela/ui";
import type { AttendanceOversightData } from "@/lib/api";

/**
 * Attendance Oversight ⑰ — admin sees the school-wide view; correction stays
 * with the teacher (read-only here, per the spec). The chronic-absentee list
 * carries a contact action because absence is a fee-churn warning.
 */

export function AttendanceTrend({ trend }: { trend: { day: string; pct: number }[] }) {
  const max = 100;
  return (
    <div className="flex items-end gap-2 pt-2" style={{ height: 120 }}>
      {trend.map((d) => (
        <div key={d.day} className="group relative flex flex-1 flex-col items-center justify-end gap-1">
          <span className="numeral text-[11px] font-semibold text-ink-700">{d.pct}%</span>
          <div
            className="w-full rounded-t-md bg-pine-600 transition-all group-hover:bg-pine-700"
            style={{ height: `${Math.max((d.pct / max) * 78, 4)}px` }}
          />
          <span className="text-[10px] text-ink-500">{d.day.slice(5)}</span>
        </div>
      ))}
      {trend.length === 0 ? <p className="text-[13px] text-ink-500">No marks yet this week.</p> : null}
    </div>
  );
}

export function ChronicList({ chronic }: { chronic: AttendanceOversightData["chronic"] }) {
  return (
    <Card className="min-w-0">
      <CardHead
        title="Chronic absentees (30 days)"
        sub="Below 3+ absences flagged — absence is a fee-churn warning; call before the learner drifts."
      />
      {chronic.length === 0 ? (
        <p className="py-5 text-[13.5px] text-ink-500">No learner has 3+ absences in the last 30 days. Healthy.</p>
      ) : (
        <div className="flex flex-col divide-y divide-paper-200">
          {chronic.map((c) => (
            <div key={c.learner_id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-[160px] flex-1">
                <p className="text-[13.5px] font-semibold text-ink-950">{c.learner}</p>
                <p className="text-[12px] text-ink-500">{c.class_name ?? "—"}</p>
              </div>
              <StatusPill tone={c.pct >= 50 ? "danger" : c.pct >= 30 ? "warn" : "neutral"}>
                {c.pct}% absent
              </StatusPill>
              <p className="text-[12px] text-ink-700">{c.absences} of {c.days} days</p>
              <a
                href={`/app/people/learners?focus=${c.learner_id}`}
                className="text-[12.5px] font-semibold text-pine-700 underline decoration-paper-300 underline-offset-2 hover:decoration-pine-700"
              >
                Open record
                <ArrowRight aria-hidden size={14} strokeWidth={2} className="inline align-[-2px]" />
              </a>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function ClassCompare({ byClass }: { byClass: AttendanceOversightData["byClass"] }) {
  return (
    <Card>
      <CardHead title="Per-class compare (7 days)" sub="Present-rate by class — the gap is a conversation, not a score" />
      {byClass.length === 0 ? (
        <p className="py-4 text-[13px] text-ink-500">No class-level marks yet.</p>
      ) : (
        <div className="flex flex-col gap-2.5 py-1">
          {byClass.map((c) => (
            <div key={c.class_id}>
              <div className="flex items-baseline justify-between">
                <p className="text-[13px] font-semibold text-ink-950">{c.class_name}</p>
                <p className="numeral text-[12.5px] text-ink-700">{c.pct}%</p>
              </div>
              <div className="mt-1 h-2.5 w-full overflow-hidden rounded-pill bg-paper-100">
                <div
                  className={c.pct >= 85 ? "h-full rounded-pill bg-pine-600" : c.pct >= 70 ? "h-full rounded-pill bg-warn" : "h-full rounded-pill bg-danger"}
                  style={{ width: `${Math.max(c.pct, 3)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
