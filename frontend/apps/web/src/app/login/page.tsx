import { requireBootstrap } from "@/lib/api";
import { MandelaMark } from "@mandela/ui";
import { LoginTabs } from "./LoginTabs";

/** Login — comp 04: ink half carries the school's serif quote; paper half the form. */
export default async function LoginPage() {
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

        <div className="my-auto max-w-[22ch] py-s8">
          {(s.quote_text ?? s.motto) ? (
            <blockquote className="display text-[44px] italic leading-[1.18] text-brand-deep-contrast">
              “{s.quote_text ?? s.motto}”
            </blockquote>
          ) : null}
          {s.quote_author ? (
            <p className="mt-s5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-400">
              — {s.quote_author}
            </p>
          ) : null}
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
          {/* compact brand for mobile (ink half is hidden) */}
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
            Welcome back
          </p>
          <h1 className="display mt-s3 text-[42px] leading-[1.05] text-ink-950">
            Sign in to <em>your school.</em>
          </h1>
          <p className="mt-2.5 text-sm leading-relaxed text-muted">
            Staff sign in with the school email. Guardians sign in with the phone the school has on file.
          </p>

          <LoginTabs />

          <div className="mt-s6 rounded-sm border border-dashed border-border bg-paper-100 px-4 py-3 font-mono text-[11.5px] leading-relaxed text-muted">
            DEMO STAFF — bursar@ · teacher@ · principal@ · admin@demo.mandela.school
            <br />
            DEMO GUARDIAN — 0733 000 001
          </div>
        </div>
      </div>
    </div>
  );
}
