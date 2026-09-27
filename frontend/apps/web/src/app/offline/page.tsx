import Link from "next/link";

/**
 * /offline — the SW's navigation fallback (Phase 7). Precached at install.
 * Not a full app page on purpose: it must render with zero network. The
 * guardian taps Retry when signal returns; their last-read screens are still
 * reachable through history/back.
 */
export const metadata = { title: "Offline — Mandela" };

export default function Offline() {
  return (
    <div className="grid min-h-dvh place-items-center p-s5 text-center">
      <div>
        <p className="microlabel">No signal</p>
        <h1 className="display mt-s2 text-xl font-semibold text-ink-950">
          You&apos;re offline right now.
        </h1>
        <p className="mx-auto mt-s2 max-w-md text-sm text-muted">
          Pages you opened recently still work — go back to them from your
          history. Everything you save while offline syncs when the signal
          returns (money is always keyed online).
        </p>
        <div className="mt-s5 flex items-center justify-center gap-s4">
          <Link
            href="/app"
            className="rounded-pill bg-ink-950 px-s4 py-2 text-[13px] font-semibold text-white"
          >
            Try the app again
          </Link>
        </div>
      </div>
    </div>
  );
}
