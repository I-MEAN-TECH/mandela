"use client";

/**
 * RoleShell — the structural enforcement of the 3-tap rule.
 *
 * Every Mandela role gets EXACTLY these navigation targets. If a feature
 * needs a 4th-level nav, the feature is wrong, not the shell.
 * The shell renders the role's whole world in one screen + bottom bar:
 *
 *   ┌────────────────────────────┐
 *   │  <RoleHome>                │   ← answers the role's #1 question first
 *   ├────────────────────────────┤
 *   │  <RoleWorkArea>            │   ← the ONE work surface per role
 *   ├────────────────────────────┤
 *   │  ⬤   ⬤   ⬤   ⬤   ⬤  │   ← ≤5 tabs, one level deep
 *   └────────────────────────────┘
 *
 * product-design: the home screen IS the dashboard — no menu to explore.
 * mobile-design: 48px tabs, thumb-zone, one primary action in thumb reach.
 */

import { createContext, useContext } from "react";

export type Role =
  | "parent"
  | "teacher"
  | "bursar"
  | "principal"
  | "admin"
  | "driver"
  | "counter"
  | "dorm_parent"
  | "janitor"
  | "librarian"
  | "patron"
  | "hod";

/** ≤5 targets per role. Adding one = product decision, not a dev task. */
export const roleNav: Record<Role, readonly string[]> = {
  parent: ["Home", "Pay", "Homework", "Messages", "Profile"],
  teacher: ["Today", "Mark", "Homework", "Messages", "Class"],
  bursar: ["Today", "Collect", "Reconcile", "Levies", "Reports"],
  principal: ["Today", "Approve", "Insights", "Broadcast", "Directory"],
  admin: ["Today", "People", "Money", "Insights", "Settings"],
  driver: ["Route", "Manifest", "Done", "Messages"],
  counter: ["Today", "Visitors", "Inquiries", "Directory", "Calendar"],
  // Phase 6 (§6.7–6.11) — ≤5 targets each, same 3-tap law.
  dorm_parent: ["Today", "Rollcall", "Exeats", "Laundry", "My dorm"],
  janitor: ["Today", "Repairs", "Supplies", "My zones"],
  librarian: ["Today", "Issue/Return", "Catalogue", "Overdue"],
  patron: ["Today", "Sections", "Points", "Events"],
  hod: ["Today", "Department", "Marks", "Coverage"],
};

/** What the home screen must answer in plain words (the screen's title). */
export const rolePrimeQuestion: Record<Role, string> = {
  parent: "What do I owe, and what's happening today?",
  teacher: "Who's here, who's not, and what's due?",
  bursar: "What came in, what's expected, what's off?",
  principal: "Is the school healthy — money, people, mood?",
  admin: "Is the term running — and what needs me?",
  driver: "Who boards where, and who's left?",
  counter: "Who's here, who's calling, who's enrolling?",
  dorm_parent: "Who's in, who's out tonight?",
  janitor: "What's broken, and what got fixed this week?",
  librarian: "What's out, what's back, who's overdue?",
  patron: "Which house is ahead, what's running this week?",
  hod: "Is my department covered and marked?",
};

export interface RoleShellContextValue {
  role: Role;
  tabs: readonly string[];
  /** navigating to the work-area tab; home is always tab[0] */
  activeTab: string;
}

const RoleShellContext = createContext<RoleShellContextValue | null>(null);

export function useRole(): RoleShellContextValue {
  const ctx = useContext(RoleShellContext);
  if (!ctx) throw new Error("useRole must be used inside <RoleShell>");
  return ctx;
}

export interface RoleShellProps {
  role: Role;
  activeTab: string;
  /** tab[0] renders the role's home screen; others render work areas */
  children: React.ReactNode;
  /** renders bottom nav / sidebar per platform */
  renderNav?: (tabs: readonly string[], activeTab: string) => React.ReactNode;
  /** per-school theming hook point (school name, logo, accent override) */
  schoolBrand?: { name: string; logoUrl?: string };
}

export function RoleShell({ role, activeTab, children, renderNav, schoolBrand }: RoleShellProps) {
  const tabs = roleNav[role];
  if (!tabs.includes(activeTab)) {
    throw new Error(
      `RoleShell: "${activeTab}" is not a ${role} tab (${tabs.join(", ")}). ` +
      `The 3-tap rule forbids adding tabs ad hoc.`
    );
  }

  return (
    <RoleShellContext.Provider value={{ role, tabs, activeTab }}>
      <div className="min-h-dvh bg-bg text-text">
        {renderNav ? null : null}
        <main className="mx-auto w-full max-w-2xl px-s4 pb-s8 pt-s5 md:max-w-5xl">
          {children}
        </main>
        {renderNav?.(tabs, activeTab)}
      </div>
    </RoleShellContext.Provider>
  );
}
