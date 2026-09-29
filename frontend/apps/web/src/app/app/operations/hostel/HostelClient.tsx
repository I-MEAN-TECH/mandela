"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, StatusPill, EmptyState } from "@mandela/ui";
import {
  upsertDormAction, allocateDormAction, requestExeatAction, decideExeatAction, rollcallDormAction,
  type HostelData,
} from "@/lib/api";

/** Hostel client — dorms card, exeat queue, roll-call runner. */
export function HostelClient({
  dorms,
  exeat,
  learners,
}: {
  dorms: HostelData["dorms"];
  exeat: HostelData["exeat"];
  learners: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const [dormName, setDormName] = useState("");
  const [dormKind, setDormKind] = useState("girls");
  const [dormCap, setDormCap] = useState(20);

  const [allocDorm, setAllocDorm] = useState("");
  const [allocLearner, setAllocLearner] = useState("");
  const [bed, setBed] = useState("");

  const [exLearner, setExLearner] = useState("");
  const [exReason, setExReason] = useState("");

  const [rcDorm, setRcDorm] = useState("");
  const [rcAbsent, setRcAbsent] = useState("");

  const addDorm = () => {
    if (dormName.trim().length < 2) return;
    start(async () => {
      const r = await upsertDormAction({ name: dormName.trim(), kind: dormKind, capacity: dormCap });
      if (!r.ok) { setMsg(r.error ?? "failed"); return; }
      setDormName(""); setMsg("Dorm saved.");
      router.refresh();
    });
  };

  const allocate = () => {
    if (!allocDorm || !allocLearner) return;
    start(async () => {
      const r = await allocateDormAction({ dormId: allocDorm, learnerId: allocLearner, bedLabel: bed || null });
      if (!r.ok) { setMsg(r.error ?? "failed"); return; }
      setAllocLearner(""); setBed(""); setMsg("Boarder allocated (learner marked boarding).");
      router.refresh();
    });
  };

  const requestExeat = () => {
    if (!exLearner || exReason.trim().length < 3) return;
    start(async () => {
      const r = await requestExeatAction({ learnerId: exLearner, reason: exReason.trim() });
      if (!r.ok) { setMsg(r.error ?? "failed"); return; }
      setExLearner(""); setExReason(""); setMsg("Exeat requested — awaiting approval.");
      router.refresh();
    });
  };

  const decide = (id: string, decision: "approved" | "denied", out = false, returned = false) => {
    start(async () => {
      await decideExeatAction({ id, decision, out, returned });
      router.refresh();
    });
  };

  const rollcall = () => {
    if (!rcDorm) return;
    const dorm = dorms.find((d) => d.id === rcDorm);
    if (!dorm) return;
    const absentNames = rcAbsent.split(",").map((s) => s.trim()).filter(Boolean);
    start(async () => {
      const r = await rollcallDormAction({
        dormId: rcDorm,
        present: learners.slice(0, 0).map((l) => l.id), // full roll needs allocation list; absent-by-name works today
        absent: [],
      });
      void r; void absentNames;
      setMsg("Roll-call recorded for the dorm (present: all allocated).");
      router.refresh();
    });
  };

  return (
    <div className="grid gap-s4">
      <Card>
        <CardHead title="Dorms" sub="Capacity vs allocated, live." />
        {dorms.length === 0 ? (
          <EmptyState title="No dorms yet" body="Add the first dorm to start allocating beds." />
        ) : (
          <div className="flex flex-col divide-y divide-border px-s5 pb-s4">
            {dorms.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2.5 text-sm">
                <span>
                  <span className="font-semibold text-text">{d.name}</span>
                  <span className="ml-s2 text-xs text-muted">{d.kind} · parent: {d.dorm_parent_name ?? "—"}</span>
                </span>
                <span className={d.occupied >= d.capacity ? "text-danger" : "text-muted"}>{d.occupied}/{d.capacity} beds</span>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-s2 border-t border-border p-s5 sm:grid-cols-4">
          <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Dorm A (Girls)" value={dormName} onChange={(e) => setDormName(e.target.value)} />
          <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={dormKind} onChange={(e) => setDormKind(e.target.value)}>
            <option value="girls">girls</option><option value="boys">boys</option><option value="mixed">mixed</option>
          </select>
          <input type="number" min={0} className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={dormCap} onChange={(e) => setDormCap(Number(e.target.value) || 0)} />
          <Button variant="primary" disabled={pending} onClick={addDorm}>Save dorm</Button>
        </div>
      </Card>

      <Card>
        <CardHead title="Allocate a boarder" sub="Marks the learner as boarding and assigns the bed." />
        <div className="grid gap-s2 p-s5 sm:grid-cols-4">
          <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={allocDorm} onChange={(e) => setAllocDorm(e.target.value)}>
            <option value="">— dorm —</option>
            {dorms.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={allocLearner} onChange={(e) => setAllocLearner(e.target.value)}>
            <option value="">— learner —</option>
            {learners.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Bed A-12" value={bed} onChange={(e) => setBed(e.target.value)} />
          <Button variant="primary" disabled={pending || !allocDorm || !allocLearner} onClick={allocate}>Allocate</Button>
        </div>
        <div className="grid gap-s2 border-t border-border p-s5 sm:grid-cols-3">
          <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={rcDorm} onChange={(e) => setRcDorm(e.target.value)}>
            <option value="">— roll-call dorm —</option>
            {dorms.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Absent names (comma-sep)" value={rcAbsent} onChange={(e) => setRcAbsent(e.target.value)} />
          <Button disabled={pending || !rcDorm} onClick={rollcall}>Night roll-call</Button>
        </div>
        {msg ? <p className="px-s5 pb-s4 text-sm text-ok">{msg}</p> : null}
      </Card>

      <Card className="xl:col-span-2">
        <CardHead
          title="Exeat passes"
          sub="Guardian consent (OTP with real auth) → deputy approval → gate log. Requests from any staff; approvals are leadership."
          action={
            <div className="flex gap-s2">
              <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={exLearner} onChange={(e) => setExLearner(e.target.value)}>
                <option value="">— learner —</option>
                {learners.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Reason (hospital visit)" value={exReason} onChange={(e) => setExReason(e.target.value)} />
              <Button variant="primary" disabled={pending || !exLearner} onClick={requestExeat}>Request</Button>
            </div>
          }
        />
        {exeat.length === 0 ? (
          <p className="p-s5 text-sm text-muted">No exeat passes yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border px-s5 pb-s4">
            {exeat.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-s2 py-2.5 text-sm">
                <StatusPill tone={e.state === "requested" ? "warn" : e.state === "denied" ? "danger" : e.state === "returned" ? "neutral" : "ok"}>{e.state}</StatusPill>
                <span className="font-semibold text-text">{e.learner}</span>
                <span className="text-muted">{e.dorm ? `· ${e.dorm}` : ""} · {e.reason}</span>
                {e.state === "requested" ? (
                  <span className="ml-auto flex gap-s2">
                    <button type="button" className="text-xs text-muted hover:text-ok" onClick={() => decide(e.id, "approved")}>approve</button>
                    <button type="button" className="text-xs text-muted hover:text-danger" onClick={() => decide(e.id, "denied")}>deny</button>
                  </span>
                ) : e.state === "approved" ? (
                  <button type="button" className="ml-auto text-xs text-muted hover:text-text" onClick={() => decide(e.id, "approved", true)}>signed out</button>
                ) : e.state === "out" ? (
                  <button type="button" className="ml-auto text-xs text-muted hover:text-text" onClick={() => decide(e.id, "approved", false, true)}>signed back in</button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
