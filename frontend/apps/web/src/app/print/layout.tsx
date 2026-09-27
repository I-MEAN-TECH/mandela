import "../globals.css";

/**
 * /print/* — bare document routes (report card, fee statement).
 * Deliberately OUTSIDE the app shell: no sidebar, no live bar, no chrome.
 * The parent's document is the school's letterhead, not our UI.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="bg-surface text-ink-950">{children}</div>;
}
