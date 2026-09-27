import { appLinks } from "@/lib/appLinks";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "For schools",
  description:
    "Why proprietors choose Mandela: collections that rise, a staff that needs no training, and data the school owns.",
};

export default function ForSchoolsPage() {
  return (
    <>
      <header className="border-b border-paper-300 bg-paper-50">
        <div className="mx-auto max-w-6xl px-s5 py-s8">
          <p className="microlabel">For schools</p>
          <h1 className="display-brand mt-3 text-ink-950">
            The fee gap closes <em>when records are real.</em>
          </h1>
          <p className="mt-s4 max-w-[58ch] text-[15.5px] leading-relaxed text-muted">
            Most schools do not have a fee-collection problem. They have a
            records problem: balances nobody trusts, receipts that arrive late,
            and parents who &quot;never saw the reminder.&quot; Mandela fixes the records —
            the money follows.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-s7 px-s5 py-s8 md:grid-cols-2">
        <section>
          <h2 className="display text-[24px] text-ink-950">What changes in term one</h2>
          <ul className="mt-s4 grid gap-3">
            <Bullet title="Balances parents believe" body="Every statement is computed from the same ledger the bursar works from — the parent's number and the school's number cannot disagree." />
            <Bullet title="Reminders that quote the truth" body="Fee reminders carry the real balance and the receipt history. Arguments at the office window drop." />
            <Bullet title="Nobody waits for the office" body="Teachers mark attendance in class. Leaders see it live. The office stops being the bottleneck." />
            <Bullet title="The board sees the truth" body="Collections, arrears and payroll on one page — pack-ready for the BOM meeting." />
          </ul>
        </section>

        <section className="rounded bg-paper-50 p-s5">
          <h2 className="display text-[24px] text-ink-950">The maths heads do</h2>
          <div className="mt-s4 grid gap-3">
            <Row k="400 learners on roll" v="" />
            <Row k="Termly billing (≈ Ksh 12,500)" v="Ksh 5.0M" />
            <Row k="Collected today (typical)" v="Ksh 4.1M" />
            <Row k="The gap" v="Ksh 900,000" tone="danger" />
          </div>
          <p className="mt-4 text-[13.5px] leading-relaxed text-muted">
            Most of that gap is not poverty — it is untracked promises, lost
            receipts and reminders that never arrived. Schools on Mandela
            recover it with records, not pressure. Even a tenth of it pays for
            the platform many times over.
          </p>
          <Link href="/pricing" className="mt-s4 inline-flex min-h-[48px] items-center text-[14px] font-semibold text-pine-700 underline decoration-paper-300 underline-offset-8 hover:decoration-primary">
            Compare with your fee structure →
          </Link>
        </section>

        <section>
          <h2 className="display text-[24px] text-ink-950">Adoption without a training week</h2>
          <ul className="mt-s4 grid gap-3">
            <Bullet title="Day 0 — morning" body="The head claims the school: profile, curriculum, term, fee structure. CSV import brings learners and guardians in." />
            <Bullet title="Day 0 — afternoon" body="Staff join with a code and pick their role. Each lands on a dashboard with three numbers and one big button." />
            <Bullet title="Day 1" body="Attendance marked, fees receipted, the first parent digest goes out on WhatsApp. The school is live." />
            <Bullet title="Week 2" body="Every module has its sea legs: transport, hostel, library. Nobody needed a manual." />
          </ul>
        </section>

        <section>
          <h2 className="display text-[24px] text-ink-950">The data belongs to the school</h2>
          <ul className="mt-s4 grid gap-3">
            <Bullet title="Your database" body="One database per school. Not a shared table with your name on a row." />
            <Bullet title="The audit trail" body="Every change carries who, what and when — tamper-evident by design." />
            <Bullet title="Portable records" body="Signed learner records the family keeps when they leave." />
            <Bullet title="Leave = export" body="Full export on request, any time. Staying must be earned monthly, not locked in." />
          </ul>
        </section>
      </div>

      <section className="border-t border-paper-300 bg-brand-deep text-brand-deep-contrast">
        <div className="mx-auto max-w-6xl px-s5 py-s8">
          <h2 className="display text-[30px] md:text-[36px]">
            Ready when <em className="text-lime-300">you are.</em>
          </h2>
          <p className="mt-3 max-w-[52ch] text-[14.5px] leading-relaxed text-white/70">
            Start the setup now and finish it with a call, or book a walkthrough
            first — both take minutes.
          </p>
          <div className="mt-s5 flex flex-wrap gap-3">
            <Link href="/start" className="inline-flex h-12 items-center rounded-pill bg-lime-500 px-6 font-semibold text-pine-950">
              Set up my school
            </Link>
            <Link href="/contact" className="inline-flex h-12 items-center rounded-pill border border-white/20 px-6 font-semibold text-white/90">
              Book a walkthrough
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function Bullet({ title, body }: { title: string; body: string }) {
  return (
    <li className="rounded border border-paper-300 bg-surface px-4 py-3.5">
      <p className="text-[14px] font-semibold text-ink-950">{title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{body}</p>
    </li>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "danger" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-paper-300 pb-2 last:border-0">
      <span className="text-[13.5px] text-muted">{k}</span>
      {v ? (
        <span className={`numeral text-[16px] font-semibold ${tone === "danger" ? "text-danger" : "text-ink-950"}`}>{v}</span>
      ) : null}
    </div>
  );
}
