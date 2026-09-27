import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Legal & trust",
  description:
    "Privacy, terms, learner data protection and the service promise — in plain language.",
};

export default function LegalPage() {
  return (
    <div className="mx-auto max-w-3xl px-s5 py-s9">
      <p className="microlabel">Legal &amp; trust</p>
      <h1 className="display-brand mt-3 text-ink-950">
        Plain-language <em>promises.</em>
      </h1>
      <p className="mt-s4 text-[14px] leading-relaxed text-muted">
        This page summarises how Mandela handles data and what we promise.
        Full legal documents are provided in the school&apos;s onboarding pack.
      </p>

      <section id="privacy" className="mt-s7 scroll-mt-24 border-t border-paper-300 pt-s6">
        <h2 className="display text-[24px] text-ink-950">Privacy</h2>
        <ul className="mt-s4 grid gap-2.5 text-[13.5px] leading-relaxed text-ink-800">
          <Li>Schools own their data. Mandela processes it to run the service — never to sell, advertise, or profile.</Li>
          <Li>Parent phone numbers are used for school messaging only, on the school's instruction.</Li>
          <Li>Passwords are hashed, secrets encrypted, and every access to school data is logged.</Li>
          <Li>Data lives in per-school databases with row-level security — isolation by construction.</Li>
        </ul>
      </section>

      <section id="child-data" className="mt-s7 scroll-mt-24 border-t border-paper-300 pt-s6">
        <h2 className="display text-[24px] text-ink-950">Learner data</h2>
        <ul className="mt-s4 grid gap-2.5 text-[13.5px] leading-relaxed text-ink-800">
          <Li>The school is the data controller; Mandela is the processor under Kenya's Data Protection Act, 2019.</Li>
          <Li>Health, discipline and counselling notes carry the strictest access rules — duty holders only.</Li>
          <Li>Learner records are signed and portable: a family leaving receives verified records, not photocopies.</Li>
          <Li>Retention follows the school's policy setting; expired data is deleted on schedule.</Li>
        </ul>
      </section>

      <section id="terms" className="mt-s7 scroll-mt-24 border-t border-paper-300 pt-s6">
        <h2 className="display text-[24px] text-ink-950">Terms</h2>
        <ul className="mt-s4 grid gap-2.5 text-[13.5px] leading-relaxed text-ink-800">
          <Li>Billed monthly per active learner on roll, on M-Pesa. Cancel any term.</Li>
          <Li>The service is provided for the school's own administration; resale requires agreement.</Li>
          <Li>Full export of school data is available on request at no charge, in open formats.</Li>
        </ul>
      </section>

      <section id="sla" className="mt-s7 scroll-mt-24 border-t border-paper-300 pt-s6">
        <h2 className="display text-[24px] text-ink-950">Service promise</h2>
        <ul className="mt-s4 grid gap-2.5 text-[13.5px] leading-relaxed text-ink-800">
          <Li>Target 99.5% availability during school hours (EAT), measured monthly.</Li>
          <Li>Money records are confirmed-write only — never queued offline.</Li>
          <Li>Support on WhatsApp during school hours; critical issues answered first.</Li>
          <Li>Planned maintenance is announced in-app at least 48 hours ahead.</Li>
        </ul>
      </section>
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span aria-hidden className="mt-0.5 text-primary">◆</span>
      <span>{children}</span>
    </li>
  );
}
