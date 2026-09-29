"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, StatusPill } from "@mandela/ui";
import {
  createInquiryAction,
  moveInquiryStageAction,
  convertInquiryAction,
  type InquiryRow,
} from "@/lib/api";

/**
 * Admissions ③ — the front desk funnel (docs/BUILD-PHASES.md Phase 1).
 * One board: every family on file, staged left-to-right; the desk moves
 * stages in a tap and ENROLMENT is one audited conversion that mints the
 * admission number and auto-links siblings by the parent phone.
 * Forms follow docs/FORM-STANDARDS.md: one column, labels above inputs,
 * phone validated in one human way (2547XXXXXXXX), nothing hidden.
 */

const STAGES = [
  { key: "inquiry", label: "Inquiry" },
  { key: "visit", label: "Visit" },
  { key: "assessment", label: "Assessment" },
  { key: "offered", label: "Offered" },
  { key: "enrolled", label: "Enrolled" },
] as const;

const STAGE_TONES: Record<string, "ok" | "warn" | "neutral" | "danger"> = {
  inquiry: "neutral",
  visit: "neutral",
  assessment: "neutral",
  offered: "warn",
  enrolled: "ok",
  lost: "danger",
};

export type InquiryFilters = { query?: string; stage?: string; level?: string; curriculum?: string; source?: string; followup?: "all" | "due" | "none" };
type FilterableInquiry = Pick<InquiryRow, "child_first" | "child_last" | "parent_name" | "phone" | "level_interest" | "curriculum_code" | "source" | "stage" | "next_followup_on">;

export function filterInquiries<T extends FilterableInquiry>(rows: T[], filters: InquiryFilters): T[] {
  const term = filters.query?.trim().toLowerCase() ?? "";
  return rows.filter((row) => {
    if (filters.stage && row.stage !== filters.stage) return false;
    if (filters.level && row.level_interest !== filters.level) return false;
    if (filters.curriculum && row.curriculum_code !== filters.curriculum) return false;
    if (filters.source && row.source !== filters.source) return false;
    if (filters.followup === "due" && !row.next_followup_on) return false;
    if (filters.followup === "none" && row.next_followup_on) return false;
    return !term || `${row.child_first} ${row.child_last} ${row.parent_name} ${row.phone}`.toLowerCase().includes(term);
  });
}

export function FunnelBoard({ rows, classes }: { rows: InquiryRow[]; classes: { id: number; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [moving, setMoving] = useState<InquiryRow | null>(null);

  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("");
  const [level, setLevel] = useState("");
  const [curriculum, setCurriculum] = useState("");
  const [source, setSource] = useState("");
  const [followup, setFollowup] = useState<InquiryFilters["followup"]>("all");
  const filtered = useMemo(() => filterInquiries(rows, { query, stage, level, curriculum, source, followup }), [rows, query, stage, level, curriculum, source, followup]);
  const levels = useMemo(() => [...new Set(rows.map((row) => row.level_interest).filter((value): value is string => Boolean(value)))].sort(), [rows]);
  const curricula = useMemo(() => [...new Set(rows.map((row) => row.curriculum_code).filter((value): value is string => Boolean(value)))].sort(), [rows]);
  const sources = useMemo(() => [...new Set(rows.map((row) => row.source).filter(Boolean))].sort(), [rows]);

  function move(id: string, stage: string) {
    start(async () => {
      const r = await moveInquiryStageAction({ id, stage });
      setMsg(r.ok ? "Stage updated" : r.error ?? "Failed");
      if (r.ok) router.refresh();
    });
  }

  return (
    <Card>
      <CardHead title="Admissions register" sub={`${filtered.length} of ${rows.length} families shown. Filter the register, then progress a row.`} />
      <div className="grid gap-2 border-b border-paper-200 py-s4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Admissions filters">
        <FilterLabel label="Search family"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Child, parent or phone" /></FilterLabel>
        <FilterLabel label="Stage"><select value={stage} onChange={(event) => setStage(event.target.value)}><option value="">All stages</option>{[...STAGES, { key: "lost", label: "Lost" }].map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></FilterLabel>
        <FilterLabel label="Level"><select value={level} onChange={(event) => setLevel(event.target.value)}><option value="">All levels</option>{levels.map((item) => <option key={item} value={item}>{item}</option>)}</select></FilterLabel>
        <FilterLabel label="Curriculum"><select value={curriculum} onChange={(event) => setCurriculum(event.target.value)}><option value="">All curricula</option>{curricula.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select></FilterLabel>
        <FilterLabel label="Source"><select value={source} onChange={(event) => setSource(event.target.value)}><option value="">All sources</option>{sources.map((item) => <option key={item} value={item}>{item}</option>)}</select></FilterLabel>
        <FilterLabel label="Follow-up"><select value={followup} onChange={(event) => setFollowup(event.target.value as InquiryFilters["followup"])}><option value="all">All follow-up states</option><option value="due">Follow-up set</option><option value="none">No follow-up</option></select></FilterLabel>
      </div>
      {filtered.length === 0 ? <p className="py-s5 text-[13px] text-ink-500">No family matches these filters.</p> : <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead><tr className="border-b border-border">{["Family", "Stage", "Level", "Curriculum", "Source", "Follow-up", "Actions"].map((heading) => <th key={heading} className="microlabel px-s3 py-s3 text-left">{heading}</th>)}</tr></thead><tbody>{filtered.map((r) => { const next = STAGES[STAGES.findIndex((item) => item.key === r.stage) + 1]; return <tr key={r.id} className="border-b border-paper-200 last:border-0 hover:bg-paper-50"><td className="px-s3 py-s3"><p className="font-semibold text-ink-950">{r.child_first} {r.child_last}</p><p className="text-[11.5px] text-ink-500">{r.parent_name} · {r.phone}</p></td><td className="px-s3 py-s3"><StatusPill tone={STAGE_TONES[r.stage] ?? "neutral"}>{r.stage === "enrolled" && r.admission_no ? r.admission_no : r.stage}</StatusPill></td><td className="px-s3 py-s3 text-ink-700">{r.level_interest ?? "—"}</td><td className="px-s3 py-s3 text-ink-700">{r.curriculum_code?.toUpperCase() ?? "—"}</td><td className="px-s3 py-s3 text-ink-700">{r.source}</td><td className="px-s3 py-s3 text-ink-700">{r.next_followup_on ?? "—"}</td><td className="px-s3 py-s3"><div className="flex justify-end gap-1.5 whitespace-nowrap">{next ? <Button size="sm2" variant="secondary" disabled={pending} onClick={() => next.key === "enrolled" ? setMoving(r) : move(r.id, next.key)}>{next.key === "enrolled" ? "Enrol" : `Move to ${next.label}`}</Button> : null}{r.stage !== "enrolled" && r.stage !== "lost" ? <Button size="sm2" variant="ghost" disabled={pending} onClick={() => move(r.id, "lost")}>Lost</Button> : null}</div></td></tr>; })}</tbody></table></div>}
      {/*
      <div className="mt-1 overflow-x-auto pb-2">
        <div className="flex min-w-[900px] gap-3">
          {STAGES.map((s) => {
            const list = byStage.get(s.key) ?? [];
            return (
              <div key={s.key} className="flex-1 rounded bg-paper-50 p-2.5">
                <p className="px-1 pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">
                  {s.label} · {list.length}
                </p>
                <div className="flex flex-col gap-2">
                  {list.map((r) => (
                    <div key={r.id} className="rounded-sm border border-paper-200 bg-surface p-3 shadow-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-semibold text-ink-950">
                            {r.child_first} {r.child_last}
                          </p>
                          <p className="truncate text-[11.5px] text-ink-500">{r.parent_name} · {r.phone}</p>
                        </div>
                        {r.stage === "enrolled" ? (
                          <StatusPill tone="ok">{r.admission_no}</StatusPill>
                        ) : r.stage === "lost" ? (
                          <StatusPill tone="danger">Lost</StatusPill>
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-ink-500">
                        {r.level_interest ? <span className="rounded-pill bg-paper-100 px-2 py-0.5">{r.level_interest}</span> : null}
                        {r.curriculum_code ? <span className="rounded-pill bg-paper-100 px-2 py-0.5">{r.curriculum_code.toUpperCase()}</span> : null}
                        {r.siblings > 0 ? (
                          <span className="rounded-pill bg-pine-100 px-2 py-0.5 font-semibold text-pine-800">
                            {r.siblings} {r.siblings === 1 ? "sibling" : "siblings"}
                          </span>
                        ) : null}
                        {r.next_followup_on ? <span className="rounded-pill bg-paper-100 px-2 py-0.5">follow-up {r.next_followup_on}</span> : null}
                      </div>
                      {r.stage !== "enrolled" && r.stage !== "lost" ? (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          {(() => {
                            const idx = STAGES.findIndex((x) => x.key === r.stage);
                            const nextStage = STAGES[idx + 1];
                            return nextStage ? (
                              <Button
                                variant="secondary"
                                disabled={pending}
                                onClick={() => (nextStage.key === "enrolled" ? setMoving(r) : move(r.id, nextStage.key))}
                              >
                                {nextStage.key === "enrolled" ? "Enrol…" : `→ ${nextStage.label}`}
                              </Button>
                            ) : null;
                          })()}
                          <Button variant="ghost" disabled={pending} onClick={() => move(r.id, "lost")}>
                            Lost
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {list.length === 0 ? (
                    <p className="px-1 py-2 text-[11.5px] text-ink-500">Empty</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      */}
      {msg ? <p className="mt-2 text-[12.5px] text-ink-700" role="status">{msg}</p> : null}
      {moving ? (
        <EnrolDialog
          row={moving}
          classes={classes}
          onClose={() => setMoving(null)}
          onDone={(text) => {
            setMoving(null);
            setMsg(text);
            router.refresh();
          }}
        />
      ) : null}
    </Card>
  );
}

function FilterLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-[12px] font-semibold text-ink-700">{label}<span className="mt-1 block [&_input]:h-9 [&_input]:w-full [&_input]:rounded-sm [&_input]:border [&_input]:border-paper-300 [&_input]:bg-surface [&_input]:px-2.5 [&_input]:text-[12.5px] [&_select]:h-9 [&_select]:w-full [&_select]:rounded-sm [&_select]:border [&_select]:border-paper-300 [&_select]:bg-surface [&_select]:px-2 [&_select]:text-[12.5px]">{children}</span></label>;
}

function EnrolDialog({
  row,
  classes,
  onClose,
  onDone,
}: {
  row: InquiryRow;
  classes: { id: number; name: string }[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [classId, setClassId] = useState("");
  const [boarding, setBoarding] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-md rounded bg-surface p-6 shadow-1">
        <p className="font-display text-[17px] font-semibold text-ink-950">
          Enrol {row.child_first} {row.child_last}
        </p>
        <p className="mt-1 text-[12.5px] text-ink-500">
          This mints the admission number and creates the {row.siblings > 0 ? `${row.siblings}+ ` : ""}family link by phone {row.phone}. It is audited.
        </p>
        <label className="mt-4 flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Class (optional)</span>
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950"
          >
            <option value="">Decide later</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="mt-3 flex items-center gap-2.5">
          <input type="checkbox" checked={boarding} onChange={(e) => setBoarding(e.target.checked)} className="h-4 w-4 accent-pine-600" />
          <span className="text-[13px] text-ink-900">Boarder (bed is an asset — the Hostel module will hold it)</span>
        </label>
        {error ? <p className="mt-3 text-[12.5px] text-danger" role="alert">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await convertInquiryAction({
                  id: row.id,
                  classId: classId ? Number(classId) : null,
                  boarding,
                });
                if (r.ok && "data" in r && r.data && typeof r.data === "object" && "admissionNo" in r.data) {
                  const d = r.data as { admissionNo: string; siblingsLinked: number };
                  onDone(
                    `${row.child_first} ${row.child_last} enrolled as ${d.admissionNo}` +
                      (d.siblingsLinked > 0 ? ` — ${d.siblingsLinked} sibling${d.siblingsLinked === 1 ? "" : "s"} auto-linked by phone` : ""),
                  );
                } else if (!r.ok) {
                  setError(r.error ?? "Failed");
                } else {
                  onDone(`${row.child_first} enrolled`);
                }
              })
            }
          >
            Enrol
          </Button>
        </div>
      </div>
    </div>
  );
}

export function NewInquiryForm({ packs }: { packs: { code: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <Card>
      <CardHead title="Log an inquiry" sub="A family called, walked in, or was referred — capture them in thirty seconds." />
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = e.currentTarget;
          const fd = new FormData(f);
          start(async () => {
            const r = await createInquiryAction({
              childFirst: String(fd.get("childFirst") ?? ""),
              childLast: String(fd.get("childLast") ?? ""),
              parentName: String(fd.get("parentName") ?? ""),
              phone: String(fd.get("phone") ?? "").replace(/\s+/g, ""),
              levelInterest: String(fd.get("levelInterest") ?? "") || undefined,
              curriculumCode: String(fd.get("curriculumCode") ?? "") || undefined,
              source: String(fd.get("source") ?? "walk-in"),
              notes: String(fd.get("notes") ?? "") || undefined,
              nextFollowupOn: String(fd.get("nextFollowupOn") ?? "") || undefined,
            });
            if (r.ok) {
              f.reset();
              setMsg({ ok: true, text: "Inquiry logged" });
              router.refresh();
            } else {
              setMsg({ ok: false, text: r.error ?? "Failed" });
            }
          });
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Child's first name *</span>
          <input name="childFirst" required minLength={2} maxLength={50} className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Child's last name *</span>
          <input name="childLast" required minLength={2} maxLength={50} className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Parent / guardian name *</span>
          <input name="parentName" required minLength={3} maxLength={80} className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Phone * (2547XXXXXXXX — links the family)</span>
          <input
            name="phone"
            required
            inputMode="tel"
            pattern="254[0-9]{9}"
            title="Start with 254, then 9 digits — e.g. 254712345678"
            placeholder="254712345678"
            className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Level asked about</span>
          <input name="levelInterest" maxLength={40} placeholder="e.g. Grade 7" className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Curriculum</span>
          <select name="curriculumCode" className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950">
            <option value="">Not sure yet</option>
            {packs.map((p) => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Source</span>
          <select name="source" defaultValue="walk-in" className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950">
            <option value="walk-in">Walk-in</option>
            <option value="phone">Phone</option>
            <option value="referral">Referral</option>
            <option value="event">Event</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Next follow-up</span>
          <input name="nextFollowupOn" type="date" className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950" />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Notes</span>
          <textarea name="notes" maxLength={500} rows={2} className="rounded-sm border border-paper-300 bg-surface px-3 py-2 text-[13.5px] text-ink-950" />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="primary" disabled={pending}>Log inquiry</Button>
          {msg ? (
            <p className={msg.ok ? "text-[12.5px] text-pine-700" : "text-[12.5px] text-danger"} role="status">{msg.text}</p>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
