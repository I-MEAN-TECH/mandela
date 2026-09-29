"use server";

/**
 * Server-side API client for the Mandela web app.
 * The Next.js server is the only browser-facing consumer of the NestJS API;
 * the session cookie is forwarded/set here, never exposed to client JS.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const API_URL = process.env.MANDELA_API_URL ?? "http://localhost:4000";
const COOKIE = "mandela_session";

export interface Whoami {
  authenticated: boolean;
  tenant: string;
  principal?: {
    kind: "staff" | "guardian";
    full_name: string;
    role?: string;
    email?: string | null;
  };
}

export interface BootstrapPayload {
  tenant: string;
  school: {
    name: string;
    tagline: string | null;
    motto: string | null;
    logo_svg_path: string | null;
    logo_aspect: number;
    contact_phone: string | null;
    contact_email: string | null;
    contact_address: string | null;
    quote_text: string | null;
    quote_author: string | null;
  };
  nav: Record<string, string[]>;
  modules: { title: string; body: string }[];
  prime_questions: Record<string, string>;
  /** Per-school color overrides (school_settings.theme_json) — {} = product default. */
  theme: Record<string, string>;
}

async function apiFetch(path: string, init?: RequestInit & { tenantHeader?: string }): Promise<Response> {
  const h = await headers();
  const tenant = (await cookies()).get("mandela_tenant")?.value ?? hostToTenant(h.get("host"));
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      cookie: `mandela_session=${(await cookies()).get(COOKIE)?.value ?? ""}`,
      ...(tenant ? { "x-mandela-host": `${tenant}.mandela.school` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

function hostToTenant(host: string | null): string | undefined {
  if (!host) return undefined;
  const sub = host.split(":")[0]!.split(".")[0]!;
  return sub && sub !== "localhost" && sub !== "www" && !/^\d+\.\d+\.\d+\.\d+$/.test(sub) ? sub : undefined;
}

export async function whoami(): Promise<Whoami> {
  try {
    const r = await apiFetch("/web/whoami");
    if (!r.ok) return { authenticated: false, tenant: "?" };
    return (await r.json()) as Whoami;
  } catch {
    return { authenticated: false, tenant: "?" };
  }
}

export async function getBootstrap(): Promise<BootstrapPayload | null> {
  try {
    const r = await apiFetch("/web/bootstrap");
    if (!r.ok) return null;
    return (await r.json()) as BootstrapPayload;
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Whoami & { principal: NonNullable<Whoami["principal"]> }> {
  const me = await whoami();
  if (!me.authenticated || !me.principal) redirect("/login");
  return me as Whoami & { principal: NonNullable<Whoami["principal"]> };
}

export async function requireBootstrap(): Promise<BootstrapPayload> {
  const boot = await getBootstrap();
  if (!boot) redirect("/down");
  return boot;
}

/**
 * Bootstrap without redirecting — the root layout renders /login and /down
 * too. `theme` carries the per-school color overrides; empty = product
 * default tokens win.
 */
export async function getBootstrapSafe(): Promise<BootstrapPayload | null> {
  try {
    return (await getBootstrap()) ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase 3 — onboarding: start state, role landing, Principal hat, guardian
// link codes, admission with welcome WhatsApp (docs/DEV-PHASES.md Phase 3).
// ---------------------------------------------------------------------------

export interface StartState {
  landed: boolean;
  landing?: string;
  role?: string;
  roleName?: string;
  schoolName?: string;
  error?: string;
}

/** Post-login state — the interstitial gate reads this once. */
export async function getStartState(): Promise<StartState | null> {
  return read<StartState | null>("/web/me/start", null);
}

/** Confirm your role and land (flips staff.joined server-side, audited). */
export async function confirmRoleAndLandAction(): Promise<{ ok: boolean; landing?: string; error?: string }> {
  const r = await mutate("/web/me/land", {});
  return { ok: r.ok, landing: (r.data as { landing?: string } | undefined)?.landing, error: r.error };
}

export async function togglePrincipalHatAction(on: boolean): Promise<{ ok: boolean; error?: string }> {
  return mutate("/web/me/principal-hat", { on });
}

export async function getPrincipalHat(): Promise<boolean> {
  const r = await read<{ hasHat?: boolean; error?: string }>("/web/me/principal-hat", {});
  return Boolean(r.hasHat);
}

export interface OnboardingState {
  profile_done: boolean;
  pack_code: string | null;
  term_open: boolean;
  structures: number;
  learners: number;
  steps_done: number;
}

/** Phase 4 — admin setup wizard state (5 steps; null when unreadable). */
export async function getOnboardingState(): Promise<OnboardingState | null> {
  try {
    const r = await apiFetch("/web/admin/onboarding");
    if (!r.ok) return null;
    const body = (await r.json()) as Partial<OnboardingState> & { error?: string };
    if (body.error || typeof body.steps_done !== "number") return null;
    return body as OnboardingState;
  } catch {
    return null;
  }
}

// ------------------------- Phase 5 — role dashboards -------------------------

export interface TeacherPulseData {
  role: "teacher";
  /** Leadership broadcast for staff (System completion B1) — shows once until dismissed. */
  staff_notice?: { title: string; body: string; created_at: string } | null;
  class_id: number | null;
  class_name: string | null;
  marked_today: boolean;
  present: number;
  expected: number;
  homework_due_week: number;
  unmarked_assessments: number;
  messages_today: number;
  slots_today: { period: number; starts_at: string | null; area_name: string | null }[];
  duty_today: string[];
  heatmap: { learner_id: string; name: string; marks: (string | null)[] }[];
  days: string[];
}
export async function getTeacherPulse() {
  return read<TeacherPulseData | { error: string }>("/web/pulse/teacher", { error: "unavailable" });
}

export interface BursarPulseData {
  role: "bursar";
  staff_notice?: { title: string; body: string; created_at: string } | null;
  collected_today_cents: string;
  collected_term_cents: string;
  billed_term_cents: string;
  pending_confirmations: number;
  top_arrears_class: { class: string; arrears_cents: string } | null;
  confirmations: { receipt_no: string; learner: string; amount_cents: string; method: string; paid_at: string }[];
  rails_suggestions: { payer_name: string | null; amount_cents: string; source: string }[];
  arrears: { learner: string; class: string; balance_cents: string }[];
  week: { day: string; collected_cents: string }[];
}
export async function getBursarPulse() {
  return read<BursarPulseData | { error: string }>("/web/pulse/bursar", { error: "unavailable" });
}

export interface PrincipalPulseData {
  role: "principal";
  attendance_pct: number | null;
  incidents_7d: number;
  approvals_pending: number;
  collection_pct: number | null;
  approvals_feed: { id: string; request_type: string; requester: string; at: string }[];
  absences_by_class: { class: string; absent: number }[];
  duty_today: { staff: string; duty: string }[];
  attendance_trend: { day: string; pct: number }[];
  incidents_by_class: { class: string; n: number }[];
}
export async function getPrincipalPulse() {
  return read<PrincipalPulseData | { error: string }>("/web/pulse/principal", { error: "unavailable" });
}

export interface CounterPulseData {
  role: "counter";
  staff_notice?: { title: string; body: string; created_at: string } | null;
  visitors_on_site: number;
  calls_today: number;
  open_inquiries: number;
  fee_inquiries_today: number;
  awaiting_checkout: { visitor: string; visiting: string; time_in: string }[];
  new_inquiries: { child: string; parent: string; stage: string }[];
  events_today: { title: string; kind: string }[];
  funnel: { stage: string; n: number }[];
}
export async function getCounterPulse() {
  return read<CounterPulseData | { error: string }>("/web/pulse/counter", { error: "unavailable" });
}

export interface DriverPulseData {
  role: "driver";
  staff_notice?: { title: string; body: string; created_at: string } | null;
  trips_today: number;
  on_manifest: number;
  not_picked_up: number;
  bus_status: string | null;
  route_stops: { point: string; pickup_at: string | null; learners: number; ticked: boolean }[];
  manifest: { learner: string; stop: string | null; ticked: boolean }[];
  route_affecting_events: { title: string; kind: string }[];
}
export async function getDriverPulse() {
  return read<DriverPulseData | { error: string }>("/web/pulse/driver", { error: "unavailable" });
}

/* ======================= Phase 6 pulses (§6.7–6.11) ======================= */

export interface DormParentPulseData {
  role: "dorm_parent";
  staff_notice?: { title: string; body: string; created_at: string } | null;
  dorms: { id: string; name: string; capacity: number; occupied: number }[];
  occupied: number;
  beds: number;
  exeats_out: number;
  laundry_in_custody: number;
  incidents_7d: number;
  rollcall_taken: boolean;
  rollcall: { learner_id: string; name: string; bed_label: string | null; present: boolean | null }[];
  pending_exeats: { learner: string; reason: string; state: string; created_at: string }[];
  laundry_today: { learner: string; items: string; direction: string; created_at: string }[];
}
export async function getDormParentPulse() {
  return read<DormParentPulseData | { error: string }>("/web/pulse/dorm_parent", { error: "unavailable" });
}

export interface JanitorPulseData {
  role: "janitor";
  staff_notice?: { title: string; body: string; created_at: string } | null;
  open_repairs: number;
  done_7d: number;
  structural_open: number;
  est_cost_open_cents: string;
  supplies_low: number;
  queue: { room: string; item: string; condition: string; state: string; qty: number; est_cost_cents: string; created_at: string }[];
  supplies: { name: string; qty_on_hand: number; low_stock_threshold: number; location: string | null }[];
}
export async function getJanitorPulse() {
  return read<JanitorPulseData | { error: string }>("/web/pulse/janitor", { error: "unavailable" });
}

export interface LibrarianPulseData {
  role: "librarian";
  staff_notice?: { title: string; body: string; created_at: string } | null;
  copies_out: number;
  due_today: number;
  overdue: number;
  new_titles_term: number;
  due_feed: { title: string; barcode: string; learner: string; due_on: string; overdue: boolean }[];
  by_class_30d: { class: string; n: number }[];
  new_titles: { title: string; author: string | null; copies_total: number }[];
}
export async function getLibrarianPulse() {
  return read<LibrarianPulseData | { error: string }>("/web/pulse/librarian", { error: "unavailable" });
}

export interface PatronPulseData {
  role: "patron";
  staff_notice?: { title: string; body: string; created_at: string } | null;
  leader_house: string | null;
  leader_points: string | null;
  events_week: number;
  kit_low: number;
  sessions_7d: number;
  standings: { house: string; points: string }[];
  my_sections: { id: string; name: string; kind: string; members: number }[];
  sessions: { section: string; held_on: string; topic: string | null }[];
  kit_requests: { section: string; item: string; qty: number; min_qty: number }[];
  events: { title: string; kind: string; starts_on: string }[];
}
export async function getPatronPulse() {
  return read<PatronPulseData | { error: string }>("/web/pulse/patron", { error: "unavailable" });
}

export interface HodPulseData {
  role: "hod";
  staff_notice?: { title: string; body: string; created_at: string } | null;
  teacher: TeacherPulseData;
  dept_area: string | null;
  coverage_pct: number | null;
  unmarked_dept: number;
  dept_mean: number | null;
  school_mean: number | null;
  dept_teachers: number;
  unmarked_by_teacher: { teacher: string; n: number }[];
  subject_means: { subject: string; mean: number }[];
  gaps_today: { class: string; period: number; area_name: string | null }[];
}
export async function getHodPulse() {
  return read<HodPulseData | { error: string }>("/web/pulse/hod", { error: "unavailable" });
}

export async function admitWithLinkAction(input: {
  firstName: string; middleName?: string | null; lastName: string;
  dob?: string | null; gender?: "M" | "F" | null; classId?: number | null; boarding?: boolean;
  guardianName: string; guardianPhone: string; guardianEmail?: string | null;
}): Promise<{ ok: boolean; admissionNo?: string; linkCode?: string | null; error?: string }> {
  const r = await mutate("/web/people/admit-with-link", input);
  const d = (r.data ?? {}) as { admissionNo?: string; linkCode?: string | null };
  return { ok: r.ok, admissionNo: d.admissionNo, linkCode: d.linkCode, error: r.error };
}

export async function redeemLinkCodeAction(code: string): Promise<{ ok: boolean; learner?: string; error?: string }> {
  const r = await mutate("/web/guardian/link-code", { code });
  const d = (r.data ?? {}) as { learner?: string };
  return { ok: r.ok, learner: d.learner, error: r.error };
}

export async function changeJoinerRoleAction(input: { staffId?: string; role: string }): Promise<{ ok: boolean; error?: string }> {
  return mutate("/web/staff/joiner-role", input);
}

// ---------------------------------------------------------------------------
// Mutations (server actions) — login/logout + all write paths
// ---------------------------------------------------------------------------

export async function loginStaff(email: string): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`${API_URL}/web/login/staff`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
    cache: "no-store",
  });
  const body = (await r.json()) as { ok: boolean; error?: string; token?: string };
  if (body.ok && body.token) {
    const jar = await cookies();
    jar.set(COOKIE, body.token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 3600 });
    return { ok: true };
  }
  return { ok: false, error: body.error ?? "Sign-in failed." };
}

export async function loginGuardian(phone: string): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`${API_URL}/web/login/guardian`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone }),
    cache: "no-store",
  });
  const body = (await r.json()) as { ok: boolean; error?: string; token?: string };
  if (body.ok && body.token) {
    const jar = await cookies();
    jar.set(COOKIE, body.token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 3600 });
    return { ok: true };
  }
  return { ok: false, error: body.error ?? "Sign-in failed." };
}

export async function logout(): Promise<void> {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}

async function mutate(path: string, payload: unknown): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  const r = await apiFetch(path, { method: "POST", body: JSON.stringify(payload) });
  if (!r.ok) return { ok: false, error: `Request failed (${r.status})` };
  const body = (await r.json()) as Record<string, unknown>;
  if (body.error) return { ok: false, error: String(body.error) };
  if (body.ok === false) return { ok: false, error: String(body.error ?? "Request failed") };
  return { ok: true, data: body };
}

export async function markAttendanceAction(marks: { learnerId: string; mark: string }[]) {
  const r = await mutate("/web/attendance", { marks });
  // Marks change the teacher's gate ("Today IS the mark screen") and the
  // pulse numbers — revalidate so the dashboard flips live after saving.
  if (r.ok) revalidatePath("/app");
  return r;
}

export async function recordPaymentAction(input: {
  learnerId: string; amountCents: number; method: string; reference?: string; details?: PaymentDetails; paidAt?: string;
}) {
  const r = await mutate("/web/money/payments", input);
  if (r.ok) revalidatePath("/app/money");
  return r;
}

export async function createHomeworkAction(input: { classId: number; subject: string; title: string; body: string; dueOn?: string }) {
  return mutate("/web/homework", input);
}

export async function createAnnouncementAction(input: { title: string; body: string; urgency: string; audience: Record<string, unknown> }) {
  return mutate("/web/announcements", input);
}

export async function confirmPaymentAction(input: { receiptNo: string }) {
  return mutate("/web/money/payments/confirm", input);
}

export async function updateSettingsAction(input: Record<string, unknown>) {
  return mutate("/web/settings", input);
}

// -- Daily loop (Settings → Connect WhatsApp/Email) ---------------------------

export interface ChannelStatus {
  whatsapp: { connected: boolean; phoneNumberId: string | null };
  email: { connected: boolean; host: string | null; port: number | null; from: string | null };
  digest: { enabled: boolean; time: string };
}

export async function getChannelStatus(): Promise<ChannelStatus | { error: string }> {
  try {
    const r = await apiFetch("/web/admin/channels");
    const body = (await r.json()) as unknown;
    if ((body as { error?: string }).error) return { error: String((body as { error: string }).error) };
    return body as ChannelStatus;
  } catch {
    return { error: "The school database did not respond." };
  }
}

export async function updateChannelsAction(input: {
  waPhoneNumberId?: string | null;
  waToken?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpFrom?: string | null;
  smtpPass?: string | null;
  digestEnabled?: boolean;
  digestTime?: string;
}) {
  return mutate("/web/admin/channels", input);
}

export async function testChannelAction(input: { channel: "whatsapp" | "email"; to: string }) {
  return mutate("/web/admin/channels/test", input) as Promise<{ ok: boolean; note?: string; error?: string }>;
}

export async function updateGuardianChannelAction(input: { prefChannel: "whatsapp" | "email" | "none"; email?: string | null }) {
  return mutate("/web/guardian/channel", input);
}

export async function getIntegrity(): Promise<
  | { ok: boolean; checks: { name: string; ok: boolean; count: number; detail: string }[] }
  | { error: string }
> {
  try {
    const r = await apiFetch("/web/admin/integrity");
    const body = (await r.json()) as Record<string, unknown>;
    if (body.error) return { error: String(body.error) };
    return body as { ok: boolean; checks: { name: string; ok: boolean; count: number; detail: string }[] };
  } catch {
    return { error: "The school database did not respond." };
  }
}

export async function createStaffAction(input: {
  fullName: string; email: string; phone?: string; role: string; classes: string[]; tscNo?: string; nationalId?: string;
}) {
  return mutate("/web/staff", input);
}

export async function updateStaffAction(input: {
  id: string; role?: string; active?: boolean; classes?: string[]; tscNo?: string; nationalId?: string; phone?: string;
}) {
  return mutate("/web/staff/update", input);
}

export interface LearningAreaRow { code: string; name: string }
export async function getLearningAreas(classId: number) {
  return read<{ areas: LearningAreaRow[] }>(`/web/class/${classId}/areas`, { areas: [] });
}

export interface AssessmentEntryRow { learner_id: string; subject: string; level: string | null }
export async function getAssessments(classId: number) {
  return read<{ assessments: AssessmentEntryRow[] }>(`/web/class/${classId}/assessments`, { assessments: [] });
}

export async function recordAssessmentAction(input: {
  classId: number; entries: { learnerId: string; areaCode: string; level: string }[];
}) {
  return mutate("/web/assessment/record", input);
}

// ---------------------------------------------------------------------------
// Live watchers — cheap hashes polled by <LiveRefresh>
// ---------------------------------------------------------------------------

export async function watchStaff(): Promise<string> {
  const r = await apiFetch("/web/watch/staff");
  if (!r.ok) throw new Error("watch failed");
  const body = (await r.json()) as { hash?: string };
  return body.hash ?? "0";
}

export async function watchGuardian(): Promise<string> {
  const r = await apiFetch("/web/watch/guardian");
  if (!r.ok) throw new Error("watch failed");
  const body = (await r.json()) as { hash?: string };
  return body.hash ?? "0";
}

// ---------------------------------------------------------------------------
// Reads used by the role screens
// ---------------------------------------------------------------------------

async function read<T>(path: string, fallback: T): Promise<T> {
  try {
    const r = await apiFetch(path);
    if (!r.ok) return fallback;
    return (await r.json()) as T;
  } catch {
    return fallback;
  }
}

export interface StaffHomeData {
  today: { present: number; absent: number; marked: number; expected: number };
  money: { collected_today_cents: string; expected_term_cents: string };
  count: number;
  collected_term_cents: string;
  last7: { day: string; present: string; total: string }[];
}

export async function getStaffHome() {
  return read<StaffHomeData | { error: string }>("/web/home/staff", { error: "unavailable" });
}

/** Exam Entries — the KEMIS readiness read (admin/principal). */
export interface KemisReadinessData {
  learners: { total: number; with_upi: number; with_birth_cert: number; with_guardian: number; with_dob: number };
  staff: { total: number; with_national_id: number; with_tsc: number };
  missing_learners: { id: string; name: string; admission_no: string; class: string | null; upi: string | null; birth_cert_no: string | null; gender: string | null; date_of_birth: string | null; missing: string[] }[];
  missing_staff: { id: string; name: string; role: string; missing: string[] }[];
}

export async function getKemisReadiness() {
  return read<KemisReadinessData | { error: string }>("/web/admin/kemis", { error: "unavailable" });
}

export interface AuditEntry {
  action: string;
  entity: string;
  entity_id: string;
  actor_kind: string;
  actor_name: string | null;
  before: unknown;
  after: unknown;
  at: string;
}

export async function getAuditTrail(filters: { action?: string; actor?: string; limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (filters.action) qs.set("action", filters.action);
  if (filters.actor) qs.set("actor", filters.actor);
  if (filters.limit) qs.set("limit", String(filters.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return read<{ entries: AuditEntry[] } | { error: string }>(`/web/admin/audit${suffix}`, { error: "unavailable" });
}

/** Terms & Calendar — the school's clock, run from Settings. */
export interface TermsData {
  current_year: { id: number; year: number; starts_on: string; ends_on: string } | null;
  years: { id: number; year: number; starts_on: string; ends_on: string; terms: number }[];
  terms: { id: number; label: string; starts_on: string; ends_on: string; year: number; days_left: number | null; is_current: boolean }[];
}

export async function getTerms() {
  return read<TermsData | { error: string }>("/web/admin/terms", { error: "unavailable" });
}

/** Fee Structures ⑫ — structures, discounts, plans (docs/BUILD-PHASES.md Phase 1). */
export interface FeeStructureRow {
  id: string; name: string; class_name: string | null; amount_cents: string;
  is_optional: boolean; term_label: string;
}
export interface FeeStructuresData {
  rows: FeeStructureRow[];
  currentTerm: { id: number; label: string };
}
export async function getFeeStructures() {
  return read<FeeStructuresData | { error: string }>("/web/admin/fees/structures", { error: "unavailable" });
}
export async function upsertFeeStructureAction(input: { name: string; classId: number | null; amountCents: number; isOptional: boolean }) {
  return mutate("/web/admin/fees/structures/upsert", input);
}
export async function applyFeeStructureAction(structureId: string) {
  return mutate("/web/admin/fees/structures/apply", { structureId });
}
export interface DiscountRow {
  id: string; name: string; class_name: string | null;
  applies_from: number; percent_off: string; active: boolean;
}
export async function getFeeDiscounts() {
  return read<DiscountRow[] | { error: string }>("/web/admin/fees/discounts", { error: "unavailable" });
}
export async function upsertFeeDiscountAction(input: { name: string; classId: number | null; appliesFrom: number; percentOff: number; active: boolean }) {
  return mutate("/web/admin/fees/discounts/upsert", input);
}
export interface PlanRow {
  id: string; learner: string; class_name: string | null; plan_name: string;
  parts: number; total_cents: string; paid_cents: string; next_due: string | null;
}
export async function getFeePlans() {
  return read<PlanRow[] | { error: string }>("/web/admin/fees/plans", { error: "unavailable" });
}
export async function createFeePlanAction(input: { learnerId: string; name: string; parts: { label: string; dueOn: string; amountCents: number }[] }) {
  return mutate("/web/admin/fees/plans/create", input);
}

/** Invoices & Statements 13 — the allocation-backed money truth (Phase 1). */
export interface InvoiceListRow {
  learner_id: string; learner: string; class_name: string | null;
  billed_cents: string; paid_cents: string; balance_cents: string;
  credit_cents: string; items: number;
}
export interface InvoicesData {
  rows: InvoiceListRow[];
  term: string;
}
export async function getInvoices() {
  return read<InvoicesData | { error: string }>("/web/admin/invoices", { error: "unavailable" });
}
export interface StatementItemLine {
  name: string; billed_cents: number; paid_cents: number; balance_cents: number; billed_at: string;
}
export interface StatementPaymentLine {
  receipt_no: string; amount_cents: number; method: string; paid_at: string; reference: string | null;
}
export interface LearnerTermStatement {
  learner: string; class_name: string | null; term: string;
  invoice_no: string; issued_on: string;
  items: StatementItemLine[];
  payments: StatementPaymentLine[];
  billed_cents: number; paid_cents: number; balance_cents: number; credit_cents: number;
  school: { name: string; contact_phone: string | null; contact_email: string | null; contact_address: string | null };
}
export async function getLearnerStatement(learnerId: string) {
  return read<LearnerTermStatement | { error: string }>(
    `/web/admin/invoices/statement/${learnerId}`,
    { error: "unavailable" },
  );
}
export async function createInvoiceItemAction(input: { learnerId: string; name: string; amountCents: number }) {
  return mutate("/web/admin/invoices/item", input);
}

export async function upsertTermAction(input: { year: number; label: string; startsOn: string; endsOn: string }) {
  return mutate("/web/admin/terms/upsert", input);
}

/** Curriculum Setup (16) — pack controls, class ladder, context resolver. */
export interface CurriculumVocab {
  learner_label: string; level_label: string; area_label: string;
  unit_label: string | null; subunit_label: string | null;
}
export interface AreaNode {
  id: number; code: string; name: string; pathway: string | null;
  children: { id: number; code: string; name: string }[];
}
export interface CurriculumContext {
  curriculum_id: number; code: string; name: string;
  vocab: CurriculumVocab;
  scheme_code: string; scheme_name: string;
  scale: { k: string; name?: string; min?: number }[];
  flags: { has_strands: boolean; has_pathways: boolean; has_coursework: boolean; marks_range: [number, number] | null };
  areas: AreaNode[];
}
export interface CurriculumPackRow {
  id: number; code: string; name: string; enabled: boolean; is_default: boolean;
  level_count: number; area_count: number; class_count: number;
  scheme: string | null; vocab: CurriculumVocab | null;
}
export interface CurriculumSetupData {
  packs: CurriculumPackRow[];
  classes: { id: number; name: string; level_code: string | null; curriculum_code: string | null }[];
  ladder: Record<string, { label: string; levels: { id: number; code: string; label: string }[] }>;
}
export async function getCurriculumSetup() {
  return read<CurriculumSetupData | { error: string }>("/web/admin/curriculum", { error: "unavailable" });
}
export async function getCurriculumContext(classId: number) {
  return read<{ context: CurriculumContext | null } | { error: string }>(
    `/web/admin/curriculum/context/${classId}`,
    { error: "unavailable" },
  );
}
export async function setCurriculumPackAction(input: { code: string; enabled?: boolean; makeDefault?: boolean }) {
  return mutate("/web/admin/curriculum/pack", input);
}
export async function attachClassLevelAction(input: { classId: number; levelId: number }) {
  return mutate("/web/admin/curriculum/attach", input);
}

/** Admissions (3) — the front desk funnel. */
export interface InquiryRow {
  id: string; child_first: string; child_middle: string | null; child_last: string;
  parent_name: string; phone: string; level_interest: string | null;
  curriculum_code: string | null; source: string; stage: string;
  notes: string | null; next_followup_on: string | null;
  learner_id: string | null; admission_no: string | null;
  created_at: string; siblings: number;
}
export interface AdmissionsData { rows: InquiryRow[] }
export async function getAdmissions() {
  return read<AdmissionsData | { error: string }>("/web/admin/admissions", { error: "unavailable" });
}
export async function createInquiryAction(input: {
  childFirst: string; childMiddle?: string; childLast: string; childDob?: string;
  gender?: string; parentName: string; phone: string; email?: string;
  levelInterest?: string; curriculumCode?: string; source: string;
  notes?: string; nextFollowupOn?: string;
}) {
  return mutate("/web/admin/admissions/inquiry", input);
}
export async function moveInquiryStageAction(input: { id: string; stage: string }) {
  return mutate("/web/admin/admissions/stage", input);
}
export async function convertInquiryAction(input: { id: string; classId: number | null; boarding: boolean }) {
  return mutate("/web/admin/admissions/convert", input);
}

/** Compliance Center (28) — every regulatory line on one screen. */
export interface ComplianceLine {
  key: string; label: string; pct: number | null; done: boolean;
  due_date: string | null; days_left: number | null; note: string | null;
  fix: { label: string; href: string } | null;
}
export interface ComplianceRollupData {
  lines: ComplianceLine[];
  worst_pct: number;
  next_deadline: { label: string; due_date: string; days_left: number } | null;
}
export async function getCompliance() {
  return read<ComplianceRollupData | { error: string }>("/web/admin/compliance", { error: "unavailable" });
}
export async function updateComplianceLineAction(input: { key: string; done?: boolean; dueDate?: string | null }) {
  return mutate("/web/admin/compliance/line", input);
}

/** Retention policy (32-parked decision, flank #8) — Settings block. */
export interface RetentionPolicyData {
  audit_retention: string; backups: string; export_window_days: number;
}
export async function getRetentionPolicy() {
  return read<RetentionPolicyData | { error: string }>("/web/admin/retention", { error: "unavailable" });
}
export async function setRetentionPolicyAction(input: { backups: string; exportWindowDays: number }) {
  return mutate("/web/admin/retention", input);
}

/** Approvals Inbox (36) + Tasks (37) — the two-leaders hinge. */
export interface ApprovalRow {
  id: string; request_type: string; requester: string; requester_role: string;
  payload: { amount_cents?: number; about?: string; note?: string };
  state: string; decided_by: string | null; decision_reason: string;
  decided_at: string | null; created_at: string; age_days: number;
}
export interface ApprovalsData { pending: ApprovalRow[]; decided: ApprovalRow[] }
export async function getApprovals() {
  return read<ApprovalsData | { error: string }>("/web/admin/approvals", { error: "unavailable" });
}
export async function raiseApprovalAction(input: { requestType: string; about?: string; note?: string; amountCents?: number }) {
  return mutate("/web/admin/approvals/raise", input);
}
export async function decideApprovalAction(input: { id: string; decision: "approved" | "rejected"; reason: string }) {
  return mutate("/web/admin/approvals/decide", input);
}
export interface TaskRow {
  id: string; title: string; detail: string | null; source: string;
  source_link: string | null; assignee: string | null; due_on: string | null;
  days_left: number | null; state: string; created_at: string;
}
export interface TasksData { open: TaskRow[]; done: TaskRow[] }
export async function getTasks() {
  return read<TasksData | { error: string }>("/web/admin/tasks", { error: "unavailable" });
}
export async function createTaskAction(input: {
  title: string; detail?: string; source?: string; sourceLink?: string;
  assigneeId?: string; dueOn?: string;
}) {
  return mutate("/web/admin/tasks/create", input);
}
export async function completeTaskAction(input: { id: string; state: "done" | "cancelled" }) {
  return mutate("/web/admin/tasks/complete", input);
}

/** Payroll (7) — three staff populations, one system. */
export interface ContractRow {
  id: string; staff_id: string; staff_name: string; staff_role: string;
  phone: string | null; population: string; basic_cents: string;
  frequency: string; allowances: Record<string, number>;
  effective_from: string; effective_to: string | null; active: boolean;
}
export interface PayrollContractsData {
  contracts: ContractRow[];
  tscSeconded: { id: string; name: string; role: string; tsc_no: string | null }[];
}
export async function getPayrollContracts() {
  return read<PayrollContractsData | { error: string }>("/web/admin/payroll/contracts", { error: "unavailable" });
}
export async function upsertContractAction(input: {
  staffId: string; population: "bom" | "term"; basicCents: number;
  frequency: "monthly" | "termly"; allowances?: Record<string, number>; effectiveFrom: string;
}) {
  return mutate("/web/admin/payroll/contracts/upsert", input);
}
export interface PayrollRunRow {
  id: string; period: string; state: string; working_days: number;
  headcount: number; net_total_cents: string | null;
  computed_at: string | null; disbursed_at: string | null; disbursed_how: string | null;
}
export async function getPayrollRuns() {
  return read<{ runs: PayrollRunRow[] } | { error: string }>("/web/admin/payroll/runs", { error: "unavailable" });
}
export interface SlipRow {
  id: string; staff_name: string; staff_role: string; population: string;
  phone: string | null; days_worked: number; basic_cents: string;
  allowances: Record<string, number>; gross_cents: string; paye_cents: string;
  shif_cents: string; housing_cents: string; nssf_cents: string;
  other_cents: string; net_cents: string;
}
export async function getPayrollRun(runId: string) {
  return read<{ run: PayrollRunRow; slips: SlipRow[] } | { error: string }>(
    `/web/admin/payroll/runs/${runId}`, { error: "unavailable" },
  );
}
export async function computePayrollAction(input: { period: string; workingDays?: number }) {
  return mutate("/web/admin/payroll/runs/compute", input);
}
export async function approvePayrollAction(input: { runId: string; reason: string }) {
  return mutate("/web/admin/payroll/runs/approve", input);
}
export async function disbursePayrollAction(input: { runId: string; how: "bank-file" | "manual" | "mpesa" }) {
  return mutate("/web/admin/payroll/runs/disburse", input);
}

/** Guardians & Parents — the contact register + CSV import (admin/principal). */
export interface GuardianRow {
  id: string; full_name: string; phone: string; email: string | null; relationship: string;
  wa_opt_in: boolean; active: boolean; children: string | null;
}
export interface GuardianDirectoryData {
  guardians: GuardianRow[];
  stats: { total: string; wa: string; with_children: string };
}

export async function getGuardians() {
  return read<GuardianDirectoryData | { error: string }>("/web/admin/guardians", { error: "unavailable" });
}

export async function upsertGuardianAction(input: {
  id?: string; fullName: string; phone: string; email?: string; relationship: string; waOptIn?: boolean;
}) {
  return mutate("/web/admin/guardians/upsert", input);
}

export async function importGuardiansAction(rows: { fullName: string; phone: string; email?: string; relationship: string }[]) {
  return mutate("/web/admin/guardians/import", { rows });
}

/** Admin Today — the governance pulse. Errors read as "unavailable". */
export interface AdminPulseData {
  staff_active: number;
  staff_total: number;
  learners_active: number;
  term: { label: string; ends_on: string; days_left: number } | null;
  audit_term: number;
  audit_7d: number;
  money: { collected_term_cents: string; billed_term_cents: string };
  guardians: { total: number; whatsapp: number };
  attendance_today: { present: number; expected: number };
  recent_audit: { action: string; entity: string; actor_kind: string; at: string }[];
  cashflow: { month: string; billed_cents: string; collected_cents: string }[];
  by_method: { method: string; total_cents: string }[];
  recent_payments: {
    receipt_no: string;
    learner: string;
    amount_cents: string;
    method: string;
    state: string;
    paid_at: string;
  }[];
  approvals: { pending: number; oldest_days: number | null };
  tasks: { open: number; overdue: number };
  sections: { events_week: number; kit_low: number; sections_enabled: number };
}

export async function getAdminPulse() {
  return read<AdminPulseData | { error: string }>("/web/admin/pulse", { error: "unavailable" });
}

// -- System completion C11 — inline approvals/tasks on the Pulse --------------

export interface PulseApproval {
  id: string;
  request_type: string;
  requester: string;
  payload: unknown;
  age_days: number;
}

export interface PulseTask {
  id: string;
  title: string;
  due_on: string | null;
  days_left: number | null;
}

/** C12 — one-tap timetable auto-layout (§7 #4): greedy gap-fill, teacher-conflict aware. */
export async function autolayoutTimetableAction(): Promise<{ ok: boolean; placed?: number; skipped?: number; error?: string }> {
  try {
    const r = await apiFetch("/web/admin/timetable/autolayout", { method: "POST" });
    const body = (await r.json()) as { ok?: boolean; placed?: number; skipped?: number; error?: string };
    if (body.error) return { ok: false, error: body.error };
    return { ok: true, placed: body.placed ?? 0, skipped: body.skipped ?? 0 };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

export async function getPulseActions(): Promise<{ approvals: PulseApproval[]; tasks: PulseTask[] } | { error: string }> {
  try {
    const r = await apiFetch("/web/admin/pulse/actions");
    const body = (await r.json()) as unknown;
    if ((body as { error?: string }).error) return { error: String((body as { error: string }).error) };
    return body as { approvals: PulseApproval[]; tasks: PulseTask[] };
  } catch {
    return { error: "unavailable" };
  }
}

// -- System completion B2 — school health (§7.7 #11) ---------------------------

export interface SchoolHealthData {
  totals: { staff: number; started: number; pending: number };
  by_role: { role: string; total: number; started: number }[];
  started: { staff_id: string; name: string; role: string; duties: number; since: string | null }[];
  pending: { staff_id: string; name: string; role: string; email: string | null; created_at: string | null }[];
}

export async function getSchoolHealth(): Promise<SchoolHealthData | { error: string }> {
  try {
    const r = await apiFetch("/web/admin/health");
    const body = (await r.json()) as unknown;
    if ((body as { error?: string }).error) return { error: String((body as { error: string }).error) };
    return body as SchoolHealthData;
  } catch {
    return { error: "unavailable" };
  }
}

export interface SearchHit {
  kind: "learner" | "staff" | "guardian" | "receipt";
  label: string;
  meta: string;
  href: string;
}

/** School-wide search (topbar). Server action — runs with the session cookie. */
export async function schoolSearch(q: string): Promise<SearchHit[]> {
  try {
    const r = await apiFetch(`/web/search?q=${encodeURIComponent(q)}`);
    if (!r.ok) return [];
    const j = (await r.json()) as { hits?: SearchHit[] };
    return j.hits ?? [];
  } catch {
    return [];
  }
}

export interface BellState {
  pending_payments: number;
  announcements_7d: number;
  audit_7d: number;
}

/** The bell's live counts (topbar). Server action. */
export async function getBellState(): Promise<BellState | null> {
  try {
    const r = await apiFetch("/web/bell");
    if (!r.ok) return null;
    return (await r.json()) as BellState;
  } catch {
    return null;
  }
}

export interface GuardianHomeData {
  learners: { id: string; name: string; class: string | null }[];
  due_cents: Record<string, string>;
  paid_this_term_cents: Record<string, string>;
  homework_due: { learner: string; subject: string; title: string; due_on: string }[];
  announcements: { title: string; body: string; created_at: string }[];
  next_due?: { learner: string; item: string; amount_cents: string };
}

export async function getGuardianHome() {
  return read<GuardianHomeData | { error: string }>("/web/home/guardian", { error: "unavailable" });
}

export interface LearnerRow {
  id: string; admission_no: string; name: string; class: string | null; status: string; gender: string | null;
}
export async function getLearners() {
  return read<{ learners: LearnerRow[] }>("/web/learners", { learners: [] });
}

export interface ClassRow { id: number; code: string; name: string; learners: string }
export async function getClasses() {
  return read<{ classes: ClassRow[] }>("/web/classes", { classes: [] });
}

export interface RosterRow { id: string; name: string; admission_no: string; mark: string | null }
export async function getRoster(classId: number) {
  return read<{ roster: RosterRow[] }>(`/web/roster/${classId}`, { roster: [] });
}

export interface HomeworkRow { id: string; subject: string; title: string; body: string; due_on: string | null; class: string }
export async function getHomework() {
  return read<{ homework: HomeworkRow[] }>("/web/homework", { homework: [] });
}

export interface PaymentDetails {
  mpesa_code?: string;
  mpesa_phone?: string;
  mpesa_time?: string;
  slip_no?: string;
  bank_name?: string;
  cheque_no?: string;
  cheque_date?: string;
}
export interface PaymentRow {
  id: string;
  receipt_no: string;
  learner: string;
  learner_id: string;
  class_name: string | null;
  amount_cents: string;
  method: string;
  state: string;
  reference: string | null;
  details: PaymentDetails | null;
  paid_at: string;
}
export async function getPayments() {
  return read<{ payments: PaymentRow[] }>("/web/money/payments", { payments: [] });
}
export async function updatePaymentAction(input: {
  paymentId: string;
  amountCents?: number;
  method?: string;
  reference?: string | null;
  details?: PaymentDetails;
  paidAt?: string | null;
}) {
  const r = await mutate("/web/money/payments/update", input);
  if (r.ok) revalidatePath("/app/money");
  return r;
}

/** THE receipt print payload — what /web/print/receipt answers. */
export interface PaymentReceiptData {
  receipt_no: string;
  learner: string;
  admission_no: string | null;
  class_name: string | null;
  amount: string;
  method: string;
  state: string;
  reference: string | null;
  details: PaymentDetails | null;
  paid_at: string;
  recorded_by: string | null;
  school: { name: string; contact_phone: string | null; contact_email: string | null; contact_address: string | null };
}

export interface CollectionRow { class: string; billed_cents: string; paid_cents: string }
export async function getCollections() {
  return read<{ collections: CollectionRow[] }>("/web/money/collections", { collections: [] });
}

export interface AnnouncementRow { id: string; title: string; body: string; urgency: string; created_at: string }
export async function getAnnouncements() {
  return read<{ announcements: AnnouncementRow[] }>("/web/announcements", { announcements: [] });
}

export interface InsightsData {
  learners: { active: string; boarding: string };
  guardians: { total: string; wa: string };
  attendance7: { day: string; present: string; total: string }[];
  collection: CollectionRow[];
}
export async function getInsights() {
  return read<InsightsData | { error: string }>("/web/insights", { error: "unavailable" });
}

// ---------------------------------------------------------------------------
// Messages / staff directory / levies / pending / settings / guardian profile
// ---------------------------------------------------------------------------

export interface MessageRow {
  id: string; title: string | null; guardian: string; learner: string | null;
  channel: string; state: string; created_at: string;
}
export async function getMessages() {
  return read<{ messages: MessageRow[] }>("/web/messages", { messages: [] });
}

export interface StaffRow {
  id: string; full_name: string; role: string; email: string | null; phone: string | null; active: boolean; classes: string | null; tsc_no: string | null; national_id: string | null;
}
export async function getStaffDirectory() {
  return read<{ staff: StaffRow[] }>("/web/staff", { staff: [] });
}

export interface LevyRow { id: string; name: string; class: string | null; amount_cents: string; is_optional: boolean }
export async function getLevies() {
  return read<{ levies: LevyRow[] }>("/web/money/levies", { levies: [] });
}

export interface PendingPaymentRow {
  receipt_no: string; learner: string; amount_cents: string; method: string; reference: string | null; paid_at: string;
}
export async function getPendingPayments() {
  return read<{ pending: PendingPaymentRow[] }>("/web/money/pending", { pending: [] });
}

export interface SettingsData {
  name: string; tagline: string | null; motto: string | null;
  contact_phone: string | null; contact_email: string | null; contact_address: string | null;
  quote_text: string | null; quote_author: string | null;
  modules: { title: string; body: string }[];
  nav: Record<string, string[]>;
  prime_questions: Record<string, string>;
  /** Color overrides for the ink/paper tokens (hex); {} = product default. */
  theme: Record<string, string>;
}
export async function getSettings() {
  return read<SettingsData | { error: string }>("/web/settings", { error: "unavailable" });
}

export interface GuardianProfileData {
  full_name: string; phone: string; email: string | null; relationship: string;
  wa_opt_in: boolean; sms_fallback: boolean; pref_channel: string;
  learners: { id: string; name: string; class: string | null }[];
}
export async function getGuardianProfile() {
  return read<GuardianProfileData | { error: string }>("/web/guardian/profile", { error: "unavailable" });
}

export interface GuardianMessageRow {
  id: string; title: string | null; body: string | null; urgency: string | null;
  channel: string; state: string; created_at: string;
}
export async function getGuardianMessages() {
  return read<{ messages: GuardianMessageRow[] }>("/web/guardian/messages", { messages: [] });
}

// ---- Money Rails (14) -------------------------------------------------------
export interface RailsSuggestionRow {
  id: string; source: string; payer_name: string | null; payer_ref: string | null;
  amount_cents: string; paid_on: string; suggested_learner_id: string | null;
  suggested_learner: string | null; match_score: string | null;
  match_reason: string | null; state: string;
}
export interface RailsOverviewData {
  suggestions: RailsSuggestionRow[];
  stats: { auto: number; suggested: number; unmatched: number; manualShare: number };
}
export async function getRailsOverview() {
  return read<RailsOverviewData | { error: string }>("/web/admin/rails", { error: "unavailable" });
}
export async function importBankCsvAction(input: { fileName: string; rows: { payerName?: string; payerRef?: string; amountCents: number; paidOn: string }[] }) {
  return mutate("/web/admin/rails/import-csv", input);
}
export async function confirmRailsAction(input: { id: string; learnerId: string; method: "bank" | "cash" | "cheque" | "mpesa" }) {
  return mutate("/web/admin/rails/confirm", input);
}
export async function dismissRailsAction(input: { id: string }) {
  return mutate("/web/admin/rails/dismiss", input);
}

// ---- Attendance Oversight (17) + Exams & Report Cards (18) ------------------
export interface AttendanceOversightData {
  todayPct: number; todayMarked: number; todayTotal: number;
  trend7: { day: string; pct: number }[];
  chronic: { learner_id: string; learner: string; class_name: string | null; absences: number; days: number; pct: number }[];
  byClass: { class_id: number; class_name: string; pct: number; marked: number }[];
}
export async function getAttendanceOversight() {
  return read<AttendanceOversightData | { error: string }>("/web/admin/attendance-oversight", { error: "unavailable" });
}
export interface ExamCoverageData {
  classes: { class_id: number; class_name: string; curriculum: string; learners: number; assessed: number; coveragePct: number }[];
  overallPct: number;
  pendingApprovals: { card_id: string; learner: string; class_name: string | null; term: string; state: string }[];
  recentCards: { card_id: string; learner: string; class_name: string | null; term: string; state: string; created_at: string }[];
}
export async function getExamCoverage() {
  return read<ExamCoverageData | { error: string }>("/web/admin/exam-coverage", { error: "unavailable" });
}
export async function generateReportCardAction(input: { learnerId: string }) {
  return mutate("/web/admin/report-cards/generate", input);
}
export async function approveReportCardAction(input: { cardId: string }) {
  return mutate("/web/admin/report-cards/approve", input);
}

// ---- Governance cluster (33/34/35/36) ---------------------------------------
export interface UsersRolesData {
  users: { staff_id: string; name: string; role: string; email: string | null; active: boolean; member_since: string | null; duties: number }[];
}
export async function getUsersRoles() {
  return read<UsersRolesData | { error: string }>("/web/admin/users-roles", { error: "unavailable" });
}
export async function changeUserRoleAction(input: { staffId: string; role: string }) {
  return mutate("/web/admin/users-roles/change", input);
}
export interface PermMatrixData {
  rows: { module_key: string; role: string; owns: boolean; sees: boolean; landing: boolean }[];
}
export async function getPermMatrix() {
  return read<PermMatrixData | { error: string }>("/web/admin/perm-matrix", { error: "unavailable" });
}
export async function setPermCellAction(input: { moduleKey: string; role: string; owns?: boolean; sees?: boolean; landing?: boolean }) {
  return mutate("/web/admin/perm-matrix/set", input);
}
/* Phase 6 — Settings → Team (§7.7): join code + pending joiners + regen. */
export interface TeamOverviewData {
  joinCode: string | null;
  joined: { staff_id: string; name: string; role: string; joined_at: string | null }[];
  pending: { staff_id: string; name: string; role: string; created_at: string | null }[];
}
export async function getTeamOverview() {
  return read<TeamOverviewData | { error: string }>("/web/admin/team", { error: "unavailable" });
}
export async function regenerateJoinCodeAction() {
  return mutate("/web/auth/join-code/regenerate", {});
}
export interface DutyRow {
  id: string; staff_id: string; staff_name: string; staff_role: string;
  duty_key: string; label: string; scope_id: string | null;
  effective_from: string; effective_to: string | null; active: boolean;
}
export async function getDuties() {
  return read<{ rows: DutyRow[] } | { error: string }>("/web/admin/duties", { error: "unavailable" });
}
export async function assignDutyAction(input: { staffId: string; dutyKey: string; label: string; scopeId?: string }) {
  return mutate("/web/admin/duties/assign", input);
}
export async function endDutyAction(input: { id: string }) {
  return mutate("/web/admin/duties/end", input);
}
export interface IntegrationsData {
  rows: { key: string; label: string; connected: boolean; last_ok_at: string | null; note: string | null }[];
}
export async function getIntegrations() {
  return read<IntegrationsData | { error: string }>("/web/admin/integrations", { error: "unavailable" });
}
export async function toggleIntegrationAction(input: { key: string; connected: boolean }) {
  return mutate("/web/admin/integrations/toggle", input);
}

// ------------------------------ ㊸ Sections ---------------------------------
export interface SectionRow {
  id: string; name: string; kind: string; head_staff_id: string | null;
  head_name: string | null; enabled: boolean; members: number;
  kit_value_cents: string; kit_items: number; notes: string | null;
}
export async function getSections() {
  return read<{ rows: SectionRow[] } | { error: string }>("/web/admin/sections", { error: "unavailable" });
}
export interface SectionDetail {
  section: { id: string; name: string; kind: string; head_name: string | null; enabled: boolean };
  members: { learner_id: string; learner: string; admission_no: string; class_name: string | null }[];
  sessions: { id: string; held_on: string; topic: string | null; present: number; total: number }[];
  kit: { id: string; name: string; qty_on_hand: number; unit_price: string; low: boolean }[];
}
export async function getSectionDetail(id: string) {
  return read<SectionDetail | { error: string }>(`/web/admin/sections/${id}`, { error: "unavailable" });
}
export interface MySectionData {
  sections: { id: string; name: string; kind: string; members: number }[];
}
export async function getMySection() {
  return read<MySectionData | null | { error: string }>("/web/admin/my-section", { error: "unavailable" });
}
export async function upsertSectionAction(input: { id?: string; name: string; kind: string; headStaffId?: string | null; notes?: string | null }) {
  return mutate("/web/admin/sections/upsert", input);
}
export async function toggleSectionAction(input: { id: string; enabled: boolean }) {
  return mutate("/web/admin/sections/toggle", input);
}
export async function deleteSectionAction(input: { id: string }) {
  return mutate("/web/admin/sections/delete", input);
}
export async function deleteRouteAction(input: { id: string }) {
  return mutate("/web/admin/transport/route-delete", input);
}
export async function deleteBusAction(input: { id: string }) {
  return mutate("/web/admin/transport/bus-delete", input);
}
export async function addSectionMembersAction(input: { sectionId: string; learnerIds: string[] }) {
  return mutate("/web/admin/sections/members/add", input);
}
export async function removeSectionMemberAction(input: { sectionId: string; learnerId: string }) {
  return mutate("/web/admin/sections/members/remove", input);
}
export async function holdSectionSessionAction(input: { sectionId: string; topic?: string | null; present: string[]; absent: string[] }) {
  return mutate("/web/admin/sections/sessions/hold", input);
}
export async function tagKitItemAction(input: { sectionId: string; itemId: string }) {
  return mutate("/web/admin/sections/kit/tag", input);
}

// ------------------------ ㊹ Discipline & ㊺ Counselling ---------------------
export interface IncidentRow {
  id: string; learner_id: string; learner: string; class_name: string | null;
  kind: string; category: string; points: number; description: string;
  action: string | null; occurred_on: string; parent_notified: boolean;
  recorded_by_name: string | null;
}
export interface DisciplineOverview {
  kpis: { incidents_term: number; merits: number; demerits: number; detentions: number };
  byClass: { class_name: string; incidents: number; merit_points: number; demerit_points: number }[];
  rows: IncidentRow[];
}
export async function getDiscipline() {
  return read<DisciplineOverview | { error: string }>("/web/admin/discipline", { error: "unavailable" });
}
export async function recordIncidentAction(input: {
  learnerId: string; kind: "merit" | "demerit"; category: string; points: number;
  description: string; action?: string | null; notifyParent: boolean;
}) {
  return mutate("/web/admin/discipline/record", input);
}
export interface CounsellingCaseRow {
  id: string; learner_id: string; learner: string; class_name: string | null;
  status: string; summary: string; referral: string | null; opened_on: string;
  notes: { on: string; note: string; by: string }[];
}
export interface CounsellingData {
  canOpen: boolean;
  stats: { open_ct: number; referred_ct: number; closed_ct: number };
  cases: CounsellingCaseRow[];
}
export async function getCounselling() {
  return read<CounsellingData | { error: string }>("/web/admin/counselling", { error: "unavailable" });
}
export async function openCaseAction(input: { learnerId: string; summary: string; referral?: string | null }) {
  return mutate("/web/admin/counselling/open", input);
}
export async function appendCaseNoteAction(input: { id: string; note: string }) {
  return mutate("/web/admin/counselling/note", input);
}
export async function closeCaseAction(input: { id: string; status: "referred" | "closed"; referral?: string | null }) {
  return mutate("/web/admin/counselling/close", input);
}

// ------------------------------ The edit pass -----------------------------
// Every register row correctable on its own screen; the backend audits
// before/after, leaders only.
export interface UpsertLearnerInput {
  id?: string;
  admissionNo?: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender?: "M" | "F" | null;
  dob?: string | null;
  classId?: number | null;
  boarding?: boolean;
  upi?: string | null;
  birthCertNo?: string | null;
  status?: "active" | "transferred" | "graduated" | "inactive";
}
export async function upsertLearnerAction(input: UpsertLearnerInput) {
  return mutate("/web/admin/learners/upsert", input);
}
export async function updateEventAction(input: {
  id: string; title: string; kind: string; startsOn: string; endsOn?: string | null; notes?: string | null;
}) {
  return mutate("/web/admin/events/update", input);
}
export async function cancelEventAction(input: { id: string }) {
  return mutate("/web/admin/events/cancel", input);
}
export async function setRouteActiveAction(input: { id: string; active: boolean }) {
  return mutate("/web/admin/transport/route-state", input);
}

// --------------------------- ㉔ Events ----------------------------------
export interface EventRow {
  id: string; title: string; kind: string; starts_on: string;
  ends_on: string | null; notes: string | null;
}
export async function getEvents() {
  return read<{ rows: EventRow[] } | { error: string }>("/web/admin/events", { error: "unavailable" });
}
export async function createEventAction(input: {
  title: string; kind: string; startsOn: string; endsOn?: string | null; notes?: string | null;
}) {
  return mutate("/web/admin/events/create", input);
}

// ---------------------- ② Learner 360 + CSV import ---------------------------
export interface Learner360 {
  learner: { id: string; admission_no: string; upi: string | null; name: string;
             class_name: string | null; class_id: number | null; gender: string | null; dob: string | null;
             boarding: boolean; status: string };
  guardians: { id: string; full_name: string; phone: string; relationship: string; is_primary: boolean }[];
  ledger: { billed_cents: string; paid_cents: string; balance_cents: string } | null;
  attendance: { present: number; absent: number; late: number; rate: number };
  conduct: { merits: number; demerits: number };
  sections: { name: string; kind: string }[];
}
export async function getLearner360(id: string) {
  return read<Learner360 | { error: string }>(`/web/admin/learners/${id}/360`, { error: "unavailable" });
}
export interface CsvImportResult {
  ok: boolean; created: number; updated: number; skipped: number;
  errors: { line: number; message: string }[];
  siblingsLinked: number;
}
export async function importLearnersCsvAction(csv: string, filename?: string | null) {
  return mutate("/web/admin/learners/import-csv", { csv, filename });
}

// ------------------------------ ㊴ Facilities --------------------------------
export interface RepairRow {
  id: string; room: string; item: string; qty: number; condition: string;
  note: string | null; state: string; verdict: string | null;
  est_cost_cents: string; replace_value_cents: string;
  reported_by_name: string | null; created_at: string;
}
export interface FacilitiesData {
  rows: RepairRow[];
  kpis: { open: number; structural: number; replace_ct: number; est_total_cents: string };
}
export async function getFacilities() {
  return read<FacilitiesData | { error: string }>("/web/admin/facilities", { error: "unavailable" });
}
export async function reportRepairAction(input: {
  room: string; item: string; qty: number; condition: string; note?: string | null;
  estCostCents?: number; replaceValueCents?: number;
}) {
  return mutate("/web/admin/facilities/report", input);
}
export async function setRepairStateAction(input: { id: string; state: string }) {
  return mutate("/web/admin/facilities/state", input);
}

// -------------------------------- ㉓ Hostel ----------------------------------
export interface HostelData {
  dorms: { id: string; name: string; kind: string; capacity: number; occupied: number; dorm_parent_name: string | null }[];
  boarders: number;
  exeat: { id: string; learner: string; dorm: string | null; reason: string; state: string; guardian_consent: boolean }[];
  last_rollcall: { night: string; present: number; total: number }[];
}
export async function getHostel() {
  return read<HostelData | { error: string }>("/web/admin/hostel", { error: "unavailable" });
}
export async function upsertDormAction(input: { name: string; kind: string; capacity: number }) {
  return mutate("/web/admin/hostel/dorm", input);
}
export async function allocateDormAction(input: { dormId: string; learnerId: string; bedLabel?: string | null }) {
  return mutate("/web/admin/hostel/allocate", input);
}
export async function requestExeatAction(input: { learnerId: string; reason: string }) {
  return mutate("/web/admin/hostel/exeat/request", input);
}
export async function decideExeatAction(input: { id: string; decision: "approved" | "denied"; out?: boolean; returned?: boolean }) {
  return mutate("/web/admin/hostel/exeat/decide", input);
}
export async function rollcallDormAction(input: { dormId: string; present: string[]; absent: string[] }) {
  return mutate("/web/admin/hostel/rollcall", input);
}

// ------------------------------- Infirmary -----------------------------------
export interface InfirmaryData {
  canOpen: boolean;
  stats: { records_ct: number; visits_30d: number; open_allergies: number };
  records: { id: string; learner: string; kind: string; detail: string; parent_declared: boolean }[];
  visits: { id: string; learner: string; visited_on: string; complaint: string; action: string | null; outcome: string | null; parent_notified: boolean; medication: string | null }[];
}
export async function getInfirmary() {
  return read<InfirmaryData | { error: string }>("/web/admin/infirmary", { error: "unavailable" });
}
export async function addHealthRecordAction(input: { learnerId: string; kind: string; detail: string; parentDeclared: boolean }) {
  return mutate("/web/admin/infirmary/record", input);
}
export async function logClinicVisitAction(input: {
  learnerId: string; complaint: string; action?: string | null; outcome?: string | null;
  medication?: string | null; kitItemId?: string | null; parentNotified: boolean;
}) {
  return mutate("/web/admin/infirmary/visit", input);
}

// ------------------------------- ⑳ Transport ---------------------------------
export interface TransportData {
  routes: { id: string; name: string; fee_term_cents: string; learners: number; points: number; active: boolean }[];
  buses: { id: string; reg_no: string; capacity: number; route_name: string | null }[];
  trips: { id: string; direction: string; ran_on: string; done: boolean; route_name: string; reg_no: string }[];
}
export async function getTransport() {
  return read<TransportData | { error: string }>("/web/admin/transport", { error: "unavailable" });
}
export async function upsertRouteAction(input: { id?: string; name: string; feeTermCents: number }) {
  return mutate("/web/admin/transport/route", input);
}
export async function upsertBusAction(input: { id?: string; regNo: string; capacity: number; routeId?: string | null }) {
  return mutate("/web/admin/transport/bus", input);
}
export async function addStopAction(input: { routeId: string; name: string; pickupAt?: string | null; sort?: number }) {
  return mutate("/web/admin/transport/stop", input);
}
export async function runTripAction(input: { busId: string; routeId: string; direction: "am" | "pm"; done?: boolean }) {
  return mutate("/web/admin/transport/trip", input);
}

// --------------------------- ㉑ Library + ㉒ Store -----------------------------
export interface LibraryData {
  titles: number; copies: number; on_shelf: number;
  overdue: { copy_barcode: string; title: string; learner: string; due_on: string }[];
  most_borrowed: { title: string; loans: number }[];
}
export async function getLibrary() {
  return read<LibraryData | { error: string }>("/web/admin/library", { error: "unavailable" });
}
export async function addLibraryTitleAction(input: { title: string; author?: string | null; isbn?: string | null; copies: number }) {
  return mutate("/web/admin/library/title", input);
}
export async function issueCopyAction(input: { barcode: string; learnerId: string; days: number }) {
  return mutate("/web/admin/library/issue", input);
}
export async function returnCopyAction(input: { barcode: string }) {
  return mutate("/web/admin/library/return", input);
}
export interface StoreData {
  items: { id: string; name: string; category: string; qty_on_hand: number; low_stock_threshold: number; unit_price: string; low: boolean; section_name: string | null }[];
  low_count: number;
  stock_value_cents: string;
}
export async function getStore() {
  return read<StoreData | { error: string }>("/web/admin/store", { error: "unavailable" });
}
export async function adjustStockAction(input: { itemId: string; delta: number; note?: string | null }) {
  return mutate("/web/admin/store/adjust", input);
}

// ------------------------------ ㊶ Board & BOM --------------------------------
export interface BoardData {
  members: { id: string; full_name: string; office: string; term_end: string | null; phone: string | null; active: boolean }[];
  meetings: { id: string; title: string; held_on: string; agenda: string | null; minutes: string | null;
              items: { id: string; decision: string; action: string | null; owner: string | null; due_on: string | null; status: string }[] }[];
}
export async function getBoard() {
  return read<BoardData | { error: string }>("/web/admin/board", { error: "unavailable" });
}
export async function addBoardMemberAction(input: { fullName: string; office: string; phone?: string | null; termEnd?: string | null }) {
  return mutate("/web/admin/board/member", input);
}
export async function recordMeetingAction(input: {
  title: string; heldOn: string; agenda?: string | null; minutes?: string | null;
  decisions: { decision: string; action?: string | null; owner?: string | null; dueOn?: string | null }[];
}) {
  return mutate("/web/admin/board/meeting", input);
}

// ------------------------------ Feature flags ---------------------------------
export interface FeatureFlagRow { key: string; label: string; enabled: boolean; group_key: string }
export async function getFlags() {
  return read<{ rows: FeatureFlagRow[] } | { error: string }>("/web/admin/flags", { error: "unavailable" });
}
export async function setFlagAction(input: { key: string; enabled: boolean }) {
  return mutate("/web/admin/flags/set", input);
}

// ------------------------- 6 HR & LEAVE + 19 TIMETABLE ----------------------

export interface LeaveRow {
  id: string; staff_id: string; staff_name: string; staff_role: string;
  kind: string; state: string; starts_on: string; ends_on: string; days: number;
  reason: string; decision_reason: string;
}
export interface HrData {
  onLeaveToday: LeaveRow[];
  pending: LeaveRow[];
  recent: LeaveRow[];
  balances: { staff_id: string; staff_name: string; role: string; kind: string; taken: number; entitlement: number }[];
  rules: { kind: string; days: number; note: string | null }[];
}
export async function getHrOverview() {
  return read<HrData | { error: string }>("/web/admin/hr", { error: "unavailable" });
}
export async function raiseLeaveAction(input: { staffId?: string; kind: string; startsOn: string; endsOn: string; reason: string }) {
  return mutate("/web/admin/hr/leave/raise", input);
}
export async function decideLeaveAction(input: { id: string; approve: boolean; reason: string }) {
  return mutate("/web/admin/hr/leave/decide", input);
}
export interface SlotRow {
  id: string; class_id: number; class_name: string; class_code: string;
  day_of_week: number; period: number; starts_at: string | null; ends_at: string | null;
  area_code: string | null; area_name: string | null;
  teacher_id: string | null; teacher_name: string | null; room: string | null; active: boolean;
}
export interface TimetableData {
  slots: SlotRow[];
  classes: { id: number; code: string; name: string }[];
  teachers: { id: string; name: string }[];
}
export async function getTimetable() {
  return read<TimetableData | { error: string }>("/web/admin/timetable", { error: "unavailable" });
}
export async function upsertSlotAction(input: {
  id?: string; classId: number; dayOfWeek: number; period: number;
  startsAt?: string | null; endsAt?: string | null;
  areaCode?: string | null; areaName?: string | null;
  teacherId?: string | null; room?: string | null;
}) {
  return mutate("/web/admin/timetable/slot", input);
}
export async function clearSlotAction(input: { id: string }) {
  return mutate("/web/admin/timetable/clear", input);
}

// --------------------- 15 PETTY CASH + 33 PURCHASES -------------------------

export interface PettyTxnRow {
  id: string; direction: string; state: string; amount_cents: string;
  cost_center: string; description: string; spent_on: string;
  raised_by: string | null; decision_reason: string;
}
export interface BudgetRow {
  id: string; term_id: number; cost_center: string; budget_cents: string; spent_cents: string;
}
export interface PettyData {
  balanceCents: string;
  pending: PettyTxnRow[];
  recent: PettyTxnRow[];
  budgets: BudgetRow[];
  centers: string[];
}
export async function getPettyOverview() {
  return read<PettyData | { error: string }>("/web/admin/petty", { error: "unavailable" });
}
export async function recordPettyAction(input: { direction: "topup" | "spend"; amountCents: number; costCenter: string; description: string; spentOn?: string }) {
  return mutate("/web/admin/petty/record", input);
}
export async function decidePettyAction(input: { id: string; approve: boolean; reason: string }) {
  return mutate("/web/admin/petty/decide", input);
}
export async function upsertBudgetAction(input: { costCenter: string; budgetCents: number; note?: string }) {
  return mutate("/web/admin/petty/budget", input);
}
export interface SupplierRow {
  id: string; name: string; phone: string | null; email: string | null;
  category: string; active: boolean; notes: string | null;
}
export interface PurchaseRow {
  id: string; ref: string; supplier_id: string | null; supplier_name: string | null;
  title: string; cost_center: string; est_cents: string; state: string;
  requested_by: string | null; decision_reason: string; created_at: string;
}
export interface PurchasesData {
  suppliers: SupplierRow[];
  requests: PurchaseRow[];
  openTotalCents: string;
}
export async function getPurchasesOverview() {
  return read<PurchasesData | { error: string }>("/web/admin/purchases", { error: "unavailable" });
}
export async function upsertSupplierAction(input: { id?: string; name: string; phone?: string | null; email?: string | null; category?: string; notes?: string | null }) {
  return mutate("/web/admin/purchases/supplier", input);
}
export async function toggleSupplierAction(input: { id: string; active: boolean }) {
  return mutate("/web/admin/purchases/supplier-state", input);
}
export async function raisePurchaseAction(input: { title: string; supplierId?: string | null; costCenter?: string; estCents: number; submit?: boolean; note?: string }) {
  return mutate("/web/admin/purchases/raise", input);
}
export async function movePurchaseAction(input: { id: string; action: "submit" | "approve" | "cancel" | "order" | "receive" | "pay"; reason?: string }) {
  return mutate("/web/admin/purchases/move", input);
}

// ------------------------- BREADTH GAPS (flank batches) --------------------

export interface FeeExtrasData {
  ok: boolean; discountPct: number; discountCents: number; billedCents: number;
  avgFeeCents: number; learnersCharged: number; activeRules: number;
}
export async function getFeeExtras() {
  return read<FeeExtrasData | { error: string }>("/web/admin/fees/extras", { error: "unavailable" });
}
export async function setFeeConsentAction(input: { id: number; isOptional: boolean }) {
  return mutate("/web/admin/fees/structure/consent", input);
}
export async function answerLevyAction(input: { structureId: number; learnerId: string; choice: "granted" | "declined" }) {
  return mutate("/web/admin/fees/levy/answer", input);
}

export interface PayrollDashData {
  ok: boolean; month: string; grossDueCents: number; staffPaid: number; runState: string;
  collectedCents: number;
  chart: { month: string; payroll: number; collections: number }[];
  checks: { key: string; label: string; due: string; overdue: boolean }[];
}
export async function getPayrollDashboard() {
  return read<PayrollDashData | { error: string }>("/web/admin/payroll/dashboard", { error: "unavailable" });
}
export async function payrollExportAction(input: { period: string }) {
  return mutate("/web/admin/payroll/export", input);
}

export interface AdmissionsAnalyticsData {
  ok: boolean;
  funnel: { stage: string; n: number }[];
  sources: { source: string; n: number }[];
  trend: { month: string; inquiries: number; enrolled: number }[];
  conversion: number;
}
export async function getAdmissionsAnalytics() {
  return read<AdmissionsAnalyticsData | { error: string }>("/web/admin/admissions/analytics", { error: "unavailable" });
}

export interface ExamEntryRow {
  id: string; learner: string; admission_no: string; curriculum: string;
  exam_name: string; exam_year: number; candidate_no: string | null; status: string;
}
export interface ExamEntriesData { ok: boolean; rows: ExamEntryRow[]; learners: { id: string; label: string }[] }
export async function getExamEntries() {
  return read<ExamEntriesData | { error: string }>("/web/admin/exam-entries", { error: "unavailable" });
}
export async function upsertExamEntryAction(input: {
  id?: string; learnerId: string; curriculum: string; examName: string;
  examYear: number; candidateNo?: string; status: string;
}) {
  return mutate("/web/admin/exam-entries/upsert", input);
}

export async function moveLearnerClassAction(input: { learnerId: string; toClassId: number; kind: string; reason?: string }) {
  return mutate("/web/admin/learners/move-class", input);
}
export interface MoveHistoryData { ok: boolean; rows: { moved_at: string; kind: string; from_name: string | null; to_name: string | null; reason: string | null }[] }
export async function getMoveHistory(learnerId: string) {
  return read<MoveHistoryData | { error: string }>(`/web/admin/learners/moves?learnerId=${learnerId}`, { error: "unavailable" });
}

export async function linkGuardianAction(input: { learnerId: string; guardianId: string; relationship: string }) {
  return mutate("/web/admin/guardians/link", input);
}
export async function unlinkGuardianAction(input: { learnerId: string; guardianId: string }) {
  return mutate("/web/admin/guardians/unlink", input);
}
export async function setGuardianRelationshipAction(input: { learnerId: string; guardianId: string; relationship: string; isPrimary: boolean }) {
  return mutate("/web/admin/guardians/relationship", input);
}

export interface CampaignRow {
  id: string; name: string; channel: string; audience: string; state: string;
  sent_count: number; opt_outs: number; created_at: string; body: string;
}
export interface CampaignsData { ok: boolean; rows: CampaignRow[]; reachAll: number; reachBoarders: number }
export async function getCampaigns() {
  return read<CampaignsData | { error: string }>("/web/admin/campaigns", { error: "unavailable" });
}
export async function createCampaignAction(input: { name: string; channel: string; body: string; audience: string }) {
  return mutate("/web/admin/campaigns/create", input);
}
export async function sendCampaignAction(input: { id: string }) {
  return mutate("/web/admin/campaigns/send", input);
}

export interface MessData {
  ok: boolean; weekStart: string;
  menu: { day: number; meal: string; items: string }[];
  counts: { meal_day: string; meal: string; head_count: number }[];
}
export async function getMessWeek() {
  return read<MessData | { error: string }>("/web/admin/mess", { error: "unavailable" });
}
export async function setMealAction(input: { weekStart: string; day: number; meal: string; items: string }) {
  return mutate("/web/admin/mess/menu", input);
}
export async function takeHeadCountAction(input: { mealDay: string; meal: string; headCount: number; note?: string }) {
  return mutate("/web/admin/mess/headcount", input);
}

export interface VisitorRow {
  id: string; visitor: string; id_no: string | null; phone: string | null;
  visiting: string; purpose: string | null; time_in: string; time_out: string | null; pass_no: string | null;
}
export interface VisitorsData { ok: boolean; rows: VisitorRow[]; onSite: number }
export async function getVisitors() {
  return read<VisitorsData | { error: string }>("/web/admin/visitors", { error: "unavailable" });
}
export async function logVisitorAction(input: { visitor: string; idNo?: string; phone?: string; visiting: string; purpose?: string }) {
  return mutate("/web/admin/visitors/in", input);
}
export async function checkoutVisitorAction(input: { id: string }) {
  return mutate("/web/admin/visitors/out", input);
}

export interface MySectionFullData {
  sections: { id: string; name: string; kind: string; members: number }[];
  register: { learner: string; admission_no: string; class_name: string | null; active: boolean }[];
  kit: { item: string; qty: number; min_qty: number }[];
  events: { title: string; starts_at: string }[];
  money: { col_in: string; col_out: string };
}
export async function getMySectionFull() {
  return read<MySectionFullData | null | { error: string }>("/web/admin/sections/mine-full", { error: "unavailable" });
}

// ------------------------- final flanks (houses, rosters, vault, pocket, alumni, consent, switching, payroll depth, OTP, onboarding) -------------------------

export interface HouseRow { id: string; name: string; colour: string; mascot: string | null; points: number }
export async function listHousesAction() {
  return read<HouseRow[] | { houses: HouseRow[] } | { error: string }>("/web/admin/houses", { error: "unavailable" });
}
export async function awardHousePointsAction(input: { houseId: string; points: number; reason: string; learnerId?: string | null }) {
  return mutate("/web/admin/houses/award", input);
}

export interface CoCurricularData {
  sections: { id: string; name: string; kind: string; members: number; events: number }[];
  fees: { section: string; name: string; amount_cents: number; term_id: number }[];
}
export async function getCoCurricular() {
  return read<CoCurricularData | { error: string }>("/web/admin/cocurricular", { error: "unavailable" });
}
export async function chargeActivityFeeAction(input: { sectionId: string; termId: number; name: string; amountCents: number }) {
  return mutate("/web/admin/cocurricular/fee", input);
}
export async function linkSectionEventAction(input: { eventId: string; sectionId: string }) {
  return mutate("/web/admin/cocurricular/event-link", input);
}

export interface DutyRosterRow { id: string; staff: string; staff_id: string; weekday: number; slot: string; duty: string; place: string | null; active: boolean; tasked_today?: boolean }
export async function emitRosterTasksAction() {
  return mutate("/web/admin/rosters/emit-tasks", {}) as Promise<{ ok: boolean; error?: string; data?: { emitted?: number } }>;
}

export async function getHouseCompetitions() {
  return read<{ rows: HouseCompetitionRow[] } | { error: string }>("/web/admin/houses/competitions", { error: "unavailable" });
}
export interface HouseCompetitionRow { id: string; title: string; house: string; house_id: string; starts_on: string; notes: string | null }
export async function createHouseCompetitionAction(input: { houseId: string; title: string; startsOn: string; notes?: string | null }) {
  return mutate("/web/admin/houses/competitions/create", input);
}

export interface LaundryRow { learner_id: string; learner: string; class_name: string | null; out_items: string; out_at: string | null; bag_ref: string | null }
export async function getLaundryCustody() {
  return read<{ rows: LaundryRow[] } | { error: string }>("/web/admin/laundry", { error: "unavailable" });
}
export async function recordLaundryMoveAction(input: { learnerId: string; direction: "out" | "in"; items?: string | null; bagRef?: string | null }) {
  return mutate("/web/admin/laundry/move", input);
}

export async function getOfflineState() {
  return read<{ pending: number; last_synced_at: string | null } | { error: string }>("/web/admin/offline/state", { error: "unavailable" });
}
export async function flushOutboxAction(input: { clientId: string; op: string; payload: Record<string, unknown> }) {
  return mutate("/web/admin/offline/flush", input) as Promise<{ ok: boolean; error?: string; data?: { state?: string; note?: string } }>;
}

export async function getAiAnomaly() {
  return read<{ flagged: { learner: string; learner_id: string; class_name: string | null; att_pct: number; arrears_cents: string; demerits_14d: number; why: string } | null } | { error: string }>("/web/admin/ai/anomaly", { error: "unavailable" });
}
export async function recordAiAnomalyAction(input: { learnerId: string; subject: string; body: string; params: Record<string, unknown> }) {
  return mutate("/web/admin/ai/anomaly/record", input);
}
export async function draftParentMessageAction(input: { subject: string; intent: string; tone?: string | null }) {
  return mutate("/web/admin/ai/parent-message", input) as Promise<{ ok: boolean; error?: string; data?: { draft?: string } }>;
}
export async function getDutyRoster() {
  return read<{ rows: DutyRosterRow[] } | { error: string }>("/web/admin/rosters", { error: "unavailable" });
}
export async function upsertDutyRosterAction(input: { staffId: string; weekday: number; slot: string; duty: string; place?: string | null }) {
  return mutate("/web/admin/rosters/upsert", input);
}
export async function removeDutyRosterAction(input: { id: string }) {
  return mutate("/web/admin/rosters/remove", input);
}

export interface VaultDoc { id: string; title: string; kind: string; doc_kind: string | null; entity_type: string | null; entity_id: string | null; entity_name: string | null; template_code: string | null; issued_by: string | null; created_at: string }
export async function getVaultDocs() {
  return read<{ docs: VaultDoc[] } | { error: string }>("/web/admin/documents", { error: "unavailable" });
}
export interface DocTemplateRow { code: string; name: string; doc_kind: string; body_md: string; style_json: Record<string, unknown> }
export async function getDocTemplates() {
  return read<{ templates: DocTemplateRow[] } | { error: string }>("/web/admin/documents/templates", { error: "unavailable" });
}
export async function issueDocumentAction(input: { templateCode: string; entityType: string; entityId?: string | null; title?: string | null; placeholders: Record<string, string> }) {
  return mutate("/web/admin/documents/issue", input);
}
export async function upsertDocTemplateAction(input: { code: string; name: string; bodyMd: string; docKind?: string; styleJson?: Record<string, unknown> }) {
  return mutate("/web/admin/documents/templates/upsert", input);
}
export interface DocRender {
  id: string; title: string; doc_kind: string | null; body_md: string | null;
  template_code: string | null; entity_name: string | null; issued_by: string | null; created_at: string;
  style_json: Record<string, unknown> | null;
  school: { name: string; contact_phone: string | null; contact_email: string | null; contact_address: string | null; logo_svg_path: string | null };
}
export async function getDocRender(id: string) {
  return read<DocRender | { error: string }>(`/web/admin/documents/${encodeURIComponent(id)}/render`, { error: "unavailable" });
}

export interface PocketWallet { learner_id: string; learner: string; class_name: string | null; boarding: boolean; balance_cents: string }
export async function getPocketWallets() {
  return read<{ wallets: PocketWallet[] } | { error: string }>("/web/admin/pocket", { error: "unavailable" });
}
export async function recordPocketTxnAction(input: { learnerId: string; direction: "topup" | "spend"; amountCents: number; note?: string | null }) {
  return mutate("/web/admin/pocket/txn", input);
}

export interface AlumniRow { learner_id: string; learner: string; adm: string; graduated_on: string; final_class: string | null; mentor_available: boolean }
export async function getAlumni() {
  return read<{ alumni: AlumniRow[] } | { error: string }>("/web/admin/alumni", { error: "unavailable" });
}
export async function markAlumniAction(input: { learnerId: string; graduatedOn: string; finalClass?: string | null; mentorAvailable?: boolean; notes?: string | null }) {
  return mutate("/web/admin/alumni/mark", input);
}

export interface MediaConsentRow { learner_id: string; learner: string; class_name: string | null; guardian_id: string; guardian: string; phone: string; state: string }
export async function getMediaConsent() {
  return read<{ rows: MediaConsentRow[] } | { error: string }>("/web/admin/media-consent", { error: "unavailable" });
}
export async function setMediaConsentAction(input: { guardianId: string; learnerId?: string | null; choice: "granted" | "declined" | "revoked" }) {
  return mutate("/web/admin/media-consent/set", input);
}

export interface SwitchingImportRow { id: string; provider: string; status: string; rows_total: number; rows_ok: number; imported_count: number | null; created_at: string }
export async function getSwitchingImports() {
  return read<SwitchingImportRow[] | { error: string }>("/web/admin/switching", { error: "unavailable" });
}
export async function createSwitchingImportAction(input: { provider: string; filename?: string | null; rows: Record<string, unknown>[] }) {
  return mutate("/web/admin/switching/create", input);
}
export async function commitSwitchingImportAction(input: { id: string }) {
  return mutate("/web/admin/switching/commit", input);
}

export async function confirmPayslipAction(input: { payslipId: string; note?: string | null }) {
  return mutate("/web/admin/payroll/payslip/confirm", input);
}
export async function reconcilePayrollRunAction(input: { runId: string; note?: string | null }) {
  return mutate("/web/admin/payroll/run/reconcile", input);
}
export interface PayrollVsCollections { month: string; collected_cents: number; payroll_cents: number }[]
export async function getPayrollVsCollections() {
  return read<PayrollVsCollections | { error: string }>("/web/admin/payroll/vs-collections", { error: "unavailable" });
}
export async function applyLeaveProrationAction(input: { period: string }) {
  return mutate("/web/admin/leave/prorate", input);
}

export interface MyPayslip { id: string; period: string; net_cents: number; confirmed_at: string | null }
export async function getMyPayslips() {
  return read<MyPayslip[] | { error: string }>("/web/me/payslips", { error: "unavailable" });
}
export async function confirmMyPayslipAction(input: { payslipId: string }) {
  return mutate("/web/me/payslips/confirm", input);
}

// ------------------------- hardening: passwords, daraja, reports -------------------------

export async function setMyPasswordAction(input: { password: string }) {
  return mutate("/web/me/password", input);
}
export async function setStaffPasswordAction(input: { email: string; password: string }) {
  return mutate("/web/me/password", input);
}

export interface ReportDatasetPayload { dataset: string; columns: string[]; rows: Record<string, unknown>[] }
export async function getReportDataset(dataset: string) {
  return read<ReportDatasetPayload | { error: string }>(`/web/admin/reports/${dataset}`, { error: "unavailable" });
}
