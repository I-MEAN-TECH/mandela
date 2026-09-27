"use client";

import { useState } from "react";
import { LANGS, getStoredLang, storeLang, type Lang } from "@/lib/i18n";

/**
 * EN/SW toggle skeleton — persists the choice and dispatches a window event
 * so client components (nav, doors, parent CTA) can re-render in Kiswahili.
 * Server components keep EN until the SW copy lands, then the site moves to
 * locale routing ([lang]/ segment) without changing this contract.
 */
export function LangToggle({ compact = false }: { compact?: boolean }) {
  const [lang, setLang] = useState<Lang>("en");

  function pick(next: Lang) {
    setLang(next);
    storeLang(next);
    window.dispatchEvent(new CustomEvent("mandela:lang", { detail: next }));
  }

  return (
    <div
      className={`inline-flex items-center rounded-pill border border-paper-300 bg-surface ${compact ? "" : "p-0.5"}`}
      role="group"
      aria-label="Language / Lugha"
    >
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          aria-pressed={lang === l.code}
          onClick={() => pick(l.code)}
          className={`min-h-[32px] rounded-pill px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${
            lang === l.code ? "bg-paper-100 text-ink-950" : "text-muted hover:text-ink-700"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
