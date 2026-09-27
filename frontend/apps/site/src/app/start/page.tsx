import { appLinks } from "@/lib/appLinks";
import type { Metadata } from "next";
import Link from "next/link";
import { Doors } from "@/components/Doors";

export const metadata: Metadata = {
  title: "Get started",
  description: "Run a school, work at a school, or a parent looking for your code — start here.",
};

/**
 * /start — the thin router from the brand site into the product.
 * Three doors, no forms: the forms live in the app where they belong.
 */
export default function StartPage() {
  return (
    <div className="mx-auto max-w-3xl px-s5 py-s9">
      <p className="microlabel">Get started</p>
      <h1 className="display-brand mt-3 text-ink-950">
        Which one <em>are you?</em>
      </h1>
      <p className="mt-s4 text-[15px] leading-relaxed text-muted">
        Everyone lands on their own place: the head sets up the school, staff
        join with a code, parents go straight to the family view.
      </p>

      <div className="mt-s6 grid gap-3">
        <Door
          href={appLinks.registerSchool}
          title="I run a school"
          body="Set up the school in the morning — profile, term, fees, learners. Staff join the same day."
        />
        <Door
          href={appLinks.register}
          title="I work at a school"
          body="Pick your role, enter the school's code, land on your dashboard. About two minutes."
        />
        <Door
          href={appLinks.loginGuardian}
          title="I'm a parent"
          body="A login code comes to the phone the school has on file. No password to remember."
        />
      </div>

      <p className="mt-s6 text-[13px] text-muted">
        Already signed in?{" "}
        <Link href={appLinks.dashboard} className="font-semibold text-pine-700 underline decoration-paper-300 underline-offset-4 hover:decoration-primary">
          Go to your dashboard
        </Link>
      </p>
    </div>
  );
}

function Door({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="flex min-h-[92px] items-center justify-between rounded border border-paper-300 bg-surface px-5 py-4 text-left transition-all hover:-translate-y-px hover:bg-paper-50 hover:shadow-1">
      <span>
        <span className="block text-[16px] font-semibold text-ink-950">{title}</span>
        <span className="mt-1 block max-w-[46ch] text-[13px] leading-relaxed text-muted">{body}</span>
      </span>
      <span aria-hidden className="text-primary">→</span>
    </Link>
  );
}
