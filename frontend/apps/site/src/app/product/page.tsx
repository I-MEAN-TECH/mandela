import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Product",
  description:
    "Money, classroom, people, talk, operations and trust — a guided tour of every module in the Mandela school platform.",
};

export default function ProductPage() {
  return (
    <>
      <header className="border-b border-paper-300 bg-paper-50">
        <div className="mx-auto max-w-6xl px-s5 py-s8">
          <p className="microlabel">Product</p>
          <h1 className="display-brand mt-3 text-ink-950">
            Everything a school runs on. <em>Nothing it doesn&apos;t.</em>
          </h1>
          <p className="mt-s4 max-w-[60ch] text-[15.5px] leading-relaxed text-muted">
            Six sectors, one database, one login per person. What follows is the
            whole platform — the same tour your staff will live in.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-s5 py-s8">
        <nav aria-label="Sections" className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-pill border border-paper-300 bg-surface px-4 py-2 text-[12.5px] font-semibold text-ink-800 hover:bg-paper-50">
              {s.title}
            </a>
          ))}
        </nav>

        <div className="mt-s7 grid gap-s7">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 border-t border-paper-300 pt-s6">
              <div className="grid gap-s4 md:grid-cols-[1fr_1.2fr]">
                <div>
                  <h2 className="display text-[26px] text-ink-950">{s.title}</h2>
                  <p className="mt-3 text-[14.5px] leading-relaxed text-muted">{s.lead}</p>
                </div>
                <ul className="grid content-start gap-2.5">
                  {s.points.map((p) => (
                    <li key={p} className="flex gap-3 rounded border border-paper-300 bg-surface px-4 py-3 text-[13.5px] leading-snug text-ink-800">
                      <span aria-hidden className="mt-0.5 text-primary">◆</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>

        <div className="mt-s8 rounded bg-brand-deep px-s6 py-s7 text-brand-deep-contrast">
          <h2 className="display text-[26px]">
            See it on <em className="text-lime-300">your school&apos;s</em> data.
          </h2>
          <p className="mt-3 max-w-[52ch] text-[14.5px] leading-relaxed text-white/70">
            We load your classes, terms and fee items in a sandbox before you
            decide. Thirty minutes, no commitment.
          </p>
          <Link href="/contact" className="mt-s5 inline-flex h-12 items-center rounded-pill bg-lime-500 px-6 font-semibold text-pine-950">
            Book a walkthrough
          </Link>
        </div>
      </div>
    </>
  );
}

const SECTIONS = [
  {
    id: "money",
    title: "Money",
    lead: "The bursar's whole day, from billing to reconciliation — with the confirm step that keeps every shilling honest.",
    points: [
      "Fee structures per class, applied in bulk, with sibling discounts and instalment plans",
      "Collect: receipt in under a minute, printed or sent on WhatsApp",
      "Confirm queue: money never enters the books unconfirmed",
      "M-Pesa and bank feeds arrive as matching suggestions — you tap to agree",
      "Payroll: PAYE, SHIF, NSSF and housing levy computed on Kenya's current rates",
      "Petty cash and purchase approvals with limits",
    ],
  },
  {
    id: "classroom",
    title: "Classroom",
    lead: "Built for the CBC — competency levels, learning areas and the reports the ministry expects.",
    points: [
      "Curriculum packs: CBE/CBC, 8-4-4 and British — pick per school",
      "Attendance: two taps per class, oversight dashboards for leaders",
      "Homework with due dates parents can see",
      "Assessments feed report cards automatically",
      "Report cards: generate, approve, print — the principal signs off",
      "Timetable and exam entries with KEMIS readiness checks",
    ],
  },
  {
    id: "people",
    title: "People",
    lead: "One directory for the whole school family — from the first admissions call to alumni.",
    points: [
      "Learner 360: fees, attendance, discipline, health and guardians on one page",
      "Guardians linked to children with channel preferences",
      "Staff register with TSC numbers and national IDs",
      "Admissions pipeline: inquiry → tour → assessment → enrolled",
      "Alumni records that follow the learner after graduation",
      "CSV import everywhere — bring the data you already have",
    ],
  },
  {
    id: "talk",
    title: "Talk",
    lead: "The school speaks, parents hear — on the channel they already read: WhatsApp.",
    points: [
      "Announcements fan out to the right guardians automatically",
      "A daily digest per parent: balance, homework due, yesterday's attendance",
      "Two-way inbox — replies land where staff actually work",
      "Fee reminders that quote the real balance",
      "Delivery receipts for every message — no more 'I never saw it'",
      "Email fallback for parents without WhatsApp",
    ],
  },
  {
    id: "operations",
    title: "Operations",
    lead: "The school beyond the classroom — finally on the record, not in a notebook.",
    points: [
      "Transport: routes, buses, manifests and trip ticks",
      "Hostel: beds, rollcall, exeat passes with approval",
      "Library, store and laundry custody",
      "Visitors logged in and out at the gate",
      "Repairs with a cost-vs-replace verdict",
      "Duty rosters that become staff tasks automatically",
    ],
  },
  {
    id: "trust",
    title: "Trust",
    lead: "Your school's data, guarded like exam results.",
    points: [
      "Every write lands in a tamper-evident audit trail",
      "Per-school database — isolation by construction",
      "Row-level security: a teacher sees their classes, never the school's books",
      "Signed, portable learner records the family can keep",
      "Daily WhatsApp reach reports — proof parents are being reached",
      "Your data can be exported in full, any time",
    ],
  },
];
