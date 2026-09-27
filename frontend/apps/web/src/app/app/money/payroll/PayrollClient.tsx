"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, Money, StatusPill } from "@mandela/ui";
import {
  upsertContractAction,
  computePayrollAction,
  approvePayrollAction,
  disbursePayrollAction,
  type ContractRow,
  type PayrollRunRow,
  type SlipRow,
} from "@/lib/api";

/**
 * Payroll (7) — the client surfaces. The bursar prepares; the admin signs
 * off with a reason (through the same law as Approvals 36); disbursement is
 * however the school pays — bank bulk-upload file, manual transfers, M-Pesa.
 */

export function RunLauncher({ runs, canPrepare }: { runs: PayrollRunRow[]; canPrepare: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const period = new Date().toISOString().slice(0, 7);

  if (!canPrepare) return null;
  return (
    <Card>
      <CardHead title="Run payroll" sub="Computes from active contracts. TSC-seconded staff are state-paid and skipped with a reason." />
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = e.currentTarget;
          const fd = new FormData(f);
          start(async () => {
            const r = await computePayrollAction({
              period: String(fd.get("period") ?? period),
              workingDays: Number(fd.get("workingDays") ?? 26) || undefined,
            });
            if (r.ok) {
              setMsg({ ok: true, text: "Run computed" });
              router.refresh();
            } else {
              setMsg({ ok: false, text: r.error ?? "Failed" });
            }
          });
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Period *</span>
          <input name="period" required pattern="\d{4}-\d{2}" defaultValue={period} className="h-10 w-[130px] rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Working days</span>
          <input name="workingDays" inputMode="numeric" defaultValue={26} className="h-10 w-[90px] rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950" />
        </label>
        <Button type="submit" variant="primary" disabled={pending}>Compute run</Button>
        {msg ? <p className={msg.ok ? "text-[12.5px] text-pine-700" : "text-[12.5px] text-danger"} role="status">{msg.text}</p> : null}
      </form>
      {runs.length > 0 ? (
        <div className="mt-4 flex flex-col divide-y divide-paper-200">
          {runs.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <p className="w-[90px] font-mono text-[13px] font-semibold text-ink-950">{r.period}</p>
              <StatusPill tone={r.state === "disbursed" ? "ok" : r.state === "approved" ? "ok" : r.state === "computed" ? "warn" : "neutral"}>
                {r.state}
              </StatusPill>
              <p className="text-[12.5px] text-ink-500">{r.headcount} payslips</p>
              {r.net_total_cents ? (
                <p className="numeral ml-auto text-[14px] font-semibold text-ink-950"><Money cents={Number(r.net_total_cents)} /></p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

export function RunDetail({ run, slips, isAdmin, canPrepare }: {
  run: PayrollRunRow;
  slips: SlipRow[];
  isAdmin: boolean;
  canPrepare: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const totals = slips.reduce(
    (a, s) => ({
      gross: a.gross + Number(s.gross_cents),
      paye: a.paye + Number(s.paye_cents),
      shif: a.shif + Number(s.shif_cents),
      housing: a.housing + Number(s.housing_cents),
      nssf: a.nssf + Number(s.nssf_cents),
      net: a.net + Number(s.net_cents),
    }),
    { gross: 0, paye: 0, shif: 0, housing: 0, nssf: 0, net: 0 },
  );

  function disburse(how: "bank-file" | "manual" | "mpesa") {
    start(async () => {
      const r = await disbursePayrollAction({ runId: run.id, how });
      if (r.ok && "data" in r && r.data && typeof r.data === "object" && "bankFile" in r.data) {
        const d = r.data as { bankFile: string | null };
        if (d.bankFile) {
          const blob = new Blob([d.bankFile], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `payroll-${run.period}-bank-upload.csv`;
          a.click();
          URL.revokeObjectURL(url);
        }
        setMsg({ ok: true, text: `Disbursed (${how})` });
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.error ?? "Failed" });
      }
    });
  }

  return (
    <Card>
      <CardHead
        title={`Run ${run.period}`}
        sub={`${run.headcount} payslips · ${run.working_days} working days · ${run.state}`}
        action={<StatusPill tone={run.state === "draft" ? "neutral" : run.state === "computed" ? "warn" : "ok"}>{run.state}</StatusPill>}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-paper-200">
              <th className="microlabel !mb-0 py-2 pr-3">Staff</th>
              <th className="microlabel !mb-0 py-2 pr-3">Pop.</th>
              <th className="microlabel !mb-0 py-2 pr-3 text-right">Basic</th>
              <th className="microlabel !mb-0 py-2 pr-3 text-right">PAYE</th>
              <th className="microlabel !mb-0 py-2 pr-3 text-right">SHIF</th>
              <th className="microlabel !mb-0 py-2 pr-3 text-right">Housing</th>
              <th className="microlabel !mb-0 py-2 pr-3 text-right">NSSF</th>
              <th className="microlabel !mb-0 py-2 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {slips.map((s) => (
              <tr key={s.id} className="border-b border-paper-200 last:border-b-0">
                <td className="py-2.5 pr-3 font-semibold text-ink-950">{s.staff_name}</td>
                <td className="py-2.5 pr-3"><span className="rounded-pill bg-paper-100 px-2 py-0.5 font-mono text-[10px] uppercase text-ink-500">{s.population}</span></td>
                <td className="numeral py-2.5 pr-3 text-right"><Money cents={Number(s.basic_cents)} /></td>
                <td className="numeral py-2.5 pr-3 text-right text-ink-700"><Money cents={Number(s.paye_cents)} /></td>
                <td className="numeral py-2.5 pr-3 text-right text-ink-700"><Money cents={Number(s.shif_cents)} /></td>
                <td className="numeral py-2.5 pr-3 text-right text-ink-700"><Money cents={Number(s.housing_cents)} /></td>
                <td className="numeral py-2.5 pr-3 text-right text-ink-700"><Money cents={Number(s.nssf_cents)} /></td>
                <td className="numeral py-2.5 text-right font-semibold"><Money cents={Number(s.net_cents)} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-paper-300">
              <td className="py-2.5 pr-3 font-semibold text-ink-950">Totals</td>
              <td />
              <td className="numeral py-2.5 pr-3 text-right font-semibold"><Money cents={totals.gross} /></td>
              <td className="numeral py-2.5 pr-3 text-right font-semibold"><Money cents={totals.paye} /></td>
              <td className="numeral py-2.5 pr-3 text-right font-semibold"><Money cents={totals.shif} /></td>
              <td className="numeral py-2.5 pr-3 text-right font-semibold"><Money cents={totals.housing} /></td>
              <td className="numeral py-2.5 pr-3 text-right font-semibold"><Money cents={totals.nssf} /></td>
              <td className="numeral py-2.5 text-right font-semibold"><Money cents={totals.net} /></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {run.state === "computed" && isAdmin ? (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-paper-200 pt-4">
          <label className="flex min-w-[240px] flex-1 flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Sign-off reason (required)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="e.g. Verified against contracts and leave records"
              className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950"
            />
          </label>
          <Button
            variant="primary"
            disabled={pending || reason.trim().length < 4}
            onClick={() =>
              start(async () => {
                const r = await approvePayrollAction({ runId: run.id, reason: reason.trim() });
                setMsg(r.ok ? { ok: true, text: "Payroll signed off — payslips locked" } : { ok: false, text: r.error ?? "Failed" });
                if (r.ok) router.refresh();
              })
            }
          >
            Approve run
          </Button>
        </div>
      ) : null}

      {run.state === "approved" && canPrepare ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-paper-200 pt-4">
          <p className="mr-1 text-[12.5px] text-ink-700">Disburse:</p>
          <Button variant="secondary" disabled={pending} onClick={() => disburse("bank-file")}>Bank bulk-upload file</Button>
          <Button variant="ghost" disabled={pending} onClick={() => disburse("manual")}>Record manual transfers</Button>
          <Button variant="ghost" disabled={pending} onClick={() => disburse("mpesa")}>M-Pesa</Button>
        </div>
      ) : null}

      {msg ? <p className={msg.ok ? "mt-3 text-[12.5px] text-pine-700" : "mt-3 text-[12.5px] text-danger"} role="status">{msg.text}</p> : null}
    </Card>
  );
}

export function ContractsCard({ contracts, tscSeconded, staff }: {
  contracts: ContractRow[];
  tscSeconded: { id: string; name: string; role: string; tsc_no: string | null }[];
  staff: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <Card>
      <CardHead
        title="Contracts"
        sub="BOM/board-employed and term-contract staff. No contract = skipped, with a reason. TSC-seconded teachers never appear here — the state pays them."
      />
      <div className="flex flex-col divide-y divide-paper-200">
        {contracts.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-[200px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[14px] font-semibold text-ink-950">{c.staff_name}</p>
                <span className="rounded-pill bg-paper-100 px-2 py-0.5 font-mono text-[10px] uppercase text-ink-500">{c.population}</span>
                {!c.active ? <StatusPill tone="neutral">ended</StatusPill> : null}
              </div>
              <p className="mt-0.5 text-[12px] text-ink-500">
                {c.staff_role} · {c.frequency} · from {c.effective_from}
              </p>
            </div>
            <p className="numeral text-[14px] font-semibold text-ink-950"><Money cents={Number(c.basic_cents)} /></p>
          </div>
        ))}
        {contracts.length === 0 ? (
          <p className="py-4 text-[13px] text-ink-500">No contracts yet — add the first below.</p>
        ) : null}
      </div>

      {tscSeconded.length > 0 ? (
        <div className="mt-3 border-t border-paper-200 pt-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">TSC-seconded (state-paid, skipped)</p>
          <p className="mt-1.5 text-[12.5px] text-ink-700">{tscSeconded.map((t) => t.name).join(" · ")}</p>
        </div>
      ) : null}

      <ContractForm staff={staff.filter((s) => !contracts.some((c) => c.active && c.staff_id === s.id))} pending={pending}
        onSubmit={(payload) =>
          start(async () => {
            const r = await upsertContractAction(payload);
            setMsg(r.ok ? { ok: true, text: "Contract saved" } : { ok: false, text: r.error ?? "Failed" });
            if (r.ok) router.refresh();
          })
        }
      />
      {msg ? <p className={msg.ok ? "mt-2 text-[12.5px] text-pine-700" : "mt-2 text-[12.5px] text-danger"} role="status">{msg.text}</p> : null}
    </Card>
  );
}

function ContractForm({ staff, pending, onSubmit }: {
  staff: { id: string; name: string }[];
  pending: boolean;
  onSubmit: (payload: {
    staffId: string; population: "bom" | "term"; basicCents: number;
    frequency: "monthly" | "termly"; effectiveFrom: string;
  }) => void;
}) {
  const [staffId, setStaffId] = useState("");
  const [population, setPopulation] = useState<"bom" | "term">("bom");
  const [basic, setBasic] = useState("");
  const [frequency, setFrequency] = useState<"monthly" | "termly">("monthly");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      className="mt-4 grid gap-3 border-t border-paper-200 pt-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!staffId || !basic) return;
        onSubmit({ staffId, population, basicCents: Math.round(parseFloat(basic) * 100), frequency, effectiveFrom: today });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Staff *</span>
        <select value={staffId} onChange={(e) => setStaffId(e.target.value)} required className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950">
          <option value="">Choose…</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Population</span>
        <select value={population} onChange={(e) => setPopulation(e.target.value as "bom" | "term")} className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950">
          <option value="bom">BOM / board-employed</option>
          <option value="term">Term contract</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Basic (Ksh) *</span>
        <input value={basic} onChange={(e) => setBasic(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" required className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Frequency</span>
        <select value={frequency} onChange={(e) => setFrequency(e.target.value as "monthly" | "termly")} className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950">
          <option value="monthly">Monthly</option>
          <option value="termly">Termly (÷3 per month)</option>
        </select>
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" variant="secondary" disabled={pending || !staffId || !basic}>Save contract</Button>
      </div>
    </form>
  );
}
