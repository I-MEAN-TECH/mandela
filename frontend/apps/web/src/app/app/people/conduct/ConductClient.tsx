"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, EmptyState, KpiCard, StatusPill } from "@mandela/ui";
import {
  getDiscipline,
  recordIncidentAction,
  getCounselling,
  openCaseAction,
  appendCaseNoteAction,
  closeCaseAction,
  type DisciplineOverview,
  type CounsellingData,
} from "@/lib/api";

/**
 * Conduct & Welfare client — discipline register + incident form, and the
 * counselling block that renders the count card for everyone and case
 * contents only when the API says canOpen (duty-holder / principal).
 */

const CATEGORIES = ["punctuality", "uniform", "bullying", "academic-excellence", "respect", "chores", "other"];

export function ConductClient({ learners }: { learners: { id: string; name: string; class: string | null }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [disc, setDisc] = useState<DisciplineOverview | null>(null);
  const [couns, setCouns] = useState<CounsellingData | null>(null);

  const [learnerId, setLearnerId] = useState("");
  const [kind, setKind] = useState<"merit" | "demerit">("demerit");
  const [category, setCategory] = useState("punctuality");
  const [points, setPoints] = useState(1);
  const [description, setDescription] = useState("");
  const [action, setAction] = useState("");
  const [notify, setNotify] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = () => {
    start(async () => {
      const d = await getDiscipline();
      if (d && "kpis" in d) setDisc(d);
      const c = await getCounselling();
      if (c && "stats" in c) setCouns(c);
    });
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const record = () => {
    setErr(null); setOk(null);
    if (!learnerId) return setErr("Pick a learner.");
    if (description.trim().length < 3) return setErr("Describe what happened (3+ characters).");
    start(async () => {
      const r = await recordIncidentAction({
        learnerId, kind, category, points, description: description.trim(),
        action: action.trim() || null, notifyParent: notify,
      });
      if (!r.ok) { setErr(r.error ?? "could not record"); return; }
      setOk((kind === "merit" ? "Merit recorded." : "Incident recorded.") + (notify ? " Parent notified." : ""));
      setDescription(""); setAction("");
      const d = await getDiscipline();
      if (d && "kpis" in d) setDisc(d);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-s4">
      <Card>
        <CardHead
          title="Record an incident"
          sub="Merits and demerits share one ladder — class teachers record their own class; the discipline master sees all; the deputy oversees."
        />
        <div className="grid gap-s3 p-s5 sm:grid-cols-3">
          <label className="flex flex-col gap-s1 text-sm">
            <span className="font-medium">Learner</span>
            <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={learnerId} onChange={(e) => setLearnerId(e.target.value)}>
              <option value="">— pick —</option>
              {learners.map((l) => (
                <option key={l.id} value={l.id}>{l.name}{l.class ? ` · ${l.class}` : ""}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-s1 text-sm">
            <span className="font-medium">Type</span>
            <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value as "merit" | "demerit")}>
              <option value="demerit">Demerit</option>
              <option value="merit">Merit</option>
            </select>
          </label>
          <label className="flex flex-col gap-s1 text-sm">
            <span className="font-medium">Category</span>
            <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-s1 text-sm">
            <span className="font-medium">Points</span>
            <input type="number" min={1} max={100} className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={points} onChange={(e) => setPoints(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <label className="flex flex-col gap-s1 text-sm sm:col-span-2">
            <span className="font-medium">What happened</span>
            <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Late four mornings this week" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="flex flex-col gap-s1 text-sm sm:col-span-2">
            <span className="font-medium">Action / award (optional)</span>
            <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Detention Friday · Certificate" value={action} onChange={(e) => setAction(e.target.value)} />
          </label>
          <label className="flex items-center gap-s2 text-sm sm:col-span-1 sm:pt-6">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            <span>Notify parent</span>
          </label>
          {err ? <p className="text-sm text-danger sm:col-span-3">{err}</p> : null}
          {ok ? <p className="text-sm text-ok sm:col-span-3">{ok}</p> : null}
          <div className="sm:col-span-3">
            <Button variant="primary" disabled={pending} onClick={record}>Record</Button>
          </div>
        </div>
      </Card>

      {disc ? (
        <>
          <div className="grid gap-s4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Incidents this term" value={disc.kpis.incidents_term} />
            <KpiCard label="Merits" value={disc.kpis.merits} tone="ok" />
            <KpiCard label="Demerits" value={disc.kpis.demerits} tone="danger" />
            <KpiCard label="Detentions scheduled" value={disc.kpis.detentions} tone="warn" />
          </div>

          {disc.byClass.length > 0 ? (
            <Card>
              <CardHead title="Incidents by class" sub="Where the ladder bites — feeds the pulse Classroom sign." />
              <div className="flex flex-col divide-y divide-border px-s5 pb-s4">
                {disc.byClass.map((c) => (
                  <div key={c.class_name} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-medium text-text">{c.class_name}</span>
                    <span className="text-muted">{c.incidents} incidents · {c.merit_points} merits · {c.demerit_points} demerits</span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHead title="Register" sub="Newest first (last 200). Parents read their own child's record only." />
            {disc.rows.length === 0 ? (
              <p className="p-s5 text-sm text-muted">Nothing recorded yet this term.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border px-s5 pb-s4">
                {disc.rows.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-s2 py-2 text-sm">
                    <StatusPill tone={r.kind === "merit" ? "ok" : "danger"}>{r.kind}</StatusPill>
                    <span className="font-medium text-text">{r.learner}</span>
                    <span className="text-muted">{r.class_name ?? "—"}</span>
                    <span className="text-muted">· {r.category} · {r.points}pt · {r.occurred_on}</span>
                    {r.action ? <span className="text-muted">· {r.action}</span> : null}
                    {r.parent_notified ? <span className="text-xs text-ok">parent notified</span> : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      ) : (
        <Card><CardHead title="Discipline" /><p className="p-s5 text-sm text-muted">Loading the register…</p></Card>
      )}

      <CounsellingBlock data={couns} learners={learners} onChange={load} />
    </div>
  );
}

function CounsellingBlock({
  data,
  learners,
  onChange,
}: {
  data: CounsellingData | null;
  learners: { id: string; name: string; class: string | null }[];
  onChange: () => void;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [learnerId, setLearnerId] = useState("");
  const [summary, setSummary] = useState("");
  const [referral, setReferral] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (!data) {
    return (
      <Card>
        <CardHead title="Counselling" sub="Confidential case register." />
        <p className="p-s5 text-sm text-muted">Checking your access…</p>
      </Card>
    );
  }

  const submit = () => {
    setErr(null);
    if (!learnerId) return setErr("Pick a learner.");
    if (summary.trim().length < 4) return setErr("Summarise the case (4+ characters).");
    start(async () => {
      const r = await openCaseAction({ learnerId, summary: summary.trim(), referral: referral.trim() || null });
      if (!r.ok) { setErr(r.error ?? "could not open the case"); return; }
      setSummary(""); setReferral(""); setOpen(false);
      onChange();
    });
  };

  const addNote = (id: string) => {
    const note = window.prompt("Case note (kept confidential):");
    if (!note || note.trim().length < 2) return;
    start(async () => {
      await appendCaseNoteAction({ id, note: note.trim() });
      onChange();
    });
  };

  const close = (id: string, status: "referred" | "closed") => {
    start(async () => {
      await closeCaseAction({ id, status });
      onChange();
    });
  };

  return (
    <div className="flex flex-col gap-s4">
      <div className="grid gap-s4 sm:grid-cols-3">
        <KpiCard label="Open cases" value={data.stats.open_ct} tone={data.stats.open_ct > 0 ? "warn" : "ok"} />
        <KpiCard label="Referred out" value={data.stats.referred_ct} />
        <KpiCard label="Closed" value={data.stats.closed_ct} tone="ok" />
      </div>

      <Card>
        <CardHead
          title="Guidance & Counselling"
          sub={
            data.canOpen
              ? "You hold the counselling hat — full case register below. Contents never leave this circle."
              : "DPA-strict: the register's contents are visible only to the counsellor and the principal. Everyone else — including this screen's owner — sees counts only."
          }
          action={data.canOpen ? <Button variant="primary" onClick={() => setOpen((v) => !v)}>{open ? "Close form" : "+ Open case"}</Button> : undefined}
        />
        {!data.canOpen ? (
          <p className="p-s5 text-sm text-muted">
            The admin sees the count card above and nothing else — by law, not by politeness (extra-strict RLS on <code>counselling_case</code>).
          </p>
        ) : open ? (
          <div className="grid gap-s3 p-s5 sm:grid-cols-3">
            <label className="flex flex-col gap-s1 text-sm">
              <span className="font-medium">Learner</span>
              <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={learnerId} onChange={(e) => setLearnerId(e.target.value)}>
                <option value="">— pick —</option>
                {learners.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-s1 text-sm sm:col-span-2">
              <span className="font-medium">Case summary</span>
              <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Grief support after family bereavement" value={summary} onChange={(e) => setSummary(e.target.value)} />
            </label>
            <label className="flex flex-col gap-s1 text-sm sm:col-span-2">
              <span className="font-medium">Referral (optional)</span>
              <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="County counsellor, Wednesdays" value={referral} onChange={(e) => setReferral(e.target.value)} />
            </label>
            {err ? <p className="text-sm text-danger sm:col-span-3">{err}</p> : null}
            <div className="sm:col-span-3">
              <Button variant="primary" disabled={pending} onClick={submit}>Open case</Button>
            </div>
          </div>
        ) : data.cases.length === 0 ? (
          <EmptyState title="No cases on file" body="The register is empty. Cases opened here are visible only to the counselling hat and the principal." />
        ) : (
          <div className="flex flex-col divide-y divide-border px-s5 pb-s4">
            {data.cases.map((c) => (
              <div key={c.id} className="flex flex-col gap-s1 py-3">
                <div className="flex flex-wrap items-center gap-s2 text-sm">
                  <StatusPill tone={c.status === "open" ? "warn" : c.status === "referred" ? "neutral" : "ok"}>{c.status}</StatusPill>
                  <span className="font-medium text-text">{c.learner}</span>
                  <span className="text-muted">{c.class_name ?? "—"} · opened {c.opened_on}</span>
                </div>
                <p className="text-sm text-muted">{c.summary}</p>
                {c.referral ? <p className="text-xs text-muted">Referral: {c.referral}</p> : null}
                {c.notes.length > 0 ? (
                  <p className="text-xs text-muted">{c.notes.length} note{c.notes.length > 1 ? "s" : ""} on file</p>
                ) : null}
                <div className="flex gap-s2 pt-s1">
                  <button type="button" className="text-xs text-muted hover:text-text" onClick={() => addNote(c.id)}>+ note</button>
                  {c.status === "open" ? (
                    <>
                      <button type="button" className="text-xs text-muted hover:text-text" onClick={() => close(c.id, "referred")}>refer out</button>
                      <button type="button" className="text-xs text-muted hover:text-text" onClick={() => close(c.id, "closed")}>close</button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
