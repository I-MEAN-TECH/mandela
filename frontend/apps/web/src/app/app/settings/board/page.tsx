import { requireSession, requireBootstrap, getBoard } from "@/lib/api";
import { KpiCard, SerifHeader, StatusPill } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { BoardClient } from "./BoardClient";

/**
 * Board & BOM ㊶ (docs/BUILD-PHASES.md Phase 2) — members with offices and
 * term expiries, meetings with agenda + minutes-in-brief, and the decisions
 * register where every decision carries an owner and a due date. The board
 * never logs in — the term pack is printable (Spending data joins in Phase 3).
 */
export default async function BoardPage() {
  const me = await requireSession();
  if (!me) redirect("/login");
  if (me.principal.kind !== "staff") redirect("/app");
  if (!["admin", "principal"].includes(me.principal.role ?? "")) redirect("/app");
  await requireBootstrap();

  const data = await getBoard();
  const members = "members" in data ? data.members : [];
  const meetings = "meetings" in data ? data.meetings : [];
  const openItems = meetings.flatMap((m) => m.items).filter((i) => i.status === "open").length;
  const now = new Date().toISOString().slice(0, 10);
  const expiring = members.filter((m) => m.term_end && m.term_end >= now && m.term_end <= new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)).length;

  return (
    <div className="flex flex-col gap-s6">
      <AppLiveBar />
      <SerifHeader
        crumb="Settings / Board & BOM"
        title="The board governs; the pack speaks."
        sub="Members and offices, meetings with minutes-in-brief, and a decisions register where every decision has an owner and a due date — chased onto Tasks until closed. The board never logs in."
        actions={
          <a
            href="/api/pdf?kind=board-pack"
            className="inline-flex h-11 items-center rounded-pill bg-primary px-5 text-[13px] font-semibold text-on-primary hover:bg-primary-hover"
          >
            Board pack PDF
          </a>
        }
      />
      <div className="grid gap-s4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Board members" value={members.filter((m) => m.active).length} />
        <KpiCard label="Meetings recorded" value={meetings.length} />
        <KpiCard label="Open decisions" value={openItems} tone={openItems > 0 ? "warn" : "ok"} />
        <KpiCard label="Terms expiring (90d)" value={expiring} tone={expiring > 0 ? "warn" : "neutral"} />
      </div>
      <BoardClient members={members} meetings={meetings} />
    </div>
  );
}
