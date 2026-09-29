"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, StatusPill } from "@mandela/ui";
import { upsertLearnerAction, type LearnerRow, type ClassRow } from "@/lib/api";

const PAGE_SIZE = 25;

export type LearnerFilters = {
  query?: string;
  className?: string;
  status?: "all" | "active" | "inactive";
  gender?: "all" | "M" | "F";
};

type FilterableLearner = Pick<LearnerRow, "id" | "name" | "admission_no" | "class" | "gender" | "status">;

/** Filters only rows the page already received; RLS remains authoritative. */
export function filterLearners<T extends FilterableLearner>(rows: T[], filters: LearnerFilters): T[] {
  const term = filters.query?.trim().toLowerCase() ?? "";
  return rows.filter((learner) => {
    if (filters.className && learner.class !== filters.className) return false;
    if (filters.status === "active" && learner.status !== "active") return false;
    if (filters.status === "inactive" && learner.status === "active") return false;
    if (filters.gender && filters.gender !== "all" && learner.gender !== filters.gender) return false;
    return !term || learner.name.toLowerCase().includes(term) || learner.admission_no.toLowerCase().includes(term) || (learner.class ?? "").toLowerCase().includes(term);
  });
}

export function paginateRows<T>(rows: T[], page: number, pageSize = PAGE_SIZE): T[] {
  return rows.slice(Math.max(0, page) * pageSize, Math.max(0, page + 1) * pageSize);
}

/**
 * LearnerActions — the roster's action layer (the edit pass).
 * Search box filters the roll live; every row carries Edit (identity,
 * class, boarding, UPI + birth-cert — the KEMIS gate) and the status
 * toggle (active ↔ transferred). Writes are leaders-only at the API and
 * audited before/after; the UI just speaks honestly about both.
 */

export function LearnerRoster({ rows, classes, canEdit }: {
  rows: LearnerRow[];
  classes: ClassRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [className, setClassName] = useState("");
  const [gender, setGender] = useState<"all" | "M" | "F">("all");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<LearnerRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const filtered = useMemo(() => filterLearners(rows, { query: q, status, className, gender }), [rows, q, status, className, gender]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleRows = paginateRows(filtered, Math.min(page, pageCount - 1));
  const classNames = useMemo(() => [...new Set(rows.map((row) => row.class).filter((value): value is string => Boolean(value)))].sort(), [rows]);

  function resetPage() { setPage(0); }

  return (
    <Card>
      <CardHead
        title="Learners"
        sub={`${filtered.length} of ${rows.length} shown${canEdit ? " · click Edit to correct a record" : ""}`}
        action={
          <div className="flex max-w-full min-w-0 items-center gap-2">
            <input
              type="search"
              value={q}
            onChange={(e) => { setQ(e.target.value); resetPage(); }}
              placeholder="Name, adm no or class…"
              aria-label="Filter the roll"
              className="h-9 w-36 rounded-pill border border-paper-300 bg-surface px-3.5 text-[12.5px] text-ink-950 outline-none focus:border-pine-400 sm:w-44"
            />
            {canEdit ? <Button size="sm2" variant="secondary" onClick={() => setAdding(true)}>Add learner</Button> : null}
          </div>
        }
      />
      <div className="flex items-center gap-2 px-s5 pb-s3">
        {(["all", "active", "inactive"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => { setStatus(s); resetPage(); }}
            className={`h-8 rounded-pill px-3.5 text-[12px] font-semibold transition-colors ${
              status === s ? "bg-pine-700 text-white" : "border border-paper-300 text-ink-600 hover:bg-paper-100"
            }`}
          >
            {s === "all" ? "All" : s === "active" ? "Active" : "Inactive"}
          </button>
        ))}
      </div>
      <div className="grid gap-2 px-s5 pb-s4 sm:grid-cols-2" aria-label="Learner filters">
        <label className="text-[12px] font-semibold text-ink-700">Class
          <select value={className} onChange={(e) => { setClassName(e.target.value); resetPage(); }} className="mt-1 h-9 w-full rounded-sm border border-paper-300 bg-surface px-2 text-[12.5px]">
            <option value="">All classes</option>{classNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="text-[12px] font-semibold text-ink-700">Gender
          <select value={gender} onChange={(e) => { setGender(e.target.value as typeof gender); resetPage(); }} className="mt-1 h-9 w-full rounded-sm border border-paper-300 bg-surface px-2 text-[12.5px]">
            <option value="all">All genders</option><option value="F">Female</option><option value="M">Male</option>
          </select>
        </label>
      </div>
      {msg ? (
        <p role="status" className={`px-s5 pb-s2 text-[12.5px] font-semibold ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>
      ) : null}
      {filtered.length === 0 ? (
        <p className="px-s5 pb-s5 text-[13px] text-ink-500">
          {rows.length === 0 ? "No learners yet — enrol from Admissions or import a CSV below." : "No learner matches that filter."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Adm no", "Name", "Class", "Gender", "Status", ""].map((h) => (
                  <th key={h} className="microlabel px-s3 pb-s2 pt-s1 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((l) => (
                <tr key={l.id} className="border-b border-paper-200 last:border-0 hover:bg-paper-50">
                  <td className="px-s3 py-s3 font-mono text-xs">{l.admission_no}</td>
                  <td className="px-s3 py-s3">
                    <a href={`/app/people/learners/${l.id}`} className="font-semibold text-ink-950 underline decoration-paper-300 underline-offset-4 hover:decoration-primary">
                      {l.name}
                    </a>
                  </td>
                  <td className="px-s3 py-s3 text-ink-700">{l.class ?? "—"}</td>
                  <td className="px-s3 py-s3 text-ink-700">{l.gender ?? "—"}</td>
                  <td className="px-s3 py-s3"><StatusPill tone={l.status === "active" ? "ok" : "neutral"}>{l.status}</StatusPill></td>
                  <td className="px-s3 py-s3 text-right">
                    {canEdit ? (
                      <Button size="sm2" variant="ghost" onClick={() => setEditing(l)}>Edit</Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-3 border-t border-paper-200 px-s5 py-s3 text-[12.5px] text-ink-600">
          <span>{Math.min(page * PAGE_SIZE + 1, filtered.length)}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
          <span className="flex gap-2"><Button size="sm2" variant="ghost" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</Button><Button size="sm2" variant="ghost" disabled={page >= pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>Next</Button></span>
        </div>
      ) : null}
      {editing ? (
        <EditLearnerDialog
          learner={editing}
          classes={classes}
          onClose={() => setEditing(null)}
          onSaved={(text) => { setMsg({ ok: true, text }); setEditing(null); router.refresh(); }}
        />
      ) : null}
      {adding ? (
        <AddLearnerDialog
          classes={classes}
          onClose={() => setAdding(false)}
          onSaved={(text) => { setMsg({ ok: true, text }); setAdding(false); router.refresh(); }}
        />
      ) : null}
    </Card>
  );
}

/**
 * Add-learner — the walk-in path. The server mints the admission number
 * (ADM-n+1) when none is typed; enrolment can start here, CSV stays for
 * bulk, Admissions for the funnel.
 */
function AddLearnerDialog({ classes, onClose, onSaved }: {
  classes: ClassRow[];
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<"M" | "F" | "">("");
  const [classId, setClassId] = useState("");
  const [adm, setAdm] = useState("");
  const [boarding, setBoarding] = useState(false);

  const save = () => {
    setErr(null);
    if (firstName.trim().length < 2 || lastName.trim().length < 2) return setErr("First and last name are required (2+ letters each).");
    start(async () => {
      const r = await upsertLearnerAction({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender: gender || null,
        classId: classId ? Number(classId) : null,
        admissionNo: adm.trim() || undefined,
        boarding: boarding || undefined,
      });
      if (!r.ok) { setErr(r.error ?? "Could not save."); return; }
      onSaved(`${firstName.trim()} ${lastName.trim()} added to the roll as ${"admissionNo" in r ? r.admissionNo : "a learner"}.`);
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-950/40 p-4" role="dialog" aria-modal="true" aria-label="Add learner">
      <div className="w-full max-w-[520px] rounded bg-surface p-s6 shadow-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="microlabel">Add learner</p>
            <p className="font-display text-xl font-bold text-ink-950">New on the roll</p>
            <p className="text-[12px] text-ink-500">Leave the admission number empty and the system mints the next one.</p>
          </div>
          <Button variant="ghost" size="sm2" onClick={onClose}>Close</Button>
        </div>
        <form
          className="mt-s4 grid gap-s3"
          onSubmit={(e) => { e.preventDefault(); save(); }}
          noValidate
        >
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="af">First name *</label>
            <input id="af" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="al">Last name *</label>
            <input id="al" value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
          </div>
          <div>
            <span className="mb-1 block text-[12px] font-semibold text-ink-700">Gender</span>
            <div className="flex gap-2">
              {[{ v: "", l: "Not set" }, { v: "F", l: "Female" }, { v: "M", l: "Male" }].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setGender(o.v as "M" | "F" | "")}
                  className={`h-10 rounded-pill px-4 text-[12.5px] font-semibold ${gender === o.v ? "bg-pine-700 text-white" : "border border-paper-300 text-ink-600 hover:bg-paper-100"}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="ac">Class</label>
            <select id="ac" value={classId} onChange={(e) => setClassId(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]">
              <option value="">Not assigned yet</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="aa">Admission number <span className="font-normal text-ink-500">(optional — auto-minted)</span></label>
            <input id="aa" value={adm} onChange={(e) => setAdm(e.target.value)} placeholder="e.g. ADM-010" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 font-mono text-[13px]" />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-ink-700">
            <input type="checkbox" checked={boarding} onChange={(e) => setBoarding(e.target.checked)} className="h-4 w-4" />
            Boarder
          </label>
          {err ? <p className="text-[12.5px] font-semibold text-danger">{err}</p> : null}
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={pending}>{pending ? "Adding…" : "Add to roll"}</Button>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditLearnerDialog({ learner, classes, onClose, onSaved }: {
  learner: LearnerRow;
  classes: ClassRow[];
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [firstName, setFirstName] = useState(learner.name.split(" ")[0] ?? "");
  const [lastName, setLastName] = useState(learner.name.split(" ").slice(-1)[0] ?? "");
  const [gender, setGender] = useState<"M" | "F" | "">(learner.gender === "M" || learner.gender === "F" ? learner.gender : "");
  const [dob, setDob] = useState("");
  const [classId, setClassId] = useState("");
  const [boarding, setBoarding] = useState(false);
  const [upi, setUpi] = useState("");
  const [birthCertNo, setBirthCertNo] = useState("");

  const save = () => {
    setErr(null);
    if (firstName.trim().length < 2 || lastName.trim().length < 2) return setErr("First and last name are required (2+ letters each).");
    start(async () => {
      const r = await upsertLearnerAction({
        id: learner.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender: gender || null,
        dob: dob || null,
        classId: classId ? Number(classId) : null,
        boarding: boarding || undefined,
        upi: upi.trim() || null,
        birthCertNo: birthCertNo.trim() || null,
      });
      if (!r.ok) { setErr(r.error ?? "Could not save."); return; }
      onSaved(`${learner.name} updated — the change is on the audit trail.`);
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-950/40 p-4" role="dialog" aria-modal="true" aria-label={`Edit ${learner.name}`}>
      <div className="w-full max-w-[520px] rounded bg-surface p-s6 shadow-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="microlabel">Edit learner</p>
            <p className="font-display text-xl font-bold text-ink-950">{learner.name}</p>
            <p className="font-mono text-[11.5px] text-ink-500">{learner.admission_no} · the admission number never changes — the ledger keys on it</p>
          </div>
          <Button variant="ghost" size="sm2" onClick={onClose}>Close</Button>
        </div>

        <form
          className="mt-s4 grid gap-s3"
          onSubmit={(e) => { e.preventDefault(); save(); }}
          noValidate
        >
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="lf">First name *</label>
            <input id="lf" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="ll">Last name *</label>
            <input id="ll" value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
          </div>
          <div>
            <span className="mb-1 block text-[12px] font-semibold text-ink-700">Gender</span>
            <div className="flex gap-2">
              {[{ v: "", l: "Not set" }, { v: "F", l: "Female" }, { v: "M", l: "Male" }].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setGender(o.v as "M" | "F" | "")}
                  className={`h-10 rounded-pill px-4 text-[12.5px] font-semibold ${gender === o.v ? "bg-pine-700 text-white" : "border border-paper-300 text-ink-600 hover:bg-paper-100"}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="lc">Class</label>
            <select id="lc" value={classId} onChange={(e) => setClassId(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]">
              <option value="">Leave as-is ({learner.class ?? "none"})</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="ld">Date of birth</label>
            <input id="ld" type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-ink-700">
            <input type="checkbox" checked={boarding} onChange={(e) => setBoarding(e.target.checked)} className="h-4 w-4" />
            Boarder
          </label>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="lu">UPI <span className="font-normal text-ink-500">(KEMIS — no UPI means no national exam entry)</span></label>
            <input id="lu" value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="Leave empty to keep the current value" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 font-mono text-[13px]" />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="lb">Birth certificate entry no <span className="font-normal text-ink-500">(entry number, not serial)</span></label>
            <input id="lb" value={birthCertNo} onChange={(e) => setBirthCertNo(e.target.value)} placeholder="Leave empty to keep the current value" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 font-mono text-[13px]" />
          </div>

          {err ? <p className="text-[12.5px] font-semibold text-danger">{err}</p> : null}
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Status toggle on the 360 page — active ↔ transferred. The upsert keeps
 * unmentioned fields (COALESCE on the server), so names ride along untouched.
 */
export function LearnerStatusToggle({ learnerId, name, status }: { learnerId: string; name: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const next = status === "active" ? "transferred" : "active";
  const [first = "", ...rest] = name.split(" ");
  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        variant={status === "active" ? "ghost" : "secondary"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await upsertLearnerAction({
              id: learnerId,
              firstName: first,
              lastName: rest.join(" ") || first,
              status: next,
            });
            setMsg(r.ok ? `Status set to ${next}.` : r.error ?? "Could not update.");
            if (r.ok) router.refresh();
          })
        }
      >
        {status === "active" ? "Mark transferred" : "Reactivate"}
      </Button>
      {msg ? <p role="status" className="text-[11.5px] font-semibold text-ink-600">{msg}</p> : null}
    </div>
  );
}
