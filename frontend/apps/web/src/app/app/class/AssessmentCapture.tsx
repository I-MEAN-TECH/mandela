"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@mandela/ui";
import type { LearnerRow, LearningAreaRow, AssessmentEntryRow } from "@/lib/api";
import { recordAssessmentAction } from "@/lib/api";

/**
 * Assessment capture — CBC/CBE day-to-day recording, schema-driven:
 * learning areas come from the class's curriculum ladder (migration 008),
 * the grading keys come from the assessment scheme (BE/AE/ME/EE for CBE).
 * Radios for ≤5 known options (form standard #11); the whole class is one
 * tap-column per level — two taps per learner, same as attendance.
 */

const LEVELS = [
  { key: "BE", label: "BE", title: "Below Expectation" },
  { key: "AE", label: "AE", title: "Approaching Expectation" },
  { key: "ME", label: "ME", title: "Meeting Expectation" },
  { key: "EE", label: "EE", title: "Exceeding Expectation" },
] as const;

export function AssessmentCapture({
  classId,
  className,
  learners,
  areas,
  existing,
}: {
  classId: number;
  className: string;
  learners: LearnerRow[];
  areas: LearningAreaRow[];
  existing: AssessmentEntryRow[];
}) {
  const [areaCode, setAreaCode] = useState(areas[0]?.code ?? "");
  const [grid, setGrid] = useState<Record<string, string>>(() => {
    // prefill: existing entries for the first area
    const first = areas[0]?.code ?? "";
    const pre: Record<string, string> = {};
    for (const e of existing) {
      if (e.subject === first && e.level) pre[e.learner_id] = e.level;
    }
    return pre;
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dirty = useMemo(() => Object.keys(grid).length, [grid]);

  function pickArea(code: string) {
    setAreaCode(code);
    const pre: Record<string, string> = {};
    for (const e of existing) {
      if (e.subject === code && e.level) pre[e.learner_id] = e.level;
    }
    setGrid(pre);
    setMsg(null);
  }

  function submit() {
    const entries = Object.entries(grid)
      .filter(([learnerId, level]) => learnerId && level)
      .map(([learnerId, level]) => ({ learnerId, areaCode, level }));
    if (entries.length === 0) return;
    start(async () => {
      const res = await recordAssessmentAction({ classId, entries });
      if (res.ok) setMsg(`Recorded for ${entries.length} learner${entries.length === 1 ? "" : "s"} — done`);
      else setMsg(res.error ?? "Could not save — try again");
    });
  }

  if (areas.length === 0) {
    return (
      <p className="rounded-sm border border-dashed border-border bg-paper-100 px-3.5 py-3 text-xs text-muted">
        No learning areas are attached to this class yet — the office sets them from the curriculum (Settings).
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Learning area">
        {areas.map((a) => (
          <button
            key={a.code}
            type="button"
            onClick={() => pickArea(a.code)}
            aria-pressed={areaCode === a.code}
            className={`h-9 rounded-pill px-3.5 text-[12.5px] font-semibold ${
              areaCode === a.code ? "bg-primary text-on-primary" : "border border-border bg-surface text-text hover:bg-paper-100"
            }`}
          >
            {a.name}
          </button>
        ))}
      </div>

      <div className="mt-s3">
        {learners.map((l) => (
          <div
            key={l.id}
            className="flex items-center justify-between gap-s3 border-t border-paper-200 py-s3 first:border-t-0 first:pt-0"
          >
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold">{l.name}</p>
              <p className="font-mono text-[11.5px] text-muted">{l.admission_no}</p>
            </div>
            <div className="flex gap-1.5" role="radiogroup" aria-label={`Level for ${l.name}`}>
              {LEVELS.map((lv) => {
                const active = grid[l.id] === lv.key;
                return (
                  <button
                    key={lv.key}
                    type="button"
                    title={lv.title}
                    aria-pressed={active}
                    onClick={() =>
                      setGrid((g) => {
                        const next = { ...g };
                        if (next[l.id] === lv.key) delete next[l.id];
                        else next[l.id] = lv.key;
                        return next;
                      })
                    }
                    className={`h-9 w-11 rounded-sm text-xs font-bold transition-colors ${
                      active ? "bg-primary text-on-primary" : "border border-border bg-surface text-muted hover:bg-paper-100"
                    }`}
                  >
                    {lv.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {msg ? (
        <p role="status" className={`mt-s3 text-sm font-semibold ${msg.endsWith(" — done") ? "text-ok" : "text-danger"}`}>
          {msg}
        </p>
      ) : null}

      <div className="mt-s3 flex items-center gap-s3">
        <Button variant="primary" size="md" onClick={submit} disabled={pending || dirty === 0}>
          {pending ? "Saving…" : `Record ${dirty > 0 ? dirty : ""} ${dirty === 1 ? "entry" : "entries"}`}
        </Button>
        <span className="text-xs text-muted">{className} · this term · re-recording updates, never duplicates</span>
      </div>
    </div>
  );
}
