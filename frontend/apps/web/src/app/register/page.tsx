import { requireBootstrap, requireSession } from "@/lib/api";
import { MandelaMark } from "@mandela/ui";
import { redirect } from "next/navigation";
import { RegisterClient } from "./RegisterClient";

/**
 * /register — the door for staff and school owners (parents use /login).
 * Ink-and-paper split matches the login page: brand half, form half.
 * Signed-in users don't need this screen.
 */
export default async function RegisterPage() {
  const session = await requireSession().catch(() => null);
  if (session) redirect("/app");
  const boot = await requireBootstrap();
  const s = boot.school;

  return (
    <div className="grid min-h-dvh md:grid-cols-[1.1fr_1fr]">
      {/* INK HALF */}
      <div className="hidden flex-col bg-brand-deep p-s7 text-brand-deep-contrast md:flex">
        <div className="flex items-center gap-3">
          {s.logo_svg_path ? (
            <span className="grid h-10 w-10 place-items-center rounded-sm bg-white text-ink-950">
              <MandelaMark path={s.logo_svg_path} className="h-5 w-5" title={s.name} />
            </span>
          ) : null}
          <span>
            <span className="block text-[15px] font-semibold leading-tight">{s.name}</span>
            {s.motto ? <span className="block text-xs text-ink-400">{s.motto}</span> : null}
          </span>
        </div>

        <div className="my-auto max-w-[24ch] py-s8">
          <blockquote className="display text-[44px] italic leading-[1.18] text-brand-deep-contrast">
            One school. One place.
          </blockquote>
          <p className="mt-s4 text-sm leading-relaxed text-ink-400">
            Attendance, fees, messages, transport — every part of the school in one calm place. Set up in a morning, learned in a day.
          </p>
        </div>

        <div className="flex gap-s6 font-mono text-[12.5px] text-ink-400">
          <span>Per-school database</span>
          <span>Audit-logged writes</span>
          <span>Offline-first</span>
        </div>
      </div>

      {/* PAPER HALF */}
      <div className="flex items-center justify-center px-s5 py-s9 md:px-s7">
        <div className="w-full max-w-md">
          <div className="mb-s6 flex items-center gap-3 md:hidden">
            {s.logo_svg_path ? (
              <span className="grid h-10 w-10 place-items-center rounded-sm bg-primary text-on-primary">
                <MandelaMark path={s.logo_svg_path} className="h-5 w-5" title={s.name} />
              </span>
            ) : null}
            <span className="text-[15px] font-semibold">{s.name}</span>
          </div>

          <p className="microlabel flex items-center gap-2.5">
            <span aria-hidden className="inline-block h-[1.5px] w-[22px] bg-primary" />
            New here
          </p>
          <h1 className="display mt-s3 text-[42px] leading-[1.05] text-ink-950">
            Get your <em>account.</em>
          </h1>

          <div className="mt-s5">
            <RegisterClient />
          </div>
        </div>
      </div>
    </div>
  );
}
