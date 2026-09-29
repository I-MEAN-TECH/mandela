import { requireSession, requireBootstrap, getTimetable } from "@/lib/api";
import { KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { TimetableClient } from "./TimetableClient";

/**
 * Timetable ⑲ (docs/BUILD-PHASES.md Phase 3) — the period grid per class
 * with the teacher-clash guard. Leaders edit; every staff account reads.
 * Non-lesson slots (tea break, lunch, games, home time) are day structure:
 * they fill the week but don't count against teaching coverage.
 */
export default async function TimetablePage() {
  const me = await requireSession();
  if (!me) redirect("/login");
  if (me.principal.kind !== "staff") redirect("/app");
  await requireBootstrap();

  const tt = await getTimetable();
  if ("error" in tt) {
    return (
      <div className="flex flex-col gap-s6">
        <AppLiveBar />
        <SerifHeader crumb="Academics / Timetable" title="Timetable" />
        <p className="text-[13px] text-danger">Could not load the grid — is the API up?</p>
      </div>
    );
  }

  const active = tt.slots.filter((s) => s.active);
  const canEdit = me.principal.role === "admin" || me.principal.role === "principal";
  const filled = new Set(active.map((s) => `${s.class_id}-${s.day_of_week}-${s.period}`)).size;
  const capacity = tt.classes.length * 5 * 9; // Mon-Fri × 9 periods
  const lessons = active.filter((s) => s.slot_kind === "lesson");
  const taught = new Set(lessons.map((s) => s.teacher_id).filter(Boolean)).size;
  const breaks = active.length - lessons.length;

  return (
    <div className="flex flex-col gap-s6">
      <AppLiveBar />
      <SerifHeader
        crumb="Academics / Timetable"
        title="Timetable"
        sub="The period grid per class. Pick a class, fill its week — lessons or day structure (tea break, lunch, games, home time). Double-booking a teacher is refused loudly, with the clashing class named."
      />

      <div className="grid gap-s4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Slots filled" value={filled} note={`of ${capacity} possible (Mon–Fri × 9)`} meter={{ value: capacity ? Math.round((filled / capacity) * 100) : 0, ok: true }} />
        <KpiCard label="Classes" value={tt.classes.length} note="each with its own week" />
        <KpiCard label="Teachers timetabled" value={taught} note={`${tt.teachers.length} active on the register`} />
        <KpiCard
          label="Teaching coverage"
          value={`${capacity ? Math.round((lessons.length / capacity) * 100) : 0}%`}
          note={breaks ? `${breaks} break${breaks === 1 ? "" : "s"} set aside — breaks don't count` : filled === 0 ? "empty grid — start with Period 1, Monday" : "lessons only; breaks excluded"}
        />
      </div>

      <TimetableClient data={tt} canEdit={canEdit} />
    </div>
  );
}
