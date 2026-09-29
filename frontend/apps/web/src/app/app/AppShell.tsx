"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MandelaMark, ViewToggle, viewScopeOf, readStoredView } from "@mandela/ui";
import { NavPill } from "@/components/NavPill";
import { SearchBox } from "@/components/SearchBox";
import { BellMenu } from "@/components/BellMenu";
import { ProfileMenu } from "@/components/ProfileMenu";
import { NAV_CHILDREN, CHILD_ICONS, TOP_LEVEL_ICONS } from "./navModules";
import { SyncBanner } from "@/components/SyncBanner";
import { InstallPrompt } from "@/components/InstallPrompt";
import {
  LayoutDashboard, Sparkles, LogOut,
} from "lucide-react";
import { SubChips } from "./SubChips";

/** Per-section view (Cards ⇄ List): re-apply the user's stored choice on
    client navigations — the <main> element survives route changes, so the
    attribute must follow the section. (First paint is covered by the
    pre-paint bootstrap in the root layout.) */
function useViewMode() {
  const pathname = usePathname();
  const section = viewScopeOf(pathname);
  useEffect(() => {
    const stored = readStoredView(section);
    const main = document.querySelector("main");
    if (!main) return;
    if (stored === "list") {
      main.setAttribute("data-view", "list");
      main.setAttribute("data-viewscope", section);
    } else {
      main.removeAttribute("data-view");
      main.removeAttribute("data-viewscope");
    }
  }, [section]);
}

/**
 * AppShell — the reference frame: full-bleed white shell, edge to edge.
 * INSIDE it a sage sidebar (logo card, labeled nav with the active frame,
 * "Get Pro"-style card pinned at the bottom) and the content column with a
 * topbar (page title, search field, bell with dot, user chip). The profile
 * avatar shows at every width — on phones it is the only account control.
 */

function tabToHref(tab: string, _first: string): string {
  const map: Record<string, string> = {
    Pay: "/app/pay",
    Homework: "/app/homework",
    Messages: "/app/messages",
    Profile: "/app/profile",
    Today: "/app",
    Home: "/app",
    Mark: "/app/mark",
    Class: "/app/class",
    Spend: "/app/people/payroll",
    Care: "/app/people/conduct",
    Collect: "/app/money",
    Reconcile: "/app/reconcile",
    Levies: "/app/levies",
    Fees: "/app/money/fees",
    Invoices: "/app/money/invoices",
    Payroll: "/app/people/payroll",
    Petty: "/app/money/petty",
    Purchases: "/app/money/purchases",
    Reports: "/app/reports",
    Approve: "/app/approve",
    Insights: "/app/insights",
    Broadcast: "/app/broadcast",
    Directory: "/app/directory",
    People: "/app/people",
    Money: "/app/money",
    Academics: "/app/academics",
    Settings: "/app/settings",
    // Role-specific tabs across all 12 roles
    Hostel: "/app/operations/hostel",
    Laundry: "/app/laundry",
    Facilities: "/app/operations/facilities",
    Store: "/app/operations/store",
    Library: "/app/operations/library",
    Sections: "/app/operations/sections",
    Houses: "/app/operations/houses",
    Events: "/app/operations/events",
    Calendar: "/app/operations/events",
    Exams: "/app/academics/exams",
    Transport: "/app/operations/transport",
    Visitors: "/app/operations/security",
    Inquiries: "/app/people/admissions",
  };
  if (tab === "Today" || tab === "Home") return "/app";
  return map[tab] ?? `/app/${tab.toLowerCase()}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function AppShell({
  schoolName,
  motto,
  logoPath,
  tabs,
  userName,
  userMeta,
  principalHat = false,
  children,
}: {
  schoolName: string;
  motto?: string | null;
  logoPath: string | null;
  tabs: string[];
  userName: string;
  userMeta: string;
  /** §5 — the admin also holds the Principal hat (shows both titles). */
  principalHat?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  useViewMode();
  // The full map is shown — the calm-IA law is that every main is visible;
  // 8 mains × 4-5 children fit the sidebar without scrolling.
  const shown = tabs;
  const first = shown[0] ?? "Today";

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-surface">
      {/* Full-bleed shell — the app fills the viewport edge to edge (no canvas
          frame, no rounding). NB: NO overflow-hidden here — an overflow
          ancestor would capture the sidebar's position:sticky (it would track
          this box's scrollport, which never scrolls) and the nav would scroll
          away with the page. */}
      <div className="flex min-h-dvh bg-surface">
        {/* SIDEBAR — sage panel, full height, sticky */}
        <aside className="sticky top-0 flex h-dvh w-[68px] shrink-0 flex-col overflow-y-auto bg-ambient-panel px-3 py-6 md:w-[240px] md:px-4">
          <div className="mb-6 flex items-center justify-center gap-2.5 px-1 md:justify-start md:px-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-brand-deep text-white">
              {logoPath ? (
                <MandelaMark path={logoPath} className="h-4.5 w-4.5" title={schoolName} />
              ) : (
                <span className="text-xs font-bold">{initials(schoolName)}</span>
              )}
            </span>
            <span className="hidden min-w-0 md:block">
              <span className="block truncate font-display text-[15px] font-bold uppercase tracking-[0.02em] text-ink-950">
                {schoolName.split(/\s+/).slice(0, 2).join(" ")}
              </span>
              {motto ? <span className="mt-0.5 block text-[10.5px] leading-snug text-ink-500 line-clamp-2">{motto}</span> : null}
            </span>
          </div>

          <p className="hidden px-3 pb-1.5 pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500 md:block">Menu</p>
          <NavPill
            responsive
            className="flex flex-col gap-1"
            items={shown.map((tab) => ({
              href: tabToHref(tab, first),
              label: tab,
              icon: TOP_LEVEL_ICONS[tab] ?? (
                <LayoutDashboard size={18} strokeWidth={1.75} aria-hidden />
              ),
              children: NAV_CHILDREN[tab]?.map((c) => ({
                ...c,
                icon: CHILD_ICONS[c.label],
              })),
            }))}
          />

          {/* The reference's "Get Pro" card — pinned at the sidebar's foot */}
          <div className="mt-auto hidden px-1 pb-1 pt-6 md:block">
            <div className="relative overflow-hidden rounded bg-brand-deep p-4 text-brand-deep-contrast shadow-1">
              <Sparkles aria-hidden size={64} strokeWidth={1} className="absolute -right-3 -top-3 text-white/[0.07]" />
              <span className="grid h-8 w-8 place-items-center rounded-sm bg-white/10 text-lime-300">
                <Sparkles aria-hidden size={16} strokeWidth={1.75} />
              </span>
              <p className="mt-3 text-[12.5px] leading-snug text-white/75">
                Every module your school runs, in one calm place.
              </p>
              <span className="mt-3 inline-flex h-9 items-center rounded-sm bg-accent px-3.5 text-[12.5px] font-semibold text-on-accent">
                {schoolName.split(/\s+/)[0]}
              </span>
            </div>
          </div>

          <div className="mt-3 flex flex-col items-center gap-2.5 px-1 pt-3 md:flex-row md:justify-start">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pine-100 text-xs font-semibold text-pine-800">
              {initials(userName)}
            </span>
            <span className="hidden min-w-0 flex-1 md:block">
              <span className="block truncate text-[13px] font-semibold text-ink-950">{userName}</span>
              <span className="block truncate text-[11px] text-ink-500">{userMeta}</span>
            </span>
            <button
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-pill text-ink-500 transition-colors hover:bg-paper-200 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine-500"
            >
              <LogOut aria-hidden size={16} strokeWidth={1.75} />
            </button>
          </div>
        </aside>

        {/* MAIN COLUMN — topbar + content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* TOPBAR — title left · search fills the middle · bell + profile right */}
          <div className="flex flex-wrap items-center gap-x-s4 gap-y-2 px-4 pt-5 md:flex-nowrap md:px-8 md:pt-6">
            <h1 className="min-w-0 max-w-full truncate font-display text-[22px] font-semibold tracking-[-0.01em] text-ink-950 md:max-w-none">
              {pathname === "/app" ? "Dashboard" : titleFromPath(pathname, shown, first)}
            </h1>
            <div className="ml-auto flex min-w-0 items-center justify-end gap-2.5">
              {/* Per-section view mode — the user's Cards ⇄ List choice. */}
              <ViewToggle scope={viewScopeOf(pathname)} />
              {/* LIVE search + LIVE bell — real DB-backed components */}
              <SearchBox />
              <BellMenu />
              {/* LIVE profile menu — click opens account dropdown. Visible at
                  every width: on phones the name hides itself and the avatar
                  is the only tap target for profile/sign-out. */}
              <span className="flex">
                <ProfileMenu name={userName} meta={userMeta} />
              </span>
            </div>
          </div>

          {/* Banner + sub-chips strip — no flex-1 here: only <main> may grow,
              otherwise this strip splits the free viewport height with main
              and every module screen shows a giant blank band under the topbar. */}
          <div className="mx-auto w-full max-w-7xl px-4 pt-4 md:px-10">
            <SyncBanner />
            {/* Phase 7 — one-tap A2HS (Android event / iOS sheet). */}
            <InstallPrompt />
            <SubChips />
          </div>
          {/* suppressHydrationWarning: the pre-paint view script (root layout)
              may set data-view/data-viewscope before React hydrates — same
              external-state pattern as ThemeVars on <html>. */}
          <main
            suppressHydrationWarning
            className="mx-auto w-full max-w-7xl flex-1 px-4 pb-6 pt-2 md:px-10 md:pb-9"
          >{children}</main>
        </div>
      </div>
    </div>
  );
}

function titleFromPath(pathname: string, tabs: string[], first: string): string {
  const map: Record<string, string> = {
    "/app": "Dashboard",
    "/app/people": "People",
    "/app/people/staff": "Staff Register",
    "/app/people/learners": "Learners",
    "/app/people/guardians": "Guardians & Parents",
    "/app/people/exam-entries": "Exam Entries",
    "/app/money": "Money",
    "/app/reconcile": "Confirm",
    "/app/levies": "Levies",
    "/app/reports": "Fee Reports",
    "/app/money/fees": "Fee Structures",
    "/app/money/invoices": "Invoices & Statements",
    "/app/academics": "Academics",
    "/app/academics/curriculum": "Curriculum Setup",
    "/app/people/admissions": "Admissions",
    "/app/insights/compliance": "Compliance Center",
    "/app/inbox": "Inbox (Approvals & Tasks)",
    "/app/insights": "Insights",
    "/app/settings": "Settings",
    "/app/mark": "Attendance",
    "/app/class": "My Class",
    "/app/homework": "Homework",
    "/app/messages": "Messages",
    "/app/broadcast": "Broadcast",
    "/app/approve": "Approvals",
    "/app/directory": "Directory",
    "/app/pay": "Pay Fees",
    "/app/profile": "Profile",
    "/app/insights/reports": "Report Builder",
  };
  if (map[pathname]) return map[pathname];
  const seg = pathname.split("/").filter(Boolean)[1] ?? "";
  const tab = tabs.find((t) => t.toLowerCase() === seg.toLowerCase());
  return tab ?? (seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : first);
}
