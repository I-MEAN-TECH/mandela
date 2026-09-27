"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@mandela/ui";
import {
  setGuardianRelationshipAction,
  unlinkGuardianAction,
  linkGuardianAction,
  moveLearnerClassAction,
} from "@/lib/api";

/**
 * Learner 360 actions (flank batch E) — the relationship editor and the
 * class move. Leaders only (the API enforces it too); every write audited.
 */

const inputCx = "h-9 rounded-sm border border-paper-300 bg-surface px-2.5 text-[12.5px] text-ink-950";

export function GuardianRelationshipRow({
  learnerId,
  guardianId,
  guardianName,
  relationship,
  isPrimary,
}: {
  learnerId: string;
  guardianId: string;
  guardianName: string;
  relationship: string;
  isPrimary: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [rel, setRel] = useState(relationship);

  function save(nextPrimary: boolean) {
    start(async () => {
      const r = await setGuardianRelationshipAction({ learnerId, guardianId, relationship: rel, isPrimary: nextPrimary });
      setMsg(r.ok ? "Saved" : r.error ?? "Failed");
      if (r.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function unlink() {
    if (!window.confirm(`Remove ${guardianName} from this learner? The history stays in the audit trail.`)) return;
    start(async () => {
      const r = await unlinkGuardianAction({ learnerId, guardianId });
      setMsg(r.ok ? "Link removed" : r.error ?? "Failed");
      if (r.ok) router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" disabled={pending} onClick={() => setEditing(true)}>Edit</Button>
        <Button variant="ghost" disabled={pending} onClick={unlink}>Unlink</Button>
        {msg ? <span className="text-[11.5px] text-ink-500">{msg}</span> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input value={rel} onChange={(e) => setRel(e.target.value)} maxLength={40} aria-label="Relationship" className={inputCx} />
      <label className="flex items-center gap-1.5 text-[12px] text-ink-700">
        <input type="checkbox" defaultChecked={isPrimary} className="h-3.5 w-3.5 accent-pine-600" onChange={(e) => save(e.target.checked)} />
        primary
      </label>
      <Button variant="secondary" disabled={pending} onClick={() => save(isPrimary)}>{pending ? "Saving…" : "Save"}</Button>
      <Button variant="ghost" disabled={pending} onClick={() => setEditing(false)}>Cancel</Button>
      {msg ? <span className="text-[11.5px] text-ink-500">{msg}</span> : null}
    </div>
  );
}

export function LinkGuardianForm({ learnerId, guardians }: { learnerId: string; guardians: { id: string; label: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function submit(fd: FormData) {
    const guardianId = String(fd.get("guardianId") ?? "");
    const relationship = String(fd.get("relationship") ?? "").trim() || "guardian";
    if (!guardianId) {
      setMsg("Pick a guardian.");
      return;
    }
    start(async () => {
      const r = await linkGuardianAction({ learnerId, guardianId, relationship });
      setMsg(r.ok ? "Guardian linked" : r.error ?? "Failed");
      if (r.ok) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => setOpen(true)}>Link a guardian…</Button>
        {msg ? <span className="text-[11.5px] text-ink-500">{msg}</span> : null}
      </div>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit(new FormData(e.currentTarget));
      }}
    >
      <select name="guardianId" required className={inputCx}>
        <option value="">Guardian…</option>
        {guardians.map((g) => (
          <option key={g.id} value={g.id}>{g.label}</option>
        ))}
      </select>
      <input name="relationship" placeholder="Relationship (mother, father…)" maxLength={40} className={inputCx} />
      <Button type="submit" variant="primary" disabled={pending}>{pending ? "Linking…" : "Link"}</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      {msg ? <span className="text-[11.5px] text-ink-500">{msg}</span> : null}
    </form>
  );
}

export function ClassMoveForm({
  learnerId,
  classes,
  currentClassId,
}: {
  learnerId: string;
  classes: { id: number; name: string }[];
  currentClassId: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function submit(fd: FormData) {
    const toClassId = Number(fd.get("toClassId"));
    const kind = String(fd.get("kind") ?? "promotion");
    const reason = String(fd.get("reason") ?? "").trim();
    if (!toClassId || toClassId === currentClassId) {
      setMsg({ ok: false, text: "Pick a different class." });
      return;
    }
    if (kind !== "correction" && !reason) {
      setMsg({ ok: false, text: "Promotions and transfers need a reason — corrections don't." });
      return;
    }
    start(async () => {
      const r = await moveLearnerClassAction({ learnerId, toClassId, kind, reason: reason || undefined });
      const d = r.ok && r.data && typeof r.data === "object" ? (r.data as { from?: string; to?: string }) : null;
      setMsg(r.ok ? { ok: true, text: `Moved: ${d?.from ?? "none"} → ${d?.to ?? "done"}` } : { ok: false, text: r.error ?? "Failed" });
      if (r.ok) router.refresh();
    });
  }

  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit(new FormData(e.currentTarget));
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <select name="toClassId" required className={inputCx}>
          <option value="">Move to class…</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="kind" defaultValue="promotion" className={inputCx}>
          <option value="promotion">promotion</option>
          <option value="transfer">transfer</option>
          <option value="correction">correction</option>
        </select>
      </div>
      <input name="reason" placeholder="Reason (required for promotions & transfers)" maxLength={200} className={inputCx} />
      <div className="flex items-center gap-2">
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Moving…" : "Move class"}</Button>
        {msg ? <span className={`text-[11.5px] ${msg.ok ? "text-pine-700" : "text-danger"}`} role="status">{msg.text}</span> : null}
      </div>
    </form>
  );
}
