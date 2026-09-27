"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, StatusPill } from "@mandela/ui";
import { addHealthRecordAction, logClinicVisitAction, type InfirmaryData } from "@/lib/api";

/** Infirmary client — contents only for the duty hat; counts for everyone. */
export function InfirmaryClient({
  data,
  learners,
}: {
  data: InfirmaryData | null;
  learners: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [hrLearner, setHrLearner] = useState("");
  const [hrKind, setHrKind] = useState("allergy");
  const [hrDetail, setHrDetail] = useState("");
  const [hrDeclared, setHrDeclared] = useState(true);

  const [cvLearner, setCvLearner] = useState("");
  const [cvComplaint, setCvComplaint] = useState("");
  const [cvAction, setCvAction] = useState("");
  const [cvMed, setCvMed] = useState("");
  const [cvNotify, setCvNotify] = useState(true);

  if (!data) {
    return <Card><CardHead title="Infirmary" /><p className="p-s5 text-sm text-muted">Loading…</p></Card>;
  }

  const addRecord = () => {
    setErr(null);
    if (!hrLearner || hrDetail.trim().length < 2) return setErr("Pick a learner and describe the record.");
    start(async () => {
      const r = await addHealthRecordAction({ learnerId: hrLearner, kind: hrKind, detail: hrDetail.trim(), parentDeclared: hrDeclared });
      if (!r.ok) { setErr(r.error ?? "failed"); return; }
      setHrDetail(""); setMsg("Health record saved.");
      router.refresh();
    });
  };

  const logVisit = () => {
    setErr(null);
    if (!cvLearner || cvComplaint.trim().length < 2) return setErr("Pick a learner and the complaint.");
    start(async () => {
      const r = await logClinicVisitAction({
        learnerId: cvLearner, complaint: cvComplaint.trim(), action: cvAction.trim() || null,
        medication: cvMed.trim() || null, parentNotified: cvNotify,
      });
      if (!r.ok) { setErr(r.error ?? "failed"); return; }
      setCvComplaint(""); setCvAction(""); setCvMed(""); setMsg("Visit logged.");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-s4">
      {!data.canOpen ? (
        <Card>
          <CardHead
            title="Counts only — by law"
            sub="DPA-strict: the register's contents are visible only to the nurse (infirmary hat) and the principal. Allergy flags reach the class teacher and dorm parent who need them at 2 AM — never the whole staff."
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-s4 xl:grid-cols-2">
            <Card>
              <CardHead title="Health records" sub="Parent-declared at enrolment where possible." />
              <div className="grid gap-s2 p-s5 sm:grid-cols-4">
                <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={hrLearner} onChange={(e) => setHrLearner(e.target.value)}>
                  <option value="">— learner —</option>
                  {learners.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={hrKind} onChange={(e) => setHrKind(e.target.value)}>
                  <option value="allergy">allergy</option>
                  <option value="chronic">chronic</option>
                  <option value="immunization">immunization</option>
                  <option value="note">note</option>
                </select>
                <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm sm:col-span-1" placeholder="Peanuts — EpiPen in office" value={hrDetail} onChange={(e) => setHrDetail(e.target.value)} />
                <Button variant="primary" disabled={pending} onClick={addRecord}>Add</Button>
                <label className="flex items-center gap-s2 text-xs text-muted sm:col-span-4">
                  <input type="checkbox" checked={hrDeclared} onChange={(e) => setHrDeclared(e.target.checked)} /> parent-declared
                </label>
              </div>
              {data.records.length === 0 ? (
                <p className="px-s5 pb-s4 text-sm text-muted">No records yet.</p>
              ) : (
                <div className="flex flex-col divide-y divide-border px-s5 pb-s4">
                  {data.records.slice(0, 12).map((r) => (
                    <div key={r.id} className="flex items-center gap-s2 py-2 text-sm">
                      <StatusPill tone={r.kind === "allergy" ? "danger" : r.kind === "chronic" ? "warn" : "neutral"}>{r.kind}</StatusPill>
                      <span className="font-medium text-text">{r.learner}</span>
                      <span className="text-muted">· {r.detail}</span>
                      {r.parent_declared ? <span className="text-[11px] text-ok">parent-declared</span> : null}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <CardHead title="Log a clinic visit" sub="SOAP-lite: complaint → action → outcome. Medication deducts kit stock automatically." />
              <div className="grid gap-s2 p-s5 sm:grid-cols-2">
                <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={cvLearner} onChange={(e) => setCvLearner(e.target.value)}>
                  <option value="">— learner —</option>
                  {learners.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Complaint (headache, fever)" value={cvComplaint} onChange={(e) => setCvComplaint(e.target.value)} />
                <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Action taken" value={cvAction} onChange={(e) => setCvAction(e.target.value)} />
                <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Medication given" value={cvMed} onChange={(e) => setCvMed(e.target.value)} />
                <label className="flex items-center gap-s2 text-xs text-muted">
                  <input type="checkbox" checked={cvNotify} onChange={(e) => setCvNotify(e.target.checked)} /> parent notified
                </label>
                <Button variant="primary" disabled={pending} onClick={logVisit}>Log visit</Button>
              </div>
              {data.visits.length === 0 ? (
                <p className="px-s5 pb-s4 text-sm text-muted">No visits logged yet.</p>
              ) : (
                <div className="flex flex-col divide-y divide-border px-s5 pb-s4">
                  {data.visits.slice(0, 10).map((v) => (
                    <div key={v.id} className="flex flex-wrap items-center gap-s2 py-2 text-sm">
                      <span className="w-24 font-mono text-[11px] text-muted">{v.visited_on}</span>
                      <span className="font-medium text-text">{v.learner}</span>
                      <span className="text-muted">· {v.complaint}{v.action ? ` · ${v.action}` : ""}{v.medication ? ` · ${v.medication}` : ""}</span>
                      {v.parent_notified ? <span className="text-[11px] text-ok">parent notified</span> : null}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
      {err ? <p className="text-sm text-danger">{err}</p> : null}
      {msg ? <p className="text-sm text-ok">{msg}</p> : null}
    </div>
  );
}
