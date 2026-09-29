"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { noun } from "@/lib/plural";
import { Button, Card, CardHead, EmptyState, StatusPill } from "@mandela/ui";
import {
  addLibraryTitleAction, issueCopyAction, returnCopyAction, type LibraryData,
} from "@/lib/api";

/** Library client — the counter flow: add titles, issue, return, chase. */
export function LibraryClient({
  overdue,
  most,
  learners,
}: {
  overdue: LibraryData["overdue"];
  most: LibraryData["most_borrowed"];
  learners: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [t, setT] = useState("");
  const [a, setA] = useState("");
  const [copies, setCopies] = useState(1);

  const [barcode, setBarcode] = useState("");
  const [learner, setLearner] = useState("");
  const [days, setDays] = useState(14);

  const addTitle = () => {
    setErr(null);
    if (t.trim().length < 2) return setErr("Title required.");
    start(async () => {
      const r = await addLibraryTitleAction({ title: t.trim(), author: a.trim() || null, copies });
      if (!r.ok) { setErr(r.error ?? "failed"); return; }
      setT(""); setA(""); setMsg(`Added with ${copies} barcoded cop${copies > 1 ? "ies" : "y"}.`);
      router.refresh();
    });
  };

  const issue = () => {
    setErr(null);
    if (!barcode || !learner) return setErr("Barcode and learner required.");
    start(async () => {
      const r = await issueCopyAction({ barcode: barcode.trim(), learnerId: learner, days });
      if (!r.ok) { setErr(r.error ?? "failed"); return; }
      setBarcode(""); setMsg(`Issued — due in ${days} ${noun(days, "day", "days")}.`);
      router.refresh();
    });
  };

  const giveBack = () => {
    setErr(null);
    if (!barcode) return setErr("Barcode required.");
    start(async () => {
      const r = await returnCopyAction({ barcode: barcode.trim() });
      if (!r.ok) { setErr(r.error ?? "failed"); return; }
      setBarcode(""); setMsg("Back on the shelf.");
      router.refresh();
    });
  };

  return (
    <div className="grid gap-s4">
      <Card>
        <CardHead title="Counter" sub="Issue and return are two taps on the barcode." />
        <div className="grid gap-s2 p-s5 sm:grid-cols-4">
          <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
          <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={learner} onChange={(e) => setLearner(e.target.value)}>
            <option value="">— learner —</option>
            {learners.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input type="number" min={1} max={60} className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value) || 14)} />
          <div className="flex gap-s2">
            <Button variant="primary" disabled={pending} onClick={issue}>Issue</Button>
            <Button disabled={pending} onClick={giveBack}>Return</Button>
          </div>
        </div>
        <div className="grid gap-s2 border-t border-border p-s5 sm:grid-cols-4">
          <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="New title" value={t} onChange={(e) => setT(e.target.value)} />
          <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Author" value={a} onChange={(e) => setA(e.target.value)} />
          <input type="number" min={1} max={50} className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={copies} onChange={(e) => setCopies(Number(e.target.value) || 1)} />
          <Button disabled={pending} onClick={addTitle}>+ Add title</Button>
        </div>
        {err ? <p className="px-s5 pb-s4 text-sm text-danger">{err}</p> : null}
        {msg ? <p className="px-s5 pb-s4 text-sm text-ok">{msg}</p> : null}
      </Card>

      <Card>
        <CardHead title="Overdue" sub="Chase list — fines become levies, not desk cash." />
        {overdue.length === 0 ? (
          <EmptyState title="Nothing overdue" body="The shelves are honest today." />
        ) : (
          <div className="flex flex-col divide-y divide-border px-s5 pb-s4">
            {overdue.map((o) => (
              <div key={o.copy_barcode + o.learner} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <span className="font-medium text-text">{o.learner}</span>
                  <span className="ml-s2 text-muted">· {o.title}</span>
                </span>
                <span className="font-mono text-[11px] text-danger">due {o.due_on}</span>
              </div>
            ))}
          </div>
        )}
        {most.length > 0 ? (
          <>
            <CardHead title="Most borrowed" />
            <div className="flex flex-col divide-y divide-border px-s5 pb-s4">
              {most.map((m) => (
                <div key={m.title} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-text">{m.title}</span>
                  <StatusPill tone="neutral">{m.loans} loans</StatusPill>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </Card>
    </div>
  );
}
