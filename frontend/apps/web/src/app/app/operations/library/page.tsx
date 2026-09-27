import { requireSession, requireBootstrap, getLibrary, getLearners } from "@/lib/api";
import { KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { LibraryClient } from "./LibraryClient";

/**
 * Library ㉑ (docs/BUILD-PHASES.md Phase 2) — counter issue/return two taps,
 * overdue list, catalog with per-copy barcodes, most-borrowed. Fines are
 * levies through Money ⑩ — never cash at the desk.
 */
export default async function LibraryPage() {
  const me = await requireSession();
  if (!me) redirect("/login");
  if (me.principal.kind !== "staff") redirect("/app");
  await requireBootstrap();

  const [data, learners] = await Promise.all([getLibrary(), getLearners()]);
  const roster = learners.learners.filter((l) => l.status === "active").map((l) => ({ id: l.id, name: l.name }));

  return (
    <div className="flex flex-col gap-s6">
      <AppLiveBar />
      <SerifHeader
        crumb="Operations / Library"
        title="Issue in two taps, chase the overdue, never touch cash."
        sub="Catalog with per-copy barcodes, borrower limits, reservations and stock-taking. Fines ride the levy rails — the desk stays money-free."
      />
      <div className="grid gap-s4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Titles" value={"titles" in data ? data.titles : 0} />
        <KpiCard label="Copies" value={"copies" in data ? data.copies : 0} />
        <KpiCard label="On shelf" value={"on_shelf" in data ? data.on_shelf : 0} />
        <KpiCard label="Overdue" value={"overdue" in data ? data.overdue.length : 0} tone={"overdue" in data && data.overdue.length > 0 ? "warn" : "ok"} />
      </div>
      <LibraryClient
        overdue={"overdue" in data ? data.overdue : []}
        most={"most_borrowed" in data ? data.most_borrowed : []}
        learners={roster}
      />
    </div>
  );
}
