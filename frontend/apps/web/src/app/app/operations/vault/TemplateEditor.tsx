"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@mandela/ui";
import { upsertDocTemplateAction, type DocTemplateRow } from "@/lib/api";
import { ThemedDocSheet, type DocStyleOptions } from "@/components/doc/ThemedDocSheet";

/**
 * TemplateEditor — the theme form for one document template. Left: the body
 * ({{placeholder}} markdown) with a placeholder palette to click in; right:
 * the theme — document kind, accent, paper wash, logo & signature toggles,
 * signer labels. A live A4 preview renders exactly what the PDF will look
 * like (school identity comes from school_settings, not from this form).
 * Saving is audited server-side (`doc.template.upsert`).
 */

const DOC_KINDS = ["letter", "memo", "invoice", "receipt", "report-card", "report", "purchase-order", "fee-structure", "notice", "other"] as const;

const PALETTE = ["school_name", "learner_name", "adm_no", "class_name", "term", "issue_date", "issuer_name", "issuer_role", "guardian_name", "items_md", "total", "paid", "balance", "subject", "body"];

function inputCls(extra = "") {
  return `w-full rounded-sm border border-border bg-surface px-3 py-2 text-[13px] focus:border-pine-300 focus:outline-none focus:ring-2 focus:ring-pine-100 ${extra}`;
}

export function TemplateEditor({
  template,
  school,
  onClose,
}: {
  template: DocTemplateRow | null; // null = new template
  school: { name: string; contact_phone: string | null; contact_email: string | null; contact_address: string | null; logo_svg_path: string | null };
  onClose: () => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState(template?.code ?? "");
  const [name, setName] = useState(template?.name ?? "");
  const [docKind, setDocKind] = useState<string>(template?.doc_kind ?? "letter");
  const [body, setBody] = useState(template?.body_md ?? "# {{school_name}}\n\n{{body}}\n");
  const [style, setStyle] = useState<DocStyleOptions>((template?.style_json as DocStyleOptions) ?? { accent: "brand", paper: "plain", showLogo: true, showSignatures: true, signer1Label: "Signed", signer2Label: "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const placeholders = useMemo(() => {
    const found = new Set<string>();
    for (const m of body.matchAll(/\{\{([^}]+)\}\}/g)) found.add(m[1]!.trim());
    return [...found];
  }, [body]);

  async function save() {
    setErr(null);
    if (!name.trim()) return setErr("Give the template a name.");
    if (!body.trim()) return setErr("The template body can't be empty.");
    setPending(true);
    const finalCode = (code || name).trim().toUpperCase().replace(/[^A-Z0-9-]+/g, "-");
    const res = await upsertDocTemplateAction({ code: finalCode, name: name.trim(), bodyMd: body, docKind, styleJson: style as Record<string, unknown> });
    setPending(false);
    if (res && "ok" in res && res.ok === false) return setErr(res.error ?? "Could not save the template.");
    onClose();
    router.refresh();
  }

  function set<K extends keyof DocStyleOptions>(k: K, v: DocStyleOptions[K]) {
    setStyle((s) => ({ ...s, [k]: v }));
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink-950/40 p-4" role="dialog" aria-modal="true" aria-label="Edit template">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default" />
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded border border-border bg-surface shadow-2">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="font-display text-[16px] font-semibold text-ink-950">{template ? `Edit template — ${template.name}` : "New template"}</p>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>

        <div className="grid flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[1.2fr_1fr]">
          {/* LEFT — body + placeholders */}
          <div>
            {!template ? (
              <label className="block text-[12.5px] font-semibold text-ink-900">
                Code
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="AUTO from name" className={`mt-1 font-mono ${inputCls()}`} />
              </label>
            ) : (
              <p className="font-mono text-[11px] text-muted">{code}</p>
            )}
            <label className="mt-3 block text-[12.5px] font-semibold text-ink-900">
              Template name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Term invoice" className={`mt-1 ${inputCls()}`} />
            </label>

            <label className="mt-3 block text-[12.5px] font-semibold text-ink-900">
              Body — {"{{placeholders}}"} fill when the document is issued
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className={`mt-1 font-mono text-[12px] leading-relaxed ${inputCls()}`} />
            </label>

            <p className="mt-2 text-[11px] text-muted">Click to insert:</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {PALETTE.filter((p) => !placeholders.includes(p)).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setBody((b) => `${b}{{${p}}}`)}
                  className="rounded-full border border-border px-2 py-0.5 font-mono text-[10.5px] text-ink-700 hover:border-pine-300 hover:bg-ambient-panel"
                >
                  {`{{${p}}}`}
                </button>
              ))}
            </div>
          </div>

          {/* RIGHT — the theme form */}
          <div>
            <label className="block text-[12.5px] font-semibold text-ink-900">
              Document kind
              <select value={docKind} onChange={(e) => setDocKind(e.target.value)} className={`mt-1 ${inputCls()}`}>
                {DOC_KINDS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </label>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block text-[12.5px] font-semibold text-ink-900">
                Accent
                <select value={style.accent ?? "brand"} onChange={(e) => set("accent", e.target.value as DocStyleOptions["accent"])} className={`mt-1 ${inputCls()}`}>
                  <option value="brand">School brand</option>
                  <option value="ink">Ink (black)</option>
                </select>
              </label>
              <label className="block text-[12.5px] font-semibold text-ink-900">
                Paper
                <select value={style.paper ?? "plain"} onChange={(e) => set("paper", e.target.value as DocStyleOptions["paper"])} className={`mt-1 ${inputCls()}`}>
                  <option value="plain">Plain white</option>
                  <option value="wash">Brand wash</option>
                </select>
              </label>
            </div>

            <label className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-900">
              <input type="checkbox" checked={style.showLogo !== false} onChange={(e) => set("showLogo", e.target.checked)} className="accent-pine-700" />
              Show school logo
            </label>
            <label className="mt-1.5 flex items-center gap-2 text-[12.5px] text-ink-900">
              <input type="checkbox" checked={style.showSignatures !== false} onChange={(e) => set("showSignatures", e.target.checked)} className="accent-pine-700" />
              Signature strip
            </label>

            {style.showSignatures !== false ? (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <label className="block text-[12px] font-semibold text-ink-900">
                  Signer 1 label
                  <input value={style.signer1Label ?? ""} onChange={(e) => set("signer1Label", e.target.value)} placeholder="Principal" className={`mt-1 ${inputCls()}`} />
                </label>
                <label className="block text-[12px] font-semibold text-ink-900">
                  Signer 2 label
                  <input value={style.signer2Label ?? ""} onChange={(e) => set("signer2Label", e.target.value)} placeholder="Bursar" className={`mt-1 ${inputCls()}`} />
                </label>
              </div>
            ) : null}

            <label className="mt-3 block text-[12.5px] font-semibold text-ink-900">
              Footer note
              <input value={style.footerNote ?? ""} onChange={(e) => set("footerNote", e.target.value)} placeholder="Generated from the school ledger" className={`mt-1 ${inputCls()}`} />
            </label>

            {/* Live A4 preview — the same sheet the PDF prints */}
            <p className="mt-4 microlabel">Preview</p>
            <div className="mt-1 max-h-[340px] overflow-y-auto rounded border border-border bg-paper-100 p-3">
              <div className="origin-top scale-[0.82]">
                <ThemedDocSheet
                  title={name || "Document title"}
                  bodyMd={body.replace(/\{\{([^}]+)\}\}/g, (_m, k: string) => `«${k}»`)}
                  style={style}
                  school={school}
                  meta={{ issuer: "Preview", ref: "PREVIEW", kind: docKind }}
                />
              </div>
            </div>
          </div>
        </div>

        {err ? (
          <p className="border-t border-border px-5 py-2 text-[13px] font-semibold text-danger" role="alert">{err}</p>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={pending}>Save template</Button>
        </div>
      </div>
    </div>
  );
}
