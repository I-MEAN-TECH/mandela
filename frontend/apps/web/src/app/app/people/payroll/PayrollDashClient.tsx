"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, CashflowChart, Money, Button } from "@mandela/ui";
import { payrollExportAction, type PayrollDashData } from "@/lib/api";

/**
 * Payroll dashboard (flank batch C) — the office's month-at-a-glance:
 * salaries due vs collections, the statutory remittance checklist
 * (PAYE · SHIF · NSSF, auto-landed in Tasks), cost-vs-collections chart,
 * and the CSV export seam for Solva/Workpay/Sage accountants.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function StatutoryChecklist({ checks }: { checks: PayrollDashData["checks"] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Card>
      <CardHead
        title="Statutory remittance"
        sub="Deadlines the law sets. Anything overdue also lands in your Tasks inbox until you confirm payment."
      />
      <ul className="mt-2 divide-y divide-paper-200">
        {checks.map((c) => (
          <li key={c.key} className="flex items-center justify-between gap-3 py-2.5">
            <div>
              <p className="text-[13.5px] font-semibold text-ink-950">{c.label}</p>
              <p className="text-[12px] text-ink-500">due {c.due}</p>
            </div>
            {c.overdue ? (
              <span className="rounded-pill bg-danger-bg px-2.5 py-1 text-xs font-semibold text-danger">act now</span>
            ) : (
              <span className="rounded-pill bg-ok-bg px-2.5 py-1 text-xs font-semibold text-ok">on time</span>
            )}
          </li>
        ))}
      </ul>
      {msg ? <p className="mt-2 text-[12.5px] text-ink-700" role="status">{msg}</p> : null}
      <p className="mt-2 text-[11.5px] text-ink-500">Confirmations happen in Tasks — after the payment leaves the bank.</p>
    </Card>
  );
}

export function PayrollChart({ data }: { data: PayrollDashData }) {
  return (
    <Card>
      <CardHead title="Payroll cost vs collections" sub="Six months — the money in vs the money out, one picture." />
      <div className="mt-1">
        <CashflowChart
          months={data.chart.map((m) => ({
            label: `${MONTHS[Number(m.month.split("-")[1] ?? "1") - 1] ?? m.month}`,
            up: Math.round(m.collections / 100),
            down: Math.round(m.payroll / 100),
          }))}
          upLabel="Collected"
          downLabel="Payroll"
        />
      </div>
    </Card>
  );
}

export function ExportCsv({ month }: { month: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function download() {
    start(async () => {
      const r = await payrollExportAction({ period: month });
      if (r.ok && r.data && typeof r.data === "object" && "csv" in r.data) {
        const csv = String((r.data as { csv: string }).csv);
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `payroll-${month}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setMsg({ ok: true, text: `Exported payroll-${month}.csv — works with Solva, Workpay and Sage.` });
      } else {
        setMsg({ ok: false, text: r.error ?? "Export failed" });
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="secondary" disabled={pending} onClick={download}>
        {pending ? "Preparing…" : `Export ${month} CSV`}
      </Button>
      {msg ? <p className={msg.ok ? "text-[12.5px] text-pine-700" : "text-[12.5px] text-danger"} role="status">{msg.text}</p> : null}
    </div>
  );
}
