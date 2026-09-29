import type { ReactNode } from "react";
import {
  Wallet, Landmark, ArrowLeftRight, ClipboardList, Banknote,
  FileText, Receipt, Users, GraduationCap, HeartHandshake,
  UserRound, ClipboardCheck, Building2, Tent, Bus, Library, Package,
  ShieldCheck, UtensilsCrossed, Trophy, CalendarDays, Wrench, BedDouble, Stethoscope,
  HeartPulse, ShieldQuestion, ScrollText, UserPlus, IdCard, HandCoins, BarChart3,
  CalendarRange, CalendarCheck, BookOpen, ClipboardPen, Puzzle, ChartLine,
  UsersRound, Plug, History, Import, Inbox, School,
  CreditCard, MessageSquare, MessageCircleQuestionMark, ContactRound, Map,
  ListChecks, DoorOpen, Shirt, MapPinned, BookOpenCheck, Clock3, Flag, Medal,
  NotebookPen, ChartNoAxesColumnIncreasing,
  LayoutDashboard, Settings, Route, Check, Store, Sparkles,
  ReceiptText, CalendarClock, UserCog, Activity, UserRoundCheck,
} from "lucide-react";

/**
 * Sub-modules — the second level of the sidebar, keyed by top-level tab
 * label (nav_json — seeded by 028_ia_eight_mains.sql — is the source of
 * truth for the top level). The calm-IA map: EIGHT mains, 4-5 children
 * each (owner-approved 2026-09-24). Where small screens share a door
 * (Fees/Levies/Pocket, Hostel/Mess, Infirmary/Security, Flags/
 * Integrations, Exams/Entries, Audit/Switching) each page carries a
 * TwinLinks row, so a merge never hides a screen. A tab with no children
 * renders flat — honest nav only.
 */
export interface NavChild {
  label: string;
  href: string; // "#anchor" for in-page sections, "/app/..." for routes
  /** Every visible entry has an explicit glyph. */
  icon: ReactNode;
}

/**
 * First-level navigation is role-dependent, but every workflow still gets a
 * semantic, explicit glyph. A missing entry is a regression: AppShell keeps a
 * visual fallback only for malformed tenant configuration, never for known UI.
 */
export const TOP_LEVEL_ICONS: Record<string, ReactNode> = {
  Today: <LayoutDashboard size={18} strokeWidth={1.75} aria-hidden />,
  Money: <Landmark size={18} strokeWidth={1.75} aria-hidden />,
  Spend: <HandCoins size={18} strokeWidth={1.75} aria-hidden />,
  Care: <HeartPulse size={18} strokeWidth={1.75} aria-hidden />,
  Store: <Store size={18} strokeWidth={1.75} aria-hidden />,
  Academics: <GraduationCap size={18} strokeWidth={1.75} aria-hidden />,
  Operations: <CalendarCheck size={18} strokeWidth={1.75} aria-hidden />,
  People: <Users size={18} strokeWidth={1.75} aria-hidden />,
  Insights: <ChartLine size={18} strokeWidth={1.75} aria-hidden />,
  Settings: <Puzzle size={18} strokeWidth={1.75} aria-hidden />,
  Collect: <Banknote size={18} strokeWidth={1.75} aria-hidden />,
  Approve: <ClipboardCheck size={18} strokeWidth={1.75} aria-hidden />,
  Reports: <FileText size={18} strokeWidth={1.75} aria-hidden />,
  Reconcile: <ArrowLeftRight size={18} strokeWidth={1.75} aria-hidden />,
  Pay: <CreditCard size={18} strokeWidth={1.75} aria-hidden />,
  Mark: <ClipboardPen size={18} strokeWidth={1.75} aria-hidden />,
  Class: <School size={18} strokeWidth={1.75} aria-hidden />,
  Directory: <IdCard size={18} strokeWidth={1.75} aria-hidden />,
  Levies: <Receipt size={18} strokeWidth={1.75} aria-hidden />,
  Broadcast: <Sparkles size={18} strokeWidth={1.75} aria-hidden />,
  Messages: <MessageSquare size={18} strokeWidth={1.75} aria-hidden />,
  Homework: <ClipboardList size={18} strokeWidth={1.75} aria-hidden />,
  Profile: <UserRound size={18} strokeWidth={1.75} aria-hidden />,
  Route: <Route size={18} strokeWidth={1.75} aria-hidden />,
  Manifest: <Map size={18} strokeWidth={1.75} aria-hidden />,
  Done: <Check size={18} strokeWidth={1.75} aria-hidden />,
  Visitors: <ContactRound size={18} strokeWidth={1.75} aria-hidden />,
  Inquiries: <MessageCircleQuestionMark size={18} strokeWidth={1.75} aria-hidden />,
  Calendar: <CalendarDays size={18} strokeWidth={1.75} aria-hidden />,
  Rollcall: <ListChecks size={18} strokeWidth={1.75} aria-hidden />,
  Exeats: <DoorOpen size={18} strokeWidth={1.75} aria-hidden />,
  Laundry: <Shirt size={18} strokeWidth={1.75} aria-hidden />,
  "My dorm": <BedDouble size={18} strokeWidth={1.75} aria-hidden />,
  Repairs: <Wrench size={18} strokeWidth={1.75} aria-hidden />,
  Supplies: <Package size={18} strokeWidth={1.75} aria-hidden />,
  "My zones": <MapPinned size={18} strokeWidth={1.75} aria-hidden />,
  "Issue/Return": <BookOpenCheck size={18} strokeWidth={1.75} aria-hidden />,
  Catalogue: <Library size={18} strokeWidth={1.75} aria-hidden />,
  Overdue: <Clock3 size={18} strokeWidth={1.75} aria-hidden />,
  Sections: <Flag size={18} strokeWidth={1.75} aria-hidden />,
  Points: <Medal size={18} strokeWidth={1.75} aria-hidden />,
  Events: <CalendarRange size={18} strokeWidth={1.75} aria-hidden />,
  Department: <Building2 size={18} strokeWidth={1.75} aria-hidden />,
  Marks: <NotebookPen size={18} strokeWidth={1.75} aria-hidden />,
  Coverage: <ChartNoAxesColumnIncreasing size={18} strokeWidth={1.75} aria-hidden />,
};

const NAV_CHILDREN_RAW: Record<string, Omit<NavChild, "icon">[]> = {
  Money: [
    { label: "Collect Cashier", href: "/app/money" },
    { label: "Fee Structures", href: "/app/money/fees" },
    { label: "Levies", href: "/app/levies" },
    { label: "Invoices & Statements", href: "/app/money/invoices" },
    { label: "Fee Reports", href: "/app/reports" },
  ],
  Spend: [
    { label: "Payroll", href: "/app/people/payroll" },
    { label: "Petty Cash & Budgets", href: "/app/money/petty" },
    { label: "Purchases & Suppliers", href: "/app/money/purchases" },
  ],
  People: [
    { label: "Admissions", href: "/app/people/admissions" },
    { label: "Staff Register", href: "/app/people/staff" },
    { label: "Learners", href: "/app/people/learners" },
    { label: "Guardians & Parents", href: "/app/people/guardians" },
    { label: "HR & Leave", href: "/app/people/hr" },
    { label: "Alumni", href: "/app/people/alumni" },
  ],
  Academics: [
    { label: "Curriculum Setup", href: "/app/academics/curriculum" },
    { label: "Timetable", href: "/app/academics/timetable" },
    { label: "Attendance Oversight", href: "/app/academics/attendance" },
    { label: "Exams, Entries & Report Cards", href: "/app/academics/exams" },
    { label: "Library", href: "/app/operations/library" },
  ],
  Operations: [
    { label: "Sections & Patrons", href: "/app/operations/sections" },
    { label: "Events & Calendar", href: "/app/operations/events" },
    { label: "Duty Rosters", href: "/app/operations/rosters" },
    { label: "Facilities & Repairs", href: "/app/operations/facilities" },
    { label: "Transport", href: "/app/operations/transport" },
  ],
  Care: [
    { label: "Hostel & Mess", href: "/app/operations/hostel" },
    { label: "Infirmary & Security", href: "/app/operations/infirmary" },
    { label: "Conduct & Welfare", href: "/app/people/conduct" },
    { label: "Houses & Co-curricular", href: "/app/operations/houses" },
    { label: "Media Consent", href: "/app/operations/consent" },
  ],
  Insights: [
    { label: "Compliance Center", href: "/app/insights/compliance" },
    { label: "Documents Vault", href: "/app/operations/vault" },
    { label: "Audit & Switching", href: "/app/settings#audit" },
    { label: "Report Builder", href: "/app/insights/reports" },
  ],
  Settings: [
    { label: "School Profile & Terms", href: "/app/settings#profile" },
    { label: "Users & Duties", href: "/app/settings/users" },
    { label: "School Health", href: "/app/settings/health" },
    { label: "Board & BOM", href: "/app/settings/board" },
    { label: "Flags & Integrations", href: "/app/settings/flags" },
  ],
  Mark: [
    { label: "Attendance Roster", href: "/app/mark" },
    { label: "My Class Learners", href: "/app/class" },
  ],
  Homework: [
    { label: "Homework List", href: "/app/homework" },
  ],
};

/** Sub-module icons — real glyphs (lucide), one per child row. */
export const CHILD_ICONS: Record<string, ReactNode> = {
  "Collect Cashier": <Landmark size={13} strokeWidth={2} aria-hidden />,
  "Fee Structures": <ClipboardList size={13} strokeWidth={2} aria-hidden />,
  Levies: <Receipt size={13} strokeWidth={2} aria-hidden />,
  Collect: <Landmark size={13} strokeWidth={2} aria-hidden />,
  "Confirm & Rails": <ArrowLeftRight size={13} strokeWidth={2} aria-hidden />,
  "Fees, Levies & Pocket": <ClipboardList size={13} strokeWidth={2} aria-hidden />,
  "Invoices & Statements": <ReceiptText size={13} strokeWidth={2} aria-hidden />,
  "Fee Reports": <FileText size={13} strokeWidth={2} aria-hidden />,
  "Record Payment": <Landmark size={13} strokeWidth={2} aria-hidden />,
  "Fees & Levies": <ClipboardList size={13} strokeWidth={2} aria-hidden />,
  "Pending Confirmations": <ArrowLeftRight size={13} strokeWidth={2} aria-hidden />,
  "Collection Reports": <FileText size={13} strokeWidth={2} aria-hidden />,
  Payroll: <HandCoins size={13} strokeWidth={2} aria-hidden />,
  "Petty Cash & Budgets": <Wallet size={13} strokeWidth={2} aria-hidden />,
  "Purchases & Suppliers": <Package size={13} strokeWidth={2} aria-hidden />,
  "Store & Kit": <Package size={13} strokeWidth={2} aria-hidden />,
  Admissions: <UserPlus size={13} strokeWidth={2} aria-hidden />,
  "Staff Register": <IdCard size={13} strokeWidth={2} aria-hidden />,
  Learners: <Users size={13} strokeWidth={2} aria-hidden />,
  "Guardians & Parents": <HeartHandshake size={13} strokeWidth={2} aria-hidden />,
  "HR & Leave": <ClipboardPen size={13} strokeWidth={2} aria-hidden />,
  Alumni: <UsersRound size={13} strokeWidth={2} aria-hidden />,
  "Curriculum Setup": <BookOpen size={13} strokeWidth={2} aria-hidden />,
  Timetable: <CalendarRange size={13} strokeWidth={2} aria-hidden />,
  "Attendance Oversight": <CalendarCheck size={13} strokeWidth={2} aria-hidden />,
  "Exams, Entries & Report Cards": <GraduationCap size={13} strokeWidth={2} aria-hidden />,
  Library: <Library size={13} strokeWidth={2} aria-hidden />,
  "Sections & Patrons": <Flag size={13} strokeWidth={2} aria-hidden />,
  "Events & Calendar": <CalendarDays size={13} strokeWidth={2} aria-hidden />,
  "Duty Rosters": <CalendarClock size={13} strokeWidth={2} aria-hidden />,
  "Facilities & Repairs": <Wrench size={13} strokeWidth={2} aria-hidden />,
  Transport: <Bus size={13} strokeWidth={2} aria-hidden />,
  "Hostel & Mess": <BedDouble size={13} strokeWidth={2} aria-hidden />,
  "Infirmary & Security": <Stethoscope size={13} strokeWidth={2} aria-hidden />,
  "Conduct & Welfare": <HeartPulse size={13} strokeWidth={2} aria-hidden />,
  "Houses & Co-curricular": <Trophy size={13} strokeWidth={2} aria-hidden />,
  "Media Consent": <ShieldQuestion size={13} strokeWidth={2} aria-hidden />,
  "Compliance Center": <ShieldCheck size={13} strokeWidth={2} aria-hidden />,
  "Documents Vault": <ScrollText size={13} strokeWidth={2} aria-hidden />,
  "Audit & Switching": <History size={13} strokeWidth={2} aria-hidden />,
  "Report Builder": <ChartLine size={13} strokeWidth={2} aria-hidden />,
  "School Profile & Terms": <School size={13} strokeWidth={2} aria-hidden />,
  "Users & Duties": <UserCog size={13} strokeWidth={2} aria-hidden />,
  "School Health": <Activity size={13} strokeWidth={2} aria-hidden />,
  "Board & BOM": <Building2 size={13} strokeWidth={2} aria-hidden />,
  "Flags & Integrations": <Puzzle size={13} strokeWidth={2} aria-hidden />,
  "Attendance Roster": <ClipboardCheck size={13} strokeWidth={2} aria-hidden />,
  "My Class Learners": <UserRoundCheck size={13} strokeWidth={2} aria-hidden />,
  "Homework List": <NotebookPen size={13} strokeWidth={2} aria-hidden />,
  "Dorm Allocations": <BedDouble size={13} strokeWidth={2} aria-hidden />,
  "Laundry Custody": <Package size={13} strokeWidth={2} aria-hidden />,
  "Garment Handover": <Package size={13} strokeWidth={2} aria-hidden />,
  "Repairs Queue": <Wrench size={13} strokeWidth={2} aria-hidden />,
  "Store Supplies": <Package size={13} strokeWidth={2} aria-hidden />,
  "Store Inventory": <Package size={13} strokeWidth={2} aria-hidden />,
  "Book Catalogue": <Library size={13} strokeWidth={2} aria-hidden />,
  "Route & Manifest": <Bus size={13} strokeWidth={2} aria-hidden />,
  "Visitors & Passes": <ShieldCheck size={13} strokeWidth={2} aria-hidden />,
  "Admissions Funnel": <UserPlus size={13} strokeWidth={2} aria-hidden />,
  "Houses & Points": <Trophy size={13} strokeWidth={2} aria-hidden />,
  "Exam Entries & Reports": <GraduationCap size={13} strokeWidth={2} aria-hidden />,
  "Staff Directory": <IdCard size={13} strokeWidth={2} aria-hidden />,
  "Learners List": <Users size={13} strokeWidth={2} aria-hidden />,
  // Legacy child labels (pre-028 seeds) kept so old rows still render a glyph:
  Confirm: <ArrowLeftRight size={13} strokeWidth={2} aria-hidden />,
  "Money Rails": <Banknote size={13} strokeWidth={2} aria-hidden />,
  "Pocket Money": <Wallet size={13} strokeWidth={2} aria-hidden />,
  "Exam Entries": <ClipboardCheck size={13} strokeWidth={2} aria-hidden />,
  Mess: <UtensilsCrossed size={13} strokeWidth={2} aria-hidden />,
  "Security Desk": <ShieldCheck size={13} strokeWidth={2} aria-hidden />,
  "School Profile": <School size={13} strokeWidth={2} aria-hidden />,
  "Terms & Calendar": <CalendarDays size={13} strokeWidth={2} aria-hidden />,
  "Capability Flags": <Puzzle size={13} strokeWidth={2} aria-hidden />,
  Integrations: <Plug size={13} strokeWidth={2} aria-hidden />,
  "Audit Trail": <History size={13} strokeWidth={2} aria-hidden />,
  "Switching Import": <Import size={13} strokeWidth={2} aria-hidden />,
  "Inbox (Approvals & Tasks)": <Inbox size={13} strokeWidth={2} aria-hidden />,
};

/** One registry decorates every canonical child with its required icon. */
export const NAV_CHILDREN: Record<string, NavChild[]> = Object.fromEntries(
  Object.entries(NAV_CHILDREN_RAW).map(([parent, children]) => [
    parent,
    children.map((child) => {
      const icon = CHILD_ICONS[child.label];
      if (!icon) throw new Error(`Missing navigation icon for ${parent} / ${child.label}`);
      return { ...child, icon };
    }),
  ]),
);
