import type { ReactNode } from "react";

/**
 * Shared chrome for every vault-issued document (invoices, memos, notices,
 * report cards…). One letterhead, one signature strip, one theme contract:
 * every document is a "theme form" — the school's colors, contacts and traced
 * logo come from school_settings; the per-template options (accent, paper
 * wash, logo/signature toggles, signer labels) come from style_json, frozen
 * onto the issued copy at issue time so the PDF always matches the office's
 * copy. No print button here — the vault only ever downloads PDFs.
 *
 * The body is a small markdown subset, but it is RENDERED DESIGNED, not as
 * raw markdown: label/value tables become an info panel, item tables become
 * striped data tables with a highlighted totals row, headings become bands —
 * matching the office's inspo templates (banded invoices, ruled memos,
 * gridded report cards).
 */

export interface DocStyleOptions {
  accent?: "brand" | "ink" | "none";
  paper?: "plain" | "wash";
  showLogo?: boolean;
  showSignatures?: boolean;
  signer1Label?: string;
  signer2Label?: string;
  signer1Name?: string;
  signer2Name?: string;
  footerNote?: string;
}

export interface DocSchoolIdentity {
  name: string;
  contact_phone: string | null;
  contact_email: string | null;
  contact_address: string | null;
  logo_svg_path: string | null;
}

const KIND_LABEL: Record<string, string> = {
  invoice: "Invoice",
  receipt: "Receipt",
  memo: "Memorandum",
  notice: "Notice",
  "purchase-order": "Purchase Order",
  "fee-structure": "Fee Structure",
  "report-card": "Term Report",
  report: "Report",
  letter: "Letter",
  other: "Document",
};

/** **bold** + {{placeholders}} that never got filled → render as a dotted blank. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\{\{[^}]+\}\})/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**"))
          return <strong key={i} className="font-semibold text-ink-950">{p.slice(2, -2)}</strong>;
        if (p.startsWith("{{") && p.endsWith("}}"))
          return (
            <span key={i} className="inline-block w-24 border-b border-dashed border-ink-400/70 align-baseline" title={`${p.slice(2, -2)} (not filled)`} />
          );
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

interface Block {
  kind: "h1" | "h2" | "quote" | "p" | "table";
  text?: string;
  rows?: string[][];
}

function parseBlocks(body: string): Block[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("|")) {
        const cells = lines[i]!.split("|").slice(1, -1).map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      if (rows.length) blocks.push({ kind: "table", rows });
      continue;
    }
    if (line.startsWith("# ")) { blocks.push({ kind: "h1", text: line.slice(2) }); i++; continue; }
    if (line.startsWith("## ")) { blocks.push({ kind: "h2", text: line.slice(3) }); i++; continue; }
    if (line.startsWith("> ")) { blocks.push({ kind: "quote", text: line.slice(2) }); i++; continue; }
    if (line.trim() === "") { i++; continue; }
    blocks.push({ kind: "p", text: line });
    i++;
  }
  return blocks;
}

function isTotalRow(row: string[]): boolean {
  const first = row[0]?.replace(/\*/g, "").toLowerCase() ?? "";
  return /total|balance|amount due|subtotal|grand/.test(first);
}

/** Label/value pair table (2 cols, bold labels, empty header) → info panel. */
function isInfoGrid(rows: string[][]): boolean {
  if (rows.length < 1) return false;
  const headerEmpty = rows[0]!.every((c) => c === "" || /^\*+$/.test(c));
  const twoCol = rows.every((r) => r.length === 2);
  const labeled = rows.slice(1).every((r) => r[0]!.startsWith("**"));
  return twoCol && (headerEmpty ? labeled || rows.length > 1 : labeled);
}

function RenderBlocks({ blocks, accentText }: { blocks: Block[]; accentText: string }) {
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < blocks.length) {
    const b = blocks[i]!;

    if (b.kind === "h1") {
      out.push(
        <div key={key++} className="mt-6 flex items-center gap-3">
          <span className="h-[26px] w-1.5 rounded-full bg-pine-700" aria-hidden />
          <p className={`font-display text-[19px] font-bold uppercase tracking-[0.06em] ${accentText}`}>
            <Inline text={b.text!} />
          </p>
        </div>,
      );
      i++;
      continue;
    }

    if (b.kind === "h2") {
      out.push(
        <div key={key++} className="mt-5 border-b border-paper-300 pb-1.5">
          <p className="microlabel tracking-[0.14em] text-ink-700">
            <Inline text={b.text!} />
          </p>
        </div>,
      );
      i++;
      continue;
    }

    if (b.kind === "quote") {
      out.push(
        <p key={key++} className="mt-4 border-l-[3px] border-pine-300 bg-paper-50 py-2 pl-3 pr-2 text-[11.5px] italic text-ink-600">
          {b.text}
        </p>,
      );
      i++;
      continue;
    }

    if (b.kind === "table") {
      const rows = b.rows!;
      // Info grid: the | | | label/value blocks at the top of the templates.
      if (isInfoGrid(rows)) {
        out.push(
          <dl key={key++} className="mt-4 grid grid-cols-[minmax(120px,180px)_1fr] gap-x-4 gap-y-0 overflow-hidden rounded-sm border border-paper-300 bg-surface">
            {rows.slice(rows[0]!.some((c) => c !== "") ? 1 : 0).map((r, ri) => (
              <div key={ri} className={`col-span-2 grid grid-cols-subgrid items-baseline px-4 py-2 ${ri % 2 ? "bg-paper-50" : ""}`}>
                <dt className="microlabel text-ink-500">
                  <Inline text={r[0]!.replace(/\*\*/g, "")} />
                </dt>
                <dd className="text-[13px] text-ink-900"><Inline text={r[1] ?? ""} /></dd>
              </div>
            ))}
          </dl>,
        );
        i++;
        continue;
      }

      // Data table: header band, striped rows, right-aligned numerals, highlighted totals.
      const hasHeader = !rows[0]!.every((c) => c === "");
      const header = hasHeader ? rows[0]! : null;
      const body = hasHeader ? rows.slice(1) : rows;
      const numericCols = new Set(
        header
          ? header.map((_, ci) => ci).filter((ci) => ci > 0 && body.some((r) => /^[\d,.()%\sKESk-]+$/.test(r[ci] ?? "")))
          : body[0]?.map((_, ci) => ci).filter((ci) => ci > 0) ?? [],
      );
      out.push(
        <table key={key++} className="mt-4 w-full overflow-hidden border-collapse text-left text-[12.5px]">
          {header ? (
            <thead>
              <tr className="bg-pine-700 text-white">
                {header.map((h, ci) => (
                  <th key={ci} className={`px-3 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] ${numericCols.has(ci) ? "text-right" : ""}`}>
                    {h.replace(/\*\*/g, "")}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {body.map((r, ri) => {
              const total = isTotalRow(r);
              return (
                <tr key={ri} className={`${total ? "bg-accent-soft font-semibold" : ri % 2 ? "bg-paper-50" : "bg-surface"} border-b border-paper-200`}>
                  {r.map((cell, ci) => (
                    <td
                      key={ci}
                      className={`px-3 py-2 align-top ${numericCols.has(ci) || ci > 0 ? "text-right numeral" : "font-medium"} ${total ? "text-ink-950" : "text-ink-800"}`}
                    >
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>,
      );
      i++;
      continue;
    }

    out.push(
      <p key={key++} className="mt-3 text-[13px] leading-relaxed text-ink-800">
        <Inline text={b.text!} />
      </p>,
    );
    i++;
  }

  return <div>{out}</div>;
}

/** Traced logo from school_settings — currentColor, so it takes the accent. */
function DocLogo({ path, accentClass }: { path: string | null; accentClass: string }) {
  if (!path) return null;
  return (
    <svg viewBox="0 0 100 100" className={`h-12 w-12 ${accentClass}`} role="img" aria-label="School crest">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

/**
 * The full document sheet — A4 paper, letterhead, title band, designed body,
 * signature strip. Embeddable anywhere; the print route wraps it in the
 * @page rule.
 */
export function ThemedDocSheet({
  title,
  bodyMd,
  style,
  school,
  meta,
}: {
  title: string;
  bodyMd: string | null;
  style: DocStyleOptions | null;
  school: DocSchoolIdentity;
  meta?: { issuer?: string | null; issuedOn?: string | null; ref?: string | null; kind?: string | null };
}) {
  const s: DocStyleOptions = style ?? {};
  const accentText = s.accent === "ink" ? "text-ink-950" : "text-pine-800";
  const contacts = [school.contact_address, school.contact_phone, school.contact_email].filter(Boolean).join(" · ");
  const issuedOn = meta?.issuedOn ? new Date(meta.issuedOn).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" }) : null;
  const signatureCount = s.showSignatures ? (s.signer2Label ? 2 : 1) : 0;
  const kindLabel = KIND_LABEL[meta?.kind ?? ""] ?? null;
  const blocks = bodyMd ? parseBlocks(bodyMd) : [];

  return (
    <div
      data-doc
      className={`relative mx-auto w-full max-w-[820px] overflow-hidden px-10 py-10 ${s.paper === "wash" ? "bg-ambient-panel" : "bg-surface"}`}
    >
      {/* Accent spine — the designed edge every document carries */}
      <span className="absolute inset-y-0 left-0 w-1.5 bg-pine-700" aria-hidden />

      {/* Letterhead — school_settings is the only source of truth */}
      <header className="flex items-start justify-between gap-6 border-b-2 border-pine-800 pb-5">
        <div className="flex items-start gap-4">
          {s.showLogo !== false ? <DocLogo path={school.logo_svg_path} accentClass={accentText} /> : null}
          <div>
            <p className={`font-display text-[22px] font-bold leading-tight tracking-tight ${accentText}`}>{school.name}</p>
            {contacts ? <p className="mt-1 text-[11px] text-ink-500">{contacts}</p> : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {kindLabel ? <p className="rounded-full bg-accent-soft px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-800">{kindLabel}</p> : null}
          {meta?.ref ? <p className="mt-1 font-mono text-[10.5px] text-ink-500">{meta.ref}</p> : null}
          {issuedOn ? <p className="text-[10.5px] text-ink-500">Issued {issuedOn}</p> : null}
        </div>
      </header>

      {/* Title band */}
      <div className="mt-6 border-b border-paper-300 pb-2">
        <h1 className={`font-display text-[18px] font-bold uppercase tracking-[0.09em] ${accentText}`}>{title}</h1>
      </div>

      <div className="mt-1">{blocks.length ? <RenderBlocks blocks={blocks} accentText={accentText} /> : <p className="mt-3 text-[13px] italic text-ink-500">No body was recorded for this document.</p>}</div>

      {/* Signature strip — labels from style_json, names from the issue form; each with a date line */}
      {signatureCount > 0 ? (
        <div className="mt-14 grid gap-12" style={{ gridTemplateColumns: `repeat(${signatureCount}, minmax(0, 1fr))` }}>
          {[0, 1].slice(0, signatureCount).map((n) => {
            const label = n === 0 ? s.signer1Label ?? "Signed" : s.signer2Label ?? "Signed";
            const name = n === 0 ? s.signer1Name : s.signer2Name;
            return (
              <div key={n}>
                <p className="min-h-[18px] text-[12.5px] italic text-ink-700">{name ?? ""}</p>
                <div className="mt-6 border-t border-ink-950/60 pt-1.5 text-[11px] font-medium text-ink-700">{label}</div>
                <p className="mt-1.5 text-[10.5px] text-ink-400">Date <span className="ml-1 inline-block w-20 border-b border-dashed border-ink-400/70 align-baseline" /></p>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Footer — accent tick + note */}
      <div className="mt-10 flex items-start justify-between gap-6 border-t border-paper-300 pt-3">
        <p className="text-[10px] leading-relaxed text-ink-400">
          {s.footerNote ?? "Generated from the school ledger — figures agree with the office copy."}
        </p>
        <p className="shrink-0 text-[10px] text-ink-400">
          {meta?.issuer ? <>Issued by <span className="font-semibold text-ink-600">{meta.issuer}</span></> : school.name}
        </p>
      </div>
    </div>
  );
}
