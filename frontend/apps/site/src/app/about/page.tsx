import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why Mandela exists: the school platform built in Kenya, for Kenyan schools, named for the belief that education is the most powerful weapon.",
};

export default function AboutPage() {
  return (
    <>
      <header className="border-b border-paper-300 bg-paper-50">
        <div className="mx-auto max-w-6xl px-s5 py-s8">
          <p className="microlabel">About</p>
          <h1 className="display-brand mt-3 max-w-[24ch] text-ink-950">
            Built for the school <em>down the road.</em>
          </h1>
          <p className="mt-s4 max-w-[60ch] text-[15.5px] leading-relaxed text-muted">
            Mandela is made in Nairobi for Kenyan schools — public and private,
            urban and rural. We build for the head teacher with 400 learners on
            M-Pesa, the bursar with a queue at the window, and the parent on a
            Ksh 10 bundle.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-s7 px-s5 py-s8 md:grid-cols-2">
        <section>
          <h2 className="display text-[24px] text-ink-950">Why the name</h2>
          <blockquote className="mt-s4 border-l-2 border-lime-500 pl-5">
            <p className="display text-[22px] italic leading-snug text-pine-800">
              &ldquo;Education is the most powerful weapon which you can use to change
              the world.&rdquo;
            </p>
            <footer className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              Nelson Rolihlahla Mandela
            </footer>
          </blockquote>
          <p className="mt-s4 text-[14.5px] leading-relaxed text-muted">
            The quote is the first thing a new school sees when it claims its
            platform — and the standard we hold the product to. Schools change
            the world one learner at a time; they deserve tools that respect
            that work.
          </p>
        </section>

        <section>
          <h2 className="display text-[24px] text-ink-950">What we believe</h2>
          <ul className="mt-s4 grid gap-3">
            <Belief title="Records before pressure" body="Schools lose money to bad records, not bad parents. Fix the ledger and the fee gap closes itself." />
            <Belief title="Simple is a feature" body="Any screen a teacher can't use mid-lesson is a bug. Zero training is the bar, not the aspiration." />
            <Belief title="Calm software" body="No red badges screaming for attention. The right number, at the right time, in plain language." />
            <Belief title="The school owns the data" body="Per-school databases, a tamper-evident audit trail, and a full export on request. Always." />
          </ul>
        </section>

        <section className="md:col-span-2">
          <h2 className="display text-[24px] text-ink-950">How we work with schools</h2>
          <div className="mt-s4 grid gap-3 md:grid-cols-3">
            <Belief title="You set the pace" body="Start mid-term, mid-week. The platform meets the school where the term actually is." />
            <Belief title="We answer on WhatsApp" body="Support lives where you already are. No ticket portals, no 'reference numbers'." />
            <Belief title="No lock-in, ever" body="Billing is monthly on M-Pesa. Leaving is a download, not a hostage negotiation." />
          </div>
        </section>
      </div>
    </>
  );
}

function Belief({ title, body }: { title: string; body: string }) {
  return (
    <li className="rounded border border-paper-300 bg-surface px-4 py-3.5">
      <p className="text-[14px] font-semibold text-ink-950">{title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{body}</p>
    </li>
  );
}
