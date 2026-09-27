"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, CardHead, Meter } from "@mandela/ui";
import { updateComplianceLineAction, type ComplianceRollupData, type ComplianceLine } from "@/lib/api";

/**
 * Compliance Center 28 — the client (docs/BUILD-PHASES.md Phase 1).
 * One glance: % ready per line, countdown chips (green > 30d, amber 7-30,
 * red <= 7d), and a "fix" deep-link into the module that owns the gap.
 * Manual lines (county licence) get a Done toggle + due-date editor.
 */

function ChipTone(days: number | null): { cls: string; text: string } {
  if (days === null) return { cls: "bg-paper-100 text-ink-500", text: "no deadline" };
  if (days < 0) return { cls: "bg-danger-bg text-danger", text: `${-days}d overdue` };
  if (days <= 7) return { cls: "bg-danger-bg text-danger", text: `${days}d left` };
  if (days <= 30) return { cls: "bg-warn-bg text-warn", text: `${days}d left` };
  return { cls: "bg-pine-100 text-pine-800", text: `${days}d left` };
}

export function ComplianceBoard({ data, canEdit }: { data: ComplianceRollupData; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function toggle(line: ComplianceLine) {
    if (!canEdit) return;
    start(async () => {
      const r = await updateComplianceLineAction({ key: line.key, done: !line.done });
      setMsg(r.ok ? (line.done ? "Reopened" : "Marked done") : r.error ?? "Failed");
      if (r.ok) router.refresh();
    });
  }

  return (
    <Card>
      <CardHead
        title="Regulatory lines"
        sub="KEMIS and TSC compute live from your registers; the licence line is checked off by hand. Every change is audited."
      />
      <div className="flex flex-col divide-y divide-paper-200">
        {data.lines.map((l) => {
          const chip = ChipTone(l.days_left);
          return (
            <div key={l.key} className="flex flex-wrap items-center gap-4 py-4">
              <div className="min-w-[240px] flex-1">
                <div className="flex items-center gap-2">
                  <p className={`text-[14px] font-semibold ${l.done ? "text-ink-500 line-through" : "text-ink-950"}`}>{l.label}</p>
                  <span className={`rounded-pill px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide ${chip.cls}`}>{chip.text}</span>
                </div>
                {l.note ? <p className="mt-0.5 text-[12px] text-ink-500">{l.note}</p> : null}
              </div>
              {l.pct !== null ? (
                <div className="w-40">
                  <Meter value={l.pct} ok={l.pct >= 95 || l.done} />
                  <p className="mt-1 text-right font-mono text-[10px] uppercase tracking-[0.12em] text-ink-500">{l.pct}% ready</p>
                </div>
              ) : null}
              {l.fix ? (
                <Link href={l.fix.href} className="text-[12.5px] font-semibold text-pine-700 underline decoration-pine-300 underline-offset-4 hover:decoration-pine-700">
                  {l.fix.label} →
                </Link>
              ) : null}
              {l.key === "county-licence" && canEdit ? (
                <Button variant={l.done ? "ghost" : "secondary"} disabled={pending} onClick={() => toggle(l)}>
                  {l.done ? "Reopen" : "Mark done"}
                </Button>
              ) : l.done ? (
                <span className="rounded-pill bg-pine-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-pine-800">Done</span>
              ) : null}
            </div>
          );
        })}
      </div>
      {msg ? <p className="mt-2 text-[12.5px] text-ink-700" role="status">{msg}</p> : null}
    </Card>
  );
}

export function ComplianceCsvButton({ data }: { data: ComplianceRollupData }) {
  const [msg, setMsg] = useState<string | null>(null);

  function download() {
    const rows = data.lines.map((l) => ({
      line: l.label,
      pct_ready: l.pct ?? "",
      due_date: l.due_date ?? "",
      days_left: l.days_left ?? "",
      done: l.done ? "yes" : "no",
      note: l.note ?? "",
    }));
    const head = Object.keys(rows[0] ?? { line: "" }).join(",");
    const body = rows.map((r) => Object.values(r).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`${head}\n${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "compliance-summary.csv";
    a.click();
    URL.revokeObjectURL(url);
    setMsg("Downloaded");
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="ghost" onClick={download}>Export CSV</Button>
      {msg ? <span className="text-[12px] text-ink-500">{msg}</span> : null}
    </div>
  );
}
