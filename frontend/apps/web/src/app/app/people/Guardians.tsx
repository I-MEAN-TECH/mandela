"use client";

import { useRef, useState, useTransition } from "react";
import { Button, StatusPill, EmptyState, DataTable } from "@mandela/ui";
import { ErrorSummary, useForm, Field, inputCls } from "@/components/Form";
import type { GuardianDirectoryData } from "@/lib/api";
import { upsertGuardianAction, importGuardiansAction } from "@/lib/api";

/**
 * Guardians & Parents — the contact register in the reference skin:
 * vitals row (total / WhatsApp / linked), the register table, the add
 * form (form standard: label above, Kenyan phone hint, radios for
 * relationship), and CSV bulk import with skip-report.
 */
export function Guardians({ initial }: { initial: GuardianDirectoryData }) {
  const [data, setData] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, startImport] = useTransition();
  const [editing, setEditing] = useState<GuardianDirectoryData["guardians"][number] | null>(null);

  const form = useForm({
    fields: {
      fullName: { label: "Full name", required: true },
      phone: {
        label: "Phone number",
        required: true,
        validate: (v) => {
          const d = v.replace(/[^\d]/g, "");
          return /^(?:254|0)?[17]\d{8}$/.test(d) ? null : "must be a Kenyan number (07…, 01… or +2547…)";
        },
      },
      email: {
        label: "Email",
        validate: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "must look like an email, e.g. jane@gmail.com"),
      },
    },
    initial: { relationship: "mother" },
    onSubmit: (values) => {
      setBanner(null);
      startTransition(async () => {
        const r = await upsertGuardianAction({
          fullName: (values.fullName ?? "").trim(),
          phone: (values.phone ?? "").trim(),
          email: values.email ? values.email.trim() : undefined,
          relationship: values.relationship || "mother",
        });
        if (r.ok) {
          setBanner({ tone: "ok", text: `${values.fullName ?? "Guardian"} added to the register — they appear in the table now.` });
          form.reset();
          const { getGuardians } = await import("@/lib/api");
          const fresh = await getGuardians();
          if (!("error" in fresh)) setData(fresh);
        } else {
          setBanner({ tone: "danger", text: r.error ?? "Could not save the guardian." });
        }
      });
    },
  });

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBanner(null);
    startImport(async () => {
      try {
        const text = await file.text();
        const parsed = parseCsv(text);
        if ("error" in parsed) {
          setBanner({ tone: "danger", text: parsed.error });
          return;
        }
        const r = await importGuardiansAction(parsed.rows);
        if (r.ok) {
          const d = r.data as { imported: number; skipped: string[] };
          setBanner({
            tone: d.skipped.length ? "warn" : "ok",
            text:
              `Imported ${d.imported} guardian${d.imported === 1 ? "" : "s"}` +
              (d.skipped.length ? ` · skipped ${d.skipped.length}: ${d.skipped.slice(0, 3).join("; ")}${d.skipped.length > 3 ? "…" : ""}` : " — all rows in."),
          });
          const { getGuardians } = await import("@/lib/api");
          const fresh = await getGuardians();
          if (!("error" in fresh)) setData(fresh);
        } else {
          setBanner({ tone: "danger", text: r.error ?? "Import failed." });
        }
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  return (
    <div className="grid gap-s3h">
      {/* Vitals */}
      <div className="grid gap-s3h sm:grid-cols-3">
        {[
          { label: "On the register", value: data.stats.total },
          { label: "Opted into WhatsApp", value: data.stats.wa },
          { label: "Linked to a child", value: data.stats.with_children },
        ].map((s) => (
          <div key={s.label} className="rounded border border-border bg-surface p-s5 shadow-1">
            <p className="text-[13px] font-medium text-muted">{s.label}</p>
            <p className="numeral mt-s3 text-num font-semibold text-ink-950">{s.value}</p>
          </div>
        ))}
      </div>

      {banner ? (
        <div
          role="status"
          className={`rounded-sm p-3 text-[13px] font-medium ${
            banner.tone === "ok" ? "bg-ok-bg text-ok" : banner.tone === "warn" ? "bg-warn-bg text-warn" : "bg-danger-bg text-danger"
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      {/* Register table */}
      {data.guardians.length === 0 ? (
        <EmptyState
          title="No guardians yet"
          body="Add the first parent below, or import your admission file — fee chasing and WhatsApp live off this register."
        />
      ) : (
        <div className="overflow-hidden rounded border border-border bg-surface shadow-1">
          <div className="flex items-center justify-between gap-s3 border-b border-border p-s5 pb-s4">
            <div>
              <h2 className="font-display text-[17px] font-semibold text-ink-950">Guardians &amp; Parents</h2>
              <p className="mt-0.5 text-[12.5px] text-muted">
                {data.stats.total} on the register · the contact book Talk and Money both read
              </p>
            </div>
            {/* CSV import */}
            <div className="flex shrink-0 items-center gap-2">
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={onPickFile} aria-label="Import guardians from CSV" />
              <Button size="sm" variant="secondary" loading={importing} onClick={() => fileRef.current?.click()}>
                Import CSV
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Name", "Phone", "Relationship", "Children", "WhatsApp", "Status", ""].map((h, i) => (
                    <th key={h} className={`microlabel px-s5 py-s3 ${i >= 4 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.guardians.map((g) => (
                  <tr key={g.id} className="border-b border-paper-200 last:border-0 hover:bg-paper-50">
                    <td className="px-s5 py-s3">
                      <span className="block text-[13.5px] font-semibold">{g.full_name}</span>
                      {g.email ? <span className="block text-[11.5px] text-muted">{g.email}</span> : null}
                    </td>
                    <td className="px-s5 py-s3 font-mono text-[12.5px]">{g.phone}</td>
                    <td className="px-s5 py-s3 text-[13.5px] capitalize">{g.relationship}</td>
                    <td className="px-s5 py-s3 text-[13px] text-muted">{g.children ?? <span className="text-ink-400">—</span>}</td>
                    <td className="px-s5 py-s3 text-right"><StatusPill tone={g.wa_opt_in ? "ok" : "neutral"}>{g.wa_opt_in ? "opted in" : "—"}</StatusPill></td>
                    <td className="px-s5 py-s3 text-right"><StatusPill tone={g.active ? "ok" : "neutral"}>{g.active ? "active" : "inactive"}</StatusPill></td>
                    <td className="px-s5 py-s3 text-right">
                      <Button size="sm2" variant="ghost" onClick={() => setEditing(g)}>Edit</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add form */}
      <div className="rounded border border-border bg-surface p-s5 shadow-1">
        <h2 className="font-display text-[17px] font-semibold text-ink-950">Add a guardian</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">The write is audit-logged; duplicate phone numbers are refused.</p>
        <form className="mt-s4 grid max-w-xl gap-s4" onSubmit={form.handleSubmit} noValidate>
          <ErrorSummary errors={form.summary} />
          <Field name="fullName" label="Full name" hint="As it appears on their ID." error={form.errorFor("fullName") ?? undefined}>
            <input {...form.bind("fullName")} className={inputCls(!!form.errorFor("fullName"))} autoComplete="off" />
          </Field>
          <Field name="phone" label="Phone number" hint="07…, 01… or +2547… — any format works." error={form.errorFor("phone") ?? undefined}>
            <input {...form.bind("phone")} type="tel" inputMode="tel" className={inputCls(!!form.errorFor("phone"))} autoComplete="off" />
          </Field>
          <Field name="email" label="Email" optional error={form.errorFor("email") ?? undefined}>
            <input {...form.bind("email")} type="email" className={inputCls(!!form.errorFor("email"))} autoComplete="off" />
          </Field>
          <fieldset>
            <legend className="text-[13px] font-semibold">Relationship</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {[
                { v: "mother", label: "Mother" },
                { v: "father", label: "Father" },
                { v: "guardian", label: "Guardian" },
              ].map((o) => (
                <label
                  key={o.v}
                  className={`inline-flex h-12 cursor-pointer items-center rounded-sm border px-4 text-sm font-semibold transition-colors ${
                    form.values.relationship === o.v ? "border-2 border-primary bg-primary-soft text-primary" : "border-border bg-surface text-ink-600 hover:bg-paper-100"
                  }`}
                >
                  <input type="radio" name="relationship" value={o.v} checked={form.values.relationship === o.v} onChange={() => form.setValue("relationship", o.v)} className="sr-only" />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <Button type="submit" variant="primary" loading={pending}>Add to the register</Button>
          </div>
        </form>
      </div>

      {editing ? (
        <EditGuardianDialog
          guardian={editing}
          onClose={() => setEditing(null)}
          onSaved={async (text) => {
            setBanner({ tone: "ok", text });
            setEditing(null);
            const { getGuardians } = await import("@/lib/api");
            const fresh = await getGuardians();
            if (!("error" in fresh)) setData(fresh);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Edit dialog — same fields as the add form, same validation, pre-filled.
 * The write is the same audited upsert (id present → before/after audit).
 */
function EditGuardianDialog({ guardian, onClose, onSaved }: {
  guardian: GuardianDirectoryData["guardians"][number];
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [fullName, setFullName] = useState(guardian.full_name);
  const [phone, setPhone] = useState(guardian.phone);
  const [email, setEmail] = useState(guardian.email ?? "");
  const [relationship, setRelationship] = useState(guardian.relationship);
  const [waOptIn, setWaOptIn] = useState(guardian.wa_opt_in);

  const save = () => {
    setErr(null);
    if (fullName.trim().length < 3) return setErr("Full name needs at least 3 letters.");
    const d = phone.replace(/[^\d]/g, "");
    if (!/^(?:254|0)?[17]\d{8}$/.test(d)) return setErr("Phone must be a Kenyan number — 07…, 01… or +2547…");
    start(async () => {
      const r = await upsertGuardianAction({
        id: guardian.id,
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        relationship,
        waOptIn,
      });
      if (!r.ok) { setErr(r.error ?? "Could not save."); return; }
      onSaved(`${fullName.trim()} updated — the change is on the audit trail.`);
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-950/40 p-4" role="dialog" aria-modal="true" aria-label={`Edit ${guardian.full_name}`}>
      <div className="w-full max-w-[480px] rounded bg-surface p-s6 shadow-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="microlabel">Edit guardian</p>
            <p className="font-display text-xl font-bold text-ink-950">{guardian.full_name}</p>
          </div>
          <Button variant="ghost" size="sm2" onClick={onClose}>Close</Button>
        </div>
        <form className="mt-s4 grid gap-s3" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="eg-name">Full name *</label>
            <input id="eg-name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="eg-phone">Phone * <span className="font-normal text-ink-500">(07…, 01… or +2547…)</span></label>
            <input id="eg-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="eg-email">Email (optional)</label>
            <input id="eg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
          </div>
          <fieldset>
            <legend className="text-[13px] font-semibold">Relationship</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {["mother", "father", "guardian"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRelationship(v)}
                  className={`inline-flex h-10 items-center rounded-pill px-4 text-[12.5px] font-semibold capitalize ${relationship === v ? "bg-pine-700 text-white" : "border border-paper-300 text-ink-600 hover:bg-paper-100"}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-[13px] text-ink-700">
            <input type="checkbox" checked={waOptIn} onChange={(e) => setWaOptIn(e.target.checked)} className="h-4 w-4" />
            Opted into WhatsApp announcements
          </label>
          {err ? <p className="text-[12.5px] font-semibold text-danger">{err}</p> : null}
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" loading={pending}>Save changes</Button>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Minimal CSV parser: header row (name,phone,email,relationship), quoted cells, CRLF-safe. */
export function parseCsv(text: string): { rows: { fullName: string; phone: string; email?: string; relationship: string }[] } | { error: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return { error: "The file needs a header row plus at least one guardian row." };
  const split = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; } else { q = !q; }
      } else if (ch === "," && !q) {
        out.push(cur); cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };
  const header = split(lines[0]!).map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iName = idx(["name", "fullname", "guardianname", "parentname"]);
  const iPhone = idx(["phone", "phonenumber", "mobile", "tel"]);
  const iEmail = idx(["email", "emailaddress"]);
  const iRel = idx(["relationship", "relation", "role"]);
  if (iName < 0 || iPhone < 0) {
    return { error: "The header needs at least a name and a phone column (e.g. name,phone,email,relationship)." };
  }
  const relMap: Record<string, string> = { mother: "mother", father: "father", guardian: "guardian", parent: "guardian" };
  const rows: { fullName: string; phone: string; email?: string; relationship: string }[] = [];
  for (const line of lines.slice(1)) {
    const cells = split(line);
    const fullName = cells[iName] ?? "";
    const phone = cells[iPhone] ?? "";
    if (!fullName || !phone) continue;
    const relationship = relMap[(cells[iRel]?.toLowerCase() ?? "guardian")] ?? "guardian";
    rows.push({ fullName, phone, email: iEmail >= 0 ? cells[iEmail] || undefined : undefined, relationship });
  }
  return { rows };
}
