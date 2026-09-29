"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, EmptyState } from "@mandela/ui";
import {
  deleteAssetAction, lookupAssetAction, upsertAssetAction,
  type AssetArchiveData, type AssetRow,
} from "@/lib/api";

/**
 * ArchiveClient — the register desk. Barcode scanners are HID keyboards:
 * focus the barcode input, scan (the scanner types the code + Enter), the
 * form either fills with the existing record (update condition/location/qty)
 * or opens fresh for a new accession. Works phone-camera too via any
 * keyboard-wedge scanner app.
 */

const DEPARTMENTS = [
  { key: "library", label: "📚 Library", hint: "books — barcode per copy" },
  { key: "lab", label: "🧪 Laboratories", hint: "equipment & apparatus" },
  { key: "dorm", label: "🛏 Dorms", hint: "beds, mattresses, lockers" },
  { key: "class", label: "🪑 Classrooms", hint: "desks, chairs" },
  { key: "office", label: "🗄 Offices", hint: "furniture & cabinets" },
  { key: "other", label: "📦 Other", hint: "everything else" },
] as const;

const CONDITIONS = ["good", "worn", "broken", "lost"] as const;
const SOURCES = ["bought", "donated", "government", "bequest"] as const;

export function fmtMoney(cents: number): string {
  return "KSh " + (cents / 100).toLocaleString("en-KE", { maximumFractionDigits: 0 });
}

type DeptKey = (typeof DEPARTMENTS)[number]["key"];

export function ArchiveClient({ data, canEdit, canDelete }: {
  data: AssetArchiveData;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [dept, setDept] = useState<DeptKey>("library");
  const [q, setQ] = useState("");
  const [cond, setCond] = useState("");
  const [editing, setEditing] = useState<AssetRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const scanRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.rows.filter(
      (r) =>
        r.department === dept &&
        (!cond || r.condition === cond) &&
        (!needle ||
          r.name.toLowerCase().includes(needle) ||
          r.barcode.toLowerCase().includes(needle) ||
          (r.author ?? "").toLowerCase().includes(needle) ||
          (r.category ?? "").toLowerCase().includes(needle) ||
          (r.location ?? "").toLowerCase().includes(needle)),
    );
  }, [data.rows, dept, q, cond]);

  const totals = data.totals.find((t) => t.department === dept);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
    setMsg(null);
  };

  const openEdit = (r: AssetRow) => {
    setEditing(r);
    setFormOpen(true);
    setMsg(null);
  };

  const remove = (r: AssetRow) => {
    if (!confirm(`Delete "${r.name}" (${r.barcode}) from the register? The audit trail keeps the record.`)) return;
    start(async () => {
      const res = await deleteAssetAction({ id: r.id });
      if (res && "error" in res && res.error) setMsg({ ok: false, text: res.error });
      else setMsg({ ok: true, text: `${r.name} removed from the register — audited.` });
      router.refresh();
    });
  };

  const del = canDelete ? remove : undefined;

  return (
    <>
      {msg ? (
        <p role="status" className={`text-[12.5px] font-semibold ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>
      ) : null}

      {/* Department tabs */}
      <div className="flex flex-wrap gap-2">
        {DEPARTMENTS.map((d) => {
          const t = data.totals.find((x) => x.department === d.key);
          const active = dept === d.key;
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => setDept(d.key)}
              className={`rounded-pill px-4 py-2 text-[12.5px] font-semibold transition-colors ${
                active ? "bg-pine-700 text-white" : "border border-paper-300 text-ink-600 hover:bg-paper-100"
              }`}
            >
              {d.label}
              {t ? <span className={`ml-2 ${active ? "text-white/80" : "text-ink-400"}`}>{t.units}</span> : null}
            </button>
          );
        })}
      </div>

      <Card>
        <CardHead
          title={DEPARTMENTS.find((d) => d.key === dept)!.label.replace(/^\S+\s/, "") + " register"}
          sub={
            totals
              ? `${totals.units} units · ${fmtMoney(Number(totals.value_cents))} recorded${totals.damaged ? ` · ${totals.damaged} worn/broken/lost` : ""}`
              : DEPARTMENTS.find((d) => d.key === dept)!.hint + " — nothing recorded yet"
          }
          action={
            canEdit ? (
              <Button variant="primary" size="sm" onClick={openNew}>
                {dept === "library" ? "+ Record book" : "+ Record item"}
              </Button>
            ) : null
          }
        />

        {rows.length === 0 && !formOpen ? (
          <EmptyState
            title="Nothing recorded here yet"
            body={
              dept === "library"
                ? "Record the books the school owns — scan each copy's barcode, or type one. New arrivals go in the day they reach the shelf."
                : "Record what the school owns in this department — one entry per item type, with condition and location."
            }
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-paper-200 px-s5 py-s3">
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, barcode, author, location…"
                aria-label="Search the register"
                className="h-9 min-w-[220px] flex-1 rounded-sm border border-paper-300 bg-surface px-3 text-[13px] text-ink-950 outline-none focus:border-pine-400"
              />
              <select
                aria-label="Filter by condition"
                value={cond}
                onChange={(e) => setCond(e.target.value)}
                className="h-9 rounded-sm border border-paper-300 bg-surface px-2.5 text-[12.5px] text-ink-950"
              >
                <option value="">Any condition</option>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <span className="text-[11.5px] text-muted">{rows.length} entr{rows.length === 1 ? "y" : "ies"}</span>
            </div>
            <div className="overflow-x-auto px-s5 pb-s5">
              <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-paper-200 text-left">
                    <th className="microlabel py-2 pr-2">Barcode</th>
                    <th className="microlabel py-2 pr-2">{dept === "library" ? "Title / author" : "Item"}</th>
                    <th className="microlabel py-2 pr-2">Qty</th>
                    <th className="microlabel py-2 pr-2">Condition</th>
                    <th className="microlabel py-2 pr-2">Location</th>
                    <th className="microlabel py-2 pr-2">Source</th>
                    <th className="microlabel py-2 pr-2 text-right">Value</th>
                    {canEdit ? <th className="microlabel py-2 text-right">Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-paper-100">
                      <td className="py-2 pr-2 font-mono text-[12px] text-ink-600">{r.barcode}</td>
                      <td className="py-2 pr-2">
                        <span className="block font-semibold text-ink-950">{r.name}</span>
                        {r.author || r.category ? (
                          <span className="block text-[11px] text-ink-500">{[r.author, r.category].filter(Boolean).join(" · ")}</span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-2 font-mono">{r.qty}</td>
                      <td className="py-2 pr-2">
                        <ConditionPill v={r.condition} />
                      </td>
                      <td className="py-2 pr-2 text-ink-600">{r.location ?? "—"}</td>
                      <td className="py-2 pr-2 text-ink-600">{r.source}{r.source_ref ? ` · ${r.source_ref}` : ""}</td>
                      <td className="py-2 pr-2 text-right font-mono">{fmtMoney(Number(r.price_cents) * r.qty)}</td>
                      {canEdit ? (
                        <td className="py-2 text-right">
                          <span className="inline-flex gap-2">
                            <button type="button" onClick={() => openEdit(r)} className="text-[12px] font-semibold text-pine-700 hover:underline">Edit</button>
                            {del ? (
                              <button type="button" onClick={() => del(r)} className="text-[12px] font-semibold text-danger hover:underline">Delete</button>
                            ) : null}
                          </span>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {formOpen ? (
        <AssetForm
          dept={dept}
          row={editing}
          scanRef={scanRef}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={(text) => { setMsg({ ok: true, text }); setFormOpen(false); setEditing(null); router.refresh(); }}
        />
      ) : null}
    </>
  );
}

function ConditionPill({ v }: { v: string }) {
  const tone =
    v === "good" ? "bg-ok/10 text-ok"
    : v === "worn" ? "bg-amber-100 text-amber-900"
    : v === "broken" ? "bg-orange-100 text-orange-900"
    : "bg-danger/10 text-danger";
  return <span className={`inline-block rounded-pill px-2 py-0.5 text-[11px] font-bold ${tone}`}>{v}</span>;
}

function AssetForm({ dept, row, scanRef, onClose, onSaved }: {
  dept: DeptKey;
  row: AssetRow | null;
  scanRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [barcode, setBarcode] = useState(row?.barcode ?? "");
  const [name, setName] = useState(row?.name ?? "");
  const [author, setAuthor] = useState(row?.author ?? "");
  const [isbn, setIsbn] = useState(row?.isbn ?? "");
  const [category, setCategory] = useState(row?.category ?? "");
  const [source, setSource] = useState(row?.source ?? "bought");
  const [sourceRef, setSourceRef] = useState(row?.source_ref ?? "");
  const [price, setPrice] = useState(row?.price_cents ? String(Number(row.price_cents) / 100) : "");
  const [receivedOn, setReceivedOn] = useState(row?.received_on ?? new Date().toISOString().slice(0, 10));
  const [condition, setCondition] = useState(row?.condition ?? "good");
  const [location, setLocation] = useState(row?.location ?? "");
  const [qty, setQty] = useState(String(row?.qty ?? 1));
  const [note, setNote] = useState(row?.note ?? "");

  const isLibrary = dept === "library";

  // Scan-to-input: a HID barcode scanner types the code + Enter into the
  // barcode field. Enter looks the code up — an existing record fills the
  // form for update; a new one is ready to complete and save.
  const onScanEnter = async () => {
    const code = barcode.trim();
    if (!code) return;
    setScanMsg(null);
    const r = await lookupAssetAction(code);
    if (r.found && r.asset) {
      const a = r.asset;
      setScanMsg(`Found: ${a.name} — edit and save to update it.`);
      setName(a.name);
      setAuthor(a.author ?? "");
      setIsbn(a.isbn ?? "");
      setCategory(a.category ?? "");
      setSource(a.source);
      setSourceRef(a.source_ref ?? "");
      setPrice(a.price_cents ? String(Number(a.price_cents) / 100) : "");
      setReceivedOn(a.received_on);
      setCondition(a.condition);
      setLocation(a.location ?? "");
      setQty(String(a.qty));
      setNote(a.note ?? "");
    } else {
      setScanMsg("New accession — complete the details and save.");
      if (!name) setName("");
    }
  };

  const save = () => {
    setErr(null);
    start(async () => {
      const priceCents = price.trim() ? Math.round(Number(price) * 100) : 0;
      const r = await upsertAssetAction({
        id: row?.id,
        department: dept,
        barcode: barcode.trim(),
        name: name.trim(),
        author: author.trim() || null,
        isbn: isbn.trim() || null,
        category: category.trim() || null,
        source,
        sourceRef: sourceRef.trim() || null,
        priceCents: Number.isFinite(priceCents) ? priceCents : 0,
        receivedOn: receivedOn || null,
        condition,
        location: location.trim() || null,
        qty: Math.max(1, Number(qty) || 1),
        note: note.trim() || null,
      });
      if (r && "error" in r && r.error) { setErr(r.error); return; }
      onSaved(
        row
          ? `${name.trim()} updated — audited.`
          : scanMsg?.startsWith("Found")
            ? `${name.trim()} (${barcode.trim()}) updated from a scan — audited.`
            : `${name.trim()} recorded in the ${dept} register — audited.`,
      );
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-950/40 p-4" role="dialog" aria-modal="true" aria-label="Record asset">
      <div className="w-full max-w-[580px] rounded bg-surface p-s6 shadow-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="microlabel">{row ? "Edit register entry" : "New register entry"}</p>
            <p className="font-display text-xl font-bold text-ink-950">
              {isLibrary ? "Book / copy" : DEPARTMENTS.find((d) => d.key === dept)!.label.replace(/^\S+\s/, "")}
            </p>
            <p className="text-[12px] text-ink-500">
              Connect a USB or Bluetooth barcode scanner — it types into the barcode box and presses Enter. Re-scanning an existing code loads it for update.
            </p>
          </div>
          <Button variant="ghost" size="sm2" onClick={onClose}>Close</Button>
        </div>
        <form className="mt-s4 grid gap-s3" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="as-barcode">Barcode / accession no. *</label>
            <input
              id="as-barcode"
              ref={scanRef}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onScanEnter(); } }}
              placeholder="Scan or type — e.g. LIB-000123"
              autoFocus
              className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 font-mono text-[13.5px]"
            />
            {scanMsg ? <p className="mt-1 text-[12px] font-semibold text-pine-700">{scanMsg}</p> : null}
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="as-name">{isLibrary ? "Title *" : "Name *"}</label>
            <input id="as-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={isLibrary ? "e.g. Oxford Kiswahili Fasihi" : "e.g. Microscope, student"} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
          </div>
          {isLibrary ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="as-author">Author / publisher</label>
                <input id="as-author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="e.g. Oxford University Press" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="as-isbn">ISBN</label>
                <input id="as-isbn" value={isbn} onChange={(e) => setIsbn(e.target.value)} placeholder="978…" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 font-mono text-[13px]" />
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="as-category">Category</label>
              <input id="as-category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder={isLibrary ? "e.g. Fiction, Course book" : "e.g. Glassware, Desks"} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="as-location">Location</label>
              <input id="as-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder={isLibrary ? "e.g. Rack B3" : "e.g. Chem lab cabinet 2"} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="as-source">Source</label>
              <select id="as-source" value={source} onChange={(e) => setSource(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-2.5 text-[13px]">
                {SOURCES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="as-ref">Vendor / donor</label>
              <input id="as-ref" value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} placeholder="e.g. Text Book Centre" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13px]" />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="as-price">Unit price (KSh)</label>
              <input id="as-price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="0" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 font-mono text-[13px]" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="as-date">Received on</label>
              <input id="as-date" type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 font-mono text-[12.5px]" />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="as-cond">Condition</label>
              <select id="as-cond" value={condition} onChange={(e) => setCondition(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-2.5 text-[13px]">
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="as-qty">Qty</label>
              <input id="as-qty" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 font-mono text-[13px]" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="as-note">Note</label>
            <input id="as-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="anything worth remembering" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
          </div>
          {err ? <p className="text-[12.5px] font-semibold text-danger">{err}</p> : null}
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : row ? "Save changes" : "Record in register"}</Button>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
