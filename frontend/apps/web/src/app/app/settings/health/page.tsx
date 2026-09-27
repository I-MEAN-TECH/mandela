import { requireSession, requireBootstrap, getSchoolHealth } from "@/lib/api";
import { Card, CardHead, EmptyState, KpiCard, SerifHeader, StatusPill } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";

/**
 * School health (§7.7 #11, System completion B2) — who has actually started
 * on Mandela, per role. Not a system-health dashboard: the question is
 * "is the team ON the platform" — started = signed in once (staff.joined).
 * Admin-only; the Team card on /app/settings/users covers the invite flow,
 * this is the adoption picture behind it.
 */
export default async function SchoolHealthPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  if (me.principal.role !== "admin") redirect("/app");
  const health = await getSchoolHealth();

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / Settings`}
        title={<>Is the team on?</>}
        sub="Activation per staff member — who has signed in, who the invite is still waiting for."
        actions={
          <div className="flex items-center gap-s2">
            <a
              href="/api/pdf?kind=board-pack"
              className="rounded-sm border border-border px-s2 py-s1 text-[13px] hover:bg-paper-100"
            >
              Board pack PDF
            </a>
            <AppLiveBar />
          </div>
        }
      />

      {"error" in health ? (
        <div className="mt-s7">
          <EmptyState title="Could not load health" body={health.error} />
        </div>
      ) : (
        <div className="mt-s7 grid gap-s3h">
          <div className="grid grid-cols-2 gap-s3 sm:grid-cols-3">
            <KpiCard ink label="On the books" value={String(health.totals.staff)} note={`${health.totals.started} started`} />
            <KpiCard tone="ok" label="Started" value={String(health.totals.started)} note="signed in at least once" />
            <KpiCard tone={health.totals.pending > 0 ? "warn" : "ok"} label="Pending" value={String(health.totals.pending)} note="invite not yet used" />
          </div>

          <Card>
            <CardHead title="By role" sub="Started of total, per role" />
            {health.by_role.length === 0 ? (
              <EmptyState title="No staff yet" body="Add the team from Settings → Team." />
            ) : (
              <ul className="grid gap-s2 sm:grid-cols-2 lg:grid-cols-3">
                {health.by_role.map((r) => {
                  const pct = r.total > 0 ? Math.round((r.started / r.total) * 100) : 0;
                  return (
                    <li key={r.role} className="rounded-sm border border-border bg-paper-50 px-s3 py-s2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold capitalize text-ink-950">{r.role.replaceAll("_", " ")}</span>
                        <StatusPill tone={pct === 100 ? "ok" : pct > 0 ? "warn" : "neutral"}>{r.started}/{r.total}</StatusPill>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-pill bg-paper-200">
                        <div className="h-full rounded-pill bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <div className="grid gap-s3h lg:grid-cols-2">
            <Card>
              <CardHead title="Started" sub="On the platform — with duties held" />
              {health.started.length === 0 ? (
                <EmptyState title="Nobody yet" body="Share the join code from Settings → Team." />
              ) : (
                <ul className="grid gap-1.5 text-[13px] text-ink-900">
                  {health.started.map((p) => (
                    <li key={p.staff_id} className="flex items-center justify-between gap-s2 rounded-sm border border-border bg-paper-50 px-s3 py-s2">
                      <span className="min-w-0 truncate font-medium">{p.name}</span>
                      <span className="shrink-0 font-mono text-[11.5px] text-muted">{p.role.replaceAll("_", " ")}{p.duties > 0 ? ` · ${p.duties} ${p.duties === 1 ? "duty" : "duties"}` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHead title="Pending" sub="Invite sent, first sign-in not yet happened" />
              {health.pending.length === 0 ? (
                <EmptyState title="All aboard" body="Every staff member has started." />
              ) : (
                <ul className="grid gap-1.5 text-[13px] text-ink-900">
                  {health.pending.map((p) => (
                    <li key={p.staff_id} className="flex items-center justify-between gap-s2 rounded-sm border border-border bg-paper-50 px-s3 py-s2">
                      <span className="min-w-0 truncate font-medium">{p.name}</span>
                      <span className="shrink-0 font-mono text-[11.5px] text-muted">{p.role.replaceAll("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
