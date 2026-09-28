"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@mandela/ui";
import { ChevronDown } from "lucide-react";
import type { NavChild } from "@/app/app/navModules";

/**
 * NavPill v3 — the reference's sidebar nav: ONE active marker, a lime
 * rounded-sm pill that glides onto the active row wherever it sits —
 * the parent link, or (when a sub-module is current) down into the
 * indented child row. Label on the pill is always pine-on-lime. Child
 * active states are hash-aware.
 */
export function NavPill({
  items,
  className,
  responsive = false,
}: {
  items: { href: string; label: string; icon?: React.ReactNode; children?: NavChild[] }[];
  className?: string;
  /** Icon-only rail below md, full labels from md up (sidebar is always left). */
  responsive?: boolean;
}) {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  // Hash-only navigation doesn't re-render via usePathname — subscribe.
  const [hash, setHash] = useState("");
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // A child is active on route match AND (if it's an anchor) hash match.
  function childActive(child: NavChild): boolean {
    const [childPath, childHash] = child.href.split("#");
    if (childPath !== pathname) return false;
    if (!childHash) return true;
    return hash === `#${childHash}`;
  }

  // Top-level active: exact route match first; if no top-level matches, check children.
  const exactIndex = items.findIndex((i) => i.href === pathname);
  const activeIndex = exactIndex >= 0 ? exactIndex : items.findIndex((i) => i.children?.some(childActive));

  useLayoutEffect(() => {
    const list = listRef.current;
    const pill = pillRef.current;
    if (!list || !pill) return;
    const measure = () => {
      if (activeIndex < 0) {
        pill.style.opacity = "0";
        return;
      }
      // NB: the pill <span> is itself a child of the list — select only <li>s.
      // UNIFORM RULE (every tab): the pill always hugs the TOP-LEVEL link.
      // Children render as quiet rows beneath it — never a second pill
      // target. One style on People, Money, Settings, everywhere.
      const li = list.querySelectorAll(":scope > li")[activeIndex] as HTMLElement | undefined;
      const target = li?.querySelector(":scope > a") as HTMLElement | undefined;
      if (!li || !target) return;
      const lr = list.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      pill.style.opacity = "1";
      pill.style.transform = `translateY(${r.top - lr.top}px)`;
      pill.style.height = `${r.height}px`;
      pill.style.left = `${r.left - lr.left}px`;
      pill.style.width = `${r.width}px`;
    };
    measure();
    // Re-measure when geometry moves: window resize, the rail↔full sidebar
    // width transition, or font swap. Without this the pill keeps a stale
    // width (e.g. measured while labels were hidden) and ends up hugging
    // only the icon — the "weird box" look.
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [activeIndex, pathname, items, hash]);

  return (
    <ul ref={listRef} className={cn("relative", className)}>
      <span
        ref={pillRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 rounded-sm border-2 bg-primary-soft transition-[transform,height,left,width,opacity] duration-300 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none"
        style={{ opacity: 0, borderColor: "var(--primary)" }}
      />
      {items.map((item, i) => {
        const active = i === activeIndex;
        const expanded = responsive && !!item.children?.length && active;
        // UNIFORM: the pill always sits behind the top-level link — parent
        // wears pine-on-lime at every width; an active child only bolds its
        // row. No glide-into-child variant anywhere.
        const linkActive = active;
        return (
          <li key={`${item.label}-${item.href}`} className="relative">
            <Link
              href={item.href}
              title={responsive ? item.label : undefined}
              aria-current={linkActive ? "page" : undefined}
              aria-expanded={item.children?.length ? expanded : undefined}
              className={cn(
                "group relative flex h-11 items-center gap-3 rounded-sm px-3 text-[13.5px] font-semibold transition-colors duration-200 ease-[cubic-bezier(.22,1,.36,1)]",
                linkActive ? "text-primary" : "text-ink-600 hover:bg-paper-200/60 hover:text-ink-950",
              )}
            >
              {item.icon ? (
                <span
                  className={cn(
                    "grid h-[18px] w-[18px] shrink-0 place-items-center transition-colors",
                    linkActive ? "text-primary" : "text-ink-500 group-hover:text-ink-800",
                  )}
                >
                  {item.icon}
                </span>
              ) : null}
              <span className={cn(responsive && "hidden min-w-0 md:block")}>{item.label}</span>
              {responsive && item.children?.length ? (
                <ChevronDown aria-hidden size={14} strokeWidth={2} className={cn(
                    "ml-auto hidden shrink-0 text-ink-400 transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] md:block",
                    expanded && "rotate-180",
                  )} />
              ) : null}
            </Link>

            {/* Sub-modules — accordion under the parent, md+ only (rail has no room) */}
            {expanded ? (
              <ul className="mb-1 ml-[26px] mt-2 hidden border-l border-paper-300 pl-1 md:block" aria-label={`${item.label} modules`}>
                {item.children!.map((child) => {
                  const cActive = childActive(child);
                  const cIcon = child.icon;
                  return (
                    <li key={`${child.label}-${child.href}`}>
                      <Link
                        href={child.href}
                        aria-current={cActive ? "location" : undefined}
                        className={cn(
                          // min-h (not fixed h-9): two-line labels like
                          // "School Profile & Terms" must grow the row,
                          // not collide with the icon.
                          "group flex min-h-9 items-center gap-2 rounded-sm px-2.5 py-1 text-[12.5px] transition-colors duration-200",
                          cActive
                            ? "bg-paper-100 font-semibold text-ink-950"
                            : "font-medium text-ink-500 hover:bg-paper-200/60 hover:text-ink-900",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "grid h-[14px] w-[14px] shrink-0 place-items-center transition-colors",
                            cActive ? "text-primary" : "text-ink-400 group-hover:text-ink-600",
                          )}
                        >
                          {cIcon ?? <span className={cn("h-1 w-1 rounded-full", cActive ? "bg-primary" : "bg-paper-400")} />}
                        </span>
                        <span className="min-w-0 whitespace-normal leading-snug">{child.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
