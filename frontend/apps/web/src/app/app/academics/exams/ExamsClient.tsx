"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, StatusPill } from "@mandela/ui";
import {
  approveReportCardAction,
  cancelDraftReportCardAction,
  generateReportCardAction,
  type ExamCoverageData,
} from "@/lib/api";

/**
 * CancelDraftButton — cancelling a draft card demands a typed reason. The
 * reason lands on the audit trail; the draft row itself is removed (approved
 * and issued cards are never cancellable here). The button only appears on
 * draft rows.
 */
export function CancelDraftButton({ cardId, learner, onDone }: {
  cardId: string;
  learner: string;
  onDone?: (text: string, ok: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    setErr(null);
    if (reason.trim().length < 4) {
      setErr("A reason is mandatory — type why the draft is being cancelled.");
      return;
    }
    start(async () => {
      const r = await cancelDraftReportCardAction({ cardId, reason: reason.trim() });
      if (!r.ok) { setErr(r.error ?? "Failed"); return; }
      setOpen(false);
      setReason("");
      onDone?.(`Draft cancelled — ${learner}`, true);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        className="text-[12px] font-semibold text-danger underline decoration-transparent underline-offset-2 hover:decoration-danger"
        onClick={() => setOpen(true)}
      >
        Cancel draft
      </button>
    );
  }

  return (
    <div className="w-full min-w-[240px] max-w-sm rounded-sm border border-danger/40 bg-danger/5 p-3" role="group" aria-label={`Cancel draft for ${learner}`}>
      <p className="text-[12px] font-semibold text-ink-950">
        Why is “{learner}”&apos;s draft being cancelled?
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        autoFocus
        placeholder="e.g. wrong class — scores were captured against the duplicate learner"
        className="mt-2 w-full rounded-sm border border-paper-300 bg-surface px-2.5 py-2 text-[12.5px] text-ink-950 outline-none focus:border-danger"
      />
      {err ? <p className="mt-1 text-[11.5px] font-semibold text-danger">{err}</p> : null}
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm2" variant="danger" disabled={pending} onClick={submit}>
          {pending ? "Cancelling…" : "Cancel draft"}
        </Button>
        <Button size="sm2" variant="ghost" disabled={pending} onClick={() => { setOpen(false); setErr(null); setReason(""); }}>
          Keep draft
        </Button>
      </div>
    </div>
  );
}

/**
 * Exams & Report Cards 18 — admin's screen is coverage + approval + output.
 * The renderer is curriculum-adaptive: vocabulary and grading scale come from
 * the pack (resolver 16) stored in the card payload — a CBE card says
 * Learner/Learning Area with BE-AE-ME-EE; an 8-4-4 card says Student/Subject
 * with marks. Never hardcoded.
 */

export function CoverageMeters({ classes, overall }: {
  classes: ExamCoverageData["classes"];
  overall: number;
}) {
  return (
    <Card className="min-w-0">
      <CardHead
        title="Capture coverage this term"
        sub={`School-wide ${overall}% · per class below — the gap tells you which teacher to visit`}
      />
      {classes.length === 0 ? (
        <p className="py-4 text-[13px] text-ink-500">No classes yet.</p>
      ) : (
        <div className="flex flex-col gap-3 py-1">
          {classes.map((c) => (
            <div key={c.class_id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-semibold text-ink-950">
                  {c.class_name}
                  <span className="ml-2 rounded-pill bg-paper-100 px-2 py-0.5 font-mono text-[10px] uppercase text-ink-500">{c.curriculum}</span>
                </p>
                <p className="numeral text-[12.5px] text-ink-700">
                  {c.assessed} of {c.learners} learners · {c.coveragePct}%
                </p>
              </div>
              <div className="mt-1 h-2.5 w-full overflow-hidden rounded-pill bg-paper-100">
                <div
                  className={c.coveragePct >= 90 ? "h-full rounded-pill bg-pine-600" : c.coveragePct >= 60 ? "h-full rounded-pill bg-warn" : "h-full rounded-pill bg-danger"}
                  style={{ width: `${Math.max(c.coveragePct, 3)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function ApprovalQueue({ pending, canApprove }: {
  pending: ExamCoverageData["pendingApprovals"];
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pendingAction, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // A row without a real card id cannot be printed or approved — never render
  // it (a stale payload used to emit cardId=undefined links).
  const queue = pending.filter((p) => !!p.card_id);

  return (
    <Card>
      <CardHead
        title="Approval queue"
        sub="Generated cards wait in draft — the principal approves, the admin sees state."
      />
      {queue.length === 0 ? (
        <p className="py-4 text-[13px] text-ink-500">Nothing waiting. Generate a card below.</p>
      ) : (
        <div className="flex flex-col divide-y divide-paper-200">
          {queue.map((p) => (
            <div key={p.card_id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-[150px] flex-1">
                <p className="text-[13.5px] font-semibold text-ink-950">{p.learner}</p>
                <p className="text-[12px] text-ink-500">{p.class_name ?? "—"} · {p.term}</p>
              </div>
              <StatusPill tone="warn">{p.state}</StatusPill>
              <a
                href={`/print/report-card?cardId=${p.card_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] font-semibold text-pine-700 underline decoration-paper-300 underline-offset-2 hover:decoration-pine-700"
              >
                Print preview
              </a>
              {canApprove ? (
                <Button
                  variant="primary"
                  disabled={pendingAction}
                  onClick={() =>
                    start(async () => {
                      const r = await approveReportCardAction({ cardId: p.card_id });
                      setMsg(r.ok ? { ok: true, text: `Approved — ${p.learner}` } : { ok: false, text: r.error ?? "Failed" });
                      if (r.ok) router.refresh();
                    })
                  }
                >
                  Approve
                </Button>
              ) : null}
              {canApprove ? (
                <CancelDraftButton
                  cardId={p.card_id}
                  learner={p.learner}
                  onDone={(text, ok) => setMsg({ ok, text })}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
      {msg ? (
        <p className={msg.ok ? "mt-3 text-[12.5px] text-pine-700" : "mt-3 text-[12.5px] text-danger"} role="status">{msg.text}</p>
      ) : null}
    </Card>
  );
}

export function GenerateCard({ learners }: { learners: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [learnerId, setLearnerId] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <Card>
      <CardHead
        title="Generate report card"
        sub="Scores + attendance + the curriculum's own vocabulary and scale — one card per learner, per term."
      />
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!learnerId) return;
          start(async () => {
            const r = await generateReportCardAction({ learnerId });
            setMsg(r.ok ? { ok: true, text: "Card generated — waiting for approval" } : { ok: false, text: r.error ?? "Failed" });
            if (r.ok) router.refresh();
          });
        }}
      >
        <label className="flex min-w-[240px] flex-1 flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Learner *</span>
          <select
            value={learnerId}
            onChange={(e) => setLearnerId(e.target.value)}
            required
            className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950"
          >
            <option value="">Choose…</option>
            {learners.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary" disabled={pending || !learnerId}>Generate</Button>
        {msg ? (
          <p className={msg.ok ? "text-[12.5px] text-pine-700" : "text-[12.5px] text-danger"} role="status">{msg.text}</p>
        ) : null}
      </form>
    </Card>
  );
}

/**
 * The manageable card desk: every recent card (draft, approved, issued),
 * filterable by class, learner, and state — find a learner's card and open
 * its print view without waiting on the approval queue.
 */
export function CardDesk({ cards }: { cards: ExamCoverageData["recentCards"] }) {
  const [cls, setCls] = useState("");
  const [state, setState] = useState("");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Same guard as the approval queue: a card without a real id is unprintable
  // noise — drop it instead of rendering a dead link.
  const list = cards.filter((c) => !!c.card_id);
  const classNames = [...new Set(list.map((c) => c.class_name).filter((n): n is string => !!n))];
  const filtered = list.filter(
    (c) =>
      (!cls || c.class_name === cls) &&
      (!state || c.state === state) &&
      (!q || c.learner.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <Card>
      <CardHead
        title="All report cards"
        sub="Every recent card — filter by class, learner, or state; open the print view from here."
      />
      {list.length === 0 ? (
        <p className="py-4 text-[13px] text-ink-500">No cards yet — generate the first one on the right.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <select
              aria-label="Filter by class"
              value={cls}
              onChange={(e) => setCls(e.target.value)}
              className="h-9 rounded-sm border border-paper-300 bg-surface px-2.5 text-[12.5px] text-ink-950"
            >
              <option value="">All classes</option>
              {classNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <select
              aria-label="Filter by state"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="h-9 rounded-sm border border-paper-300 bg-surface px-2.5 text-[12.5px] text-ink-950"
            >
              <option value="">All states</option>
              <option value="draft">draft</option>
              <option value="approved">approved</option>
              <option value="issued">issued</option>
            </select>
            <input
              type="search"
              aria-label="Search learner"
              placeholder="Search learner…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 min-w-[160px] flex-1 rounded-sm border border-paper-300 bg-surface px-3 text-[12.5px] text-ink-950 placeholder:text-ink-400"
            />
            <span className="numeral text-[11.5px] text-ink-500">{filtered.length} of {list.length}</span>
          </div>
          <div className="flex max-h-[420px] flex-col divide-y divide-paper-200 overflow-y-auto">
            {filtered.map((c) => (
              <div key={c.card_id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-[150px] flex-1">
                  <p className="text-[13.5px] font-semibold text-ink-950">{c.learner}</p>
                  <p className="text-[12px] text-ink-500">{c.class_name ?? "—"} · {c.term}</p>
                </div>
                <StatusPill tone={c.state === "issued" || c.state === "approved" ? "ok" : "warn"}>{c.state}</StatusPill>
                <a
                  href={`/print/report-card?cardId=${c.card_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] font-semibold text-pine-700 underline decoration-paper-300 underline-offset-2 hover:decoration-pine-700"
                >
                  Print preview
                </a>
                {c.state === "draft" ? (
                  <CancelDraftButton cardId={c.card_id} learner={c.learner} onDone={(text, ok) => setMsg({ ok, text })} />
                ) : null}
              </div>
            ))}
            {filtered.length === 0 ? (
              <p className="py-4 text-[13px] text-ink-500">No cards match those filters.</p>
            ) : null}
          </div>
          {msg ? (
            <p className={msg.ok ? "mt-3 text-[12.5px] text-pine-700" : "mt-3 text-[12.5px] text-danger"} role="status">{msg.text}</p>
          ) : null}
        </>
      )}
    </Card>
  );
}

/** The adaptive renderer — vocabulary + scale read from the card payload. */
export function ReportCardView({ card }: {
  card: {
    learner: string;
    class_name: string | null;
    term: string;
    state: string;
    payload: {
      vocab: { learner: string; class: string; subject: string } | null;
      scale: { k: string; name?: string }[] | null;
      curriculum: { code: string; name: string } | null;
      rows: { subject: string; strand: string | null; score: string | null; grade: string | null; exam_type: string }[];
      attendance: { present: number; total: number };
    };
  };
}) {
  const vocab = card.payload.vocab ?? { learner: "Student", class: "Class", subject: "Subject" };
  const scale = card.payload.scale ?? [];
  const att = card.payload.attendance;
  const attPct = att.total === 0 ? 0 : Math.round((att.present / att.total) * 100);

  return (
    <Card>
      <CardHead
        title={`Report card · ${card.learner}`}
        sub={`${card.class_name ?? "—"} · ${card.term}${card.payload.curriculum ? ` · ${card.payload.curriculum.name}` : ""}`}
        action={<StatusPill tone={card.state === "issued" ? "ok" : card.state === "approved" ? "ok" : "warn"}>{card.state}</StatusPill>}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-paper-200">
              <th className="microlabel !mb-0 py-2 pr-3">{vocab.subject}</th>
              <th className="microlabel !mb-0 py-2 pr-3">Strand</th>
              <th className="microlabel !mb-0 py-2 pr-3">Type</th>
              <th className="microlabel !mb-0 py-2 pr-3 text-right">Score</th>
              <th className="microlabel !mb-0 py-2 text-right">Level</th>
            </tr>
          </thead>
          <tbody>
            {card.payload.rows.map((r, i) => (
              <tr key={`${r.subject}-${i}`} className="border-b border-paper-200 last:border-b-0">
                <td className="py-2 pr-3 font-semibold text-ink-950">{r.subject}</td>
                <td className="py-2 pr-3 text-ink-700">{r.strand ?? "—"}</td>
                <td className="py-2 pr-3 text-[12px] text-ink-500">{r.exam_type}</td>
                <td className="numeral py-2 pr-3 text-right">{r.score ?? "—"}</td>
                <td className="py-2 text-right">
                  {r.grade ? (
                    <span className="rounded-pill bg-paper-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-ink-950">{r.grade}</span>
                  ) : "—"}
                </td>
              </tr>
            ))}
            {card.payload.rows.length === 0 ? (
              <tr><td colSpan={5} className="py-4 text-[13px] text-ink-500">No assessment records this term.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-paper-200 pt-3">
        <p className="text-[12.5px] text-ink-700">
          Attendance: <span className="numeral font-semibold text-ink-950">{attPct}%</span> ({att.present}/{att.total} days)
        </p>
        {scale.length > 0 ? (
          <p className="text-[12px] text-ink-500">
            Scale: {scale.map((s) => s.k + (s.name ? ` ${s.name}` : "")).join(" · ")}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
