import Link from "next/link";
import { Doors } from "@/components/Doors";
import { ParentCta } from "@/components/ParentCta";

/**
 * Home — the brand promise in five seconds, then proof, then the doors.
 * Copy law (SIMPLICITY.md): standard-4 English, no jargon, one idea per
 * section. Static HTML, zero client JS.
 */
export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className="border-b border-paper-300 bg-paper-50">
        <div className="mx-auto grid max-w-6xl gap-s6 px-s5 py-s8 md:grid-cols-[1.15fr_1fr] md:py-s9">
          <div>
            <p className="microlabel flex items-center gap-2.5">
              <span aria-hidden className="inline-block h-[1.5px] w-[22px] bg-primary" />
              For Kenyan schools
            </p>
            <h1 className="display-brand mt-s4 text-ink-950">
              Run the school.
              <br />
              <em>See everything.</em>
            </h1>
            <p className="mt-s5 max-w-[52ch] text-[15.5px] leading-relaxed text-muted">
              Fees, attendance, homework, messages and transport — every part of
              the school in one calm place. Set up in a morning. Learned in a day.
            </p>
            <div className="mt-s5 max-w-md">
              <ParentCta />
            </div>
          </div>

          <div className="grid content-center gap-s4">
            <p className="microlabel">Staff &amp; school owners</p>
            <Doors />
            <p className="text-[12.5px] text-muted">
              Parents don&apos;t need an account to be reached — the school talks to
              them on WhatsApp, free.
            </p>
          </div>
        </div>
      </section>

      {/* PROOF STRIP */}
      <section className="border-b border-paper-300">
        <div className="mx-auto grid max-w-6xl gap-s5 px-s5 py-s6 sm:grid-cols-3">
          <Proof
            big="Every shilling, written down"
            small="Fees billed and collected per class, per learner — with receipts the same minute."
          />
          <Proof
            big="Attendance in two taps"
            small="A teacher marks a class faster than calling the register by hand."
          />
          <Proof
            big="Parents hear it first"
            small="Daily updates and fee balances on WhatsApp — no bundles wasted on portals."
          />
        </div>
      </section>

      {/* THE ONE PLACE — module rows */}
      <section className="mx-auto max-w-6xl px-s5 py-s8">
        <p className="microlabel">What&apos;s inside</p>
        <h2 className="display mt-3 text-[30px] text-ink-950 md:text-[38px]">
          One place. <em>Every part of the school.</em>
        </h2>
        <div className="mt-s6 grid gap-s4 md:grid-cols-2">
          <ModuleRow
            title="Money"
            body="Fee structures, invoices, M-Pesa and bank reconciliation, petty cash, payroll with PAYE, SHIF and NSSF worked out for you."
          />
          <ModuleRow
            title="Classroom"
            body="The CBC curriculum built in. Attendance, homework, assessments and report cards — approved and printed."
          />
          <ModuleRow
            title="People"
            body="Learners, guardians and staff — one directory. Admissions from first call to Form One. Learner 360 shows the whole child."
          />
          <ModuleRow
            title="Talk"
            body="Announcements that become WhatsApp messages. A daily digest per parent: balance, homework, attendance. Replies land in one inbox."
          />
          <ModuleRow
            title="Operations"
            body="Transport manifests, hostel rollcall, library, store, visitors, repairs — the school beyond the classroom, finally on record."
          />
          <ModuleRow
            title="Trust"
            body="Every change is written to an audit trail. Records are signed and portable — the school's data belongs to the school."
          />
        </div>
        <Link href="/product" className="mt-s6 inline-flex min-h-[48px] items-center text-[14px] font-semibold text-pine-700 underline decoration-paper-300 underline-offset-8 hover:decoration-primary">
          See the whole product →
        </Link>
      </section>

      {/* ONE DAY — adoption story */}
      <section className="border-y border-paper-300 bg-brand-deep text-brand-deep-contrast">
        <div className="mx-auto grid max-w-6xl gap-s6 px-s5 py-s8 md:grid-cols-2 md:py-s9">
          <div>
            <p className="microlabel !text-white/50">Adoption</p>
            <h2 className="display mt-3 text-[30px] md:text-[38px]">
              Going live takes <em className="text-lime-300">one day.</em>
            </h2>
            <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-white/70">
              No training week. No consultant. The head sets up the school in the
              morning, staff join with a code before lunch, and the first
              attendance and fee records land the same afternoon.
            </p>
          </div>
          <ol className="grid content-center gap-3">
            <Step n="1" text="Set up the school — profile, term, fees, learners" />
            <Step n="2" text="Share the school code — staff pick their work and join" />
            <Step n="3" text="Mark attendance, collect a fee, send a message. That's day one." />
          </ol>
        </div>
      </section>

      {/* ROLES strip */}
      <section className="mx-auto max-w-6xl px-s5 py-s8">
        <p className="microlabel">Every role, its own calm dashboard</p>
        <h2 className="display mt-3 text-[30px] text-ink-950 md:text-[38px]">
          Each person sees <em>their work.</em> Nothing else.
        </h2>
        <div className="mt-s6 flex flex-wrap gap-2.5" aria-label="Role dashboards">
          {[
            "Head of school", "Principal", "Teacher", "Bursar", "Front desk",
            "Driver", "Dorm parent", "Janitor", "Librarian", "Patron", "HOD", "Parent",
          ].map((r) => (
            <span key={r} className="rounded-pill border border-paper-300 bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink-800">
              {r}
            </span>
          ))}
        </div>
        <p className="mt-4 max-w-[60ch] text-[14px] leading-relaxed text-muted">
          A driver sees today&apos;s route. A bursar sees today&apos;s collections. Nobody
          wades through screens that are not theirs — that is why it takes a day
          to learn, not a term.
        </p>
      </section>

      {/* PRICING teaser */}
      <section className="border-t border-paper-300 bg-paper-50">
        <div className="mx-auto grid max-w-6xl items-center gap-s5 px-s5 py-s8 md:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="microlabel">Pricing</p>
            <h2 className="display mt-3 text-[30px] text-ink-950 md:text-[38px]">
              Priced per learner. <em>Billed on M-Pesa.</em>
            </h2>
            <p className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-muted">
              A flat monthly rate per learner on roll. No setup fee, no per-seat
              games, no surprise invoices. Cancel any term.
            </p>
          </div>
          <div className="grid gap-3">
            <Link href="/pricing" className="flex min-h-[56px] items-center justify-between rounded-pill bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-hover">
              See the plans <span aria-hidden>→</span>
            </Link>
            <Link href="/contact" className="flex min-h-[56px] items-center justify-between rounded-pill border border-paper-400 px-6 font-semibold text-ink-900 transition-colors hover:bg-surface">
              Book a walkthrough <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="mx-auto max-w-3xl px-s5 py-s9 text-center">
        <h2 className="display-brand text-ink-950">
          Start this <em>term.</em>
        </h2>
        <p className="mx-auto mt-4 max-w-[46ch] text-[15px] leading-relaxed text-muted">
          The term is already running — that&apos;s fine. Schools start mid-term
          every week.
        </p>
        <div className="mx-auto mt-s5 max-w-md text-left">
          <Doors compact />
        </div>
      </section>
    </>
  );
}

function Proof({ big, small }: { big: string; small: string }) {
  return (
    <div className="rounded border border-paper-300 bg-surface p-s4 shadow-1">
      <p className="display text-[17px] text-ink-950">{big}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">{small}</p>
    </div>
  );
}

function ModuleRow({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-t border-paper-300 pt-s4">
      <p className="display text-[19px] text-pine-700">{title}</p>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function Step({ n, text }: { n: string; text: string }) {
  return (
    <li className="flex items-center gap-4 rounded border border-white/10 bg-white/[0.04] px-5 py-4">
      <span className="numeral grid h-9 w-9 shrink-0 place-items-center rounded-full bg-lime-500 text-[14px] font-semibold text-pine-950">{n}</span>
      <span className="text-[14px] leading-snug text-white/90">{text}</span>
    </li>
  );
}
