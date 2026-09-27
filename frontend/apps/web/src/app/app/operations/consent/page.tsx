import { requireSession, requireBootstrap, getMediaConsent } from "@/lib/api";
import { KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { ConsentDesk } from "./ConsentDesk";

/**
 * Media & photo consent desk (flank #7) — photos of minors are DPA-sensitive.
 * One row per guardian+learner: granted, declined or not yet asked. The desk
 * makes the coverage count loud and every change dated and auditable.
 */
export default async function ConsentPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  if (!["admin", "principal", "secretary", "teacher"].includes(me.principal.role ?? "")) redirect("/app");

  const c = await getMediaConsent();
  const rows = c && "rows" in c ? c.rows : [];
  const counts: { granted: string; declined: string; unasked: string } =
    c && "counts" in c && c.counts && typeof c.counts === "object"
      ? (c.counts as { granted: string; declined: string; unasked: string })
      : { granted: "0", declined: "0", unasked: "0" };
  const total = Number(counts.granted) + Number(counts.declined) + Number(counts.unasked);
  const pct = total ? Math.round((Number(counts.granted) / total) * 100) : 0;

  return (
    <>
      <SerifHeader
        crumb={`${boot.school.name} / Operations`}
        title="Media consent"
        sub="Who may appear in photos and on the website — recorded, dated, provable."
        actions={<AppLiveBar />}
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard ink label="Decided" value={Number(counts.granted) + Number(counts.declined)} note={`${total} pairs total`} />
        <KpiCard tone="ok" label="Granted" value={Number(counts.granted)} note="may appear in media" />
        <KpiCard tone="warn" label="Declined" value={Number(counts.declined)} note="blur or exclude" />
        <KpiCard label="Not yet asked" value={Number(counts.unasked)} note={`${pct}% granted so far`} />
      </div>

      <div className="mt-6">
        <ConsentDesk rows={rows} />
      </div>
    </>
  );
}
