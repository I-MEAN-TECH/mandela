import { requireSession, requireBootstrap, getKemisReadiness, getExamEntries } from "@/lib/api";
import { ArrowRight, ClipboardCheck, FileText, UsersRound, IdCard } from "lucide-react";
import { KpiCard, SerifHeader, CountUp } from "@mandela/ui";
import { ExamEntriesPanel } from "../ExamEntries";
import { CandidatesPanel } from "./CandidatesClient";
import { redirect } from "next/navigation";
import { noun } from "@/lib/plural";
import Link from "next/link";

/**
 * People › Exam Entries — its own screen: the KEMIS readiness vitals as
 * KPI cards, then the full panel (missing-lists + the kemis.go.ke CSV).
 * Data hygiene is money: registration gaps lock learners out of exams.
 */
export default async function ExamEntriesPage() {
  const me = await requireSession();
  await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  const role = me.principal.role;
  if (!(role === "admin" || role === "principal")) redirect("/app/people");

  const kemis = await getKemisReadiness();
  const candidates = await getExamEntries();

  return (
    <div>
      <SerifHeader
        crumb="People / Exam Entries"
        title={<>Exam-ready, every learner.</>}
        sub="UPI, birth-certificate entry numbers, dates of birth — the exact fields KEMIS demands, checked live."
        actions={
          <Link href="/app/people" className="inline-flex h-11 items-center text-[12.5px] font-semibold underline decoration-paper-300 underline-offset-4 hover:decoration-primary">
            People overview
            <ArrowRight aria-hidden size={14} strokeWidth={2} className="inline align-[-2px]" />
          </Link>
        }
      />

      <div className="mt-s7 grid gap-s3h">
        {!kemis || "error" in kemis ? (
          <p className="text-[13px] text-muted">Could not load readiness. Try again shortly.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-s3h xl:grid-cols-4">
              <KpiCard
                icon={<ClipboardCheck size={20} strokeWidth={1.75} aria-hidden />}
                delta={{
                  text:
                    kemis.learners.total === 0
                      ? "no learners"
                      : `${Math.round((kemis.learners.with_upi / kemis.learners.total) * 100)}% assigned`,
                  tone: kemis.learners.with_upi >= kemis.learners.total ? "ok" : "warn",
                }}
                value={<CountUp value={kemis.learners.with_upi} />}
                label="UPI assigned"
                note={`of ${kemis.learners.total} ${noun(kemis.learners.total, "learner")}`}
              />
              <KpiCard
                icon={<FileText size={20} strokeWidth={1.75} aria-hidden />}
                delta={{
                  text:
                    kemis.learners.total === 0
                      ? "no learners"
                      : `${Math.round((kemis.learners.with_birth_cert / kemis.learners.total) * 100)}% on file`,
                  tone: kemis.learners.with_birth_cert >= kemis.learners.total ? "ok" : "warn",
                }}
                value={<CountUp value={kemis.learners.with_birth_cert} />}
                label="Birth cert entry no"
                note="the KEMIS number, not the serial"
              />
              <KpiCard
                icon={<UsersRound size={20} strokeWidth={1.75} aria-hidden />}
                delta={{
                  text:
                    kemis.learners.total === 0
                      ? "no learners"
                      : `${Math.round((kemis.learners.with_guardian / kemis.learners.total) * 100)}% linked`,
                  tone: kemis.learners.with_guardian >= kemis.learners.total ? "ok" : "warn",
                }}
                value={<CountUp value={kemis.learners.with_guardian} />}
                label="Guardian on file"
              />
              <KpiCard
                icon={<IdCard size={20} strokeWidth={1.75} aria-hidden />}
                delta={{
                  text:
                    kemis.staff.total === 0
                      ? "no staff"
                      : `${Math.round((kemis.staff.with_national_id / kemis.staff.total) * 100)}% on file`,
                  tone: kemis.staff.with_national_id >= kemis.staff.total ? "ok" : "warn",
                }}
                value={<CountUp value={kemis.staff.with_national_id} />}
                label="Staff National ID"
                note={`of ${kemis.staff.total} ${noun(kemis.staff.total, "staff", "staff")}`}
              />
            </div>

            <ExamEntriesPanel data={kemis} />
            <CandidatesPanel data={!("error" in candidates) && candidates.ok ? candidates : { ok: true, rows: [], learners: [] }} />
          </>
        )}
      </div>
    </div>
  );
}

