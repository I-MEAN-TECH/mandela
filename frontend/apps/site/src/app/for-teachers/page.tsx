import { appLinks } from "@/lib/appLinks";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "For teachers",
  description:
    "Attendance in two taps, homework without the notebook, and a dashboard that only shows your class.",
};

export default function ForTeachersPage() {
  return (
    <>
      <header className="border-b border-paper-300 bg-paper-50">
        <div className="mx-auto max-w-6xl px-s5 py-s8">
          <p className="microlabel">For teachers</p>
          <h1 className="display-brand mt-3 text-ink-950">
            Attendance in <em>two taps.</em>
          </h1>
          <p className="mt-s4 max-w-[56ch] text-[15.5px] leading-relaxed text-muted">
            Your phone already sits on the desk. Open Mandela, tap Mark, tap
            Submit. The register, the homework diary and the marks book stop
            being three places.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-s7 px-s5 py-s8 md:grid-cols-3">
        <Benefit
          title="Your class, your screen"
          body="No school-wide noise. Your learners, your timetable, your homework list — the dashboard answers one question: who's here and what's due?"
        />
        <Benefit
          title="Marks flow to report cards"
          body="Record an assessment once. When the term closes, the report card is already written — you approve, not retype."
        />
        <Benefit
          title="Parents stay informed, quietly"
          body="The daily digest tells each parent about attendance and homework. Fewer surprise calls, fewer 'why didn't you tell me' meetings."
        />
        <Benefit
          title="Works when the network doesn't"
          body="Weak Wi-Fi is not your fault. The app is built for Kenyan networks first — and the register opens even when the internet sulks."
        />
        <Benefit
          title="Duty roster finds you"
          body="You're on gate duty Tuesday? It appears as a task on your dashboard — no wall-chart archaeology."
        />
        <Benefit
          title="Nothing to learn"
          body="If you can send a WhatsApp, you already know how to use Mandela. That is not a slogan — it is the design test every screen must pass."
        />
      </div>

      <section className="border-t border-paper-300 bg-paper-50">
        <div className="mx-auto max-w-3xl px-s5 py-s8 text-center">
          <h2 className="display text-[28px] text-ink-950">
            Your school already has a code? <em>Join in a minute.</em>
          </h2>
          <Link href={appLinks.register} className="mt-s5 inline-flex h-12 items-center rounded-pill bg-primary px-7 font-semibold text-on-primary hover:bg-primary-hover">
            I work at a school
          </Link>
          <p className="mt-3 text-[12.5px] text-muted">Ask the head of school for the code — it looks like MANDELA-XXXX.</p>
        </div>
      </section>
    </>
  );
}

function Benefit({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-t border-paper-300 pt-s4">
      <p className="display text-[18px] text-pine-700">{title}</p>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}
