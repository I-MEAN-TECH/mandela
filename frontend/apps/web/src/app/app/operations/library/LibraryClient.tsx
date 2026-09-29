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
  loans,
}: {
  overdue: LibraryData["overdue"];
  most: LibraryData["most_borrowed"];
  learners: { id: string; name: string }[];
  loans: LibraryData["loans"];
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

  // Counter list filters — find the borrower by class, admission (reg) no,
  // or name before the two-tap issue/return on the barcode.
  const [fClass, setFClass] = useState("");
  const [fReg, setFReg] = useState("");
  const [fName, setFName] = useState("");
  const classNames = [...new Set(loans.map((l) => l.class_name).filter((n): n is string => !!n))].sort();
  const filteredLoans = loans.filter(
    (l) =>
      (!fClass || l.class_name === fClass) &&
      (!fReg || (l.admission_no ?? "").toLowerCase().includes(fReg.trim().toLowerCase())) &&
      (!fName || l.learner.toLowerCase().includes(fName.trim().toLowerCase())),
  );

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
        <CardHead title="Counter" sub="Filter the list to find the borrower, then issue or return on the barcode." />
        <div className="flex flex-col gap-s3">
          {/* Filters — class / reg no / name, per the counter's daily question. */}
          <div className="flex flex-wrap items-center gap-s2 px-s5 pt-s1" aria-label="Borrower filters">
            <select
              aria-label="Filter by class"
              value={fClass}
              onChange={(e) => setFClass(e.target.value)}
              className="h-9 rounded-sm border border-border bg-surface px-2.5 text-[12.5px] text-ink-950"
            >
              <option value="">All classes</option>
              {classNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <input
              type="search"
              aria-label="Filter by admission number"
              placeholder="Reg no…"
              value={fReg}
              onChange={(e) => setFReg(e.target.value)}
              className="h-9 w-32 rounded-sm border border-border bg-surface px-3 text-[12.5px] text-ink-950 placeholder:text-muted"
            />
            <input
              type="search"
              aria-label="Filter by learner name"
              placeholder="Name…"
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              className="h-9 min-w-[160px] flex-1 rounded-sm border border-border bg-surface px-3 text-[12.5px] text-ink-950 placeholder:text-muted"
            />
            <span className="numeral text-[11.5px] text-muted">{filteredLoans.length} of {loans.length} out</span>
          </div>
          {/* The out list — one row per copy currently with a learner. */}
          {filteredLoans.length === 0 ? (
            <p className="px-s5 pb-s2 text-sm text-muted">
              {loans.length === 0 ? "Nothing is out — every copy is on the shelf." : "No borrowers match those filters."}
            </p>
          ) : (
            <div className="flex max-h-[340px] flex-col divide-y divide-border overflow-y-auto px-s5 pb-s2">
              {filteredLoans.map((l) => (
                <div key={l.copy_barcode} className="flex flex-wrap items-center gap-s2 py-2 text-sm">
                  <span className="font-mono text-[11px] text-muted">{l.copy_barcode}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-text">{l.learner}</span>
                    <span className="block text-[11.5px] text-muted">
                      {l.class_name ?? "—"}{l.admission_no ? ` · ${l.admission_no}` : ""} · {l.title}
                    </span>
                  </span>
                  {l.overdue ? <StatusPill tone="danger">overdue</StatusPill> : <StatusPill tone="ok">out</StatusPill>}
                  <span className="font-mono text-[11px] text-muted">due {l.due_on}</span>
                  <Button size="sm2" disabled={pending} onClick={() => { setBarcode(l.copy_barcode); setLearner(l.learner_id); }}>
                    Use barcode
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="grid gap-s2 border-t border-border p-s5 sm:grid-cols-4">
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
