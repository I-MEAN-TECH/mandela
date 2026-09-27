"use client";

import type { ReportCardPrint } from "@/lib/printTypes";

/**
 * The report card document itself. Everything dynamic comes from the card
 * payload: vocabulary (Learner/Learning Area for CBE, Student/Subject for
 * 8-4-4), the grading scale, the rows. Paper is white — status color never
 * prints; the state is spelled out so photocopies stay honest.
 */
export function ReportCardDoc({ card }: { card: ReportCardPrint }) {
  const payload = card.payload ?? { vocab: null, scale: null, curriculum: null, rows: [], attendance: { present: 0, total: 0 } };
  // Vocabulary is whatever the pack stored — older cards may carry the
  // legacy {learner, class, subject} shape; newer carry the resolver's
  // {learner_label, level_label, area_label}. Both resolve without hardcoding.
  const v = payload.vocab as Record<string, string | undefined> | null;
  const vocab = {
    learner: v?.learner ?? v?.learner_label ?? "Student",
    klass: v?.class ?? v?.level_label ?? "Class",
    subject: v?.subject ?? v?.area_label ?? "Subject",
  };
  const scale = payload.scale ?? [];
  const rows = payload.rows ?? [];
  const att = payload.attendance ?? { present: 0, total: 0 };
  const attPct = att.total === 0 ? 0 : Math.round((att.present / att.total) * 100);
  const contacts = [card.school.contact_address, card.school.contact_phone, card.school.contact_email].filter(Boolean).join(" · ");
  const issued = new Date(card.generated_on).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div data-doc className="mx-auto max-w-[780px] bg-surface px-10 py-8">
      {/* Letterhead — school_settings is the only source */}
      <header className="border-b-2 border-pine-700 pb-4">
        <p className="font-display text-[22px] font-bold tracking-tight text-pine-800">{card.school.name}</p>
        {contacts ? <p className="mt-1 text-[11.5px] text-ink-500">{contacts}</p> : null}
      </header>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="microlabel">Report card · {card.term}</p>
          <p className="font-display text-2xl font-bold text-ink-950">{card.learner}</p>
          <p className="text-[12.5px] text-ink-700">
            {card.class_name ?? "—"}
            {card.admission_no ? <span className="ml-2 font-mono text-[11px] text-ink-500">{card.admission_no}</span> : null}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-ink-500">Issued {issued}</p>
          <p className="text-[11px] text-ink-500">
          {payload.curriculum ? payload.curriculum.name : "Curriculum not set"} · {card.state}
          </p>
        </div>
      </div>

      {/* The rows — the curriculum's own words */}
      <table className="mt-5 w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-paper-300">
            <th className="microlabel py-2 pr-3">{vocab.subject}</th>
            <th className="microlabel py-2 pr-3">Strand / topic</th>
            <th className="microlabel py-2 pr-3">Assessment</th>
            <th className="microlabel py-2 pr-3 text-right">Score</th>
            <th className="microlabel py-2 text-right">Level</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.subject}-${i}`} className="border-b border-paper-100">
              <td className="py-2 pr-3 font-semibold text-ink-950">{r.subject}</td>
              <td className="py-2 pr-3 text-ink-700">{r.strand ?? "—"}</td>
              <td className="py-2 pr-3 text-[12px] text-ink-500">{r.exam_type}</td>
              <td className="numeral py-2 pr-3 text-right">{r.score ?? "—"}</td>
              <td className="py-2 text-right font-mono text-[12px] font-semibold text-pine-800">{r.grade ?? "—"}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-4 text-[13px] text-ink-500">No assessment records this term.</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-paper-200 pt-3">
        <p className="text-[12.5px] text-ink-700">
          Attendance: <span className="numeral font-semibold text-ink-950">{attPct}%</span> ({att.present}/{att.total} days)
        </p>
        {scale.length > 0 ? (
          <p className="text-[11.5px] text-ink-500">
            Grading: {scale.map((s) => (s.k + (s.name ? ` ${s.name}` : ""))).join(" · ")}
          </p>
        ) : null}
      </div>

      {/* Signature band — the human close */}
      <div className="mt-10 flex items-end justify-between gap-8">
        <div className="flex-1 border-t border-ink-950/40 pt-1.5 text-[11.5px] text-ink-700">Class teacher</div>
        <div className="flex-1 border-t border-ink-950/40 pt-1.5 text-[11.5px] text-ink-700">Head teacher</div>
        <div className="w-24 border-t border-ink-950/40 pt-1.5 text-[11.5px] text-ink-700">Date</div>
      </div>

      <p className="mt-6 text-center text-[10.5px] text-ink-500">
        This document is generated from the school ledger — figures agree with the office copy.
      </p>

      <div className="mt-6 flex justify-center print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="h-10 rounded-pill bg-pine-700 px-5 text-[13px] font-semibold text-white hover:opacity-90"
        >
          Print / Save as PDF
        </button>
      </div>
    </div>
  );
}
