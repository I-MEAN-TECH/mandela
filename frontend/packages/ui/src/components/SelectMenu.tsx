"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn";

/** Tiny inline glyphs — the ui package has no icon dependency. */
function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-3.5 w-3.5 shrink-0">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * SelectMenu — the app's dropdown select. Replaces bare native <select>s,
 * which are unreachable inside overflow-x tables on phones and whose native
 * popups are unreliable in embedded webviews. The popup renders through a
 * portal with position:fixed (measured from the trigger), so no overflow
 * container can clip it; options are ≥44px tall for touch; full keyboard
 * support (Enter/Space/ArrowDown opens, arrows navigate, Enter picks,
 * Escape closes) and ARIA listbox semantics.
 */

export interface SelectOption {
  value: string;
  label: string;
}

export function SelectMenu({
  value,
  onChange,
  options,
  placeholder = "Choose…",
  disabled,
  required,
  ariaLabel,
  className,
  menuClassName,
  align = "start",
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
  className?: string;
  menuClassName?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number; w: number } | null>(null);
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({ x: r.left, y: r.bottom, w: r.width });
  }, []);

  // Open: measure, place popup, park focus on the list for instant arrow keys.
  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const idx = Math.max(0, options.findIndex((o) => o.value === value));
    setActive(idx);
    requestAnimationFrame(() => listRef.current?.focus());
  }, [open, measure, options, value]);

  // Reposition on scroll/resize while open (fixed positioning ignores layout).
  useEffect(() => {
    if (!open) return;
    const onReflow = () => measure();
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, measure]);

  // Close on outside pointer-down.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  function commit(idx: number) {
    const opt = options[idx];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onTriggerKey(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(active);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  // Scroll the active option into view as arrows move.
  useEffect(() => {
    if (!open) return;
    const li = listRef.current?.children[active] as HTMLElement | undefined;
    li?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const invalid = required && !value;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
        data-testid="selectmenu-trigger"
        className={cn(
          // Same visual language as the app's inputs. NB: sizing (h-*/w-*) is
          // NOT set here — cn() is a plain join with no tailwind-merge, so
          // callers pass their own h-/w- classes explicitly.
          "flex min-w-0 items-center justify-between gap-2 rounded-sm border px-3 text-left text-[13px] transition-colors",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine-500",
          invalid ? "border-danger" : "border-paper-300",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-paper-300/80 hover:bg-paper-50",
          open && "border-pine-300 ring-2 ring-pine-100",
          className,
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", selected ? "text-ink-950" : "text-ink-400")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDownIcon className={cn("h-4 w-4 shrink-0 text-ink-500 transition-transform", open && "rotate-180")} />
      </button>

      {open && coords
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-label={ariaLabel}
              onKeyDown={onListKey}
              style={{
                position: "fixed",
                top: coords.y + 6,
                left: align === "start" ? coords.x : undefined,
                right: align === "end" ? window.innerWidth - coords.x - coords.w : undefined,
                minWidth: Math.max(coords.w, 160),
                maxHeight: "min(320px, 60dvh)",
              }}
              data-testid="selectmenu-list"
              className={cn(
                "z-[70] overflow-y-auto rounded-sm border border-paper-300 bg-surface py-1 shadow-2",
                menuClassName,
              )}
            >
              {options.map((o, i) => {
                const isSelected = o.value === value;
                return (
                  <li key={o.value} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => commit(i)}
                      className={cn(
                        "flex min-h-[44px] w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-[13.5px]",
                        i === active ? "bg-paper-100" : "",
                        isSelected ? "font-semibold text-pine-700" : "text-ink-900",
                      )}
                    >
                      <span className="truncate">{o.label}</span>
                      {isSelected ? <CheckIcon /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
