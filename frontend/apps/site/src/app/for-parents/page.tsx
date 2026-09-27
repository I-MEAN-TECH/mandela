import type { Metadata } from "next";
import Link from "next/link";
import { ParentCta } from "@/components/ParentCta";

export const metadata: Metadata = {
  title: "For parents",
  description:
    "Your child's fees, homework and attendance — on WhatsApp, in plain language, every day.",
};

export default function ForParentsPage() {
  return (
    <>
      <header className="border-b border-paper-300 bg-paper-50">
        <div className="mx-auto max-w-6xl px-s5 py-s8">
          <p className="microlabel">For parents</p>
          <h1 className="display-brand mt-3 text-ink-950">
            The school, on <em>your phone.</em>
          </h1>
          <p className="mt-s4 max-w-[56ch] text-[15.5px] leading-relaxed text-muted">
            No app to download, no password to forget. The school sends what
            matters to WhatsApp — and your login code comes to the phone the
            school already has.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-s7 px-s5 py-s8 md:grid-cols-[1fr_1.1fr]">
        <section>
          <h2 className="display text-[24px] text-ink-950">Get your login code</h2>
          <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
            Enter the phone number the school has on file. We&apos;ll text you a code —
            enter it once and you&apos;re in.
          </p>
          <div className="mt-s4 max-w-md">
            <ParentCta />
          </div>
          <div className="mt-s4 rounded border border-paper-300 bg-surface p-s4">
            <p className="text-[13.5px] font-semibold text-ink-950">No code arrives?</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              The school office can check the number on file — or verify you and
              print a statement on the spot. You are never locked out of your
              own child&apos;s records.
            </p>
          </div>
        </section>

        <section aria-label="What a daily message looks like">
          <h2 className="display text-[24px] text-ink-950">What arrives each morning</h2>
          <div className="mx-auto mt-s4 max-w-sm rounded-lg border border-paper-300 bg-surface p-4 shadow-1">
            <div className="rounded-lg rounded-tl-sm bg-paper-100 px-4 py-3">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">Mandela Demo Junior School · 06:30</p>
              <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-ink-900">{`Good morning. Today at school — 25/09/2026:

Amina (Grade 6)
• Fees: balance Ksh 4,500
• Homework: Mathematics — Fractions worksheet (due tomorrow)
• Yesterday: present

Reply to the school office for anything about this message.`}</p>
            </div>
          </div>
          <ul className="mt-s4 grid gap-2.5 text-[13.5px] text-ink-800">
            <li>✓ The balance is the school&apos;s own ledger — the same number the office sees</li>
            <li>✓ Homework appears the day it&apos;s set, with the due date</li>
            <li>✓ Every message is a record — what was sent, and when</li>
          </ul>
        </section>
      </div>

      <section className="border-t border-paper-300">
        <div className="mx-auto grid max-w-6xl gap-s6 px-s5 py-s8 md:grid-cols-3">
          <Card title="Pay with confidence" body="Statements, receipts and balances come from one ledger. When you pay, the receipt lands on your phone with the balance it leaves." />
          <Card title="Your child's whole story" body="Attendance, marks, teacher's remarks and health notes — visible in the parent app, updated as the school works." />
          <Card title="You own your records" body="When your child leaves, the school can hand you a signed, portable record — verified, not photocopies." />
        </div>
      </section>
    </>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded border border-paper-300 bg-surface p-s4 shadow-1">
      <p className="display text-[17px] text-ink-950">{title}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}
