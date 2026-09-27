import { requireSession, requireBootstrap, getInsights, type InsightsData } from "@/lib/api";
import { Card, CardHead, KpiCard, Meter, Money, DataTable, EmptyState, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { noun } from "@/lib/plural";
import { AiDrafts } from "./AiDrafts";

/** Insights — the school's health on one screen, every number from the DB. */
export default async function InsightsPage() {
  const me = await requireSession();
  await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  const data = (await getInsights()) as InsightsData;

  if ("error" in data) {
    return (
      <EmptyState title="Insights unavailable" body="The school database did not respond. Try again shortly." />
    );
  }

  const totalBilled = data.collection.reduce((s, c) => s + Number(c.billed_cents), 0);
  const totalPaid = data.collection.reduce((s, c) => s + Number(c.paid_cents), 0);
  const rate = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;
  const waRate = Number(data.learners.active) > 0
    ? Math.round((Number(data.guardians.wa) / Math.max(Number(data.guardians.total), 1)) * 100)
    : 0;
  const max7 = Math.max(...data.attendance7.map((d) => Number(d.total)), 1);

  return (
    <div>
      <SerifHeader
        crumb="School / This term"
        title={<>Is the school healthy?</>}
        sub="People, money and mood — the term's vital signs in one view."
      />

      <div className="mt-s7 grid gap-s3h">
        <div className="grid gap-s3h sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard ink label="Active learners" value={data.learners.active} note={`${data.learners.boarding} boarding`} />
          <KpiCard label="Collection rate" tone={rate >= 80 ? "ok" : rate >= 50 ? "warn" : "danger"} value={<>{rate}<span className="text-xl font-medium text-ink-500">%</span></>} note="of billed this term" meter={{ value: rate, ok: rate >= 80 }} />
          <KpiCard label="Parents on WhatsApp" value={<>{waRate}<span className="text-xl font-medium text-ink-500">%</span></>} note={`${data.guardians.total} ${noun(Number(data.guardians.total), "guardian")} connected`} />
          <KpiCard label="Money" tone="neutral" value={<Money cents={totalPaid} />} note={`collected of ${new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(totalBilled / 100)} billed`} />
        </div>

        <Card>
          <CardHead title="Attendance — last 7 days" sub="Present rate per day" />
          {data.attendance7.length === 0 ? (
            <EmptyState title="No marks yet" body="Attendance appears here the moment teachers start marking." />
          ) : (
            <>
              <div className="flex h-32 items-end gap-2.5">
                {data.attendance7.map((d, i) => {
                  const pct = Math.round((Number(d.present) / Math.max(Number(d.total), 1)) * 100);
                  const h = Math.round((Number(d.total) / max7) * 100);
                  return (
                    <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                      <div className="flex w-full flex-1 items-end">
                        <div
                          aria-hidden
                          className="w-full rounded-md rounded-b-sm bg-primary"
                          style={{ height: `${Math.max(h, 4)}%`, opacity: 0.35 + 0.65 * (pct / 100) }}
                          title={`${d.day}: ${d.present}/${d.total}`}
                        />
                      </div>
                      <span className="font-mono text-[9.5px] text-muted">{d.day}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-s5">
                <DataTable
                  columns={[
                    { key: "day", title: "Day" },
                    { key: "present", title: "Present", align: "right" },
                    { key: "total", title: "Marked", align: "right" },
                    { key: "pct", title: "Rate", align: "right" },
                  ]}
                  rows={data.attendance7.map((d) => ({
                    day: d.day,
                    present: d.present,
                    total: d.total,
                    pct: `${Math.round((Number(d.present) / Math.max(Number(d.total), 1)) * 100)}%`,
                  }))}
                />
              </div>
            </>
          )}
        </Card>

        <AiDrafts />
      </div>
    </div>
  );
}
