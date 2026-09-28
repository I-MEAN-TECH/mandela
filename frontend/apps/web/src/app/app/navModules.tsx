import type { ReactNode } from "react";
import {
  Wallet, Landmark, ArrowLeftRight, ClipboardList, Banknote,
  FileText, Receipt, Users, GraduationCap, HeartHandshake,
  UserRound, ClipboardCheck, Building2, Tent, Bus, Library, Package,
  ShieldCheck, UtensilsCrossed, Trophy, CalendarDays, Wrench, BedDouble, Stethoscope,
  HeartPulse, ShieldQuestion, ScrollText, UserPlus, IdCard, HandCoins, BarChart3,
  CalendarRange, CalendarCheck, BookOpen, ClipboardPen, Puzzle, ChartLine,
  UsersRound, Plug, History, Import, Inbox, School,
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
  /** Real glyph for the sidebar child row (falls back to a dot). */
  icon?: ReactNode;
}

export const NAV_CHILDREN: Record<string, NavChild[]> = {
  Money: [
    { label: "Collect Cashier", href: "/app/money" },
    { label: "Confirm & Rails", href: "/app/reconcile" },
    { label: "Levies", href: "/app/levies" },
    { label: "Fee Structures", href: "/app/money/fees" },
    { label: "Invoices & Statements", href: "/app/money/invoices" },
    { label: "Fee Reports", href: "/app/reports" },
  ],
  Collect: [
    { label: "Record Payment", href: "/app/money" },
    { label: "Levies", href: "/app/levies" },
    { label: "Fee Structures", href: "/app/money/fees" },
    { label: "Invoices & Statements", href: "/app/money/invoices" },
  ],
  Reconcile: [
    { label: "Pending Confirmations", href: "/app/reconcile" },
  ],
  Reports: [
    { label: "Collection Reports", href: "/app/reports" },
  ],
  Spend: [
    { label: "Payroll", href: "/app/people/payroll" },
    { label: "Petty Cash & Budgets", href: "/app/money/petty" },
    { label: "Purchases & Suppliers", href: "/app/money/purchases" },
    { label: "Store & Kit", href: "/app/operations/store" },
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
  Hostel: [
    { label: "Dorm Allocations", href: "/app/operations/hostel" },
    { label: "Laundry Custody", href: "/app/laundry" },
  ],
  Laundry: [
    { label: "Garment Handover", href: "/app/laundry" },
  ],
  Facilities: [
    { label: "Repairs Queue", href: "/app/operations/facilities" },
    { label: "Store Supplies", href: "/app/operations/store" },
  ],
  Store: [
    { label: "Store Inventory", href: "/app/operations/store" },
  ],
  Library: [
    { label: "Book Catalogue", href: "/app/operations/library" },
  ],
  Transport: [
    { label: "Route & Manifest", href: "/app/operations/transport" },
  ],
  Visitors: [
    { label: "Visitors & Passes", href: "/app/operations/security" },
  ],
  Inquiries: [
    { label: "Admissions Funnel", href: "/app/people/admissions" },
  ],
  Sections: [
    { label: "Sections & Patrons", href: "/app/operations/sections" },
    { label: "Houses & Points", href: "/app/operations/houses" },
  ],
  Exams: [
    { label: "Exam Entries & Report Cards", href: "/app/academics/exams" },
  ],
  Directory: [
    { label: "Staff Directory", href: "/app/directory" },
    { label: "Learners List", href: "/app/people/learners" },
  ],
};

/** Sub-module icons — real glyphs (lucide), one per child row. */
export const CHILD_ICONS: Record<string, ReactNode> = {
  Collect: <Landmark size={13} strokeWidth={2} aria-hidden />,
  "Confirm & Rails": <ArrowLeftRight size={13} strokeWidth={2} aria-hidden />,
  "Fees, Levies & Pocket": <ClipboardList size={13} strokeWidth={2} aria-hidden />,
  "Invoices & Statements": <Receipt size={13} strokeWidth={2} aria-hidden />,
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
  "Sections & Patrons": <UsersRound size={13} strokeWidth={2} aria-hidden />,
  "Events & Calendar": <CalendarDays size={13} strokeWidth={2} aria-hidden />,
  "Duty Rosters": <CalendarCheck size={13} strokeWidth={2} aria-hidden />,
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
  "Users & Duties": <UsersRound size={13} strokeWidth={2} aria-hidden />,
  "Board & BOM": <Building2 size={13} strokeWidth={2} aria-hidden />,
  "Flags & Integrations": <Puzzle size={13} strokeWidth={2} aria-hidden />,
  "Attendance Roster": <CalendarCheck size={13} strokeWidth={2} aria-hidden />,
  "My Class Learners": <Users size={13} strokeWidth={2} aria-hidden />,
  "Homework List": <ClipboardList size={13} strokeWidth={2} aria-hidden />,
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
  Levies: <Receipt size={13} strokeWidth={2} aria-hidden />,
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
