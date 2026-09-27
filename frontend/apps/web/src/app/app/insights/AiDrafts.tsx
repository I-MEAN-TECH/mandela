"use client";

import { useState } from "react";
import { Card, CardHead, Button } from "@mandela/ui";
import { draftParentMessageAction } from "@/lib/api";

/**
 * AI drafts desk (flank #11) — draft-only, never auto-send. The leader
 * writes intent in staff shorthand; the drafter renders plain language.
 * The textarea is always editable; "send" is whatever human action the
 * school already does (Broadcast, Talk) — this desk only produces text.
 */
export function AiDrafts() {
  const [subject, setSubject] = useState("");
  const [intent, setIntent] = useState("");
  const [tone, setTone] = useState("warm");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    setCopied(false);
    const r = await draftParentMessageAction({ subject: subject.trim() || "School message", intent, tone });
    if (r.ok && r.data?.draft) setDraft(r.data.draft);
    else setError(r.error ?? "The drafter did not return a draft.");
    setBusy(false);
  }

  return (
    <Card>
      <CardHead
        title="AI drafts (draft-only)"
        sub="Plain-language parent messages — a human always edits and always sends"
      />
      <div className="grid gap-3 px-4 pb-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2.5">
          <label className="microlabel" htmlFor="ai-subject">Subject</label>
          <input id="ai-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Fee balance reminder"
            className="h-9 rounded-sm border border-paper-300 bg-surface px-2.5 text-[13px] outline-none focus:border-primary" />
          <label className="microlabel" htmlFor="ai-intent">Your intent (staff shorthand is fine)</label>
          <textarea id="ai-intent" value={intent} onChange={(e) => setIntent(e.target.value)} rows={4}
            placeholder="balance 12,500 term 2 · pay by Friday or learner misses exam entry"
            className="rounded-sm border border-paper-300 bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-primary" />
          <label className="microlabel" htmlFor="ai-tone">Tone</label>
          <select id="ai-tone" value={tone} onChange={(e) => setTone(e.target.value)}
            className="h-9 rounded-sm border border-paper-300 bg-surface px-2.5 text-[13px] outline-none focus:border-primary">
            <option value="warm">Warm</option>
            <option value="formal">Formal</option>
            <option value="urgent">Urgent</option>
          </select>
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={busy || intent.trim().length < 3} onClick={generate}>{draft ? "Regenerate" : "Draft it"}</Button>
            <p className="text-[11.5px] text-muted">Drafts nothing without you; sends nothing ever.</p>
          </div>
          {error ? <p className="text-[13px] font-semibold text-danger" role="status">{error}</p> : null}
        </div>
        <div className="flex flex-col gap-2.5">
          <label className="microlabel" htmlFor="ai-draft">Draft (edit freely)</label>
          <textarea id="ai-draft" value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} placeholder="The draft appears here — then you take it to Broadcast or a direct message."
            className="flex-1 rounded-sm border border-paper-300 bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-primary" />
          <Button size="sm" variant="secondary" disabled={!draft || busy}
            onClick={async () => { try { await navigator.clipboard.writeText(draft); setCopied(true); } catch { setCopied(false); } }}>
            {copied ? "Copied" : "Copy draft"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
