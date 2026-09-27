"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, Money, StatusPill } from "@mandela/ui";
import {
  movePurchaseAction, raisePurchaseAction, toggleSupplierAction, upsertSupplierAction,
  type PurchasesData, type PurchaseRow,
} from "@/lib/api";

/**
 * Purchases client ㊳ — raise a request (draft or straight to approval),
 * walk the pipeline (each step a button the role can press), and the
 * supplier register with edit + activate/deactivate.
 */

const STATE_TONE: Record<string, "neutral" | "ok" | "warn" | "danger"> = {
  draft: "neutral", submitted: "warn", approved: "ok", ordered: "ok",
  received: "ok", paid: "ok", cancelled: "danger",
};

const NEXT_ACTION: Record<string, { action: PurchaseRow extends never ? never : "submit" | "approve" | "order" | "receive" | "pay"; label: string; roles: string }> = {
  draft: { action: "submit", label: "Submit", roles: "admin/bursar" },
  submitted: { action: "approve", label: "Approve", roles: "leaders" },
  approved: { action: "order", label: "Mark ordered", roles: "admin/bursar" },
  ordered: { action: "receive", label: "Mark received", roles: "admin/bursar" },
  received: { action: "pay", label: "Mark paid", roles: "admin/bursar" },
};

export function PurchasesClient({ data, canDecide }: { data: PurchasesData; canDecide: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const move = (row: PurchaseRow, action: "submit" | "approve" | "order" | "receive" | "pay" | "cancel", reason?: string) => {
    start(async () => {
      const r = await movePurchaseAction({ id: row.id, action, reason });
      if (r && "error" in r && r.error) { setMsg({ ok: false, text: r.error }); return; }
      setMsg({ ok: true, text: `${row.ref} → ${(r as { state?: string })?.state ?? "moved"} — audited.` });
      router.refresh();
    });
  };
  const [pending, start] = useTransition();

  return (
    <>
      {msg ? (
        <p role="status" className={`text-[12.5px] font-semibold ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>
      ) : null}

      <RaiseForm suppliers={data.suppliers.filter((s) => s.active)} onDone={(t) => { setMsg({ ok: true, text: t }); router.refresh(); }} />

      <Card>
        <CardHead
          title="Purchase pipeline"
          sub="Draft → submitted → approved → ordered → received → paid. Approve is leaders-only; every other step is the office."
        />
        {data.requests.length === 0 ? (
          <p className="px-s5 pb-s5 text-[13px] text-ink-500">No requests yet — raise the first one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Ref", "What", "Supplier", "Estimate", "State", ""].map((h) => (
                    <th key={h} className="microlabel px-s3 pb-s2 pt-s1 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.requests.map((r) => {
                  const next = NEXT_ACTION[r.state];
                  return (
                    <tr key={r.id} className="border-b border-paper-200 last:border-0">
                      <td className="px-s3 py-s2.5 font-mono text-xs">{r.ref}</td>
                      <td className="px-s3 py-s2.5">
                        <p className="font-semibold text-ink-950">{r.title}</p>
                        <p className="text-[12px] text-ink-500">{r.cost_center}{r.requested_by ? ` · ${r.requested_by}` : ""}</p>
                      </td>
                      <td className="px-s3 py-s2.5 text-ink-700">{r.supplier_name ?? "—"}</td>
                      <td className="px-s3 py-s2.5"><Money cents={Number(r.est_cents)} className="text-[13px]" /></td>
                      <td className="px-s3 py-s2.5">
                        <StatusPill tone={STATE_TONE[r.state] ?? "neutral"}>{r.state}</StatusPill>
                      </td>
                      <td className="px-s3 py-s2.5">
                        <div className="flex justify-end gap-1.5">
                          {next && (next.action !== "approve" || canDecide) ? (
                            <Button size="sm2" variant={next.action === "approve" ? "primary" : "ghost"} disabled={pending} onClick={() => move(r, next.action)}>
                              {next.label}
                            </Button>
                          ) : null}
                          {["draft", "submitted"].includes(r.state) ? (
                            <CancelButton row={r} pending={pending} onCancel={(reason) => move(r, "cancel", reason)} />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <SupplierCard suppliers={data.suppliers} onDone={(ok, text) => { setMsg({ ok, text }); router.refresh(); }} />
    </>
  );
}

function RaiseForm({ suppliers, onDone }: { suppliers: PurchasesData["suppliers"]; onDone: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [costCenter, setCostCenter] = useState("general");
  const [shillings, setShillings] = useState("");
  const [submitNow, setSubmitNow] = useState(true);

  const submit = () => {
    setErr(null);
    const n = Number(shillings);
    if (title.trim().length < 3) return setErr("What is being bought? (3+ letters)");
    if (!Number.isFinite(n) || n < 0) return setErr("Enter an estimate in shillings (0 if unknown).");
    start(async () => {
      const r = await raisePurchaseAction({
        title: title.trim(),
        supplierId: supplierId || null,
        costCenter,
        estCents: Math.round(n * 100),
        submit: submitNow,
      });
      if (r && "error" in r && r.error) { setErr(r.error); return; }
      setOpen(false);
      setTitle(""); setShillings("");
      const ref = r && "ref" in r ? (r as { ref: string }).ref : "";
      onDone(submitNow ? `${ref} raised and submitted for approval.` : `${ref} saved as draft.`);
    });
  };

  if (!open) {
    return (
      <div>
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>Raise purchase request</Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHead
        title="Raise a purchase request"
        sub="Draft keeps it editable; submit sends it to the leaders' approval"
        action={<Button variant="ghost" size="sm2" onClick={() => setOpen(false)}>Close</Button>}
      />
      <form className="grid max-w-[520px] gap-s3 px-s5 pb-s5" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="pr-title">What *</label>
          <input id="pr-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Exercise books, 200 copies" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="pr-sup">Supplier</label>
          <select id="pr-sup" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]">
            <option value="">Not chosen yet</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="pr-cc">Cost center</label>
            <input id="pr-cc" value={costCenter} onChange={(e) => setCostCenter(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="pr-est">Estimate (Ksh)</label>
            <input id="pr-est" inputMode="decimal" value={shillings} onChange={(e) => setShillings(e.target.value)} placeholder="e.g. 14000" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink-700">
          <input type="checkbox" checked={submitNow} onChange={(e) => setSubmitNow(e.target.checked)} className="h-4 w-4" />
          Submit for approval now (untick to keep as draft)
        </label>
        {err ? <p className="text-[12.5px] font-semibold text-danger">{err}</p> : null}
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" disabled={pending}>{pending ? "Raising…" : "Raise request"}</Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}

function CancelButton({ row, pending, onCancel }: { row: PurchaseRow; pending: boolean; onCancel: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (!open) {
    return <Button size="sm2" variant="ghost" disabled={pending} onClick={() => setOpen(true)}>Cancel</Button>;
  }
  return (
    <div className="flex items-center gap-1.5">
      <input
        value={reason}
        onChange={(e) => { setReason(e.target.value); setErr(null); }}
        placeholder="Why cancel?"
        aria-label="Cancellation reason"
        className="h-8 w-[160px] rounded-pill border border-paper-300 bg-surface px-3 text-[12px]"
      />
      <Button
        size="sm2"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (reason.trim().length < 4) { setErr("Reason required"); return; }
          onCancel(reason.trim());
        }}
      >
        Confirm
      </Button>
      {err ? <span className="text-[11.5px] font-semibold text-danger">{err}</span> : null}
    </div>
  );
}

function SupplierCard({ suppliers, onDone }: { suppliers: PurchasesData["suppliers"]; onDone: (ok: boolean, text: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PurchasesData["suppliers"][number] | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("general");
  const [err, setErr] = useState<string | null>(null);

  const openNew = () => { setEditing(null); setName(""); setPhone(""); setEmail(""); setCategory("general"); setErr(null); setOpen(true); };
  const openEdit = (s: PurchasesData["suppliers"][number]) => {
    setEditing(s); setName(s.name); setPhone(s.phone ?? ""); setEmail(s.email ?? ""); setCategory(s.category); setErr(null); setOpen(true);
  };

  const submit = () => {
    setErr(null);
    if (name.trim().length < 2) return setErr("Supplier name is required.");
    start(async () => {
      const r = await upsertSupplierAction({
        id: editing?.id,
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        category,
      });
      if (r && "error" in r && r.error) { setErr(r.error); return; }
      setOpen(false);
      onDone(true, editing ? `${name.trim()} updated — audited.` : `${name.trim()} added to the book.`);
    });
  };

  const toggle = (s: PurchasesData["suppliers"][number]) => {
    start(async () => {
      const r = await toggleSupplierAction({ id: s.id, active: !s.active });
      if (r && "error" in r && r.error) { onDone(false, r.error); return; }
      onDone(true, `${s.name} ${s.active ? "deactivated" : "reactivated"} — audited.`);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHead
        title="Supplier register"
        sub="The book every purchase draws from — names, phones, categories"
        action={<Button variant="secondary" size="sm2" onClick={openNew}>Add supplier</Button>}
      />
      {suppliers.length === 0 ? (
        <p className="px-s5 pb-s5 text-[13px] text-ink-500">No suppliers yet — add the first one above.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Name", "Phone", "Category", "Status", ""].map((h) => (
                  <th key={h} className="microlabel px-s3 pb-s2 pt-s1 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-b border-paper-200 last:border-0">
                  <td className="px-s3 py-s2.5 font-semibold text-ink-950">{s.name}</td>
                  <td className="px-s3 py-s2.5 text-ink-700">{s.phone ?? "—"}</td>
                  <td className="px-s3 py-s2.5 text-ink-700">{s.category}</td>
                  <td className="px-s3 py-s2.5">
                    <StatusPill tone={s.active ? "ok" : "neutral"}>{s.active ? "active" : "off"}</StatusPill>
                  </td>
                  <td className="px-s3 py-s2.5">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm2" variant="ghost" disabled={pending} onClick={() => openEdit(s)}>Edit</Button>
                      <Button size="sm2" variant="ghost" disabled={pending} onClick={() => toggle(s)}>
                        {s.active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-950/40 p-4" role="dialog" aria-modal="true" aria-label="Supplier form">
          <div className="w-full max-w-[480px] rounded bg-surface p-s6 shadow-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="microlabel">{editing ? "Edit supplier" : "Add supplier"}</p>
                <p className="font-display text-xl font-bold text-ink-950">{editing ? editing.name : "New on the book"}</p>
              </div>
              <Button variant="ghost" size="sm2" onClick={() => setOpen(false)}>Close</Button>
            </div>
            <form className="mt-s4 grid gap-s3" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="sup-name">Name *</label>
                <input id="sup-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="sup-phone">Phone</label>
                  <input id="sup-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07…" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="sup-email">Email</label>
                  <input id="sup-email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
                </div>
              </div>
              <div>
                <span className="mb-1 block text-[12px] font-semibold text-ink-700">Category</span>
                <div className="flex flex-wrap gap-2">
                  {["food", "stationery", "fuel", "repairs", "services", "general"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`h-9 rounded-pill px-3.5 text-[12px] font-semibold ${category === c ? "bg-pine-700 text-white" : "border border-paper-300 text-ink-600 hover:bg-paper-100"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              {err ? <p className="text-[12.5px] font-semibold text-danger">{err}</p> : null}
              <div className="flex items-center gap-2">
                <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Add to book"}</Button>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
