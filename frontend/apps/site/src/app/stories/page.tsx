import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Stories",
  description:
    "How Kenyan schools run on Mandela — case studies from the schools themselves.",
};

export default function StoriesPage() {
  return (
    <div className="mx-auto max-w-3xl px-s5 py-s9">
      <p className="microlabel">Stories</p>
      <h1 className="display-brand mt-3 text-ink-950">
        True stories, <em>coming soon.</em>
      </h1>
      <p className="mt-s4 text-[15px] leading-relaxed text-muted">
        We&apos;re writing the first case studies with our founding schools — real
        numbers: collection rates before and after, time-to-mark-attendance,
        what parents said. Nothing published until the school signs it off.
      </p>
      <div className="mt-s6 rounded border border-paper-300 bg-surface p-s5">
        <p className="text-[14px] font-semibold text-ink-950">Founding schools</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
          The first cohort gets founding pricing for life and a say in what we
          build next. If your school wants in:{" "}
          <a href="/contact" className="font-semibold text-pine-700 underline decoration-paper-300 underline-offset-4 hover:decoration-primary">
            talk to us
          </a>
          .
        </p>
      </div>
      <Link href="/" className="mt-s6 inline-flex min-h-[48px] items-center text-[14px] font-semibold text-pine-700 underline decoration-paper-300 underline-offset-8 hover:decoration-primary">
        ← Back to the start
      </Link>
    </div>
  );
}
