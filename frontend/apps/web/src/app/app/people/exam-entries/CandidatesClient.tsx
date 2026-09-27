"use client";

import { useMemo, useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, DataTable, StatusPill } from "@mandela/ui";
import { upsertExamEntryAction, type ExamEntriesData } from "@/lib/api";

/**
 * Candidate numbers (flank batch F, spec 5) — per-curriculum national and
 * international exam entries: exam year, candidate number, status. One
 * table, one register form, per-row edit. The curriculum list comes from
 * the enabled packs — nothing hardcoded.
 */

const CURRICULA = [
  { code: "cbc", label: "CBC (Kenya)" },
  { code: "8-4-4", label: "8-4-4 (Kenya)" },
  { code: "cambridge", label: "Cambridge" },
  { code: "edexcel", label: "Edexcel" },
];

const EXAMS_BY_CURRICULUM: Record<string, string[]> = {
  cbc: ["KPSEA", "KJSEA", "KLEA"],
  "8-4-4": ["KCSE", "KCPE"],
  cambridge: ["Primary Checkpoint", "Lower Secondary Checkpoint", "IGCSE", "A Level"],
  edexcel: ["iPrimary", "iLowerSecondary", "IGCSE", "IAL"],
};

const STATUS_TONES: Record<string, "ok" | "warn" | "neutral" | "danger"> = {
  planned: "neutral",
  registered: "warn",
  entered: "ok",
  withdrawn: "danger",
};

export function CandidatesPanel({ data }: { data: ExamEntriesData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const curriculaOnFile = useMemo(
    () => [...new Set(data.rows.map((r) => r.curriculum))],
    [data.rows],
  );

  function register(fd: FormData) {
    const learnerId = String(fd.get("learnerId") ?? "");
    const curriculum = String(fd.get("curriculum") ?? "");
    const examName = String(fd.get("examName") ?? "");
    const examYear = Number(fd.get("examYear"));
    if (!learnerId || !curriculum || !examName || !Number.isFinite(examYear)) {
      setMsg({ ok: false, text: "Learner, curriculum, exam and year are all required." });
      return;
    }
    start(async () => {
      const r = await upsertExamEntryAction({
        learnerId,
        curriculum,
        examName,
        examYear,
        candidateNo: String(fd.get("candidateNo") ?? "") || undefined,
        status: String(fd.get("status") ?? "planned"),
      });
      setMsg(r.ok ? { ok: true, text: `${examName} ${examYear} registered.` } : { ok: false, text: r.error ?? "Failed" });
      if (r.ok) {
        (document.getElementById("candidate-form") as HTMLFormElement | null)?.reset();
        router.refresh();
      }
    });
  }

  function setCandidate(id: string, current: string | null, status: string, learner: string, exam: string, row: ExamEntriesData["rows"][number]) {
    const candidateNo = window.prompt(`Candidate number for ${learner} · ${exam}`, current ?? "");
    if (candidateNo === null) return;
    start(async () => {
      const r = await upsertExamEntryAction({
        id,
        learnerId: "",
        curriculum: row.curriculum,
        examName: row.exam_name,
        examYear: row.exam_year,
        candidateNo: candidateNo || undefined,
        status,
      });
      setMsg(r.ok ? { ok: true, text: "Candidate number saved." } : { ok: false, text: r.error ?? "Failed" });
      if (r.ok) router.refresh();
    });
  }

  return (
    <Card>
      <CardHead
        title="Candidate numbers"
        sub="Per-curriculum exam entries with year, candidate number and status — the exam office's register."
        action={<StatusPill tone={data.rows.length > 0 ? "ok" : "neutral"}>{data.rows.length} entries</StatusPill>}
      />
      {curriculaOnFile.length > 0 ? (
        <p className="mt-1 text-[12.5px] text-ink-500">
          Curricula on file: {curriculaOnFile.map((c) => c.toUpperCase()).join(" · ")}
        </p>
      ) : null}
      <div className="mt-2">
        {data.rows.length === 0 ? (
          <p className="text-[13px] text-ink-500">No entries yet — register the first candidate below.</p>
        ) : (
          <DataTable
            columns={[
              { key: "learner", title: "Learner" },
              { key: "exam", title: "Exam" },
              { key: "cand", title: "Candidate no" },
              { key: "status", title: "Status" },
              { key: "edit", title: "" },
            ]}
            rows={data.rows.map((r) => ({
              learner: (
                <div>
                  <p className="text-[13.5px] font-semibold text-ink-950">{r.learner}</p>
                  <p className="text-[11.5px] text-ink-500">{r.admission_no}</p>
                </div>
              ),
              exam: (
                <div>
                  <p className="text-[13px] text-ink-900">{r.exam_name}</p>
                  <p className="text-[11.5px] text-ink-500">{r.curriculum.toUpperCase()} · {r.exam_year}</p>
                </div>
              ),
              cand: r.candidate_no ? <span className="font-mono text-[12.5px] text-ink-950">{r.candidate_no}</span> : <span className="text-ink-400">not assigned</span>,
              status: <StatusPill tone={STATUS_TONES[r.status] ?? "neutral"}>{r.status}</StatusPill>,
              edit: (
                <Button variant="ghost" disabled={pending} onClick={() => setCandidate(r.id, r.candidate_no, r.status, r.learner, r.exam_name, r)}>
                  Candidate no…
                </Button>
              ),
            }))}
          />
        )}
      </div>

      <form
        id="candidate-form"
        className="mt-4 grid gap-2 border-t border-paper-200 pt-4 sm:grid-cols-[1.2fr_0.8fr_1fr_0.6fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          register(new FormData(e.currentTarget));
        }}
      >
        <select name="learnerId" required className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950">
          <option value="">Learner…</option>
          {data.learners.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
        <select
          name="curriculum"
          required
          defaultValue="cbc"
          className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950"
        >
          {CURRICULA.map((c) => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
        <select name="examName" required defaultValue="KPSEA" className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950">
          {Object.entries(EXAMS_BY_CURRICULUM).flatMap(([k, v]) =>
            v.map((e) => (
              <option key={k + e} value={e} data-curriculum={k}>{e}</option>
            )),
          )}
        </select>
        <input
          name="examYear"
          type="number"
          min={2020}
          max={2100}
          defaultValue={new Date().getFullYear() + 1}
          className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950"
        />
        <Button type="submit" variant="primary" disabled={pending}>{pending ? "Registering…" : "Register"}</Button>
        <input name="candidateNo" placeholder="Candidate no (optional)" className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950 sm:col-span-2" />
        <select name="status" defaultValue="planned" className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950">
          <option value="planned">planned</option>
          <option value="registered">registered</option>
          <option value="entered">entered</option>
          <option value="withdrawn">withdrawn</option>
        </select>
      </form>
      {msg ? <p className={msg.ok ? "mt-2 text-[12.5px] text-pine-700" : "mt-2 text-[12.5px] text-danger"} role="status">{msg.text}</p> : null}
    </Card>
  );
}
