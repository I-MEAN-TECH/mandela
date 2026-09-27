"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardHead, StatusPill } from "@mandela/ui";

/**
 * PrincipalSections — §6.1: "If the admin holds the Principal hat, a Principal
 * view toggle surfaces the §6.2 sections inside this same Pulse — one account,
 * both worlds." Renders the §6.2 KPI strip (attendance today, approvals with
 * age, discipline 7d, sections vitals) plus the two §6.2 feeds (approvals
 * oldest-first, duty-roster pointer). Data is already in AdminPulseData — no
 * new endpoint needed.
 */
export function PrincipalSections({
  pulse,
}: {
  pulse: {
    attendance_today: { present: number; expected: number };
    approvals: { pending: number; oldest_days: number | null };
    sections: { events_week: number; kit_low: number; sections_enabled: number };
  };
}) {
  const att = pulse.attendance_today.expected > 0
    ? Math.round((pulse.attendance_today.present / pulse.attendance_today.expected) * 100)
    : null;

  return (
    <Card>
      <CardHead
        title="Principal view"
        sub="§6.2 — academic health, from the same account"
      />
      <div className="grid grid-cols-2 gap-s3 sm:grid-cols-4">
        <Kpi label="Attendance today" value={att !== null ? `${att}%` : "—"} tone={att !== null && att < 85 ? "warn" : "ok"} />
        <Kpi
          label="Approvals pending"
          value={String(pulse.approvals.pending)}
          note={pulse.approvals.oldest_days !== null ? `oldest ${pulse.approvals.oldest_days}d` : undefined}
          tone={pulse.approvals.pending > 0 ? "warn" : "ok"}
        />
        <Kpi label="Section events (7d)" value={String(pulse.sections.events_week)} tone="neutral" />
        <Kpi label="Kit low" value={String(pulse.sections.kit_low)} tone={pulse.sections.kit_low > 0 ? "warn" : "neutral"} />
      </div>
      <div className="mt-s4 flex flex-wrap gap-s3 border-t border-border pt-s3">
        <Link href="/app/approve" className="text-[12.5px] font-semibold underline decoration-paper-300 underline-offset-4 hover:decoration-primary">
          Review approvals
        </Link>
        <Link href="/app/operations/rosters" className="text-[12.5px] font-semibold underline decoration-paper-300 underline-offset-4 hover:decoration-primary">
          Duty roster today
        </Link>
        <Link href="/app/people/conduct" className="text-[12.5px] font-semibold underline decoration-paper-300 underline-offset-4 hover:decoration-primary">
          Discipline (7d)
        </Link>
      </div>
    </Card>
  );
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note?: string; tone: "ok" | "warn" | "neutral" }) {
  return (
    <div className="rounded-sm border border-border bg-surface p-s3">
      <p className="microlabel">{label}</p>
      <p className="mt-1 text-[22px] font-semibold leading-none text-ink-950">{value}</p>
      {note ? <p className="mt-1 text-[11px] text-muted">{note}</p> : null}
      <div className="mt-2">
        <StatusPill tone={tone}>{tone === "ok" ? "healthy" : tone === "warn" ? "needs eyes" : "info"}</StatusPill>
      </div>
    </div>
  );
}
