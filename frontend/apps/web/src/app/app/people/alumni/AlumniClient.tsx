"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@mandela/ui";

/**
 * AlumniClient — mark a learner graduated: pick from the active roll, set
 * the graduation date and final class, tick mentor availability. Audited
 * server-side (flank #2).
 */
export function AlumniClient({
  learners,
  action,
}: {
  learners: { id: string; name: string }[];
  action: (input: { learnerId: string; graduatedOn: string; finalClass?: string | null; mentorAvailable?: boolean; notes?: string | null }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [learnerId, setLearnerId] = useState("");
  const [graduatedOn, setGraduatedOn] = useState(new Date().toISOString().slice(0, 10));
  const [finalClass, setFinalClass] = useState("");
  const [mentor, setMentor] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function submit() {
    setMsg(null);
    if (!learnerId) return setMsg({ ok: false, text: "Pick the learner first." });
    start(async () => {
      const r = await action({
        learnerId,
        graduatedOn,
        finalClass: finalClass || null,
        mentorAvailable: mentor,
      });
      setMsg(r.ok ? { ok: true, text: "Marked graduated — the register is updated." } : { ok: false, text: r.error ?? "Failed" });
      if (r.ok) router.refresh();
    });
  }

  const inputCls =
    "w-full rounded-sm border border-border bg-surface px-3 py-2.5 text-sm focus:border-pine-300 focus:outline-none focus:ring-2 focus:ring-pine-100";

  return (
    <div className="grid gap-s3 sm:grid-cols-4">
      <label className="text-[13px] font-semibold text-ink-900">
        Learner
        <select value={learnerId} onChange={(e) => setLearnerId(e.target.value)} className={`mt-1.5 ${inputCls}`}>
          <option value="">— pick —</option>
          {learners.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[13px] font-semibold text-ink-900">
        Graduated on
        <input type="date" value={graduatedOn} onChange={(e) => setGraduatedOn(e.target.value)} className={`mt-1.5 ${inputCls}`} />
      </label>
      <label className="text-[13px] font-semibold text-ink-900">
        Final class
        <input value={finalClass} onChange={(e) => setFinalClass(e.target.value)} placeholder="e.g. Grade 9 Blue" className={`mt-1.5 ${inputCls}`} />
      </label>
      <div className="flex flex-col justify-end gap-2">
        <label className="flex items-center gap-2 text-[13px] text-ink-800">
          <input type="checkbox" checked={mentor} onChange={(e) => setMentor(e.target.checked)} className="h-4 w-4 rounded-sm border-border" />
          Available as mentor
        </label>
        <Button variant="primary" onClick={submit} loading={pending}>
          Mark graduated
        </Button>
      </div>
      {msg ? (
        <p className={`sm:col-span-4 text-[13px] font-semibold ${msg.ok ? "text-ok" : "text-danger"}`} role="status">
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
