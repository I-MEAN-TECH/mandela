import { requireSession, requireBootstrap, getPayrollContracts, getPayrollRuns, getPayrollRun, getStaffDirectory } from "@/lib/api";
import { Card, CardHead, EmptyState, KpiCard, Money, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { ContractsCard, RunDetail, RunLauncher } from "./PayrollClient";

/**
 * Payroll ⑦ (docs/BUILD-PHASES.md Phase 2).
 * Three staff populations, one system: TSC-seconded teachers are state-paid
 * (shown, skipped with a reason); BOM/board and term-contract staff are
 * computed from versioned contracts. The bursar prepares, the admin signs
 * off with a mandatory reason, disbursement is however the school pays.
 * Roles: admin/bursar — the two payroll roles.
 */
export default async function PayrollPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  if (!["admin", "bursar"].includes(me.principal.role ?? "")) redirect("/app");
  const isAdmin = me.principal.role === "admin";

  const [contracts, runs, dir] = await Promise.all([
    getPayrollContracts(),
    getPayrollRuns(),
    getStaffDirectory(),
  ]);
  if ("error" in contracts) redirect("/app/money");
  if ("error" in runs) redirect("/app/money");

  const active = contracts.contracts.filter((c) => c.active);
  const monthlyBill = active.reduce(
    (s, c) => s + Number(c.basic_cents) / (c.frequency === "termly" ? 3 : 1),
    0,
  );

  const latestRun = runs.runs[0] ?? null;
  const detail = latestRun ? await getPayrollRun(latestRun.id) : null;
  const paidThisPeriod =
    detail && !("error" in detail) && detail.run.state === "disbursed"
      ? Number(detail.run.net_total_cents ?? 0)
      : 0;

  const staffList = ("error" in dir ? [] : (dir.staff ?? []))
    .filter((s) => s.active)
    .map((s) => ({ id: s.id, name: s.full_name }));

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / Money`}
        title={<>Payroll, signed off.</>}
        sub="The bursar prepares from real contracts; the admin signs with a reason; disbursement is a bank file, manual transfers, or M-Pesa. TSC-seconded teachers stay on the state's payroll — shown, never computed."
        actions={<AppLiveBar />}
      />

      <div className="mt-s7 grid gap-s3h">
        <div className="grid gap-s3h sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard ink label="On the school's payroll" value={active.length} note={`${contracts.tscSeconded.length} TSC-seconded · state-paid`} />
          <KpiCard label="Monthly wage bill" value={<Money cents={Math.round(monthlyBill)} />} note="basic only · termly ÷ 3" />
          <KpiCard label="Runs" value={runs.runs.length} note={latestRun ? `latest ${latestRun.period} · ${latestRun.state}` : "none yet"} />
          <KpiCard label="Disbursed this run" value={<Money cents={paidThisPeriod} />} note={latestRun?.disbursed_how ? `via ${latestRun.disbursed_how}` : "awaiting disbursement"} />
        </div>

        <div className="grid gap-s3h">
          <div className="flex min-w-0 flex-col gap-s3h">
            {detail && !("error" in detail) ? (
              <RunDetail run={detail.run} slips={detail.slips} isAdmin={isAdmin} canPrepare />
            ) : (
              <Card>
                <CardHead title="Latest run" sub="The payslip table lands here once a run is computed" />
                <EmptyState
                  title="No payroll run yet"
                  body="Set the contracts on the right, then compute this month's run — statutory deductions (PAYE, SHIF, housing, NSSF) come from versioned rate tables, not hardcoded guesses."
                />
              </Card>
            )}
            <RunLauncher runs={runs.runs} canPrepare />
          </div>
          <ContractsCard contracts={contracts.contracts} tscSeconded={contracts.tscSeconded} staff={staffList} canEdit />
        </div>
      </div>
    </div>
  );
}
