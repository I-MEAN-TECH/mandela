"use client";

import { useState, useTransition } from "react";
import { Button } from "@mandela/ui";
import type { RosterRow } from "@/lib/api";
import { queueOfflineOp } from "@/components/SyncBanner";

const CHOICES = ["present", "late", "absent", "excused"] as const;

export function MarkButtons({
  roster,
  action,
}: {
  roster: RosterRow[];
  action: (marks: { learnerId: string; mark: string }[]) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [marks, setMarks] = useState<Record<string, string>>(
    Object.fromEntries(roster.map((r) => [r.id, r.mark ?? "present"])),
  );
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function set(learnerId: string, mark: string) {
    setMarks((m) => ({ ...m, [learnerId]: mark }));
    setSaved(false);
  }

  function saveAll() {
    start(async () => {
      const payload = Object.entries(marks).map(([learnerId, mark]) => ({ learnerId, mark }));
      if (!navigator.onLine) {
        // Flank #5: attendance is allowlisted for the offline outbox. The
        // SyncBanner shows the queued state and flushes when back online.
        queueOfflineOp("attendance.mark", { marks: payload });
        setSaved(true);
        return;
      }
      await action(payload);
      setSaved(true);
    });
  }

  const counts = CHOICES.map((c) => ({ c, n: Object.values(marks).filter((m) => m === c).length }));

  return (
    <div>
      {/* live counts — the roster's answer at a glance */}
      <div className="mb-s3 flex flex-wrap gap-2">
        {counts.map(({ c, n }) => (
          <span
            key={c}
            className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold capitalize ${
              c === "present" && n > 0
                ? "bg-ok-bg text-ok"
                : c === "absent" && n > 0
                  ? "bg-danger-bg text-danger"
                  : "bg-paper-100 text-muted"
            }`}
          >
            {c} · {n}
          </span>
        ))}
      </div>

      <ul className="divide-y divide-paper-200">
        {roster.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-s2 py-s3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.name}</p>
              <p className="font-mono text-[11.5px] text-muted">{r.admission_no}</p>
            </div>
            <div className="flex gap-1" role="group" aria-label={`Mark ${r.name}`}>
              {CHOICES.map((c) => (
                <button
                  key={c}
                  onClick={() => set(r.id, c)}
                  aria-pressed={marks[r.id] === c}
                  className={`h-10 min-w-tap rounded-pill px-s3 text-xs font-semibold capitalize ${
                    marks[r.id] === c
                      ? c === "present"
                        ? "bg-ok text-white"
                        : c === "absent"
                          ? "bg-danger text-white"
                          : "bg-primary text-on-primary"
                      : "bg-paper-100 text-muted hover:text-text"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-s5 flex items-center gap-s3">
        <Button variant="primary" size="lg" onClick={saveAll} disabled={pending}>
          {pending ? "Saving…" : "Save attendance"}
        </Button>
        {saved && !pending ? (
          <span className="text-sm font-semibold text-ok" role="status">
            {typeof navigator !== "undefined" && !navigator.onLine ? "Queued — syncs when back online" : "Saved"}
          </span>
        ) : null}
      </div>
    </div>
  );
}
