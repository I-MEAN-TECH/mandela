"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@mandela/ui";
import { deepOf, isHex6, panelOf } from "@/lib/schoolTheme";

/**
 * School colors — the settings surface for school_settings.theme_json.
 * Only brand-surface tokens are offered; state colors (ok/warn/danger) and
 * the ink/paper ramps stay product-owned so meaning never moves with a
 * rebrand. Unset tokens fall through to the product default tokens.css.
 * Saving posts {theme:{...}} through the existing settings server action;
 * an empty object clears all overrides back to defaults.
 */

/**
 * The color packs. Choosing one sets primary; the ambient chrome (deep
 * panels, sidebar wash, canvas tint, ring) derives from it automatically.
 * Pack names use words Kenyan schools actually use for their colors.
 */
const HUE_SWATCHES: Record<string, { hex: string; onHex: string; name: string }> = {
  green: { hex: "#1f7a4d", onHex: "#ffffff", name: "Pine green" },
  forest: { hex: "#14532d", onHex: "#ffffff", name: "Forest" },
  blue: { hex: "#1d4ed8", onHex: "#ffffff", name: "Royal blue" },
  navy: { hex: "#1e3a8a", onHex: "#ffffff", name: "Navy" },
  sky: { hex: "#0369a1", onHex: "#ffffff", name: "Sky blue" },
  indigo: { hex: "#4338ca", onHex: "#ffffff", name: "Indigo" },
  maroon: { hex: "#8c1d2f", onHex: "#ffffff", name: "Maroon" },
  red: { hex: "#b91c1c", onHex: "#ffffff", name: "Red" },
  purple: { hex: "#6d28d9", onHex: "#ffffff", name: "Purple" },
  brown: { hex: "#7c4a21", onHex: "#ffffff", name: "Brown" },
  black: { hex: "#1c1917", onHex: "#ffffff", name: "Black" },
  gold: { hex: "#a16207", onHex: "#ffffff", name: "Gold" },
  orange: { hex: "#c2410c", onHex: "#ffffff", name: "Orange" },
  teal: { hex: "#0f766e", onHex: "#ffffff", name: "Teal" },
};

/** The four brand surfaces the admin picks. */
const SLOTS = [
  {
    key: "primary",
    label: "Primary (buttons & highlights)",
    hint: "One gold rule: your main color, used sparingly.",
    hoverKey: "primary-hover",
  },
  {
    key: "brand-deep",
    label: "Deep brand (sidebar & login panel)",
    hint: "The dark ink behind white text.",
    hoverKey: null,
  },
] as const;

function shade(hex: string, dark: boolean): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (shift: number) => Math.min(255, Math.max(0, shift));
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const adj = (c: number) => f(dark ? Math.round(c * 0.8) : Math.min(255, Math.round(c * 1.15) + 12));
  return `#${[adj(r), adj(g), adj(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function ThemeEditor({ initial }: { initial: Record<string, string> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [customHex, setCustomHex] = useState("");
  const [pick, setPick] = useState<Record<string, string | null>>(() => {
    const seeded: Record<string, string | null> = {};
    for (const { key, hoverKey } of SLOTS) {
      seeded[key] = initial[key] ?? null;
      if (hoverKey) seeded[hoverKey] = initial[hoverKey] ?? null;
    }
    return seeded;
  });

  function choose(slotKey: string, hoverKey: string | null, hex: string, onHex: string) {
    setPick((p) => ({
      ...p,
      [slotKey]: hex,
      ...(hoverKey ? { [hoverKey]: shade(hex, true) } : {}),
      ...(slotKey === "primary" ? { "on-primary": onHex } : {}),
      ...(slotKey === "brand-deep" ? { "brand-deep-contrast": onHex, "deep-line": shade(onHex, false) } : {}),
    }));
  }

  function clearSlot(slotKey: string, hoverKey: string | null) {
    setPick((p) => ({
      ...p,
      [slotKey]: null,
      ...(hoverKey ? { [hoverKey]: null } : {}),
      ...(slotKey === "primary" ? { "on-primary": null } : {}),
      ...(slotKey === "brand-deep" ? { "brand-deep-contrast": null, "deep-line": null } : {}),
    }));
  }

  function save() {
    start(async () => {
      const { updateSettingsAction } = await import("@/lib/api");
      const theme: Record<string, string> = {};
      for (const [k, v] of Object.entries(pick)) if (v) theme[k] = v;
      const res = await updateSettingsAction({ theme });
      setMsg(res.ok ? "Colors saved — every screen now wears them." : res.error ?? "Could not save.");
      if (res.ok) router.refresh();
    });
  }

  function resetToDefault() {
    start(async () => {
      const { updateSettingsAction } = await import("@/lib/api");
      const res = await updateSettingsAction({ theme: {} });
      setMsg(res.ok ? "Back to the Mandela default colors." : res.error ?? "Could not save.");
      if (res.ok) {
        setPick(() => {
          const cleared: Record<string, string | null> = {};
          for (const { key, hoverKey } of SLOTS) {
            cleared[key] = null;
            if (hoverKey) cleared[hoverKey] = null;
          }
          return cleared;
        });
        router.refresh();
      }
    });
  }

  return (
    <div>
      <p className="text-[13px] leading-relaxed text-muted">
        Pick your school&apos;s colors — they apply to every screen, for every staff member and parent,
        the moment you save. Status colors (paid / attention / overdue) stay the product&apos;s, so meaning never changes.
      </p>

      {/* Custom hex — a school pastes its exact brand color; the ambient
          derives from it exactly like the swatch packs. */}
      {SLOTS.map(({ key, hoverKey, label, hint }) => key === "primary" && (
        <div key="custom-hex" className="mt-s4">
          <p className="text-[13px] font-semibold">Or enter your exact brand color</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="text"
              inputMode="text"
              placeholder="#1a5645"
              maxLength={7}
              value={customHex}
              onChange={(e) => setCustomHex(e.target.value)}
              className="h-11 w-36 rounded-sm border border-border bg-surface px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Custom brand color (hex)"
            />
            <span
              aria-hidden
              className="grid h-9 w-9 place-items-center rounded-full border border-border font-mono text-[10px]"
              style={{ background: isHex6(customHex) ? customHex : "transparent" }}
            >
              {isHex6(customHex) ? "" : "?"}
            </span>
            <Button
              variant="secondary"
              disabled={!isHex6(customHex)}
              onClick={() => {
                if (!isHex6(customHex)) return;
                choose("primary", "primary-hover", customHex, "#ffffff");
                setCustomHex("");
              }}
            >
              Use this color
            </Button>
          </div>
        </div>
      ))}

      {SLOTS.map(({ key, hoverKey, label, hint }) => (
        <div key={key} className="mt-s5">
          <p className="text-[13px] font-semibold">{label}</p>
          <p className="text-xs text-muted">{hint}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {Object.entries(HUE_SWATCHES).map(([hueKey, sw]) => (
              <button
                key={hueKey}
                type="button"
                aria-pressed={pick[key] === sw.hex}
                title={sw.name}
                onClick={() => choose(key, hoverKey, sw.hex, sw.onHex)}
                className="h-9 w-9 rounded-full border border-border"
                style={pick[key] === sw.hex ? { background: sw.hex, boxShadow: "0 0 0 2px var(--paper-50), 0 0 0 4px var(--ink-700)" } : { background: sw.hex }}
              />
            ))}
            <button
              type="button"
              onClick={() => clearSlot(key, hoverKey)}
              className="h-9 rounded-sm border border-border px-3 text-xs font-semibold"
            >
              Default
            </button>
            <span className="ml-1 inline-flex items-center gap-1.5 font-mono text-[11px] text-muted">
              now
              <span className="inline-block h-4 w-4 rounded-sm border border-border" style={{ background: pick[key] ?? "var(--" + key + ")" }} />
              {pick[key] ?? "product default"}
            </span>
            <span aria-hidden className="sr-only">{hoverKey}</span>
          </div>
        </div>
      ))}

      {/* Live preview strip — same tokens (and the same derive math) the whole app consumes. */}
      <div className="mt-s5 overflow-hidden rounded-sm border border-border" aria-hidden>
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{
            background: pick["brand-deep"] ?? (pick.primary ? deepOf(pick.primary) : "var(--brand-deep)"),
            color: pick["brand-deep-contrast"] ?? (pick.primary ? "#f2fbf5" : "var(--brand-deep-contrast)"),
          }}
        >
          <span className="text-[13px] font-semibold">Sidebar &amp; login panel</span>
          <span className="font-mono text-[11px] opacity-80">preview</span>
        </div>
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: pick.primary ? panelOf(pick.primary) : "var(--ambient-panel)" }}
        >
          <span className="text-[13px]">Learners · 246</span>
          <span className="rounded-pill px-3 py-1.5 text-xs font-semibold" style={{ background: pick.primary ?? "var(--primary)", color: pick["on-primary"] ?? "var(--on-primary)" }}>
            Record payment
          </span>
        </div>
      </div>

      <div className="mt-s5 flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save colors"}</Button>
        <Button variant="ghost" onClick={resetToDefault} disabled={pending}>Use Mandela default</Button>
        {msg ? <span className="text-[13px] text-muted">{msg}</span> : null}
      </div>
    </div>
  );
}
