import type { TimetableData } from "@/lib/api";

/**
 * Timetable print doc — the class week as a finished A4 sheet for the
 * classroom wall. `orientation` switches @page via the `print-orientation`
 * class (globals.css): portrait fits the classic tall grid; landscape gives
 * each day a wide column for handwritten notes.
 */

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** Non-lesson kinds print as shaded, italic day-structure entries. */
const KIND_LABEL: Record<string, string> = {
  tea: "Tea break",
  lunch: "Lunch",
  games: "Games",
  home: "Home time",
};

export function TimetablePrintDoc({
  data,
  classId,
  orientation,
  schoolName,
  termLabel,
}: {
  data: TimetableData;
  classId: number;
  orientation: "portrait" | "landscape";
  schoolName: string;
  termLabel: string;
}) {
  const cls = data.classes.find((c) => c.id === classId);
  const grid = new Map<string, TimetableData["slots"][number]>();
  for (const s of data.slots) {
    if (s.class_id === classId && s.active) grid.set(`${s.day_of_week}-${s.period}`, s);
  }

  return (
    <div
      data-doc=""
      className={`timetable-print mx-auto bg-white p-6 text-ink-950 ${orientation === "landscape" ? "print-orientation-landscape" : "print-orientation-portrait"}`}
      style={{ maxWidth: orientation === "landscape" ? 1050 : 720 }}
    >
      <header className="border-b-2 border-ink-950 pb-3 text-center">
        <h1 className="font-display text-2xl font-bold">{schoolName}</h1>
        <p className="mt-1 text-sm text-ink-600">
          {termLabel} · Class timetable — <strong>{cls?.name ?? "—"}</strong>
        </p>
      </header>

      <table className="mt-5 w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            <th className="border border-ink-300 bg-paper-100 px-2 py-2 text-left font-semibold">Period</th>
            {DAYS.map((d) => (
              <th key={d} className="border border-ink-300 bg-paper-100 px-2 py-2 text-left font-semibold">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 9 }, (_, p) => p + 1).map((period) => (
            <tr key={period}>
              <td className="border border-ink-300 px-2 py-2 font-mono font-semibold">{period}</td>
              {DAYS.map((_, di) => {
                const day = di + 1;
                const slot = grid.get(`${day}-${period}`);
                const kind = slot && slot.slot_kind !== "lesson" ? slot.slot_kind : null;
                return (
                  <td
                    key={day}
                    className={`border border-ink-300 px-2 py-2 align-top ${kind ? "bg-paper-100 italic" : ""}`}
                  >
                    {slot ? (
                      kind ? (
                        <span className="block font-semibold text-ink-700">{KIND_LABEL[kind] ?? slot.area_name ?? "Break"}</span>
                      ) : (
                        <>
                          <span className="block font-semibold">{slot.area_name ?? "—"}</span>
                          <span className="block text-[11px] text-ink-600">
                            {slot.teacher_name ?? "—"}{slot.room ? ` · ${slot.room}` : ""}
                            {slot.starts_at ? ` · ${slot.starts_at}${slot.ends_at ? `–${slot.ends_at}` : ""}` : ""}
                          </span>
                        </>
                      )
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="mt-4 flex items-center justify-between text-[10.5px] text-ink-500">
        <span>Printed {new Date().toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}</span>
        <span>Class teacher: ______________________</span>
      </footer>
    </div>
  );
}
