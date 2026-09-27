"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead } from "@mandela/ui";
import { admitWithLinkAction } from "@/lib/api";

/**
 * DirectAdmissionForm — the front-desk admission moment (Phase 3): learner
 * + guardian + family link code + welcome WhatsApp in ONE audited call.
 * The slip shown after success (adm no + ML-… code) is what the office
 * hands the guardian; the welcome message lands on WhatsApp via the talk
 * worker within seconds (dev: simulate provider).
 */
export function DirectAdmissionForm({ classes }: { classes: { id: number; name: string }[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [slip, setSlip] = useState<{ admissionNo: string; linkCode: string | null } | null>(null);
  const [f, setF] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    dob: "",
    gender: "",
    classId: "",
    boarding: false,
    guardianName: "",
    guardianPhone: "",
    guardianEmail: "",
  });

  function set(k: keyof typeof f, v: string | boolean) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function submit() {
    setErr(null);
    if (f.firstName.trim().length < 2 || f.lastName.trim().length < 2) return setErr("Child's first and last name are required.");
    if (f.guardianName.trim().length < 3) return setErr("Guardian's full name is required.");
    setPending(true);
    const r = await admitWithLinkAction({
      firstName: f.firstName.trim(),
      middleName: f.middleName.trim() || null,
      lastName: f.lastName.trim(),
      dob: f.dob || null,
      gender: f.gender === "M" || f.gender === "F" ? f.gender : null,
      classId: f.classId ? Number(f.classId) : null,
      boarding: f.boarding,
      guardianName: f.guardianName.trim(),
      guardianPhone: f.guardianPhone.trim(),
      guardianEmail: f.guardianEmail.trim() || null,
    });
    setPending(false);
    if (!r.ok) return setErr(r.error ?? "Admission failed.");
    setSlip({ admissionNo: r.admissionNo ?? "", linkCode: r.linkCode ?? null });
    setF({ firstName: "", middleName: "", lastName: "", dob: "", gender: "", classId: "", boarding: false, guardianName: "", guardianPhone: "", guardianEmail: "" });
    router.refresh();
  }

  return (
    <Card>
      <CardHead
        title="Admit a learner directly"
        sub="Walk-in enrolment — the guardian gets a one-time family link code and a WhatsApp welcome, automatically."
      />
      {slip ? (
        <div className="grid gap-s3" role="status">
          <p className="text-[14px] text-ink-900">
            <strong>{slip.admissionNo}</strong> is on the roll. Hand the office slip to the guardian:
          </p>
          <div className="rounded-sm border border-dashed border-border bg-paper-100 px-s4 py-s3 font-mono text-[13px] text-ink-950">
            Family link code: <strong>{slip.linkCode ?? "already issued — see the guardian's profile"}</strong>
            <br />
            <span className="text-[11.5px] text-muted">
              One-time. The guardian signs in with their phone and enters it once; after that the child appears automatically.
            </span>
          </div>
          <p className="text-[12.5px] text-muted">
            A WhatsApp welcome with this code is on its way to the guardian (the daily loop sends it).
          </p>
          <Button variant="secondary" size="sm" onClick={() => setSlip(null)}>Admit another</Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Child — first name" value={f.firstName} onChange={(v) => set("firstName", v)} />
          <Field label="Middle name (optional)" value={f.middleName} onChange={(v) => set("middleName", v)} />
          <Field label="Last name" value={f.lastName} onChange={(v) => set("lastName", v)} />
          <Field label="Date of birth" type="date" value={f.dob} onChange={(v) => set("dob", v)} />
          <label className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-ink-700">Gender</span>
            <select value={f.gender} onChange={(e) => set("gender", e.target.value)} className={inputCx}>
              <option value="">—</option>
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-ink-700">Class</span>
            <select value={f.classId} onChange={(e) => set("classId", e.target.value)} className={inputCx}>
              <option value="">—</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pt-5">
            <input type="checkbox" className="h-5 w-5 accent-pine-700" checked={f.boarding} onChange={(e) => set("boarding", e.target.checked)} />
            <span className="text-[13px] text-ink-900">Boarder</span>
          </label>
          <Field label="Guardian — full name" value={f.guardianName} onChange={(v) => set("guardianName", v)} />
          <Field label="Guardian — phone (07… / 01…)" value={f.guardianPhone} onChange={(v) => set("guardianPhone", v)} />
          <Field label="Guardian — email (optional)" type="email" value={f.guardianEmail} onChange={(v) => set("guardianEmail", v)} />
          <div className="sm:col-span-2 lg:col-span-3">
            <Button onClick={submit} disabled={pending}>
              {pending ? "Admitting…" : "Admit + issue link code"}
            </Button>
            {err ? <p className="mt-2 text-[13px] text-danger" role="alert">{err}</p> : null}
          </div>
        </div>
      )}
    </Card>
  );
}

const inputCx = "h-11 rounded-sm border border-border bg-surface px-3 text-[13px] text-ink-950 placeholder:text-muted";

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12px] font-semibold text-ink-700">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={inputCx} />
    </label>
  );
}
