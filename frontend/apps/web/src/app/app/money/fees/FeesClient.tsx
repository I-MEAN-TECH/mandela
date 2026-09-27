"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, Money } from "@mandela/ui";
import {
  upsertFeeStructureAction,
  applyFeeStructureAction,
  upsertFeeDiscountAction,
  createFeePlanAction,
  setFeeConsentAction,
  answerLevyAction,
} from "@/lib/api";

/**
 * Fee Structures ⑫ — the editor (docs/BUILD-PHASES.md Phase 1).
 * Forms follow docs/FORM-NAV-STANDARDS.md: one column, top labels, inline
 * validation. Manual-first law: the bursar keys the fee line; bulk-apply is
 * an explicit assist button with a visible count — never silent.
 */

const inputCx =
  "w-full rounded-sm border border-ink-200 bg-paper px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-pine focus:outline-none";
const labelCx = "mb-1 block text-[13px] font-semibold text-ink-900";

export function StructureForm({ classes }: { classes: { id: number; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function submit(fd: FormData) {
    const name = String(fd.get("name") ?? "").trim();
    const amount = String(fd.get("amount") ?? "").trim();
    const classId = String(fd.get("classId") ?? "");
    if (name.length < 2) return setErr("Give the fee item a name (min 2 letters).");
    const shillings = Number(amount);
    if (!Number.isFinite(shillings) || shillings <= 0) return setErr("Enter the amount in Ksh (numbers only).");
    setErr(null);
    start(async () => {
      const r = await upsertFeeStructureAction({
        name,
        classId: classId ? Number(classId) : null,
        amountCents: Math.round(shillings * 100),
        isOptional: fd.get("isOptional") === "on",
      });
      if (r && "error" in r) return setErr(r.error ?? "Could not save.");
      setOk(true);
      setTimeout(() => setOk(false), 2500);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHead title="Add or update a fee item" sub="Billed for the current term · saved with one audit line" />
      <form action={submit} className="grid gap-s2">
        <div>
          <label className={labelCx} htmlFor="fee-name">Name</label>
          <input id="fee-name" name="name" className={inputCx} placeholder="Tuition · Term 2" required />
        </div>
        <div className="grid gap-s2 sm:grid-cols-2">
          <div>
            <label className={labelCx} htmlFor="fee-class">Class</label>
            <select id="fee-class" name="classId" className={inputCx} defaultValue="">
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCx} htmlFor="fee-amount">Amount (Ksh)</label>
            <input id="fee-amount" name="amount" inputMode="decimal" className={inputCx} placeholder="12500" required />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" name="isOptional" className="h-4 w-4 accent-pine" />
          Optional levy — bills only after a guardian consents
        </label>
        {err ? <p className="text-sm font-semibold text-danger">{err}</p> : null}
        {ok ? <p className="text-sm font-semibold text-ok">Saved — the fee line is live for this term.</p> : null}
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save fee item"}</Button>
      </form>
    </Card>
  );
}

export function ApplyButton({ structureId, name }: { structureId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function apply() {
    start(async () => {
      const r = await applyFeeStructureAction(structureId);
      if (r && "error" in r) return setMsg(r.error ?? "Could not apply.");
      const applied = (r as { applied?: number })?.applied ?? 0;
      setMsg(`${applied} learner ${applied === 1 ? "bill" : "bills"} created for “${name}”.`);
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="ghost" onClick={apply} disabled={pending}>
        {pending ? "Applying…" : "Apply to class"}
      </Button>
      {msg ? <span className="text-xs font-semibold text-ink-500">{msg}</span> : null}
    </span>
  );
}

/** Consent toggle on a fee line — flipping it is an audited decision. */
export function ConsentToggle({ structureId, isOptional }: { structureId: string; isOptional: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function flip() {
    start(async () => {
      const r = await setFeeConsentAction({ id: Number(structureId), isOptional: !isOptional });
      setMsg(r.ok ? (isOptional ? "Now automatic" : "Now consent-first") : r.error ?? "Failed");
      if (r.ok) router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="ghost" disabled={pending} onClick={flip}>
        {pending ? "Saving…" : isOptional ? "Make automatic" : "Require consent"}
      </Button>
      {msg ? <span className="text-xs text-ink-500">{msg}</span> : null}
    </span>
  );
}

/** Consent desk — record the parent's answer on an optional levy for one
 *  learner; the ledger row is written through to the fee bill. */
export function LevyConsentDesk({
  structures,
  learners,
}: {
  structures: { id: number; name: string }[];
  learners: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function submit(fd: FormData) {
    const structureId = Number(fd.get("structureId"));
    const learnerId = String(fd.get("learnerId") ?? "");
    const choice = String(fd.get("choice") ?? "") as "granted" | "declined";
    if (!structureId || !learnerId || !choice) {
      setMsg({ ok: false, text: "Pick the levy, the learner, and what the parent said." });
      return;
    }
    start(async () => {
      const r = await answerLevyAction({ structureId, learnerId, choice });
      setMsg(r.ok ? { ok: true, text: choice === "granted" ? "Consent granted — the levy bills." : "Declined — the levy is off the bill." } : { ok: false, text: r.error ?? "Failed" });
      if (r.ok) router.refresh();
    });
  }

  return (
    <Card>
      <CardHead title="Consent desk" sub="The parent said yes (or no) at the counter. Record it — it is audited and it writes through to the bill." />
      <form
        className="grid gap-s2"
        onSubmit={(e) => {
          e.preventDefault();
          const f = e.currentTarget;
          submit(new FormData(f));
        }}
      >
        <div>
          <label className={labelCx} htmlFor="cd-levy">Optional levy</label>
          <select id="cd-levy" name="structureId" className={inputCx}>
            <option value="">Choose the levy…</option>
            {structures.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCx} htmlFor="cd-learner">Learner</label>
          <select id="cd-learner" name="learnerId" className={inputCx}>
            <option value="">Choose the learner…</option>
            {learners.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCx} htmlFor="cd-choice">The parent said</label>
          <select id="cd-choice" name="choice" className={inputCx} defaultValue="">
            <option value="">Choose…</option>
            <option value="granted">Yes — bill it</option>
            <option value="declined">No — do not bill it</option>
          </select>
        </div>
        {msg ? <p className={msg.ok ? "text-sm font-semibold text-ok" : "text-sm font-semibold text-danger"} role="status">{msg.text}</p> : null}
        <Button type="submit" disabled={pending}>{pending ? "Recording…" : "Record consent"}</Button>
      </form>
    </Card>
  );
}

export function DiscountForm({ classes }: { classes: { id: number; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submit(fd: FormData) {
    const name = String(fd.get("name") ?? "").trim();
    const percent = Number(String(fd.get("percent") ?? ""));
    const nth = Number(String(fd.get("appliesFrom") ?? "2"));
    if (name.length < 2) return setErr("Name the rule (e.g. “Second child”).");
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return setErr("Percent off must be 1–100.");
    if (!Number.isFinite(nth) || nth < 2) return setErr("Applies from must be the 2nd child or later.");
    setErr(null);
    start(async () => {
      const r = await upsertFeeDiscountAction({
        name,
        classId: String(fd.get("classId") ?? "") ? Number(fd.get("classId")) : null,
        appliesFrom: nth,
        percentOff: percent,
        active: true,
      });
      if (r && "error" in r) return setErr(r.error ?? "Could not save.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHead title="Sibling discount rule" sub="Family money: the Nth child pays less — applied when billing assists" />
      <form action={submit} className="grid gap-s2">
        <div>
          <label className={labelCx} htmlFor="disc-name">Rule name</label>
          <input id="disc-name" name="name" className={inputCx} placeholder="Second child" required />
        </div>
        <div className="grid gap-s2 sm:grid-cols-3">
          <div>
            <label className={labelCx} htmlFor="disc-class">Class scope</label>
            <select id="disc-class" name="classId" className={inputCx} defaultValue="">
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCx} htmlFor="disc-nth">Applies from child #</label>
            <input id="disc-nth" name="appliesFrom" type="number" min={2} max={12} defaultValue={2} className={inputCx} />
          </div>
          <div>
            <label className={labelCx} htmlFor="disc-percent">Percent off</label>
            <input id="disc-percent" name="percent" inputMode="decimal" className={inputCx} placeholder="10" required />
          </div>
        </div>
        {err ? <p className="text-sm font-semibold text-danger">{err}</p> : null}
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save rule"}</Button>
      </form>
    </Card>
  );
}

export function PlanForm({ learners }: { learners: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [nParts, setNParts] = useState(3);

  function submit(fd: FormData) {
    const learnerId = String(fd.get("learnerId") ?? "");
    const name = String(fd.get("name") ?? "").trim() || "Term plan";
    if (!learnerId) return setErr("Pick the learner this plan is for.");
    const parts = Array.from({ length: nParts }, (_, i) => {
      const amount = Number(String(fd.get(`p${i + 1}-amount`) ?? ""));
      return {
        label: String(fd.get(`p${i + 1}-label`) ?? `Part ${i + 1}`),
        dueOn: String(fd.get(`p${i + 1}-due`) ?? ""),
        amountCents: Math.round((Number.isFinite(amount) ? amount : 0) * 100),
      };
    });
    if (parts.some((p) => !/^\d{4}-\d{2}-\d{2}$/.test(p.dueOn))) return setErr("Every part needs a due date.");
    if (parts.some((p) => p.amountCents <= 0)) return setErr("Every part needs an amount.");
    setErr(null);
    start(async () => {
      const r = await createFeePlanAction({ learnerId, name, parts });
      if (r && "error" in r) return setErr(r.error ?? "Could not save.");
      setNParts(3);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHead title="Instalment plan" sub="Balance is measured against the parts — replaces one hard due date" />
      <form action={submit} className="grid gap-s2">
        <div className="grid gap-s2 sm:grid-cols-2">
          <div>
            <label className={labelCx} htmlFor="plan-learner">Learner</label>
            <select id="plan-learner" name="learnerId" className={inputCx} defaultValue="">
              <option value="">Choose learner…</option>
              {learners.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCx} htmlFor="plan-name">Plan name</label>
            <input id="plan-name" name="name" className={inputCx} placeholder="Term plan · 3 parts" />
          </div>
        </div>
        <div>
          <label className={labelCx} htmlFor="plan-parts">Parts</label>
          <select id="plan-parts" value={nParts} onChange={(e) => setNParts(Number(e.target.value))} className={inputCx}>
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        {Array.from({ length: nParts }, (_, i) => (
          <div key={i} className="grid gap-s2 sm:grid-cols-[1fr_auto_auto]">
            <div>
              <label className={labelCx} htmlFor={`p${i + 1}-label`}>Part {i + 1} label</label>
              <input id={`p${i + 1}-label`} name={`p${i + 1}-label`} className={inputCx} defaultValue={`By ${["half-term", "end of term", "closing week"][i] ?? `week ${i + 4}`}`} />
            </div>
            <div>
              <label className={labelCx} htmlFor={`p${i + 1}-due`}>Due</label>
              <input id={`p${i + 1}-due`} name={`p${i + 1}-due`} type="date" className={inputCx} required />
            </div>
            <div>
              <label className={labelCx} htmlFor={`p${i + 1}-amount`}>Ksh</label>
              <input id={`p${i + 1}-amount`} name={`p${i + 1}-amount`} inputMode="decimal" className={inputCx} placeholder="5000" required />
            </div>
          </div>
        ))}
        {err ? <p className="text-sm font-semibold text-danger">{err}</p> : null}
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save plan"}</Button>
      </form>
    </Card>
  );
}
