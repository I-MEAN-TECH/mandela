import { requireSession, requireBootstrap, getEvents } from "@/lib/api";
import { KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { EventsClient } from "./EventsClient";
import { CalendarList } from "./CalendarList";

/**
 * Events & Calendar (docs/BUILD-PHASES.md Phase 2) — the term calendar:
 * events, exam windows, open days and holidays, feeding guardian
 * announcements. One audited add-event form.
 */
export default async function EventsPage() {
  const me = await requireSession();
  if (!me) redirect("/login");
  if (me.principal.kind !== "staff") redirect("/app");
  if (!["admin", "principal", "teacher", "dorm_parent", "janitor", "librarian", "patron", "hod"].includes(me.principal.role ?? "")) redirect("/app");
  await requireBootstrap();

  const data = await getEvents();
  const rows = "rows" in data ? data.rows : [];
  const canEdit = me.principal.role === "admin" || me.principal.role === "principal" || me.principal.role === "teacher";
  const now = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const upcoming = rows.filter((e) => e.starts_on >= now);
  const next7 = upcoming.filter((e) => e.starts_on <= in7);

  return (
    <div className="flex flex-col gap-s6">
      <AppLiveBar />
      <SerifHeader
        crumb="Operations / Calendar"
        title="Events & Calendar"
        sub="The term calendar everyone plans around — fixtures, festivals, exam windows, open days. Guardians see what concerns them."
      />

      <div className="grid gap-s4 sm:grid-cols-3">
        <KpiCard label="On the calendar" value={rows.length} note="last 60 days forward" />
        <KpiCard label="Next 7 days" value={next7.length} tone={next7.length > 0 ? "warn" : "ok"} />
        <KpiCard label="Upcoming" value={upcoming.length} />
      </div>

      <CalendarList rows={rows} canEdit={canEdit} />

      <EventsClient />
    </div>
  );
}
