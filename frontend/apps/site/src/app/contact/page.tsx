import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description: "Talk to Mandela on WhatsApp, by phone or email — Nairobi-based, school-hours support.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-s5 py-s9">
      <p className="microlabel">Contact</p>
      <h1 className="display-brand mt-3 text-ink-950">
        Talk to a <em>human.</em>
      </h1>
      <p className="mt-s4 text-[15.5px] leading-relaxed text-muted">
        The fastest route is WhatsApp — same team that supports schools every
        day, during school hours.
      </p>

      <div className="mt-s6 grid gap-3">
        <a
          href="https://wa.me/254700000000?text=Hi%20Mandela%20—%20I%27d%20like%20to%20know%20more%20for%20our%20school"
          className="flex min-h-[72px] items-center justify-between rounded border border-paper-300 bg-surface px-5 py-4 transition-all hover:-translate-y-px hover:shadow-1"
        >
          <span>
            <span className="block text-[15px] font-semibold text-ink-950">WhatsApp</span>
            <span className="mt-0.5 block text-[12.5px] text-muted">Mon–Fri 8:00–17:00, Sat 9:00–13:00 (EAT)</span>
          </span>
          <span aria-hidden className="text-primary">→</span>
        </a>

        <a href="tel:+254700000000" className="flex min-h-[72px] items-center justify-between rounded border border-paper-300 bg-surface px-5 py-4 transition-all hover:-translate-y-px hover:shadow-1">
          <span>
            <span className="block text-[15px] font-semibold text-ink-950">Call</span>
            <span className="numeral mt-0.5 block text-[12.5px] text-muted">0700 000 000</span>
          </span>
          <span aria-hidden className="text-primary">→</span>
        </a>

        <a href="mailto:schools@mandela.school" className="flex min-h-[72px] items-center justify-between rounded border border-paper-300 bg-surface px-5 py-4 transition-all hover:-translate-y-px hover:shadow-1">
          <span>
            <span className="block text-[15px] font-semibold text-ink-950">Email</span>
            <span className="mt-0.5 block text-[12.5px] text-muted">schools@mandela.school</span>
          </span>
          <span aria-hidden className="text-primary">→</span>
        </a>
      </div>

      <section className="mt-s7 rounded bg-paper-50 p-s5">
        <h2 className="display text-[20px] text-ink-950">Booking a walkthrough</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Thirty minutes, on a video call or at your school. Send your termly
          billing and learner count if you can — we&apos;ll bring the maths back in
          writing.
        </p>
      </section>
    </div>
  );
}
