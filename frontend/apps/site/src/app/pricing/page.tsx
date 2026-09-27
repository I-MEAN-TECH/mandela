import { appLinks } from "@/lib/appLinks";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "One flat rate per learner per month. M-Pesa billing, no setup fee, no per-seat games. Cancel any term.",
};

const PLANS = [
  {
    name: "Ubuntu",
    tag: "Small schools",
    price: "Ksh 25",
    unit: "per learner · month",
    blurb: "Everything a growing school needs — nothing gated behind 'premium'.",
    features: [
      "All modules: money, classroom, people, talk, operations",
      "Unlimited staff accounts",
      "WhatsApp + email parent messaging",
      "M-Pesa & bank reconciliation",
      "Payroll with statutory rates",
      "CSV import + guided setup",
    ],
    cta: "Start now",
    href: appLinks.registerSchool,
    featured: false,
  },
  {
    name: "Sizwe",
    tag: "Medium schools",
    price: "Ksh 20",
    unit: "per learner · month",
    blurb: "The same platform, better rate as your roll grows.",
    features: [
      "Everything in Ubuntu",
      "Board & BOM pack, printable",
      "Priority WhatsApp support",
      "Termly data review call",
      "Up to 700 learners",
    ],
    cta: "Start now",
    href: appLinks.registerSchool,
    featured: true,
  },
  {
    name: "Longwalk",
    tag: "Large & group schools",
    price: "Custom",
    unit: "from 700 learners",
    blurb: "Dedicated capacity and onboarding for big campuses and groups.",
    features: [
      "Everything in Sizwe",
      "Dedicated database capacity",
      "Onboarding team on-site or on-call",
      "Custom report templates",
      "Multi-school group view",
    ],
    cta: "Talk to us",
    href: "/contact",
    featured: false,
  },
];

const FAQ = [
  {
    q: "What counts as a learner on roll?",
    a: "Active learners on your register on the billing date. Transferred or graduated learners stop counting the month they leave.",
  },
  {
    q: "How is billing collected?",
    a: "On M-Pesa — a paybill instruction each month, or standing order for group schools. No card, no invoice chasing.",
  },
  {
    q: "Is there a setup fee?",
    a: "No. Setup is guided and self-serve — that is the whole point of the one-day adoption promise.",
  },
  {
    q: "What if we stop?",
    a: "Cancel any term. Your data is exported in full, in open formats, at no charge.",
  },
  {
    q: "Do parents pay anything?",
    a: "Never. Parent messaging rides on the school's WhatsApp and email — parents read for free.",
  },
  {
    q: "Can we try before paying?",
    a: "Yes — start a school and use it. Billing begins the term after your learners are on roll, not before.",
  },
];

export default function PricingPage() {
  return (
    <>
      <header className="border-b border-paper-300 bg-paper-50">
        <div className="mx-auto max-w-6xl px-s5 py-s8 text-center">
          <p className="microlabel">Pricing</p>
          <h1 className="display-brand mt-3 text-ink-950">
            One rate. <em>Everything included.</em>
          </h1>
          <p className="mx-auto mt-s4 max-w-[52ch] text-[15.5px] leading-relaxed text-muted">
            Priced per learner on roll, billed monthly on M-Pesa. The modules
            are never chopped up — a school runs on all of them or none of them
            works.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-s5 px-s5 py-s8 md:grid-cols-3">
        {PLANS.map((p) => (
          <article
            key={p.name}
            className={`relative grid content-start gap-s4 rounded border p-s5 shadow-1 ${
              p.featured ? "border-primary bg-surface ring-1 ring-primary" : "border-paper-300 bg-surface"
            }`}
          >
            {p.featured ? (
              <span className="absolute -top-3 left-s5 rounded-pill bg-primary px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-on-primary">
                Most schools
              </span>
            ) : null}
            <header>
              <p className="display text-[20px] text-ink-950">{p.name}</p>
              <p className="microlabel mt-1">{p.tag}</p>
            </header>
            <p className="numeral text-[38px] font-semibold leading-none text-ink-950">
              {p.price}
              <span className="ml-2 align-middle text-[12px] font-normal text-muted">{p.unit}</span>
            </p>
            <p className="text-[13.5px] leading-relaxed text-muted">{p.blurb}</p>
            <ul className="grid gap-2">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2.5 text-[13px] leading-snug text-ink-800">
                  <span aria-hidden className="text-primary">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href={p.href}
              className={`mt-auto flex min-h-[52px] items-center justify-center rounded-pill px-5 font-semibold transition-colors ${
                p.featured
                  ? "bg-primary text-on-primary hover:bg-primary-hover"
                  : "border border-paper-400 text-ink-900 hover:bg-paper-50"
              }`}
            >
              {p.cta}
            </Link>
          </article>
        ))}
      </div>

      <section className="border-t border-paper-300 bg-paper-50">
        <div className="mx-auto max-w-3xl px-s5 py-s8">
          <h2 className="display text-[26px] text-ink-950">Straight answers</h2>
          <div className="mt-s5 grid gap-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded border border-paper-300 bg-surface px-s4 py-3.5">
                <summary className="cursor-pointer list-none text-[14.5px] font-semibold text-ink-950 marker:hidden">
                  <span className="flex items-center justify-between gap-3">
                    {f.q}
                    <span aria-hidden className="text-primary transition-transform group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-s6 text-center text-[13.5px] text-muted">
            Still deciding?{" "}
            <Link href="/contact" className="font-semibold text-pine-700 underline decoration-paper-300 underline-offset-4 hover:decoration-primary">
              Book a walkthrough
            </Link>{" "}
            — thirty minutes on your numbers.
          </p>
        </div>
      </section>
    </>
  );
}
