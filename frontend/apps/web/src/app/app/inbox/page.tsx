import { requireSession, requireBootstrap, getApprovals, getTasks, getStaffDirectory } from "@/lib/api";
import { KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../LiveBar";
import { RequestForm, ApprovalsBoard, TasksBoard } from "./InboxClient";

/**
 * Inbox — Approvals (36) + Tasks (37) under one roof (blueprint 215 folds
 * them into one Inbox tab; the calm-IA structure lands here first). The
 * two-leaders hinge: requests wait in ONE queue, decisions carry a mandatory
 * reason, tasks are the operating rhythm.
 */
export default async function InboxPage() {
  const me = await requireSession();
  if (me.principal.kind !== "staff") redirect("/app");
  const boot = await requireBootstrap();
  const canDecide = me.principal.role === "admin" || me.principal.role === "principal";
  const [apr, tsk, dir] = await Promise.all([getApprovals(), getTasks(), getStaffDirectory()]);
  const pending = "error" in apr ? [] : apr.pending;
  const decided = "error" in apr ? [] : apr.decided;
  const openTasks = "error" in tsk ? [] : tsk.open;
  const doneTasks = "error" in tsk ? [] : tsk.done;
  const staff = "error" in dir ? [] : (dir.staff ?? []).filter((s) => s.active).map((s) => ({ id: s.id, name: s.full_name }));

  const oldest = pending.length > 0 ? Math.max(...pending.map((p) => p.age_days)) : null;
  const overdue = openTasks.filter((t) => t.days_left !== null && t.days_left < 0).length;
  const doneWeek = doneTasks.length;

  return (
    <>
      <SerifHeader
        crumb={`${boot.school.name} / Today`}
        title={<>The inbox.</>}
        sub="Every request needing a sign-off, every follow-up the system asks of you — one queue, one rhythm."
        actions={<AppLiveBar />}
      />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard ink label="Waiting decisions" value={pending.length} note={oldest !== null && oldest > 0 ? `oldest ${oldest}d` : "queue clear"} />
        <KpiCard label="Open tasks" value={openTasks.length} />
        <KpiCard label="Overdue tasks" value={overdue} tone={overdue > 0 ? "danger" : "neutral"} />
        <KpiCard label="Done this week" value={doneWeek} tone="ok" />
      </div>

      <div className="mt-6 grid gap-6">
        <ApprovalsBoard pending={pending} decided={decided} canDecide={canDecide} meName={me.principal.full_name} />
        <TasksBoard open={openTasks} done={doneTasks} canEdit={canDecide} staff={staff} />
        <RequestForm />
      </div>
    </>
  );
}
