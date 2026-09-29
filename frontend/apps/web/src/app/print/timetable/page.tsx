import { fetchPrintPayload } from "@/lib/printFetch";
import type { TimetableData } from "@/lib/api";
import { TimetablePrintDoc } from "./TimetablePrintDoc";
import { PrintButton } from "../PrintButton";

/**
 * Timetable print view — the class week as a wall-ready A4. The office picks
 * the orientation when opening: portrait (tall grid) or landscape (wide
 * columns), and the browser's print dialog — or Save as PDF — produces the
 * physical copy classrooms pin up.
 */
export default async function TimetablePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; orientation?: string }>;
}) {
  const sp = await searchParams;
  const classId = Number(sp.classId);
  const orientation = sp.orientation === "landscape" ? "landscape" : "portrait";

  if (!Number.isFinite(classId) || classId <= 0) {
    return (
      <main className="mx-auto max-w-[720px] px-8 py-24">
        <p className="font-display text-xl font-bold text-ink-950">Timetable unavailable</p>
        <p className="mt-2 text-sm text-ink-500">Open it from the Timetable screen.</p>
      </main>
    );
  }

  const [data, school] = await Promise.all([
    fetchPrintPayload<TimetableData>(`/web/admin/timetable`),
    fetchPrintPayload<{ name: string }>(`/web/settings`),
  ]);

  if ("error" in data) {
    return (
      <main className="mx-auto max-w-[720px] px-8 py-24">
        <p className="font-display text-xl font-bold text-ink-950">Timetable unavailable</p>
        <p className="mt-2 text-sm text-ink-500">{data.error} — open it from the Timetable screen.</p>
      </main>
    );
  }

  const schoolName = (!("error" in school) && school?.name) || "School";

  return (
    <main className="bg-surface px-4 py-6 print:p-0">
      <TimetablePrintDoc
        data={data}
        classId={classId}
        orientation={orientation}
        schoolName={schoolName}
        termLabel="This term"
      />
      <PrintButton />
    </main>
  );
}
