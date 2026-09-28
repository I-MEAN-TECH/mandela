import crypto from "node:crypto";
import { config } from "../config.js";
import { getControlPool, getSchoolPool, withRlsSession, type PoolClient } from "../db/pool.js";
import { verifyPassword, hashPassword } from "./password.js";

/**
 * Web module — every byte the web app renders is queried here, from the
 * per-school databases. Nothing is hardcoded in the frontend: the landing
 * page, navigation labels, role homes, tables, even the logo mark arrive
 * as JSON from these queries (branding lives in school_settings).
 */

// ---------------------------------------------------------------------------
// Tenancy: host subdomain -> school db (dev fallback: WEB_DEFAULT_TENANT)
// ---------------------------------------------------------------------------

/**
 * Resolve the tenant (school database) for a request host.
 * `opts.fallback` (default TRUE for the product paths — single-tenant dev
 * and the WEB_DEFAULT_TENANT convenience) falls back to the configured
 * default tenant. TLS issuance and any caller that must not guess pass
 * `{ fallback: false }` — an unknown host then returns null, never a school.
 */
export async function resolveTenant(
  host: string | undefined,
  opts: { fallback?: boolean } = {},
): Promise<{ dbName: string; slug: string } | null> {
  const control = await getControlPool();
  const allowFallback = opts.fallback ?? true; // dev/no-host convenience stays the default
  if (host) {
    const bare = host.split(":")[0]!.toLowerCase();
    // 1) EXACT host match — enterprise custom domains (portal.stmarys.ac.ke)
    //    and full SaaS subdomains resolve by the whole host first.
    const exact = await control.query<{ db_name: string; slug: string }>(
      `SELECT db_name, slug FROM school WHERE caddy_host = $1 LIMIT 1`,
      [bare],
    );
    if (exact.rowCount) return { dbName: exact.rows[0]!.db_name, slug: exact.rows[0]!.slug };
    // 2) First-label slug — dev hosts (demo.localhost) and short subdomains.
    const sub = bare.split(".")[0]!;
    if (sub && sub !== "www" && sub !== "localhost" && !/^\d+\.\d+\.\d+\.\d+$/.test(sub)) {
      const r = await control.query<{ db_name: string; slug: string }>(
        `SELECT db_name, slug FROM school WHERE slug = $1 LIMIT 1`,
        [sub],
      );
      if (r.rowCount) return { dbName: r.rows[0]!.db_name, slug: r.rows[0]!.slug };
    }
    if (!allowFallback) return null;
  } else if (!allowFallback) {
    return null;
  }
  const fallback = await control.query<{ db_name: string; slug: string }>(
    `SELECT db_name, slug FROM school WHERE slug = $1 LIMIT 1`,
    [config.WEB_DEFAULT_TENANT],
  );
  return fallback.rowCount ? { dbName: fallback.rows[0]!.db_name, slug: fallback.rows[0]!.slug } : null;
}

// ---------------------------------------------------------------------------
// Sessions: stateless HMAC tokens (better-auth replaces this in v2)
// token = base64url(principal json).base64url(hmac-sha256(principal))
// ---------------------------------------------------------------------------

export type Principal =
  | { kind: "staff"; userId: string; role: string }
  | { kind: "guardian"; guardianId: string };

function b64url(s: Buffer | string): string {
  return Buffer.from(s).toString("base64url");
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", config.WEB_SESSION_SECRET).update(payload).digest("base64url");
}

export function issueToken(principal: Principal): string {
  const payload = b64url(JSON.stringify(principal));
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined | null): Principal | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Principal;
    if (parsed.kind === "staff" && parsed.userId && parsed.role) return parsed;
    if (parsed.kind === "guardian" && parsed.guardianId) return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * Run a query block with the RLS session GUCs set, always releasing the
 * client (even on error) so the per-school pool never leaks.
 * (Shared with rolePulse.ts — Phase 5 role dashboards use the same seam.)
 */
export async function withSession<T>(
  dbName: string,
  session: { userId: string; role: string; guardianId?: string },
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const db = getSchoolPool(dbName);
  // Acquire with a deadline: a leaked or nested acquire (see POOL LAW on
  // latestStaffNotice) must fail loudly in seconds, not wedge the school's
  // whole pool forever. A lost race releases the client when it arrives.
  let lost = false;
  const pending = db.connect().then((c) => {
    if (lost) c.release();
    return c;
  });
  const client = await Promise.race([
    pending,
    new Promise<never>((_, rej) => {
      const t = setTimeout(
        () => rej(new Error(`school pool exhausted for ${dbName}: no client released within 10s (nested acquire or leaked client)`)),
        10_000,
      );
      t.unref?.();
    }),
  ]).catch((err) => {
    lost = true;
    throw err;
  });
  try {
    return await withRlsSession(client, session, fn);
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Bootstrap: branding + nav for a tenant (powers the whole shell)
// ---------------------------------------------------------------------------

export interface Bootstrap {
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
  modules: { title: string; body: string }[];
  nav: Record<string, string[]>;
  prime_questions: Record<string, string>;
  /** Per-school color overrides (school_settings.theme_json) — {} = product default. */
  theme: Record<string, string>;
}

/**
 * Role-default sidebars (the calm-IA law: every role lands with a coherent
 * set of modules). perm_matrix 'sees' grants are MERGED on top — the admin
 * can only ADD modules to a role's sidebar from Settings, never break the
 * defaults, because the defaults are the product floor.
 */
const DEFAULT_NAV: Record<string, string[]> = {
  admin: ["Today", "Money", "Spend", "People", "Academics", "Operations", "Care", "Insights", "Settings"],
  bursar: ["Today", "Collect", "Reconcile", "Levies", "Reports"],
  driver: ["Today", "Transport"],
  parent: ["Home", "Pay", "Homework", "Messages", "Profile"],
  counter: ["Today", "Visitors", "Inquiries", "Directory"],
  teacher: ["Today", "Mark", "Homework", "Messages", "Class"],
  principal: ["Today", "Operations", "Approve", "Reports", "Broadcast", "Directory", "Academics"],
  dorm_parent: ["Today", "Hostel", "Laundry"],
  janitor: ["Today", "Facilities", "Store"],
  librarian: ["Today", "Library", "Directory"],
  patron: ["Today", "Sections", "Houses", "Events"],
  hod: ["Today", "Academics", "Exams", "People", "Insights"],
};

/** perm_matrix module_key → the sidebar tab it unlocks (nav labels come from
 * NAV_CHILDREN mapping; a grant adds the tab if the role lacks it). */
const MODULE_TAB: Record<string, string> = {
  today: "Today",
  money: "Money",
  academics: "Academics",
  operations: "Operations",
  people: "People",
  insights: "Insights",
  settings: "Settings",
};

const DEFAULT_PRIME: Record<string, string> = {
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

/**
 * Public branding: no session exists on this path, so as mandela_app the
 * RLS settings_read policy (migration 007) keeps it readable — and all
 * personal tables stay locked.
 */
export async function getBootstrap(dbName: string): Promise<Bootstrap> {
  const db = getSchoolPool(dbName);
  // Nav per role: role defaults merged with perm_matrix 'sees' grants (the
  // admin's Settings → Permissions matrix can only ADD tabs; defaults hold).
  const grants = await db
    .query<{ role: string; module_key: string }>(
      `SELECT role::text AS role, module_key FROM perm_matrix WHERE sees`,
    )
    .catch(() => ({ rows: [] as { role: string; module_key: string }[] }));
  const nav: Record<string, string[]> = {};
  for (const [role, tabs] of Object.entries(DEFAULT_NAV)) {
    const merged = [...tabs];
    for (const g of grants.rows) {
      if (g.role !== role) continue;
      const tab = MODULE_TAB[g.module_key];
      if (tab && !merged.includes(tab)) merged.push(tab);
    }
    nav[role] = merged;
  }
  const s = await db.query<{
    name: string; tagline: string | null; motto: string | null;
    logo_svg_path: string | null; logo_aspect: string;
    contact_phone: string | null; contact_email: string | null; contact_address: string | null;
    quote_text: string | null; quote_author: string | null;
    modules_json: unknown;
    nav_json: unknown;
    theme_json: unknown;
  }>(
    `SELECT name, tagline, motto, logo_svg_path, logo_aspect,
            contact_phone, contact_email, contact_address,
            quote_text, quote_author, modules_json, nav_json,
            COALESCE((SELECT jsonb_object_agg(e.k, e.v #>> '{}')
                      FROM jsonb_each(theme_json) e(k, v)
                      WHERE jsonb_typeof(e.v) = 'string'
                        AND (e.v #>> '{}') ~ '^#[0-9a-fA-F]{6}$'), '{}'::jsonb) AS theme_json
     FROM school_settings WHERE id = 'default'`,
  );
  if (!s.rowCount) throw new Error(`school_settings missing in ${dbName} — run migrations`);
  const row = s.rows[0]!;
  return {
    school: {
      name: row.name,
      tagline: row.tagline,
      motto: row.motto,
      logo_svg_path: row.logo_svg_path,
      logo_aspect: Number(row.logo_aspect) || 1,
      contact_phone: row.contact_phone,
      contact_email: row.contact_email,
      contact_address: row.contact_address,
      quote_text: row.quote_text,
      quote_author: row.quote_author,
    },
    modules: (row.modules_json as { title: string; body: string }[] | null) ?? [],
    nav: Object.keys(nav).length > 0 ? nav : ((row.nav_json as Record<string, string[]> | null) ?? {}),
    prime_questions: DEFAULT_PRIME,
    theme: (row.theme_json as Record<string, string> | null) ?? {},
  };
}

// ---------------------------------------------------------------------------
// Auth: sign-in resolves a staff row by email (guardians: phone OTP later)
// ---------------------------------------------------------------------------

export async function resolveStaffLogin(
  dbName: string,
  email: string,
  password?: string,
): Promise<{ token: string; staff: { id: string; full_name: string; role: string }; needsPassword: boolean } | null> {
  const db = getSchoolPool(dbName);
  // SECURITY DEFINER helper (migration 007/031): this lookup runs BEFORE any
  // session exists, so RLS would hide every staff row from mandela_app.
  // The helper now surfaces login_hash; password verify happens here.
  const r = await db.query<{ id: string; full_name: string; role: string; login_hash: string | null }>(
    `SELECT id, full_name, role, login_hash FROM app_login_staff($1)`,
    [email],
  );
  if (!r.rowCount) return null;
  const staff = r.rows[0]!;
  if (staff.login_hash) {
    // Secured account: password is mandatory and must verify - except on
    // the dev escape, where the demo flow (no password) keeps working so
    // the seeded school stays clickable. Production never takes this branch.
    const devEscape = config.NODE_ENV !== "production" && !password;
    if (!devEscape && (!password || !verifyPassword(password, staff.login_hash))) return null;
  } else if (password) {
    // A password was offered but the account has none set yet: do NOT
    // auto-grant - the desk must set one through /web/me/password first.
    return null;
  }
  // No hash and no password = the legacy dev path (email match only).
  // Production flips this off by seeding every staff a password.
  return {
    token: issueToken({ kind: "staff", userId: staff.id, role: staff.role }),
    staff: { id: staff.id, full_name: staff.full_name, role: staff.role },
    needsPassword: staff.login_hash === null,
  };
}

/** Set a staff member's password (self or by a leader). Audited. */
export async function setStaffPassword(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { email?: string; password: string },
): Promise<{ ok: boolean; error?: string }> {
  const db = getSchoolPool(dbName);
  const target = input.email
    ? await db.query<{ id: string; email: string }>(
        `SELECT id, email FROM staff WHERE email = $1 AND active = true`,
        [input.email],
      )
    : await db.query<{ id: string; email: string }>(
        `SELECT id, email FROM staff WHERE id = $1 AND active = true`,
        [principal.userId],
      );
  if (!target.rowCount) return { ok: false, error: "No active staff with that email." };
  const row = target.rows[0]!;
  const isSelf = row.id === principal.userId;
  const isLeader = principal.role === "admin" || principal.role === "principal";
  if (!isSelf && !isLeader) return { ok: false, error: "Only admin or principal can set another staff member's password." };
  await db.query(`UPDATE staff SET login_hash = $1 WHERE id = $2`, [hashPassword(input.password), row.id]);
  await db.query(
    `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
     VALUES ($1, 'staff', 'staff.password.set', 'staff', $2, jsonb_build_object('email', $3::text, 'self', $4::boolean))`,
    [principal.userId, row.id, row.email, isSelf],
  );
  return { ok: true };
}

// Login throttle: per (ip + email) counter in the school DB. 5 failures in
// a 15-minute window lock the pair out until the window expires.
const THROTTLE_WINDOW_MINUTES = 15;
const THROTTLE_MAX_FAILS = 5;

export async function loginThrottleBlocked(dbName: string, key: string): Promise<boolean> {
  const db = getSchoolPool(dbName);
  const r = await db.query<{ blocked: boolean }>(
    `SELECT fails >= $1 AND window_start > now() - interval '${THROTTLE_WINDOW_MINUTES} minutes' AS blocked
     FROM login_throttle WHERE key = $2`,
    [THROTTLE_MAX_FAILS, key],
  );
  return r.rows[0]?.blocked ?? false;
}

export async function loginThrottleFail(dbName: string, key: string): Promise<void> {
  const db = getSchoolPool(dbName);
  await db.query(
    `INSERT INTO login_throttle (key, fails, window_start)
     VALUES ($1, 1, now())
     ON CONFLICT (key) DO UPDATE SET
       fails = CASE WHEN login_throttle.window_start < now() - interval '${THROTTLE_WINDOW_MINUTES} minutes'
                    THEN 1 ELSE login_throttle.fails + 1 END,
       window_start = now()`,
    [key],
  );
}

export async function loginThrottleReset(dbName: string, key: string): Promise<void> {
  const db = getSchoolPool(dbName);
  await db.query(`DELETE FROM login_throttle WHERE key = $1`, [key]);
}

export interface DarajaC2BResult { ok: boolean; duplicate?: boolean; matched: boolean; reason?: string | null }

export interface ReportDataset { dataset: string; columns: string[]; rows: Record<string, unknown>[] }

/**
 * Report Builder datasets (Phase 3): the data floor the builder slices.
 * Each dataset is a small, honest, column-typed table - money by class,
 * attendance by class x day, conduct by kind x category.
 */
export async function reportData(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  dataset: string,
): Promise<ReportDataset | { error: string }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    if (dataset === "money") {
      const r = await c.query<Record<string, unknown>>(
        `SELECT cl.name AS class,
                COALESCE(SUM(fi.amount) FILTER (WHERE fi.is_optional = false), 0)::bigint AS billed,
                COALESCE((SELECT SUM(p.amount) FROM payments p JOIN learner l2 ON l2.id = p.learner_id
                          WHERE l2.class_id = cl.id AND p.state = 'confirmed'), 0)::bigint AS paid
         FROM class cl
         LEFT JOIN learner l ON l.class_id = cl.id
         LEFT JOIN fee_item fi ON fi.learner_id = l.id
         GROUP BY cl.id, cl.name ORDER BY cl.code`,
      );
      return { dataset, columns: ["class", "billed", "paid"], rows: r.rows };
    }
    if (dataset === "attendance") {
      const r = await c.query<Record<string, unknown>>(
        `SELECT cl.name AS class, a.day::text AS day,
                COUNT(*) FILTER (WHERE a.mark = 'present')::bigint AS present,
                COUNT(*) FILTER (WHERE a.mark = 'absent')::bigint AS absent,
                COUNT(*) FILTER (WHERE a.mark = 'late')::bigint AS late
         FROM attendance a
         JOIN learner l ON l.id = a.learner_id
         JOIN class cl ON cl.id = l.class_id
         WHERE a.day > current_date - interval '30 days'
         GROUP BY cl.id, cl.name, a.day ORDER BY a.day DESC, cl.name LIMIT 500`,
      );
      return { dataset, columns: ["class", "day", "present", "absent", "late"], rows: r.rows };
    }
    if (dataset === "conduct") {
      const r = await c.query<Record<string, unknown>>(
        `SELECT COALESCE(cl.name, '-') AS class, i.kind, i.category,
                COUNT(*)::bigint AS incidents, COALESCE(SUM(i.points), 0)::bigint AS points
         FROM discipline_incident i
         LEFT JOIN class cl ON cl.id = i.class_id
         GROUP BY cl.name, i.kind, i.category ORDER BY COUNT(*) DESC LIMIT 300`,
      );
      return { dataset, columns: ["class", "kind", "category", "incidents", "points"], rows: r.rows };
    }
    return { error: `unknown dataset '${dataset}' - try money | attendance | conduct` };
  });
}

/**
 * Daraja C2B callback (hardening slice): validate, dedupe by transID via
 * mpesa_txn's UNIQUE checkout_request_id, then land ONE rails_match
 * suggestion the bursar confirms. Never auto-writes a payment (manual-first).
 */
export async function darajaC2BCallback(
  dbName: string,
  input: {
    transID: string; transTime: string; transAmount: string;
    businessShortCode: string; billRefNumber: string;
    msisdn: string; firstName: string; middleName?: string; lastName?: string;
  },
): Promise<DarajaC2BResult> {
  const db = getSchoolPool(dbName);
  const paidOn = `${input.transTime.slice(0, 4)}-${input.transTime.slice(4, 6)}-${input.transTime.slice(6, 8)}`;
  const amount = Math.round(Number(input.transAmount) * 100);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, matched: false, reason: "bad amount" };

  // Dedupe: the UNIQUE checkout_request_id makes a replay a no-op.
  const txn = await db.query<{ id: string }>(
    `INSERT INTO mpesa_txn (checkout_request_id, guardian_phone, amount, state, raw_callback)
     VALUES ($1, $2, $3, 'pending', $4::jsonb)
     ON CONFLICT (checkout_request_id) DO NOTHING
     RETURNING id`,
    [input.transID, input.msisdn, amount, JSON.stringify(input)],
  );
  if (!txn.rowCount) return { ok: true, duplicate: true, matched: false };
  const txnId = txn.rows[0]!.id;

  const learners = await db.query<{ id: string; name: string; admission_no: string }>(
    `SELECT id::text, TRIM(CONCAT_WS(' ', first_name, middle_name, last_name)) AS name, admission_no
     FROM learner WHERE status = 'active'`,
  );
  const payerName = [input.firstName, input.middleName, input.lastName].filter(Boolean).join(" ");
  const match = matchLearnerForRails(input.billRefNumber, payerName, learners.rows);
  await db.query(
    `INSERT INTO rails_match (source, mpesa_txn_id, payer_name, payer_ref, amount_cents, paid_on,
                              suggested_learner_id, match_score, match_reason)
     VALUES ('daraja-c2b', $1, $2, $3, $4, $5, $6, $7, $8)`,
    [txnId, payerName || null, input.billRefNumber, amount, paidOn, match.learnerId, match.score, match.reason],
  );
  return { ok: true, matched: match.learnerId !== null, reason: match.reason };
}

export async function resolveGuardianLogin(dbName: string, phone: string): Promise<{ token: string; guardian: { id: string; full_name: string } } | null> {
  const db = getSchoolPool(dbName);
  // SECURITY DEFINER helper (migration 007) — same pre-session reasoning.
  const r = await db.query<{ id: string; full_name: string }>(
    `SELECT id, full_name FROM app_login_guardian($1)`,
    [phone],
  );
  if (!r.rowCount) return null;
  const g = r.rows[0]!;
  return { token: issueToken({ kind: "guardian", guardianId: g.id }), guardian: g };
}

// ---------------------------------------------------------------------------
// Role dashboards — one query per role, all numbers from the database
// ---------------------------------------------------------------------------

export interface GuardianHome {
  learners: { id: string; name: string; class: string | null }[];
  due_cents: Record<string, string>;
  paid_this_term_cents: Record<string, string>;
  homework_due: { learner: string; subject: string; title: string; due_on: string }[];
  announcements: { title: string; body: string; created_at: string }[];
  next_due?: { learner: string; item: string; amount_cents: string };
}

export async function guardianHome(dbName: string, guardianId: string): Promise<GuardianHome> {
  const out: GuardianHome = { learners: [], due_cents: {}, paid_this_term_cents: {}, homework_due: [], announcements: [] };

  await withSession(dbName, { userId: guardianId, role: "guardian", guardianId }, async (c) => {
    const learners = await c.query<{ id: string; name: string; class: string | null }>(
      `SELECT l.id, l.first_name || ' ' || l.last_name AS name, cl.name AS class
       FROM learner l LEFT JOIN class cl ON cl.id = l.class_id ORDER BY l.first_name`,
    );
    out.learners = learners.rows;
    const ids = learners.rows.map((l) => l.id);

    const due = await c.query<{ learner_id: string; due: string }>(
      `SELECT fi.learner_id, SUM(fi.amount)::text AS due
       FROM fee_item fi LEFT JOIN consent cs ON cs.id = fi.consent_id
       WHERE fi.is_optional = false OR cs.choice = 'granted'
       GROUP BY fi.learner_id`,
    );
    for (const row of due.rows) out.due_cents[row.learner_id] = row.due;

    if (ids.length) {
      const paid = await c.query<{ learner_id: string; paid: string }>(
        `SELECT learner_id, SUM(amount)::text AS paid FROM payments
         WHERE state = 'confirmed' AND learner_id = ANY($1::uuid[]) GROUP BY learner_id`,
        [ids],
      );
      for (const row of paid.rows) out.paid_this_term_cents[row.learner_id] = row.paid;

      const hw = await c.query<{ learner: string; subject: string; title: string; due_on: string }>(
        `SELECT l.first_name || ' ' || l.last_name AS learner, h.subject, h.title, h.due_on::text
         FROM homework h
         JOIN learner l ON l.class_id = h.class_id
         WHERE l.id = ANY($1::uuid[]) AND h.due_on >= CURRENT_DATE
         ORDER BY h.due_on LIMIT 5`,
        [ids],
      );
      out.homework_due = hw.rows;

      const next = await c.query<{ learner: string; item: string; amount_cents: string }>(
        `SELECT l.first_name || ' ' || l.last_name AS learner, fi.name AS item, fi.amount::text AS amount_cents
         FROM fee_item fi JOIN learner l ON l.id = fi.learner_id
         LEFT JOIN consent cs ON cs.id = fi.consent_id
         WHERE l.id = ANY($1::uuid[]) AND (fi.is_optional = false OR cs.choice = 'granted')
         ORDER BY fi.created_at DESC LIMIT 1`,
        [ids],
      );
      if (next.rowCount) out.next_due = next.rows[0];
    }

    const ann = await c.query<{ title: string; body: string; created_at: string }>(
      `SELECT title, body, created_at::text FROM announcement ORDER BY created_at DESC LIMIT 3`,
    );
    out.announcements = ann.rows;
  });

  return out;
}

export interface StaffHome {
  today: { present: number; absent: number; marked: number; expected: number };
  money: { collected_today_cents: string; expected_term_cents: string };
  count: number;
  /** term collections (bento anchor card) */
  collected_term_cents: string;
  /** attendance rate per day, last 7 days (bento mini chart) */
  last7: { day: string; present: string; total: string }[];
}

export async function staffHome(dbName: string, principal: Extract<Principal, { kind: "staff" }>): Promise<StaffHome> {
  const out: StaffHome = {
    today: { present: 0, absent: 0, marked: 0, expected: 0 },
    money: { collected_today_cents: "0", expected_term_cents: "0" },
    count: 0,
    collected_term_cents: "0",
    last7: [],
  };

  await withSession(dbName, { userId: principal.userId, role: principal.role }, async (c: PoolClient) => {
    const attendance = await c.query<{ present: string; absent: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE a.mark = 'present')::text AS present,
         COUNT(*) FILTER (WHERE a.mark = 'absent')::text AS absent
       FROM attendance a WHERE a.day = CURRENT_DATE`,
    );
    const expected = await c.query<{ expected: string }>(
      `SELECT COUNT(*)::text AS expected FROM learner WHERE status = 'active'`,
    );
    const collected = await c.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total FROM payments
       WHERE state = 'confirmed' AND paid_at::date = CURRENT_DATE`,
    );
    const expectedTerm = await c.query<{ total: string }>(
      `SELECT COALESCE(SUM(fi.amount), 0)::text AS total
       FROM fee_item fi WHERE fi.is_optional = false`,
    );
    const learners = await c.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM learner WHERE status = 'active'`,
    );
    out.today = {
      present: Number(attendance.rows[0]!.present),
      absent: Number(attendance.rows[0]!.absent),
      marked: Number(attendance.rows[0]!.present) + Number(attendance.rows[0]!.absent),
      expected: Number(expected.rows[0]!.expected),
    };
    out.money = {
      collected_today_cents: collected.rows[0]!.total,
      expected_term_cents: expectedTerm.rows[0]!.total,
    };
    out.count = Number(learners.rows[0]!.count);

    const term = await c.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total FROM payments WHERE state = 'confirmed'`,
    );
    out.collected_term_cents = term.rows[0]!.total;

    const last7 = await c.query<{ day: string; present: string; total: string }>(
      `SELECT to_char(d.day, 'Dy') AS day,
              COUNT(a.id) FILTER (WHERE a.mark = 'present')::text AS present,
              COUNT(a.id)::text AS total
       FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS d(day)
       LEFT JOIN attendance a ON a.day = d.day
       GROUP BY d.day ORDER BY d.day`,
    );
    out.last7 = last7.rows;
  });

  return out;
}

// ---------------------------------------------------------------------------
// Public pulse — the landing page's live "Today at school" card.
// Aggregates via the SECURITY DEFINER public_pulse() (migration 007): no
// personal rows, and no session GUCs exist on the public path on purpose.
// ---------------------------------------------------------------------------

export interface PublicPulse {
  present: number;
  expected: number;
  rate: number | null;
  collected_today_cents: string;
  active_learners: number;
}

export async function publicPulse(dbName: string): Promise<PublicPulse> {
  const db = getSchoolPool(dbName);
  const r = await db.query<{ present: string; expected: string; paid_today: string }>(
    `SELECT present::text, expected::text, paid_today::text FROM public_pulse()`,
  );
  const present = Number(r.rows[0]!.present);
  const expected = Number(r.rows[0]!.expected);
  return {
    present,
    expected,
    rate: expected > 0 ? Math.round((present / expected) * 1000) / 10 : null,
    collected_today_cents: r.rows[0]!.paid_today,
    active_learners: expected,
  };
}

// ---------------------------------------------------------------------------
// People: learners directory (staff) + class roster (teacher)
// ---------------------------------------------------------------------------

export async function listLearners(dbName: string, principal: Extract<Principal, { kind: "staff" }>, opts: { classId?: number; limit?: number } = {}) {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{
      id: string; admission_no: string; name: string; class: string | null; status: string; gender: string | null;
    }>(
      `SELECT l.id, l.admission_no,
              l.first_name || ' ' || COALESCE(l.middle_name || ' ', '') || l.last_name AS name,
              cl.name AS class, l.status::text, l.gender
       FROM learner l LEFT JOIN class cl ON cl.id = l.class_id
       WHERE ($1::int IS NULL OR l.class_id = $1::int)
       ORDER BY l.admission_no LIMIT $2`,
      [opts.classId ?? null, opts.limit ?? 200],
    );
    return r.rows;
  });
}

export async function listClasses(dbName: string, principal: Extract<Principal, { kind: "staff" }>) {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ id: number; code: string; name: string; learners: string }>(
      `SELECT cl.id, cl.code, cl.name,
              (SELECT COUNT(*)::text FROM learner l WHERE l.class_id = cl.id AND l.status = 'active') AS learners
       FROM class cl ORDER BY cl.code`,
    );
    return r.rows;
  });
}

// ---------------------------------------------------------------------------
// Classroom: attendance marking (teacher write path)
// ---------------------------------------------------------------------------

export async function rosterForToday(dbName: string, principal: Extract<Principal, { kind: "staff" }>, classId: number) {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ id: string; name: string; admission_no: string; mark: string | null }>(
      `SELECT l.id, l.first_name || ' ' || l.last_name AS name, l.admission_no, a.mark::text
       FROM learner l
       LEFT JOIN attendance a ON a.learner_id = l.id AND a.day = CURRENT_DATE
       WHERE l.class_id = $1 AND l.status = 'active'
       ORDER BY l.first_name`,
      [classId],
    );
    return r.rows;
  });
}

export async function markAttendance(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  marks: { learnerId: string; mark: string }[],
): Promise<number> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    let n = 0;
    for (const m of marks) {
      await c.query(
        // uq_att_learner_day (migration 007) is the arbiter: re-marking a
        // learner the same day UPDATES the mark instead of inserting a
        // second row (the old (learner_id, day, id) arbiter double-counted).
        `INSERT INTO attendance (learner_id, day, mark, marked_by)
         VALUES ($1, CURRENT_DATE, $2, $3)
         ON CONFLICT (learner_id, day) DO UPDATE
         SET mark = EXCLUDED.mark,
             marked_by = EXCLUDED.marked_by,
             synced_at = now(),
             client_id = NULL`,
        [m.learnerId, m.mark, principal.userId],
      );
      n++;
    }
    return n;
  });
}

export async function listHomework(dbName: string, principal: Extract<Principal, { kind: "staff" }>, opts: { classId?: number } = {}) {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ id: string; subject: string; title: string; body: string; due_on: string | null; class: string }>(
      `SELECT h.id, h.subject, h.title, h.body, h.due_on::text, cl.name AS class
       FROM homework h JOIN class cl ON cl.id = h.class_id
       WHERE ($1::int IS NULL OR h.class_id = $1::int)
       ORDER BY h.created_at DESC LIMIT 50`,
      [opts.classId ?? null],
    );
    return r.rows;
  });
}

export async function createHomework(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { classId: number; subject: string; title: string; body: string; dueOn?: string },
) {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO homework (class_id, subject, title, body, due_on, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [input.classId, input.subject, input.title, input.body, input.dueOn ?? null, principal.userId],
    );
    // Security sweep (2026-09-27): this write had no audit twin — every
    // record-changing write lands in the trail ("the record keeps itself").
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'homework.create', 'homework', $2, $3)`,
      [principal.userId, r.rows[0]!.id, JSON.stringify({ class_id: input.classId, subject: input.subject, title: input.title })],
    );
    return r.rows[0]!.id;
  });
}

// ---------------------------------------------------------------------------
// Classroom: CBC/CBE assessment capture (schema-driven, any curriculum)
// ---------------------------------------------------------------------------

export interface LearningAreaRow { code: string; name: string }

/**
 * Learning areas for a class, read from the class's curriculum ladder
 * (migration 008). Falls back to CBE Grade 7 areas when the class predates
 * ladder attachment. One row per level, so strands nest later via parent_id.
 */
export async function classLearningAreas(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  classId: number,
): Promise<LearningAreaRow[]> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<LearningAreaRow>(
      `SELECT a.code, a.name
       FROM learning_area a
       JOIN class cl ON cl.level_id = a.level_id
       WHERE cl.id = $1
       ORDER BY a.code`,
      [classId],
    );
    if (r.rowCount) return r.rows;
    // graceful fallback: areas of the class's named level under CBE
    const r2 = await c.query<LearningAreaRow>(
      `SELECT a.code, a.name
       FROM learning_area a
       JOIN curriculum_level lv ON lv.id = a.level_id
       JOIN curriculum cu ON cu.id = lv.curriculum_id
       JOIN class cl ON cl.level IS NOT NULL AND lv.label = cl.level
       WHERE cl.id = $1 AND cu.code = 'cbe'
       ORDER BY a.code`,
      [classId],
    );
    return r2.rows;
  });
}

export interface AssessmentEntry {
  learnerId: string;
  areaCode: string;
  level: string; // scheme key: BE | AE | ME | EE (or marks for 8-4-4/IGCSE)
}

/**
 * Record assessment entries. Reads the class's assessment scheme from the
 * DB (assessment_scheme via curriculum) and validates every level against
 * it — no hardcoded grade letters anywhere. Upsert by natural key
 * (migration 013): re-recording UPDATES, never duplicates. Every entry is
 * audit-logged (grade data is money-adjacent: it must be provable).
 */
export async function recordAssessment(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { classId: number; entries: AssessmentEntry[] },
) {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    // resolve current term (same convention as levies)
    const term = await c.query<{ id: number }>(
      `SELECT id FROM term ORDER BY starts_on DESC LIMIT 1`,
    );
    if (!term.rowCount) return { ok: false as const, error: "No term is set up yet" };
    const termId = term.rows[0]!.id;

    // the class's scheme: prefer the curriculum scheme, fall back to cbc-sba
    const scheme = await c.query<{ code: string; scale: { k: string }[] }>(
      `SELECT s.code, s.scale
       FROM assessment_scheme s
       JOIN curriculum cu ON cu.id = s.curriculum_id
       JOIN curriculum_level lv ON lv.curriculum_id = cu.id
       JOIN class cl ON cl.level_id = lv.id
       WHERE cl.id = $1
       ORDER BY (cu.code = 'cbe') DESC, s.code
       LIMIT 1`,
      [input.classId],
    );
    const validKeys = new Set<string>(
      scheme.rowCount
        ? (scheme.rows[0]!.scale as { k: string }[]).map((x) => x.k)
        : ["BE", "AE", "ME", "EE"],
    );

    // verify the teacher only records learners in classes they can see (RLS
    // enforces this at SELECT; we re-check for a clean error)
    const allowed = await c.query<{ id: string }>(
      `SELECT l.id FROM learner l WHERE l.id = ANY($1::uuid[])`,
      [input.entries.map((e) => e.learnerId)],
    );
    const allowedIds = new Set(allowed.rows.map((x) => x.id));

    let saved = 0;
    const errors: string[] = [];
    for (const e of input.entries) {
      if (!allowedIds.has(e.learnerId)) {
        errors.push("a learner is outside your classes");
        continue;
      }
      if (!validKeys.has(e.level)) {
        errors.push(`level ${e.level} is not in this class's grading scale`);
        continue;
      }
      await c.query(
        `INSERT INTO assessment (learner_id, term_id, subject, exam_type, score, level, recorded_by)
         VALUES ($1, $2, $3, 'cat', NULL, $4, $5)
         ON CONFLICT (learner_id, term_id, subject, strand, exam_type)
         DO UPDATE SET level = EXCLUDED.level, recorded_by = EXCLUDED.recorded_by, created_at = now()`,
        [e.learnerId, termId, e.areaCode, e.level, principal.userId],
      );
      saved++;
    }
    if (saved > 0) {
      await c.query(
        `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
         VALUES ($1, 'staff', 'assessment.record', 'assessment', $2, $3)`,
        [principal.userId, input.classId.toString(), JSON.stringify({ saved, scheme: scheme.rowCount ? scheme.rows[0]!.code : "cbc-sba" })],
      );
    }
    if (errors.length > 0) return { ok: false as const, error: errors[0]!, saved };
    return { ok: true as const, saved };
  });
}

export interface AssessmentRow {
  learner_id: string; subject: string; level: string | null;
}

/** Existing entries for a class this term (to prefill the capture grid). */
export async function listAssessments(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  classId: number,
) {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<AssessmentRow>(
      `SELECT a.learner_id::text, a.subject, a.level
       FROM assessment a
       WHERE a.term_id = (SELECT id FROM term ORDER BY starts_on DESC LIMIT 1)
         AND a.learner_id IN (SELECT id FROM learner WHERE class_id = $1)`,
      [classId],
    );
    return r.rows;
  });
}

// ---------------------------------------------------------------------------
// Money: collections, balances, ledger (bursar/principal)
// ---------------------------------------------------------------------------

/**
 * POOL LAW: the inner runs on the CALLER's client. The exported wrapper keeps
 * its own session for standalone controller endpoints — but must never be
 * awaited while another session of the same pool is open (nested acquire
 * deadlocks the school pool at capacity — perf-gate postmortem 2026-09-27).
 */
async function collectionByClassInner(c: PoolClient) {
  const r = await c.query<{ class: string; billed_cents: string; paid_cents: string }>(
    `SELECT cl.name AS class,
            COALESCE(SUM(fi.amount) FILTER (WHERE fi.is_optional = false), 0)::text AS billed_cents,
            COALESCE((SELECT SUM(p.amount) FROM payments p JOIN learner l2 ON l2.id = p.learner_id
                      WHERE l2.class_id = cl.id AND p.state = 'confirmed'), 0)::text AS paid_cents
     FROM class cl
     LEFT JOIN learner l ON l.class_id = cl.id
     LEFT JOIN fee_item fi ON fi.learner_id = l.id
     GROUP BY cl.id, cl.name ORDER BY cl.code`,
  );
  return r.rows;
}

export async function collectionByClass(dbName: string, principal: Extract<Principal, { kind: "staff" }>) {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, (c) => collectionByClassInner(c));
}

export async function recentPayments(dbName: string, principal: Extract<Principal, { kind: "staff" }>, limit = 20) {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{
      id: string; receipt_no: string; learner: string; learner_id: string; class_name: string | null;
      amount_cents: string; method: string; state: string; reference: string | null;
      details: Record<string, string> | null; paid_at: string;
    }>(
      `SELECT p.id::text, p.receipt_no,
              l.first_name || ' ' || l.last_name AS learner, l.id::text AS learner_id,
              cl.name AS class_name,
              p.amount::text AS amount_cents, p.method::text, p.state::text,
              p.reference, p.details, p.paid_at::text
       FROM payments p
       JOIN learner l ON l.id = p.learner_id
       LEFT JOIN class cl ON cl.id = l.class_id
       ORDER BY p.paid_at DESC LIMIT $1`,
      [limit],
    );
    return r.rows;
  });
}

/** Method-specific payment details — validated once, stored as jsonb. */
export interface PaymentDetails {
  mpesa_code?: string;
  mpesa_phone?: string;
  mpesa_time?: string;
  slip_no?: string;
  bank_name?: string;
  cheque_no?: string;
  cheque_date?: string;
}

function normalizeDetails(method: string, raw?: PaymentDetails | null): { details: PaymentDetails | null; paidAtHint: string | null; error?: string } {
  if (!raw) return { details: null, paidAtHint: null };
  const clean: PaymentDetails = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string" && v.trim()) clean[k as keyof PaymentDetails] = v.trim().slice(0, 80);
  }
  if (method === "mpesa") {
    if (!clean.mpesa_code) return { details: null, paidAtHint: null, error: "M-Pesa payments need the M-Pesa code" };
    const t = clean.mpesa_time ?? null;
    return { details: clean, paidAtHint: t ? t : null };
  }
  if (method === "bank" && !clean.slip_no) return { details: null, paidAtHint: null, error: "Bank payments need the slip number" };
  if (method === "cheque" && !clean.cheque_no) return { details: null, paidAtHint: null, error: "Cheque payments need the cheque number" };
  return { details: clean, paidAtHint: null };
}

export async function recordPayment(
  dbName: string,
  principal: Principal,
  input: { learnerId: string; amountCents: number; method: string; reference?: string; details?: PaymentDetails; paidAt?: string },
) {
  const staff = principal.kind === "staff";
  const session = staff
    ? { userId: principal.userId, role: principal.role }
    : { userId: principal.guardianId, role: "guardian", guardianId: principal.guardianId };
  const norm = normalizeDetails(input.method, input.details ?? null);
  if (norm.error) throw new Error(norm.error);
  return withSession(dbName, session, async (c) => {
    const receipt = `R-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
    // M-Pesa money is recorded at the moment the SMS says it landed; other
    // methods post now(). The receipt and ledger both show that truth.
    const paidAt = input.paidAt ?? norm.paidAtHint ?? null;
    const r = await c.query<{ id: string; receipt_no: string }>(
      `INSERT INTO payments (learner_id, amount, method, state, reference, receipt_no, recorded_by, paid_at, details)
       VALUES ($1, $2, $3, 'confirmed', $4, $5, $6, COALESCE($7::timestamptz, now()), $8)
       RETURNING id, receipt_no`,
      [
        input.learnerId,
        input.amountCents,
        input.method,
        input.reference ?? null,
        receipt,
        staff ? principal.userId : null, // guardians pay too; recorded_by is staff-only
        paidAt,
        norm.details ? JSON.stringify(norm.details) : null,
      ],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, $2, 'payment.record', 'payments', $3, $4)`,
      [staff ? principal.userId : principal.guardianId, staff ? "staff" : "guardian", r.rows[0]!.id, JSON.stringify(input)],
    );
    return r.rows[0]!;
  });
}

/**
 * Edit a recorded payment — method, amount, reference, method details, and
 * the paid-at moment. Provided fields win; omitted fields keep the current
 * value. Money is never silently wrong: every change lands in the audit
 * log with before + after. RLS keeps writes to the money desk.
 */
export async function updatePayment(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  paymentId: string,
  input: { amountCents?: number; method?: string; reference?: string | null; details?: PaymentDetails; paidAt?: string | null },
) {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const cur = await c.query<{
      id: string; amount: string; method: string; reference: string | null; details: PaymentDetails | null; paid_at: string;
    }>(`SELECT id::text, amount::text, method::text, reference, details, paid_at::text FROM payments WHERE id = $1`, [paymentId]);
    if (!cur.rowCount) throw new Error("payment not found");
    const before = cur.rows[0]!;
    const method = input.method ?? before.method;
    const norm = normalizeDetails(method, input.details ?? before.details ?? null);
    if (norm.error) throw new Error(norm.error);
    const r = await c.query<{ id: string; receipt_no: string }>(
      `UPDATE payments SET
         amount = COALESCE($2, amount),
         method = $3,
         reference = COALESCE($4, reference),
         details = COALESCE($5, details),
         paid_at = COALESCE($6::timestamptz, paid_at)
       WHERE id = $1
       RETURNING id::text, receipt_no`,
      [
        paymentId,
        input.amountCents ?? null,
        method,
        input.reference !== undefined ? input.reference : null, // explicit clear allowed
        norm.details ? JSON.stringify(norm.details) : null,
        input.paidAt !== undefined ? input.paidAt : null,
      ],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, before, after)
       VALUES ($1, 'staff', 'payment.update', 'payments', $2, $3, $4)`,
      [principal.userId, paymentId, JSON.stringify(before), JSON.stringify(input)],
    );
    return r.rows[0]!;
  });
}

/** THE receipt payload — one payment, the school letterhead, the learner. */
export async function paymentReceipt(
  dbName: string,
  principal: Principal,
  receiptNo: string,
): Promise<PaymentReceipt | { error: string }> {
  const staff = principal.kind === "staff";
  const session = staff
    ? { userId: principal.userId, role: principal.role }
    : { userId: principal.guardianId, role: "guardian", guardianId: principal.guardianId };
  return withSession(dbName, session, async (c) => {
    const r = await c.query<{
      receipt_no: string; learner: string; admission_no: string | null; class_name: string | null;
      amount: string; method: string; state: string; reference: string | null;
      details: PaymentDetails | null; paid_at: string; recorded_by: string | null;
    }>(
      `SELECT p.receipt_no, l.first_name || ' ' || l.last_name AS learner, l.admission_no,
              cl.name AS class_name, p.amount::text, p.method::text, p.state::text,
              p.reference, p.details, p.paid_at::text, s.full_name AS recorded_by
       FROM payments p
       JOIN learner l ON l.id = p.learner_id
       LEFT JOIN class cl ON cl.id = l.class_id
       LEFT JOIN staff s ON s.id = p.recorded_by
       WHERE p.receipt_no = $1`,
      [receiptNo],
    );
    if (!r.rowCount) return { error: "receipt not found" };
    const school = await c.query<{ name: string; contact_phone: string | null; contact_email: string | null; contact_address: string | null }>(
      `SELECT name, contact_phone, contact_email, contact_address FROM school_settings WHERE id = 'default'`,
    );
    const row = r.rows[0]!;
    return {
      receipt_no: row.receipt_no,
      learner: row.learner,
      admission_no: row.admission_no,
      class_name: row.class_name,
      amount: row.amount,
      method: row.method,
      state: row.state,
      reference: row.reference,
      details: row.details,
      paid_at: row.paid_at,
      recorded_by: row.recorded_by,
      school: school.rows[0] ?? { name: "", contact_phone: null, contact_email: null, contact_address: null },
    };
  });
}

// ---------------------------------------------------------------------------
// Talk: announcements (principal/admin write, everyone read)
// ---------------------------------------------------------------------------

export async function listAnnouncements(dbName: string, principal: Principal, limit = 20) {
  const session = principal.kind === "staff"
    ? { userId: principal.userId, role: principal.role }
    : { userId: principal.guardianId, role: "guardian", guardianId: principal.guardianId };
  return withSession(dbName, session, async (c) => {
    const r = await c.query<{ id: string; title: string; body: string; urgency: string; created_at: string }>(
      `SELECT id, title, body, urgency, created_at::text FROM announcement ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return r.rows;
  });
}

export async function createAnnouncement(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { title: string; body: string; urgency: "alert" | "update"; audience: Record<string, unknown> },
) {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO announcement (title, body, audience, urgency, channel, created_by)
       VALUES ($1, $2, $3::jsonb, $4, 'whatsapp', $5) RETURNING id`,
      [input.title, input.body, JSON.stringify(input.audience), input.urgency, principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'announcement.create', 'announcement', $2, $3)`,
      [principal.userId, r.rows[0]!.id, JSON.stringify({ title: input.title, urgency: input.urgency, audience: input.audience })],
    );
    return r.rows[0]!.id;
  });
}

/**
 * Latest staff-audience announcement (System completion B1) — the "staff
 * notices" signal each role pulse surfaces. Staff broadcasts (audience
 * {staff:true}) are read from the staff-addressed message rows, so a role
 * sees it only after the fanout has run (worker, every 10s).
 */
/**
 * The freshest staff-audience announcement — B1 broadcast banner.
 *
 * POOL LAW (perf-gate postmortem, 2026-09-27): this MUST take the caller's
 * session client. The original signature took a dbName and ran its own
 * pool.query — harmless at dev concurrency, but every role pulse called it
 * as the FIRST statement inside its own open transaction, so 5 concurrent
 * pulses could deadlock the whole school pool (each outer transaction waits
 * for an inner acquire that can only be satisfied by its own COMMIT).
 * Under load that wedged every route in the API. Never acquire a pool client
 * while another client of the same pool is checked out — pass `c` down.
 */
export async function latestStaffNotice(
  c: PoolClient,
): Promise<{ title: string; body: string; urgency: string; created_at: string } | null> {
  const r = await c.query<{ title: string; body: string; urgency: string; created_at: string }>(
    `SELECT a.title, a.body, a.urgency::text AS urgency, a.created_at::text
     FROM announcement a
     WHERE a.audience ->> 'staff' = 'true'
     ORDER BY a.created_at DESC LIMIT 1`,
  );
  return r.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// System completion B2 — school health: activation per staff member (§7.7 #11).
// The admin's answer to "who hasn't started": every active person, their role,
// whether they've been through their start screen (staff.joined, 041), and
// the hats they carry — so adoption gaps are visible, not guessed.
// ---------------------------------------------------------------------------

export interface SchoolHealthData {
  totals: { staff: number; started: number; pending: number };
  by_role: { role: string; total: number; started: number }[];
  started: { staff_id: string; name: string; role: string; duties: number; since: string | null }[];
  pending: { staff_id: string; name: string; role: string; email: string | null; created_at: string | null }[];
}

// ---------------------------------------------------------------------------
// System completion C11 — the Pulse's inline action queue (§7 #2). The two
// leadership roles act without navigating away: the three oldest approvals and
// the three nearest tasks ride the /app payload. Decisions themselves stay in
// their own endpoints (reason law intact) — this list only READS.
// ---------------------------------------------------------------------------

export async function pulseActions(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ approvals: unknown[]; tasks: unknown[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const approvals = await c.query(
      `SELECT a.id::text, a.request_type, r.full_name AS requester, a.payload,
              (CURRENT_DATE - a.created_at::date) AS age_days
         FROM approval_request a JOIN staff r ON r.id = a.requester_id
        WHERE a.state = 'pending'
        ORDER BY a.created_at ASC LIMIT 3`,
    );
    const tasks = await c.query(
      `SELECT t.id::text, t.title, t.due_on::text AS due_on,
              (t.due_on - CURRENT_DATE) AS days_left
         FROM admin_task t
        WHERE t.state = 'open'
        ORDER BY t.due_on ASC NULLS LAST LIMIT 3`,
    );
    return { approvals: approvals.rows, tasks: tasks.rows };
  });
}

export async function schoolHealth(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<SchoolHealthData | { error: string }> {
  if (principal.role !== "admin") return { error: "health page is admin-only" };
  const db = getSchoolPool(dbName);
  const rows = await db.query<{
    staff_id: string; name: string; role: string; email: string | null;
    joined: boolean; duties: string; created_at: string | null;
  }>(
    `SELECT s.id::text AS staff_id, s.full_name AS name, s.role::text AS role, s.email,
            s.joined,
            (SELECT COUNT(*)::text FROM staff_duty d WHERE d.staff_id = s.id AND (d.effective_to IS NULL OR d.effective_to >= CURRENT_DATE)) AS duties,
            s.created_at::text AS created_at
     FROM staff s WHERE s.active
     ORDER BY s.joined ASC, s.role, s.full_name`,
  );
  const people = rows.rows.map((r) => ({ ...r, duties: Number(r.duties) }));
  const startedRows = people.filter((p) => p.joined);
  const pendingRows = people.filter((p) => !p.joined);
  const byRole = new Map<string, { role: string; total: number; started: number }>();
  for (const p of people) {
    const e = byRole.get(p.role) ?? { role: p.role, total: 0, started: 0 };
    e.total += 1;
    if (p.joined) e.started += 1;
    byRole.set(p.role, e);
  }
  return {
    totals: { staff: people.length, started: startedRows.length, pending: pendingRows.length },
    by_role: [...byRole.values()].sort((a, b) => a.role.localeCompare(b.role)),
    started: startedRows.map(({ staff_id, name, role, duties, created_at }) => ({ staff_id, name, role, duties, since: created_at })),
    pending: pendingRows.map(({ staff_id, name, role, email, created_at }) => ({ staff_id, name, role, email, created_at })),
  };
}

// ---------------------------------------------------------------------------
// System completion C10 — the term boundary every money pulse now reads from.
// One helper so bursar/principal/admin cannot drift into all-time sums again.
// ---------------------------------------------------------------------------

export async function currentTermBounds(dbName: string): Promise<{ starts_on: string; ends_on: string } | null> {
  const db = getSchoolPool(dbName);
  const r = await db.query<{ starts_on: string; ends_on: string }>(
    `SELECT starts_on::text, ends_on::text FROM term
     WHERE CURRENT_DATE BETWEEN starts_on AND ends_on LIMIT 1`,
  );
  return r.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// System completion C12 — timetable auto-layout (§7 #4). Greedy placement:
// for each class, walk its curriculum areas (from the curriculum pack the
// class is attached to, else the areas already in use) and drop each area's
// weekly periods into the first free (day, period) slot where the assigned
// (or pickable) teacher is free. Not clever — boring, deterministic, and it
// only fills GAPS: it never moves an existing placed slot.
// ---------------------------------------------------------------------------

export async function autolayoutTimetable(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ ok: true; placed: number; skipped: number }> {
  if (principal.role !== "admin" && principal.role !== "principal") {
    throw new Error("leaders only");
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const classes = await c.query<{ id: number; name: string }>(`SELECT id, name FROM class ORDER BY id`);
    const teachers = await c.query<{ id: string }>(`SELECT id::text FROM staff WHERE active AND role = 'teacher'`);
    const teacherIds = teachers.rows.map((t) => t.id);
    let placed = 0;
    let skipped = 0;

    for (const cl of classes.rows) {
      // Areas this class already teaches (kept from the pack or manual setup).
      const areas = await c.query<{ area_name: string; periods_needed: string }>(
        `SELECT area_name, COUNT(*)::text AS periods_needed
         FROM timetable_slot WHERE class_id = $1 AND area_name IS NOT NULL
         GROUP BY area_name`,
        [cl.id],
      );
      // Occupied (day, period) + busy teacher map.
      const taken = new Set<string>();
      const busy = new Set<string>();
      const existing = await c.query<{ day_of_week: number; period: number; teacher_id: string | null }>(
        `SELECT day_of_week, period, teacher_id::text FROM timetable_slot
         WHERE class_id = $1 AND active AND teacher_id IS NOT NULL`,
        [cl.id],
      );
      const gaps = await c.query<{ id: string; day_of_week: number; period: number; area_name: string | null; teacher_id: string | null }>(
        `SELECT id::text, day_of_week, period, area_name, teacher_id::text
         FROM timetable_slot WHERE class_id = $1 AND active`,
        [cl.id],
      );
      for (const row of existing.rows) {
        taken.add(row.day_of_week + ":" + row.period);
        if (row.teacher_id) busy.add(row.teacher_id + "@" + row.day_of_week + ":" + row.period);
      }
      // A slot row with an area but NO teacher is a gap to fill; a row with
      // neither is an empty grid cell to create into.
      const emptyCells: { day_of_week: number; period: number }[] = [];
      for (let day = 1; day <= 5; day++) {
        for (let period = 1; period <= 8; period++) {
          if (!taken.has(day + ":" + period)) emptyCells.push({ day_of_week: day, period });
        }
      }

      for (const area of areas.rows) {
        const need = Number(area.periods_needed);
        // count rows already carrying this area WITH a teacher
        const filled = gaps.rows.filter((g) => g.area_name === area.area_name && g.teacher_id).length;
        let toPlace = Math.max(0, need - filled);
        // First fill rows that have the area but no teacher.
        for (const g of gaps.rows) {
          if (toPlace === 0) break;
          if (g.area_name === area.area_name && !g.teacher_id) {
            const t = pickFreeTeacher(teacherIds, busy, g.day_of_week, g.period);
            if (t) {
              await c.query(`UPDATE timetable_slot SET teacher_id = $1 WHERE id = $2`, [t, g.id]);
              busy.add(t + "@" + g.day_of_week + ":" + g.period);
              placed++;
              toPlace--;
            }
          }
        }
        // Then create new rows in empty cells.
        for (const cell of emptyCells) {
          if (toPlace === 0) break;
          const key = cell.day_of_week + ":" + cell.period;
          if (taken.has(key)) continue;
          const t = pickFreeTeacher(teacherIds, busy, cell.day_of_week, cell.period);
          if (!t) { skipped++; continue; }
          await c.query(
            `INSERT INTO timetable_slot (class_id, day_of_week, period, area_name, teacher_id, active, created_by)
             VALUES ($1, $2, $3, $4, $5, true, $6)`,
            [cl.id, cell.day_of_week, cell.period, area.area_name, t, principal.userId],
          );
          taken.add(key);
          busy.add(t + "@" + cell.day_of_week + ":" + cell.period);
          placed++;
          toPlace--;
        }
      }
    }
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'timetable.autolayout', 'timetable_slot', $2, $3)`,
      [principal.userId, `class-set:${placed}/${placed + skipped}`, JSON.stringify({ placed, skipped })],
    );
    return { ok: true as const, placed, skipped };
  });
}

function pickFreeTeacher(teacherIds: string[], busy: Set<string>, day: number, period: number): string | null {
  for (const t of teacherIds) {
    if (!busy.has(t + "@" + day + ":" + period)) return t;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Live watchers — tiny payloads polled by LiveRefresh; the hash drives
// router.refresh() so RSC pages update without heavy client state.
// ---------------------------------------------------------------------------

export async function pulseHash(dbName: string): Promise<string> {
  const db = getSchoolPool(dbName);
  const r = await db.query<{
    present: string; expected: string; paid_today: string; paid_count: string; ann: string;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM attendance WHERE day = CURRENT_DATE AND mark = 'present')::text AS present,
       (SELECT COUNT(*) FROM learner WHERE status = 'active')::text AS expected,
       (SELECT COALESCE(SUM(amount),0) FROM payments WHERE state='confirmed' AND paid_at::date = CURRENT_DATE)::text AS paid_today,
       (SELECT COUNT(*) FROM payments WHERE state='confirmed' AND paid_at::date = CURRENT_DATE)::text AS paid_count,
       (SELECT COALESCE(MAX(extract(epoch FROM created_at)),0) FROM announcement)::text AS ann`,
  );
  const row = r.rows[0]!;
  return `${row.present}/${row.expected}/${row.paid_today}/${row.paid_count}/${row.ann}`;
}

export async function guardianHash(dbName: string, guardianId: string): Promise<string> {
  return withSession(dbName, { userId: guardianId, role: "guardian", guardianId }, async (c) => {
    const r = await c.query<{ h: string | null }>(
      `SELECT
         (SELECT COALESCE(SUM(extract(epoch FROM paid_at))::text || ':' || COUNT(*), '0')
            FROM payments WHERE state='confirmed' AND learner_id IN (SELECT learner_id FROM learner_guardian WHERE guardian_id = $1))
         || '/' ||
         (SELECT COALESCE(MAX(extract(epoch FROM created_at))::text, '0') FROM announcement)
         || '/' ||
         (SELECT COALESCE(MAX(extract(epoch FROM due_on))::text || ':' || COUNT(*), '0') FROM homework
            WHERE due_on >= CURRENT_DATE AND class_id IN (SELECT class_id FROM learner WHERE id IN (SELECT learner_id FROM learner_guardian WHERE guardian_id = $1)))
         AS h`,
      [guardianId],
    );
    return r.rows[0]!.h ?? "0";
  });
}

// ---------------------------------------------------------------------------
// Messages: the delivery ledger (announcement -> guardian messages)
// ---------------------------------------------------------------------------

export interface MessageRow {
  id: string;
  title: string | null;
  guardian: string;
  learner: string | null;
  channel: string;
  state: string;
  created_at: string;
}

export async function listMessages(dbName: string, principal: Extract<Principal, { kind: "staff" }>, limit = 40): Promise<MessageRow[]> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<MessageRow>(
      `SELECT m.id::text, a.title, g.full_name AS guardian, l.first_name || ' ' || l.last_name AS learner,
              m.channel::text, m.state::text, m.created_at::text
       FROM message m
       JOIN guardian g ON g.id = m.guardian_id
       LEFT JOIN learner l ON l.id = m.learner_id
       LEFT JOIN announcement a ON a.id = m.announcement_id
       ORDER BY m.created_at DESC LIMIT $1`,
      [limit],
    );
    return r.rows;
  });
}

// ---------------------------------------------------------------------------
// People: staff register (read: admin/principal via staff_admin; self via
// staff_self_read. Writes: admin/principal only, every change audit-logged)
// ---------------------------------------------------------------------------

export interface StaffRow {
  id: string; full_name: string; role: string; email: string | null; phone: string | null; active: boolean; classes: string | null; tsc_no: string | null; national_id: string | null;
}

export async function listStaff(dbName: string, principal: Extract<Principal, { kind: "staff" }>): Promise<StaffRow[]> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<StaffRow>(
      `SELECT id::text, full_name, role::text, email::text, phone, active, tsc_no, national_id,
              CASE WHEN classes IS NULL THEN NULL ELSE array_to_string(classes, ', ') END AS classes
       FROM staff ORDER BY active DESC, role, full_name`,
    );
    return r.rows;
  });
}

export interface CreateStaffInput {
  fullName: string;
  email: string;
  phone?: string;
  role: string; // user_role enum values
  classes: string[];
  tscNo?: string;
  nationalId?: string;
}

const STAFF_ROLES = ["admin", "principal", "teacher", "bursar", "counter", "driver"] as const;

/**
 * Create a staff row (admin/principal only). Auth stays better-auth's job —
 * dev login is email-match, so the row alone is enough for v1.
 * Writes staff.create to the audit log with the actor and the payload.
 */
export async function createStaff(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: CreateStaffInput,
) {
  if (!STAFF_ROLES.includes(input.role as (typeof STAFF_ROLES)[number])) {
    return { ok: false as const, error: "Unknown role" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const dup = await c.query<{ id: string }>(`SELECT id FROM staff WHERE email = $1`, [input.email]);
    if (dup.rowCount) return { ok: false as const, error: "A staff member with that email already exists" };
    try {
      const r = await c.query<{ id: string }>(
        `INSERT INTO staff (auth_user_id, full_name, email, phone, role, classes, active, tsc_no, national_id)
         VALUES ($1, $2, $3, $4, $5::user_role, $6, true, $7, $8)
         RETURNING id`,
        [
          `seed_${crypto.randomUUID()}`, // better-auth owns this column in v2
          input.fullName,
          input.email,
          input.phone ?? null,
          input.role,
          input.classes,
          input.tscNo ?? null,
          input.nationalId ?? null,
        ],
      );
      await c.query(
        `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
         VALUES ($1, 'staff', 'staff.create', 'staff', $2, $3)`,
        [principal.userId, r.rows[0]!.id, JSON.stringify({ full_name: input.fullName, role: input.role, email: input.email })],
      );
      return { ok: true as const, id: r.rows[0]!.id };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  });
}

export interface UpdateStaffInput {
  id: string;
  role?: string;
  active?: boolean;
  classes?: string[];
  tscNo?: string;
  nationalId?: string;
  phone?: string;
}

/**
 * Update role/active/register fields (admin/principal only). Captures
 * before/after into the audit log so the owner can answer "who changed what
 * and when" — the Sh912M-lesson, applied at school level.
 */
export async function updateStaff(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: UpdateStaffInput,
) {
  if (input.role && !STAFF_ROLES.includes(input.role as (typeof STAFF_ROLES)[number])) {
    return { ok: false as const, error: "Unknown role" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const before = await c.query<StaffRow & { classes_arr: string[] | null }>(
      `SELECT id::text, full_name, role::text, email::text, phone, active, tsc_no, national_id, classes AS classes_arr
       FROM staff WHERE id = $1`,
      [input.id],
    );
    if (!before.rowCount) return { ok: false as const, error: "Staff member not found" };
    const b = before.rows[0]!;

    // convenience guard mirroring the DB trigger (nicer error than the raw one)
    if (
      b.role === "principal" && b.active &&
      ((input.role && input.role !== "principal") || input.active === false)
    ) {
      const others = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM staff WHERE role = 'principal' AND active AND id <> $1`,
        [input.id],
      );
      if (others.rows[0]!.n === "0") {
        return { ok: false as const, error: "Cannot demote or deactivate the last active principal" };
      }
    }

    try {
      const r = await c.query<{ id: string }>(
        `UPDATE staff SET
           role      = COALESCE($2::user_role, role),
           active    = COALESCE($3, active),
           classes   = COALESCE($4, classes),
           tsc_no    = COALESCE($5, tsc_no),
           national_id = COALESCE($6, national_id),
           phone     = COALESCE($7, phone)
         WHERE id = $1 RETURNING id`,
        [input.id, input.role ?? null, input.active ?? null, input.classes ?? null, input.tscNo ?? null, input.nationalId ?? null, input.phone ?? null],
      );
      if (!r.rowCount) return { ok: false as const, error: "Staff member not found" };

      const after: Record<string, unknown> = {};
      for (const [k, v] of Object.entries({
        role: input.role ?? b.role,
        active: input.active ?? b.active,
        classes: input.classes ?? b.classes_arr,
        tsc_no: input.tscNo ?? b.tsc_no,
        national_id: input.nationalId ?? b.national_id,
        phone: input.phone ?? b.phone,
      })) {
        if (JSON.stringify(v) !== JSON.stringify((b as unknown as Record<string, unknown>)[k === "classes" ? "classes_arr" : k])) {
          after[k] = v;
        }
      }
      await c.query(
        `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, before, after)
         VALUES ($1, 'staff', 'staff.update', 'staff', $2, $3, $4)`,
        [principal.userId, input.id, JSON.stringify({ role: b.role, active: b.active }), JSON.stringify(after)],
      );
      return { ok: true as const, id: r.rows[0]!.id };
    } catch (err) {
      // the last-principal DB trigger surfaces here if the API guard missed it
      return { ok: false as const, error: (err as Error).message };
    }
  });
}

// ---------------------------------------------------------------------------
// Money: levies (fee structures) + pending payments + confirm
// ---------------------------------------------------------------------------

export interface LevyRow { id: string; name: string; class: string | null; amount_cents: string; is_optional: boolean }

export async function listLevies(dbName: string, principal: Extract<Principal, { kind: "staff" }>): Promise<LevyRow[]> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<LevyRow>(
      `SELECT fs.id::text, fs.name, cl.name AS class, fs.amount::text AS amount_cents, fs.is_optional
       FROM fee_structure fs
       LEFT JOIN class cl ON cl.id = fs.class_id
       WHERE fs.term_id = (SELECT id FROM term ORDER BY starts_on DESC LIMIT 1)
       ORDER BY fs.is_optional, fs.name`,
    );
    return r.rows;
  });
}

export interface PendingPaymentRow {
  receipt_no: string; learner: string; amount_cents: string; method: string; reference: string | null; paid_at: string;
}

export async function listPendingPayments(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<PendingPaymentRow[]> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<PendingPaymentRow>(
      `SELECT p.receipt_no, l.first_name || ' ' || l.last_name AS learner,
              p.amount::text AS amount_cents, p.method::text, p.reference, p.paid_at::text
       FROM payments p JOIN learner l ON l.id = p.learner_id
       WHERE p.state = 'pending'
       ORDER BY p.paid_at ASC LIMIT 50`,
    );
    return r.rows;
  });
}

export async function confirmPayment(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  receiptNo: string,
): Promise<{ receipt_no: string }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ receipt_no: string }>(
      `UPDATE payments SET state = 'confirmed' WHERE receipt_no = $1 AND state = 'pending' RETURNING receipt_no`,
      [receiptNo],
    );
    if (!r.rowCount) throw new Error("payment not found or not pending");
    // Receipt on confirm (flank 1): queue a Talk announcement scoped to the
    // payer's class/learner context; the Talk worker fans out + sends.
    const ctx = await c.query<{ learner_id: string | null; class_code: string | null; first: string; amount: string }>(
      `SELECT pa.learner_id::text AS learner_id, cl.code AS class_code,
              trim(l.first_name || ' ' || l.last_name) AS first, p.amount::text AS amount
       FROM payments p
       LEFT JOIN payment_allocation pa ON pa.payment_id = p.id
       LEFT JOIN learner l ON l.id = pa.learner_id
       LEFT JOIN class cl ON cl.id = l.class_id
       WHERE p.receipt_no = $1 LIMIT 1`,
      [receiptNo],
    );
    if (ctx.rowCount) {
      const row = ctx.rows[0]!;
      const audience = row.learner_id
        ? ({ learners: [row.learner_id] } as Record<string, unknown>)
        : { all: true };
      const school = await c.query<{ name: string }>(`SELECT name FROM school_settings LIMIT 1`);
      await c.query(
        `INSERT INTO announcement (title, body, audience, urgency, channel, created_by)
         VALUES ($1, $2, $3::jsonb, 'update', 'whatsapp', $4)
         ON CONFLICT DO NOTHING`,
        [
          "Receipt " + receiptNo,
          "Receipt " + receiptNo + ": Ksh " + (Number(row.amount) / 100).toLocaleString() +
            " received for " + (row.first ?? "your child") + ". Thank you. — " + (school.rows[0]?.name ?? "School"),
          JSON.stringify(audience),
          principal.userId,
        ],
      );
    }
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'payment.confirm', 'payments', $2, $3)`,
      [principal.userId, receiptNo, JSON.stringify({ receiptNo })],
    );
    return r.rows[0]!;
  });
}

// ---------------------------------------------------------------------------
// Fee Structures ⑫ — the editor the blueprint promised (docs/BUILD-PHASES.md
// Phase 1). Manual-first: the bursar keys fee items; bulk-apply only assists.
// ---------------------------------------------------------------------------

export interface FeeStructureRow {
  id: string; name: string; class_name: string | null; amount_cents: string;
  is_optional: boolean; term_label: string;
}

export async function listFeeStructures(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ rows: FeeStructureRow[]; currentTerm: { id: number; label: string } }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const term = await c.query<{ id: number; label: string }>(
      `SELECT id, label FROM term ORDER BY starts_on DESC LIMIT 1`,
    );
    if (!term.rowCount) throw new Error("no term exists");
    const rows = await c.query<FeeStructureRow>(
      `SELECT fs.id::text, fs.name, cl.name AS class_name, fs.amount::text AS amount_cents,
              fs.is_optional, t.label AS term_label
       FROM fee_structure fs
       LEFT JOIN class cl ON cl.id = fs.class_id
       JOIN term t ON t.id = fs.term_id
       WHERE fs.term_id = $1
       ORDER BY fs.is_optional, fs.name, cl.name NULLS FIRST`,
      [term.rows[0]!.id],
    );
    return { rows: rows.rows, currentTerm: term.rows[0]! };
  });
}

/** Create/update one structure line. Audit-logged (fee.structure.upsert). */
export async function upsertFeeStructure(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id?: string; name: string; classId: number | null; amountCents: number; isOptional: boolean },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const term = await c.query<{ id: number }>(`SELECT id FROM term ORDER BY starts_on DESC LIMIT 1`);
    if (!term.rowCount) throw new Error("no term exists");
    const r = await c.query<{ id: number }>(
      `INSERT INTO fee_structure (term_id, class_id, name, amount, is_optional)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (term_id, class_id, name)
       DO UPDATE SET amount = EXCLUDED.amount, is_optional = EXCLUDED.is_optional
       RETURNING id`,
      [term.rows[0]!.id, input.classId, input.name, input.amountCents, input.isOptional],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'fee.structure.upsert', 'fee_structure', $2, $3)`,
      [principal.userId, String(r.rows[0]!.id), JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

/**
 * Bulk-apply a structure line to every active learner of a class — the
 * ASSIST (⑫). Manual-first: each fee_item row carries source 'structure'
 * and the action is one audited line; the bursar sees the count and can
 * reverse by deleting (also audited). Never silent, never automatic.
 */
export async function bulkApplyFeeStructure(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { structureId: string },
): Promise<{ applied: number }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const s = await c.query<{ id: number; term_id: number; class_id: number | null; name: string; amount: string; is_optional: boolean }>(
      `SELECT id, term_id, class_id, name, amount::text AS amount, is_optional
       FROM fee_structure WHERE id = $1`,
      [input.structureId],
    );
    if (!s.rowCount) throw new Error("structure not found");
    const st = s.rows[0]!;
    const r = await c.query<{ learner_id: string }>(
      `INSERT INTO fee_item (learner_id, structure_id, term_id, name, amount, is_optional, source)
       SELECT l.id, st.id, st.term_id, st.name, st.amount::bigint, st.is_optional, 'structure'
       FROM learner l, fee_structure st
       WHERE st.id = $1
         AND l.status = 'active'
         AND (st.class_id IS NULL OR l.class_id = st.class_id)
         AND NOT EXISTS (
           SELECT 1 FROM fee_item fi
           WHERE fi.learner_id = l.id AND fi.term_id = st.term_id AND fi.name = st.name)
       RETURNING learner_id`,
      [input.structureId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'fee.bulk_apply', 'fee_structure', $2, $3)`,
      [principal.userId, input.structureId, JSON.stringify({ applied: r.rowCount, structure: st.name })],
    );
    return { applied: r.rowCount ?? 0 };
  });
}

export interface DiscountRow {
  id: string; name: string; class_name: string | null;
  applies_from: number; percent_off: string; active: boolean;
}

export async function listDiscounts(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<DiscountRow[]> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<DiscountRow>(
      `SELECT sd.id::text, sd.name, cl.name AS class_name,
              sd.applies_from, sd.percent_off::text AS percent_off, sd.active
       FROM sibling_discount sd LEFT JOIN class cl ON cl.id = sd.scope_class
       ORDER BY sd.active DESC, sd.applies_from`,
    );
    return r.rows;
  });
}

export async function upsertDiscount(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id?: string; name: string; classId: number | null; appliesFrom: number; percentOff: number; active: boolean },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ id: number }>(
      `INSERT INTO sibling_discount (name, scope_class, applies_from, percent_off, active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [input.name, input.classId, input.appliesFrom, input.percentOff, input.active],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'fee.discount.upsert', 'sibling_discount', $2, $3)`,
      [principal.userId, String(r.rows[0]!.id), JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

export interface PlanRow {
  id: string; learner: string; class_name: string | null; plan_name: string;
  parts: number; total_cents: string; paid_cents: string; next_due: string | null;
}

export async function listPlans(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<PlanRow[]> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<PlanRow>(
      `SELECT ip.id::text,
              l.first_name || ' ' || l.last_name AS learner,
              cl.name AS class_name, ip.name AS plan_name,
              count(i.id)::int AS parts,
              COALESCE(sum(i.amount), 0)::text AS total_cents,
              COALESCE(sum(CASE WHEN i.paid_at IS NOT NULL THEN i.amount END), 0)::text AS paid_cents,
              min(i.due_on)::text AS next_due
       FROM instalment_plan ip
       JOIN learner l ON l.id = ip.learner_id
       LEFT JOIN class cl ON cl.id = l.class_id
       JOIN instalment i ON i.plan_id = ip.id
       WHERE ip.term_id = (SELECT id FROM term ORDER BY starts_on DESC LIMIT 1)
       GROUP BY ip.id, l.first_name, l.last_name, cl.name, ip.name
       ORDER BY next_due NULLS LAST`,
    );
    return r.rows;
  });
}

export async function createPlan(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { learnerId: string; name: string; parts: { label: string; dueOn: string; amountCents: number }[] },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const term = await c.query<{ id: number }>(`SELECT id FROM term ORDER BY starts_on DESC LIMIT 1`);
    if (!term.rowCount) throw new Error("no term exists");
    await c.query(`DELETE FROM instalment_plan WHERE learner_id = $1 AND term_id = $2`, [input.learnerId, term.rows[0]!.id]);
    const plan = await c.query<{ id: string }>(
      `INSERT INTO instalment_plan (learner_id, term_id, name, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id::text`,
      [input.learnerId, term.rows[0]!.id, input.name, principal.userId],
    );
    for (const [idx, p] of input.parts.entries()) {
      await c.query(
        `INSERT INTO instalment (plan_id, seq, label, due_on, amount)
         VALUES ($1, $2, $3, $4, $5)`,
        [plan.rows[0]!.id, idx + 1, p.label, p.dueOn, p.amountCents],
      );
    }
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'fee.plan.create', 'instalment_plan', $2, $3)`,
      [principal.userId, plan.rows[0]!.id, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// Invoices & Statements (13) — the allocation-backed money truth.
// The bill is fee_item; the ledger is payments/payment_allocation; the
// statement is a deterministic FIFO waterfall computed at read time —
// NEVER a silent write (manual-first law). Staff and guardians call the
// SAME function, so the bursar's ledger and the parent's screen can
// never disagree (blueprint: trust by construction).
// ---------------------------------------------------------------------------

export interface InvoiceListRow {
  learner_id: string; learner: string; class_name: string | null;
  billed_cents: string; paid_cents: string; balance_cents: string;
  credit_cents: string; items: number;
}

/** Per-learner term ledger summary: billed (consent-aware), paid (waterfall), balance. */
export async function listInvoices(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ rows: InvoiceListRow[]; term: string }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const term = await c.query<{ id: number; label: string }>(
      `SELECT id, label FROM term ORDER BY starts_on DESC LIMIT 1`,
    );
    if (!term.rowCount) throw new Error("no term exists");
    const termId = term.rows[0]!.id;
    const r = await c.query<InvoiceListRow>(
      `WITH billed AS (
         SELECT fi.learner_id,
                count(*)::int AS items,
                COALESCE(SUM(CASE WHEN fi.is_optional = false
                                   OR EXISTS (SELECT 1 FROM consent cc
                                              WHERE cc.id = fi.consent_id AND cc.choice = 'granted')
                                  THEN fi.amount END), 0) AS billed,
                COALESCE(SUM(pa.amount), 0) AS alloc
         FROM fee_item fi
         LEFT JOIN payment_allocation pa ON pa.fee_item_id = fi.id
         WHERE fi.term_id = $1
         GROUP BY fi.learner_id
       ),
       pool AS (
         SELECT p.learner_id, SUM(p.amount) AS paid
         FROM payments p
         WHERE p.state = 'confirmed'
           AND p.paid_at::date <= (SELECT ends_on FROM term WHERE id = $1)
         GROUP BY p.learner_id
       )
       SELECT l.id::text AS learner_id,
              l.first_name || ' ' || l.last_name AS learner,
              cl.name AS class_name,
              COALESCE(b.billed, 0)::text AS billed_cents,
              LEAST(COALESCE(p.paid, 0), COALESCE(b.billed, 0))::text AS paid_cents,
              (COALESCE(b.billed, 0) - LEAST(COALESCE(p.paid, 0), COALESCE(b.billed, 0)))::text AS balance_cents,
              GREATEST(COALESCE(p.paid, 0) - COALESCE(b.billed, 0), 0)::text AS credit_cents,
              COALESCE(b.items, 0) AS items
       FROM learner l
       LEFT JOIN class cl ON cl.id = l.class_id
       LEFT JOIN billed b ON b.learner_id = l.id
       LEFT JOIN pool p ON p.learner_id = l.id
       WHERE l.status = 'active' AND COALESCE(b.items, 0) > 0
       ORDER BY (COALESCE(b.billed, 0) - LEAST(COALESCE(p.paid, 0), COALESCE(b.billed, 0))) DESC,
                l.first_name, l.last_name`,
      [termId],
    );
    return { rows: r.rows, term: term.rows[0]!.label };
  });
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

/**
 * THE one learner-term statement. Called verbatim by the staff endpoint and
 * the guardian endpoint — the same query is the product's trust fix.
 * The waterfall: allocations pay items directly; any unallocated confirmed
 * money (the pool) flows onto unpaid items FIFO by billing date; anything
 * left after every item is a credit (overpayment) shown honestly.
 */
export async function learnerTermStatement(
  dbName: string,
  session: { userId: string; role: string; guardianId?: string },
  learnerId: string,
  termId: number,
): Promise<LearnerTermStatement | { error: string }> {
  // Guard the UUID boundary BEFORE Postgres sees the value: a junk id in the
  // URL must answer "learner not found", never a raw 500 pg type error.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(learnerId)) {
    return { error: "learner not found" };
  }
  return withSession(dbName, session, async (c) => {
    // Guardians may only ever see their own children — enforced here AND by RLS.
    if (session.role === "guardian") {
      const own = await c.query(
        `SELECT 1 FROM learner_guardian WHERE guardian_id = $1 AND learner_id = $2`,
        [session.guardianId ?? "", learnerId],
      );
      if (!own.rowCount) return { error: "not your child" };
    }
    const learner = await c.query<{
      learner: string; class_name: string | null;
    }>(
      `SELECT l.first_name || ' ' || l.last_name AS learner, cl.name AS class_name
       FROM learner l LEFT JOIN class cl ON cl.id = l.class_id WHERE l.id = $1`,
      [learnerId],
    );
    if (!learner.rowCount) return { error: "learner not found" };
    const term = await c.query<{
      label: string; starts_on: string; year: number;
    }>(
      `SELECT t.label, t.starts_on::text, ay.year
       FROM term t JOIN academic_year ay ON ay.id = t.year_id
       WHERE t.id = $1`,
      [termId],
    );
    if (!term.rowCount) return { error: "term not found" };

    const items = await c.query<{
      id: string; name: string; effective: string; paid_on_item: string; created_at: string;
    }>(
      `SELECT fi.id::text, fi.name,
              (CASE WHEN fi.is_optional = false
                     OR EXISTS (SELECT 1 FROM consent cc WHERE cc.id = fi.consent_id AND cc.choice = 'granted')
                    THEN fi.amount ELSE 0 END)::text AS effective,
              COALESCE(SUM(pa.amount), 0)::text AS paid_on_item,
              fi.created_at::text
       FROM fee_item fi
       LEFT JOIN payment_allocation pa ON pa.fee_item_id = fi.id
       WHERE fi.learner_id = $1 AND fi.term_id = $2
       GROUP BY fi.id, fi.name, fi.amount, fi.is_optional, fi.consent_id, fi.created_at
       ORDER BY fi.created_at, fi.name`,
      [learnerId, termId],
    );
    const poolRow = await c.query<{ pool: string }>(
      `SELECT COALESCE(SUM(p.amount), 0)::text AS pool
       FROM payments p
       WHERE p.learner_id = $1 AND p.state = 'confirmed'
         AND p.paid_at::date <= (SELECT ends_on FROM term WHERE id = $2)`,
      [learnerId, termId],
    );
    const paymentLines = await c.query<{
      receipt_no: string; amount: string; method: string; paid_at: string; reference: string | null;
    }>(
      `SELECT p.receipt_no, p.amount::text, p.method::text, p.paid_at::text, p.reference
       FROM payments p
       WHERE p.learner_id = $1 AND p.state = 'confirmed'
         AND p.paid_at::date <= (SELECT ends_on FROM term WHERE id = $2)
       ORDER BY p.paid_at`,
      [learnerId, termId],
    );

    // FIFO waterfall over integer cents.
    let flex = Number(poolRow.rows[0]?.pool ?? "0");
    const lines: StatementItemLine[] = items.rows.map((it) => {
      const effective = Number(it.effective);
      const direct = Number(it.paid_on_item);
      const outstanding = Math.max(0, effective - direct);
      const extra = Math.min(flex, outstanding);
      flex -= extra;
      const paid = Math.min(effective, direct + extra);
      return {
        name: it.name,
        billed_cents: effective,
        paid_cents: paid,
        balance_cents: effective - paid,
        billed_at: it.created_at,
      };
    });

    // Sequential invoice number: this learner's alphabetical position among
    // the term's billed learners — stable, needs no counter table, no races.
    const seq = await c.query<{ rk: string; cnt: string }>(
      `SELECT rk::text, cnt::text FROM (
         SELECT l.id,
                row_number() OVER (ORDER BY l.first_name, l.last_name) AS rk,
                count(*) OVER () AS cnt
         FROM learner l
         WHERE EXISTS (
           SELECT 1 FROM fee_item fi WHERE fi.learner_id = l.id AND fi.term_id = $1
             AND (fi.is_optional = false
                  OR EXISTS (SELECT 1 FROM consent cc WHERE cc.id = fi.consent_id AND cc.choice = 'granted')))
       ) x WHERE id = $2`,
      [termId, learnerId],
    );
    const yy = term.rows[0]!.year % 100;
    const invoiceNo = seq.rowCount
      ? `INV-${String(seq.rows[0]!.rk).padStart(3, "0")}/${yy}-${term.rows[0]!.label.replace(/\D+/g, "") || "1"}`
      : "INV-000";

    const school = await c.query<{
      name: string; contact_phone: string | null; contact_email: string | null; contact_address: string | null;
    }>(`SELECT name, contact_phone, contact_email, contact_address FROM school_settings WHERE id = 'default'`);

    const billedTotal = lines.reduce((s, l) => s + l.billed_cents, 0);
    const paidTotal = Math.min(Number(poolRow.rows[0]?.pool ?? "0"), billedTotal);
    return {
      learner: learner.rows[0]!.learner,
      class_name: learner.rows[0]!.class_name,
      term: term.rows[0]!.label,
      invoice_no: invoiceNo,
      issued_on: term.rows[0]!.starts_on,
      items: lines,
      payments: paymentLines.rows.map((p) => ({
        receipt_no: p.receipt_no,
        amount_cents: Number(p.amount),
        method: p.method,
        paid_at: p.paid_at,
        reference: p.reference,
      })),
      billed_cents: billedTotal,
      paid_cents: paidTotal,
      balance_cents: billedTotal - paidTotal,
      credit_cents: Math.max(Number(poolRow.rows[0]?.pool ?? "0") - billedTotal, 0),
      school: {
        name: school.rows[0]?.name ?? "",
        contact_phone: school.rows[0]?.contact_phone ?? null,
        contact_email: school.rows[0]?.contact_email ?? null,
        contact_address: school.rows[0]?.contact_address ?? null,
      },
    };
  });
}

/** Current-term id (shared helper for endpoints). */
export async function currentTermId(dbName: string): Promise<number | null> {
  const db = getSchoolPool(dbName);
  const r = await db.query<{ id: number }>(`SELECT id FROM term ORDER BY starts_on DESC LIMIT 1`);
  return r.rows[0]?.id ?? null;
}

/**
 * Manual invoice line — the bursar keys the bill (manual-first law, law 9).
 * One audited INSERT into fee_item (source 'manual'). Refuses a duplicate
 * learner+term+name loudly instead of silently double-billing.
 */
export async function createInvoiceItem(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { learnerId: string; name: string; amountCents: number },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const term = await c.query<{ id: number }>(`SELECT id FROM term ORDER BY starts_on DESC LIMIT 1`);
    if (!term.rowCount) return { ok: false, error: "No term exists yet — create the term first." };
    const learner = await c.query<{ status: string }>(`SELECT status::text FROM learner WHERE id = $1`, [input.learnerId]);
    if (!learner.rowCount) return { ok: false, error: "Learner not found." };
    if (learner.rows[0]!.status !== "active") return { ok: false, error: "Learner is not active — reinstate them first." };
    const dup = await c.query(
      `SELECT 1 FROM fee_item WHERE learner_id = $1 AND term_id = $2 AND name = $3`,
      [input.learnerId, term.rows[0]!.id, input.name],
    );
    if (dup.rowCount) return { ok: false, error: `“${input.name}” is already billed to this learner this term — edit it in Fees or use a distinct name.` };
    const r = await c.query<{ id: string }>(
      `INSERT INTO fee_item (learner_id, term_id, name, amount, is_optional, source)
       VALUES ($1, $2, $3, $4, false, 'manual') RETURNING id::text`,
      [input.learnerId, term.rows[0]!.id, input.name, input.amountCents],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'invoice.item.create', 'fee_item', $2, $3)`,
      [principal.userId, r.rows[0]!.id, JSON.stringify(input)],
    );
    return { ok: true as const, id: r.rows[0]!.id };
  });
}

// ---------------------------------------------------------------------------
// Settings: the school edits its own identity (everything-is-data, kept true)
// ---------------------------------------------------------------------------

export interface SettingsUpdate {
  name?: string;
  tagline?: string;
  motto?: string;
  contact_phone?: string | null;
  contact_email?: string | null;
  contact_address?: string | null;
  quote_text?: string | null;
  quote_author?: string | null;
  modules?: { title: string; body: string }[];
  nav?: Record<string, string[]>;
  prime_questions?: Record<string, string>;
  /** Color overrides for the ink/paper tokens; empty object clears back to product default. */
  theme?: Record<string, string> | null;
}

export async function getSettings(dbName: string) {
  const db = getSchoolPool(dbName);
  const r = await db.query<{
    name: string; tagline: string | null; motto: string | null;
    contact_phone: string | null; contact_email: string | null; contact_address: string | null;
    quote_text: string | null; quote_author: string | null;
    modules_json: unknown; nav_json: unknown; theme_json: unknown;
  }>(
    `SELECT name, tagline, motto, contact_phone, contact_email, contact_address,
            quote_text, quote_author, modules_json, nav_json,
            COALESCE((SELECT jsonb_object_agg(e.k, e.v #>> '{}')
                      FROM jsonb_each(theme_json) e(k, v)
                      WHERE jsonb_typeof(e.v) = 'string'
                        AND (e.v #>> '{}') ~ '^#[0-9a-fA-F]{6}$'), '{}'::jsonb) AS theme_json
     FROM school_settings WHERE id = 'default'`,
  );
  if (!r.rowCount) throw new Error("school_settings missing");
  const row = r.rows[0]!;
  return {
    name: row.name,
    tagline: row.tagline,
    motto: row.motto,
    contact_phone: row.contact_phone,
    contact_email: row.contact_email,
    contact_address: row.contact_address,
    quote_text: row.quote_text,
    quote_author: row.quote_author,
    modules: (row.modules_json as { title: string; body: string }[] | null) ?? [],
    nav: (row.nav_json as Record<string, string[]> | null) ?? {},
    prime_questions: DEFAULT_PRIME,
    theme: (row.theme_json as Record<string, string> | null) ?? {},
  };
}

export async function updateSettings(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: SettingsUpdate,
): Promise<void> {
  if (principal.role !== "admin" && principal.role !== "principal") {
    throw new Error("only the principal or admin can change school settings");
  }
  const db = getSchoolPool(dbName);
  await db.query(
    `UPDATE school_settings SET
       name = COALESCE($1, name),
       tagline = COALESCE($2, tagline),
       motto = COALESCE($3, motto),
       contact_phone = COALESCE($4, contact_phone),
       contact_email = COALESCE($5, contact_email),
       contact_address = COALESCE($6, contact_address),
       quote_text = COALESCE($7, quote_text),
       quote_author = COALESCE($8, quote_author),
       modules_json = COALESCE($9::jsonb, modules_json),
       nav_json = COALESCE($10::jsonb, nav_json),
       theme_json = COALESCE($11::jsonb, theme_json),
       updated_at = now()
     WHERE id = 'default'`,
    [
      input.name ?? null,
      input.tagline ?? null,
      input.motto ?? null,
      input.contact_phone ?? null,
      input.contact_email ?? null,
      input.contact_address ?? null,
      input.quote_text ?? null,
      input.quote_author ?? null,
      input.modules ? JSON.stringify(input.modules) : null,
      input.nav ? JSON.stringify(input.nav) : null,
      // undefined = leave theme alone; null or {} = clear back to product default.
      input.theme === undefined
        ? null
        : input.theme && Object.keys(input.theme).length
          ? JSON.stringify(input.theme)
          : "{}",
    ],
  );
  await db.query(
    `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
     VALUES ($1, 'staff', 'settings.update', 'school_settings', 'default', $2)`,
    [principal.userId, JSON.stringify({ keys: Object.keys(input) })],
  ).catch(() => undefined); // audit RLS: only admin/principal read, but insert via app role is allowed
}

// ---------------------------------------------------------------------------
// Guardian profile + message history (Profile / Messages screens)
// ---------------------------------------------------------------------------

export interface GuardianProfile {
  full_name: string;
  phone: string;
  email: string | null;
  relationship: string;
  wa_opt_in: boolean;
  sms_fallback: boolean;
  pref_channel: string;
  learners: { id: string; name: string; class: string | null }[];
}

/**
 * Guardian sets their own daily-loop channel + email (self-service).
 * RLS: guardian may update only their own row (policy in migration 033).
 */
export async function updateGuardianChannel(
  dbName: string,
  guardianId: string,
  input: { prefChannel: "whatsapp" | "email" | "none"; email?: string | null },
): Promise<void> {
  return withSession(dbName, { userId: guardianId, role: "guardian", guardianId }, async (c) => {
    await c.query(
      `UPDATE guardian SET
         pref_channel = $2::text,
         email = COALESCE($3, email)
       WHERE id = $1`,
      [guardianId, input.prefChannel, input.email ?? null],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'guardian', 'guardian.channel', 'guardian', $1, $2)`,
      [guardianId, JSON.stringify({ pref_channel: input.prefChannel, email_set: Boolean(input.email) })],
    );
  });
}

export async function guardianProfile(dbName: string, guardianId: string): Promise<GuardianProfile> {
  return withSession(dbName, { userId: guardianId, role: "guardian", guardianId }, async (c) => {
    const g = await c.query<{
      full_name: string; phone: string; email: string | null; relationship: string;
      wa_opt_in: boolean; sms_fallback: boolean; pref_channel: string;
    }>(
      `SELECT full_name, phone, email::text, relationship, wa_opt_in, sms_fallback, pref_channel::text
       FROM guardian WHERE id = $1`,
      [guardianId],
    );
    if (!g.rowCount) throw new Error("guardian not found");
    const kids = await c.query<{ id: string; name: string; class: string | null }>(
      `SELECT l.id::text, l.first_name || ' ' || l.last_name AS name, cl.name AS class
       FROM learner_guardian lg JOIN learner l ON l.id = lg.learner_id
       LEFT JOIN class cl ON cl.id = l.class_id
       WHERE lg.guardian_id = $1 ORDER BY l.first_name`,
      [guardianId],
    );
    return { ...g.rows[0]!, learners: kids.rows };
  });
}

export interface GuardianMessageRow {
  id: string; title: string | null; body: string | null; urgency: string | null;
  channel: string; state: string; created_at: string;
}

export async function guardianMessages(dbName: string, guardianId: string, limit = 50): Promise<GuardianMessageRow[]> {
  return withSession(dbName, { userId: guardianId, role: "guardian", guardianId }, async (c) => {
    const r = await c.query<GuardianMessageRow>(
      `SELECT m.id::text, a.title, a.body, a.urgency::text, m.channel::text, m.state::text, m.created_at::text
       FROM message m
       LEFT JOIN announcement a ON a.id = m.announcement_id
       WHERE m.guardian_id = $1
       ORDER BY m.created_at DESC LIMIT $2`,
      [guardianId, limit],
    );
    return r.rows;
  });
}

// ---------------------------------------------------------------------------
// Insights (principal): one query per number, straight from the DB
// ---------------------------------------------------------------------------

/**
 * Admin pulse — the governance read behind the Admin Today screen.
 * Not an attendance feed: every sector of the school reports ONE vital
 * sign (the "owner's morning glance"). Read-only; RLS scopes staff rows
 * to admin/principal, and audit_log's policy already gates the heartbeat.
 */
export interface AdminPulse {
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
  /** Last 6 months, calendar-ordered — the Cashflow chart. */
  cashflow: { month: string; billed_cents: string; collected_cents: string }[];
  /** Confirmed money by payment method — the Statistic donut. */
  by_method: { method: string; total_cents: string }[];
  /** Latest confirmed receipts — the Recent Transactions table. */
  recent_payments: {
    receipt_no: string;
    learner: string;
    amount_cents: string;
    method: string;
    state: string;
    paid_at: string;
  }[];
  /** 36/37 - the governance vitals: what waits for a decision, what is overdue. */
  approvals: { pending: number; oldest_days: number | null };
  tasks: { open: number; overdue: number };
  /** 38 - the Sections vital sign: events this week, kit running low. */
  sections: { events_week: number; kit_low: number; sections_enabled: number };
}

export async function adminPulse(dbName: string, principal: Extract<Principal, { kind: "staff" }>): Promise<AdminPulse> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const staff = await c.query<{ active: string; total: string }>(
      `SELECT COUNT(*) FILTER (WHERE active)::text AS active, COUNT(*)::text AS total FROM staff`,
    );
    const learners = await c.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM learner WHERE status = 'active'`,
    );
    const term = await c.query<{ label: string; ends_on: string; days_left: string }>(
      `SELECT label, ends_on::text, (ends_on - CURRENT_DATE)::text AS days_left
       FROM term WHERE CURRENT_DATE BETWEEN starts_on AND ends_on
       ORDER BY starts_on DESC LIMIT 1`,
    );
    const audit = await c.query<{ term: string; d7: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE at >= date_trunc('month', CURRENT_DATE))::text AS term,
         COUNT(*) FILTER (WHERE at >= CURRENT_DATE - INTERVAL '7 days')::text AS d7
       FROM audit_log`,
    );
    const money = await c.query<{ collected: string; billed: string }>(
      `SELECT
         COALESCE((SELECT SUM(p.amount) FROM payments p
                   WHERE p.state = 'confirmed'
                     AND p.paid_at >= (SELECT starts_on FROM term WHERE CURRENT_DATE BETWEEN starts_on AND ends_on LIMIT 1)
                     AND p.paid_at <= (SELECT ends_on   FROM term WHERE CURRENT_DATE BETWEEN starts_on AND ends_on LIMIT 1)), 0)::text AS collected,
         COALESCE(SUM(fi.amount) FILTER (WHERE fi.is_optional = false), 0)::text AS billed
       FROM fee_item fi`,
    );
    const guardians = await c.query<{ total: string; wa: string }>(
      `SELECT COUNT(*)::text AS total, COUNT(*) FILTER (WHERE wa_opt_in)::text AS wa
       FROM guardian WHERE active`,
    );
    const attendance = await c.query<{ present: string; expected: string }>(
      `SELECT COUNT(*) FILTER (WHERE a.mark = 'present')::text AS present,
              (SELECT COUNT(*) FROM learner WHERE status = 'active')::text AS expected
       FROM attendance a WHERE a.day = CURRENT_DATE`,
    );
    const recent = await c.query<{ action: string; entity: string; actor_kind: string; at: string }>(
      `SELECT action, entity, actor_kind, at::text FROM audit_log ORDER BY at DESC LIMIT 5`,
    );
    // Cashflow — billed (fee items raised) vs collected (confirmed payments),
    // per calendar month, last 6 months including the current one.
    const cashflow = await c.query<{ month: string; billed: string; collected: string }>(
      `SELECT to_char(m, 'Mon') AS month,
              COALESCE((SELECT SUM(fi.amount) FROM fee_item fi WHERE date_trunc('month', fi.created_at) = m), 0)::text AS billed,
              COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.state = 'confirmed' AND date_trunc('month', p.paid_at) = m), 0)::text AS collected
       FROM generate_series(
         date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
         date_trunc('month', CURRENT_DATE),
         INTERVAL '1 month'
       ) m`,
    );
    const byMethod = await c.query<{ method: string; total_cents: string }>(
      `SELECT method::text, SUM(amount)::text AS total_cents
       FROM payments WHERE state = 'confirmed'
       GROUP BY method ORDER BY SUM(amount) DESC`,
    );
    const recentPayments = await c.query<{
      receipt_no: string;
      learner: string;
      amount_cents: string;
      method: string;
      state: string;
      paid_at: string;
    }>(
      `SELECT p.receipt_no, l.first_name || ' ' || l.last_name AS learner,
              p.amount::text AS amount_cents, p.method::text, p.state::text, p.paid_at::text
       FROM payments p JOIN learner l ON l.id = p.learner_id
       WHERE p.state = 'confirmed'
       ORDER BY p.paid_at DESC LIMIT 5`,
    );

    const t = term.rows[0];
    const approvalsV = await c.query<{ pending: string; oldest_days: string | null }>(
      `SELECT COUNT(*)::text AS pending,
              (CURRENT_DATE - MIN(created_at)::date)::text AS oldest_days
       FROM approval_request WHERE state = 'pending'`,
    );
    const tasksV = await c.query<{ open: string; overdue: string }>(
      `SELECT COUNT(*) FILTER (WHERE state = 'open')::text AS open,
              COUNT(*) FILTER (WHERE state = 'open' AND due_on < CURRENT_DATE)::text AS overdue
       FROM admin_task`,
    );
    const sectionsV = await c.query<{ events_week: string; kit_low: string; enabled: string }>(
      `SELECT (SELECT COUNT(*) FROM school_event
               WHERE starts_on BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)::text AS events_week,
              (SELECT COUNT(*) FROM stock_item ki
               JOIN section s ON s.id = ki.section_id
               WHERE s.enabled AND ki.qty_on_hand <= ki.low_stock_threshold)::text AS kit_low,
              (SELECT COUNT(*) FROM section WHERE enabled)::text AS enabled`,
    );
    return {
      staff_active: Number(staff.rows[0]!.active),
      staff_total: Number(staff.rows[0]!.total),
      learners_active: Number(learners.rows[0]!.count),
      term: t ? { label: t.label, ends_on: t.ends_on, days_left: Number(t.days_left) } : null,
      audit_term: Number(audit.rows[0]!.term),
      audit_7d: Number(audit.rows[0]!.d7),
      money: { collected_term_cents: money.rows[0]!.collected, billed_term_cents: money.rows[0]!.billed },
      guardians: { total: Number(guardians.rows[0]!.total), whatsapp: Number(guardians.rows[0]!.wa) },
      attendance_today: {
        present: Number(attendance.rows[0]!.present),
        expected: Number(attendance.rows[0]!.expected),
      },
      recent_audit: recent.rows,
      cashflow: cashflow.rows.map((r) => ({ month: r.month, billed_cents: r.billed, collected_cents: r.collected })),
      by_method: byMethod.rows,
      recent_payments: recentPayments.rows,
      approvals: {
        pending: Number(approvalsV.rows[0]!.pending),
        oldest_days: approvalsV.rows[0]!.oldest_days === null ? null : Number(approvalsV.rows[0]!.oldest_days),
      },
      tasks: { open: Number(tasksV.rows[0]!.open), overdue: Number(tasksV.rows[0]!.overdue) },
      sections: {
        events_week: Number(sectionsV.rows[0]!.events_week),
        kit_low: Number(sectionsV.rows[0]!.kit_low),
        sections_enabled: Number(sectionsV.rows[0]!.enabled),
      },
    };
  });
}

/**
 * Audit trail — the append-only proof of everything that happened.
 * RLS (audit_read) already scopes rows to admin/principal; the filters are
 * a convenience on top. before/after come back as parsed JSONB objects.
 */
export interface AuditEntryRow {
  action: string;
  entity: string;
  entity_id: string;
  actor_kind: string;
  actor_name: string | null;
  before: unknown;
  after: unknown;
  at: string;
}

export async function auditTrail(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  opts: { action?: string; actor?: string; limit?: number } = {},
): Promise<AuditEntryRow[]> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (opts.action) {
      params.push(`${opts.action}%`);
      conds.push(`a.action LIKE $${params.length}`);
    }
    if (opts.actor) {
      params.push(opts.actor);
      conds.push(`a.actor_kind = $${params.length}`);
    }
    params.push(opts.limit ?? 100);
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const r = await c.query<AuditEntryRow>(
      `SELECT a.action, a.entity, a.entity_id, a.actor_kind, a.before, a.after, a.at::text,
              s.full_name AS actor_name
       FROM audit_log a LEFT JOIN staff s ON s.id = a.actor_id
       ${where}
       ORDER BY a.at DESC LIMIT $${params.length}`,
      params,
    );
    return r.rows;
  });
}

/**
 * KEMIS / Exam Entries readiness — the data→money panel.
 * Kenya: no UPI/ULI = no national exam entry; county licence renewal asks
 * for the same learner data; staff National ID appears on every audit.
 * The schema already anticipated this (learner.upi, birth_cert_no "entry
 * number, not serial"); this read just surfaces the gaps.
 */
export interface KemisReadiness {
  learners: { total: number; with_upi: number; with_birth_cert: number; with_guardian: number; with_dob: number };
  staff: { total: number; with_national_id: number; with_tsc: number };
  missing_learners: { id: string; name: string; admission_no: string; class: string | null; upi: string | null; birth_cert_no: string | null; gender: string | null; date_of_birth: string | null; missing: string[] }[];
  missing_staff: { id: string; name: string; role: string; missing: string[] }[];
}

export async function kemisReadiness(dbName: string, principal: Extract<Principal, { kind: "staff" }>): Promise<KemisReadiness> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const agg = await c.query<{
      total: string; with_upi: string; with_birth_cert: string; with_guardian: string; with_dob: string;
    }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(upi)::text AS with_upi,
              COUNT(birth_cert_no)::text AS with_birth_cert,
              COUNT(date_of_birth)::text AS with_dob,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM learner_guardian lg JOIN guardian g ON g.id = lg.guardian_id
                WHERE lg.learner_id = l.id AND g.active
              ))::text AS with_guardian
       FROM learner l WHERE l.status = 'active'`,
    );
    const staffAgg = await c.query<{ total: string; with_national_id: string; with_tsc: string }>(
      `SELECT COUNT(*) FILTER (WHERE active)::text AS total,
              COUNT(national_id) FILTER (WHERE active)::text AS with_national_id,
              COUNT(tsc_no) FILTER (WHERE active AND role = 'teacher')::text AS with_tsc
       FROM staff`,
    );
    // The actionable list — everything the portal would still reject.
    // Full list (no LIMIT): schools are hundreds of learners, and the CSV
    // export is built from exactly these rows.
    const missingL = await c.query<{
      id: string; name: string; admission_no: string; class: string | null;
      upi: string | null; birth_cert_no: string | null; gender: string | null; date_of_birth: string | null;
    }>(
      `SELECT l.id, l.first_name || ' ' || l.last_name AS name, l.admission_no,
              cl.name AS class, l.upi, l.birth_cert_no, l.gender,
              l.date_of_birth::text
       FROM learner l LEFT JOIN class cl ON cl.id = l.class_id
       WHERE l.status = 'active'
         AND (l.upi IS NULL OR l.birth_cert_no IS NULL OR l.date_of_birth IS NULL
              OR NOT EXISTS (
                SELECT 1 FROM learner_guardian lg JOIN guardian g ON g.id = lg.guardian_id
                WHERE lg.learner_id = l.id AND g.active))
       ORDER BY cl.code NULLS LAST, l.first_name`,
    );
    const missingS = await c.query<{ id: string; name: string; role: string; national_id: string | null; tsc_no: string | null }>(
      `SELECT id, full_name AS name, role::text AS role, national_id, tsc_no
       FROM staff
       WHERE active AND (national_id IS NULL OR (role = 'teacher' AND tsc_no IS NULL))
       ORDER BY full_name`,
    );

    const a = agg.rows[0]!;
    return {
      learners: {
        total: Number(a.total),
        with_upi: Number(a.with_upi),
        with_birth_cert: Number(a.with_birth_cert),
        with_guardian: Number(a.with_guardian),
        with_dob: Number(a.with_dob),
      },
      staff: {
        total: Number(staffAgg.rows[0]!.total),
        with_national_id: Number(staffAgg.rows[0]!.with_national_id),
        with_tsc: Number(staffAgg.rows[0]!.with_tsc),
      },
      missing_learners: missingL.rows.map((r) => ({
        ...r,
        missing: [
          ...(r.upi ? [] : ["UPI"]),
          ...(r.birth_cert_no ? [] : ["Birth cert entry no"]),
          ...(r.date_of_birth ? [] : ["Date of birth"]),
        ],
      })),
      missing_staff: missingS.rows.map((r) => ({
        id: r.id,
        name: r.name,
        role: r.role,
        missing: [
          ...(r.national_id ? [] : ["National ID"]),
          ...(r.role === "teacher" && !r.tsc_no ? ["TSC no"] : []),
        ],
      })),
    };
  });
}

export async function insights(dbName: string, principal: Extract<Principal, { kind: "staff" }>) {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const learners = await c.query<{ active: string; boarding: string }>(
      `SELECT COUNT(*) FILTER (WHERE status = 'active')::text AS active,
              COUNT(*) FILTER (WHERE boarding)::text AS boarding
       FROM learner`,
    );
    const guardians = await c.query<{ total: string; wa: string }>(
      `SELECT COUNT(*)::text AS total, COUNT(*) FILTER (WHERE wa_opt_in)::text AS wa FROM guardian WHERE active`,
    );
    const attendance7 = await c.query<{ day: string; present: string; total: string }>(
      `SELECT day::text, COUNT(*) FILTER (WHERE mark = 'present')::text AS present, COUNT(*)::text AS total
       FROM attendance WHERE day > CURRENT_DATE - INTERVAL '7 days'
       GROUP BY day ORDER BY day`,
    );
    const collection = await collectionByClassInner(c);
    return {
      learners: learners.rows[0]!,
      guardians: guardians.rows[0]!,
      attendance7: attendance7.rows,
      collection,
    };
  });
}

// ---------------------------------------------------------------------------
// TERMS & CALENDAR — the clock every other module reads.
// Billing windows, attendance terms, assessment periods all key off `term`;
// this module gives the Admin one screen to run the year.
// ---------------------------------------------------------------------------

export interface TermsData {
  current_year: { id: number; year: number; starts_on: string; ends_on: string } | null;
  years: { id: number; year: number; starts_on: string; ends_on: string; terms: number }[];
  terms: { id: number; label: string; starts_on: string; ends_on: string; year: number; days_left: number | null; is_current: boolean }[];
}

export async function termsCalendar(dbName: string, principal: Extract<Principal, { kind: "staff" }>): Promise<TermsData> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const years = await c.query<{ id: number; year: number; starts_on: string; ends_on: string; terms: string; is_current: boolean }>(
      `SELECT y.id, y.year, y.starts_on::text, y.ends_on::text,
              (SELECT COUNT(*) FROM term t WHERE t.year_id = y.id)::text AS terms,
              y.is_current
       FROM academic_year y ORDER BY y.year DESC`,
    );
    const terms = await c.query<{
      id: number; label: string; starts_on: string; ends_on: string; year: number; days_left: string | null;
    }>(
      `SELECT t.id, t.label, t.starts_on::text, t.ends_on::text, y.year,
              CASE WHEN CURRENT_DATE BETWEEN t.starts_on AND t.ends_on
                   THEN (t.ends_on - CURRENT_DATE)::text END AS days_left
       FROM term t JOIN academic_year y ON y.id = t.year_id
       ORDER BY y.year DESC, t.starts_on ASC`,
    );
    const cur = years.rows.find((y) => y.is_current) ?? years.rows[0] ?? null;
    const today = new Date().toISOString().slice(0, 10);
    return {
      current_year: cur ? { id: cur.id, year: cur.year, starts_on: cur.starts_on, ends_on: cur.ends_on } : null,
      years: years.rows.map((y) => ({ id: y.id, year: y.year, starts_on: y.starts_on, ends_on: y.ends_on, terms: Number(y.terms) })),
      terms: terms.rows.map((t) => ({
        id: t.id, label: t.label, starts_on: t.starts_on, ends_on: t.ends_on, year: t.year,
        days_left: t.days_left == null ? null : Number(t.days_left),
        is_current: today >= t.starts_on && today <= t.ends_on,
      })),
    };
  });
}

export interface UpsertTermInput {
  year: number;
  label: string;      // 'Term 1'
  startsOn: string;   // ISO date
  endsOn: string;
}

export async function upsertTerm(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: UpsertTermInput,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endsOn)) {
    return { ok: false as const, error: "Dates must be YYYY-MM-DD" };
  }
  if (input.endsOn <= input.startsOn) {
    return { ok: false as const, error: "The end date must be after the start date" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    try {
      // academic_year is UNIQUE(year); 015 grants the term writes.
      const y = await c.query<{ id: number }>(
        `INSERT INTO academic_year (year, starts_on, ends_on)
         VALUES ($1, $2, $3)
         ON CONFLICT (year) DO UPDATE SET starts_on = EXCLUDED.starts_on, ends_on = EXCLUDED.ends_on
         RETURNING id`,
        [input.year, `${input.year}-01-01`, `${input.year}-12-31`],
      );
      const yearId = y.rows[0]!.id;
      const dup = await c.query<{ id: number }>(
        `SELECT id FROM term WHERE year_id = $1 AND label = $2`,
        [yearId, input.label],
      );
      if (dup.rowCount) {
        await c.query(`UPDATE term SET starts_on = $1, ends_on = $2 WHERE id = $3`,
          [input.startsOn, input.endsOn, dup.rows[0]!.id]);
      } else {
        await c.query(`INSERT INTO term (year_id, label, starts_on, ends_on) VALUES ($1, $2, $3, $4)`,
          [yearId, input.label, input.startsOn, input.endsOn]);
      }
      await c.query(
        `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
         VALUES ($1, 'staff', 'term.upsert', 'term', $2, $3)`,
        [principal.userId, String(dup.rowCount ? dup.rows[0]!.id : yearId),
         JSON.stringify({ year: input.year, label: input.label, starts_on: input.startsOn, ends_on: input.endsOn })],
      );
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  });
}

// ---------------------------------------------------------------------------
// GUARDIANS & PARENTS — the contact register. WhatsApp reach (Talk module's
// worker), consent records, fee-chasing phone lists — all key off `guardian`.
// ---------------------------------------------------------------------------

export interface GuardianDirectory {
  guardians: {
    id: string; full_name: string; phone: string; email: string | null; relationship: string;
    wa_opt_in: boolean; active: boolean; children: string | null;
  }[];
  stats: { total: string; wa: string; with_children: string };
}

export async function guardianDirectory(dbName: string, principal: Extract<Principal, { kind: "staff" }>): Promise<GuardianDirectory> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const rows = await c.query<GuardianDirectory["guardians"][number]>(
      `SELECT g.id, g.full_name, g.phone, g.email, g.relationship, g.wa_opt_in, g.active,
              COALESCE(string_agg(l.first_name || ' ' || l.last_name, ', ' ORDER BY l.first_name), NULL) AS children
       FROM guardian g
       LEFT JOIN learner_guardian lg ON lg.guardian_id = g.id
       LEFT JOIN learner l ON l.id = lg.learner_id
       GROUP BY g.id
       ORDER BY g.created_at DESC`,
    );
    const stats = await c.query<{ total: string; wa: string; with_children: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE wa_opt_in)::text AS wa,
              COUNT(DISTINCT guardian_id)::text AS with_children
       FROM guardian g LEFT JOIN learner_guardian lg ON lg.guardian_id = g.id`,
    );
    return { guardians: rows.rows, stats: stats.rows[0]! };
  });
}

export interface UpsertGuardianInput {
  id?: string;            // present = update
  fullName: string;
  phone: string;          // 2547XXXXXXXX
  email?: string;
  relationship: string;   // mother | father | guardian
  waOptIn?: boolean;
}

/** Normalize any Kenyan dialing format to 2547XXXXXXXX. */
export function normalizeKePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  return null;
}

export async function upsertGuardian(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: UpsertGuardianInput,
) {
  const phone = normalizeKePhone(input.phone);
  if (!phone) {
    return { ok: false as const, error: "Enter a Kenyan phone number — 07…, 01… or +2547… (any format works)" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    try {
      let id = input.id ?? null;
      let before: Record<string, unknown> | null = null;
      if (id) {
        const prev = await c.query<{ full_name: string; phone: string; email: string | null; relationship: string }>(
          `SELECT full_name, phone, email, relationship FROM guardian WHERE id = $1`, [id]);
        before = prev.rows[0] ?? null;
        await c.query(
          `UPDATE guardian SET full_name = $1, phone = $2, email = $3, relationship = $4,
                  wa_opt_in = $5, updated_at = now() WHERE id = $6`,
          [input.fullName, phone, input.email || null, input.relationship, input.waOptIn ?? false, id],
        );
      } else {
        const dup = await c.query<{ id: string }>(`SELECT id FROM guardian WHERE phone = $1`, [phone]);
        if (dup.rowCount) return { ok: false as const, error: "A guardian with that phone number is already on the register" };
        const r = await c.query<{ id: string }>(
          `INSERT INTO guardian (full_name, phone, email, relationship, wa_opt_in)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [input.fullName, phone, input.email || null, input.relationship, input.waOptIn ?? false],
        );
        id = r.rows[0]!.id;
      }
      await c.query(
        `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, before, after)
         VALUES ($1, 'staff', $2, 'guardian', $3, $4, $5)`,
        [principal.userId, input.id ? "guardian.update" : "guardian.create", id, before,
         JSON.stringify({ full_name: input.fullName, phone, relationship: input.relationship, wa_opt_in: input.waOptIn ?? false })],
      );
      return { ok: true as const, id };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  });
}

/** Bulk CSV import — one INSERT per row, phone-normalized, audit-logged once. */
export async function importGuardians(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  rows: { fullName: string; phone: string; email?: string; relationship: string }[],
) {
  if (rows.length === 0) return { ok: false as const, error: "The file had no rows" };
  if (rows.length > 2000) return { ok: false as const, error: "Split files above 2000 rows" };
  const seen = new Set<string>();
  for (const r of rows) {
    const phone = normalizeKePhone(r.phone);
    if (!phone) return { ok: false as const, error: `“${r.phone}” is not a Kenyan phone number (07…, 01… or +2547…)` };
    if (seen.has(phone)) return { ok: false as const, error: `Phone ${phone} appears twice in the file` };
    seen.add(phone);
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    try {
      let imported = 0;
      const skipped: string[] = [];
      for (const r of rows) {
        const phone = normalizeKePhone(r.phone)!;
        const dup = await c.query<{ id: string }>(`SELECT id FROM guardian WHERE phone = $1`, [phone]);
        if (dup.rowCount) {
          skipped.push(`${r.fullName} (${r.phone}) — already on the register`);
          continue;
        }
        await c.query(
          `INSERT INTO guardian (full_name, phone, email, relationship)
           VALUES ($1, $2, $3, $4)`,
          [r.fullName, phone, r.email || null, r.relationship],
        );
        imported++;
      }
      await c.query(
        `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
         VALUES ($1, 'staff', 'guardian.import', 'guardian', $2, $3)`,
        [principal.userId, String(imported), JSON.stringify({ imported, attempted: rows.length })],
      );
      return { ok: true as const, imported, skipped };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  });
}

// ---------------------------------------------------------------------------
// School-wide search (topbar) + the bell (real notification counts)
// ---------------------------------------------------------------------------

export interface SearchHit {
  kind: "learner" | "staff" | "guardian" | "receipt";
  label: string;
  meta: string;
  href: string;
}

/** Trigram-backed school-wide search; every hit carries the page to open. */
export async function schoolSearch(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  q: string,
  limit = 8,
): Promise<SearchHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const like = `%${term.toLowerCase()}%`;
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const learners = await c.query<{ label: string; meta: string; href: string }>(
      `SELECT l.first_name || ' ' || l.last_name AS label,
              COALESCE(cl.name, '·') || ' · ' || l.admission_no AS meta,
              '/app/people#learners' AS href
       FROM learner l LEFT JOIN class cl ON cl.id = l.class_id
       WHERE l.search_name LIKE $1 LIMIT $2`,
      [like, limit],
    );
    const staff = await c.query<{ label: string; meta: string; href: string }>(
      `SELECT full_name AS label, role || ' · staff' AS meta, '/app/people#staff' AS href
       FROM staff WHERE lower(full_name) LIKE $1 LIMIT $2`,
      [like, limit],
    );
    const guardians = await c.query<{ label: string; meta: string; href: string }>(
      `SELECT full_name AS label, 'guardian · ' || COALESCE(phone, '—') AS meta, '/app/people#guardians' AS href
       FROM guardian WHERE lower(full_name) LIKE $1 LIMIT $2`,
      [like, limit],
    );
    const receipts = await c.query<{ label: string; meta: string; href: string }>(
      `SELECT p.receipt_no AS label,
              l.first_name || ' ' || l.last_name || ' · ' || p.state::text AS meta,
              '/app/money' AS href
       FROM payments p JOIN learner l ON l.id = p.learner_id
       WHERE lower(p.receipt_no) LIKE $1 LIMIT $2`,
      [like, limit],
    );
    return [
      ...learners.rows.map((r) => ({ ...r, kind: "learner" as const })),
      ...staff.rows.map((r) => ({ ...r, kind: "staff" as const })),
      ...guardians.rows.map((r) => ({ ...r, kind: "guardian" as const })),
      ...receipts.rows.map((r) => ({ ...r, kind: "receipt" as const })),
    ].slice(0, limit);
  });
}

export interface BellState {
  pending_payments: number;
  announcements_7d: number;
  audit_7d: number;
}

/** The bell's real counts — the dot only shows when work is waiting. */
export async function bellState(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<BellState> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ pending: string; ann: string; audit: string }>(
      `SELECT
         (SELECT COUNT(*) FROM payments WHERE state = 'pending')::text AS pending,
         (SELECT COUNT(*) FROM announcement WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::text AS ann,
         (SELECT COUNT(*) FROM audit_log WHERE at >= CURRENT_DATE - INTERVAL '7 days')::text AS audit`,
    );
    return {
      pending_payments: Number(r.rows[0]!.pending),
      announcements_7d: Number(r.rows[0]!.ann),
      audit_7d: Number(r.rows[0]!.audit),
    };
  });
}

// ---------------------------------------------------------------------------
// Curriculum Setup (16) - the UI over pack migrations 008-010, with the
// curriculum-context resolver (docs/CURRICULUM-ARCHITECTURE.md 4.2): ONE
// join chain returning vocab + flags + areas tree; every classroom form
// renders from this, never from per-curriculum components.
// ---------------------------------------------------------------------------

export interface CurriculumVocab {
  learner_label: string;
  level_label: string;
  area_label: string;
  unit_label: string | null;
  subunit_label: string | null;
}

export interface CurriculumFlags {
  has_strands: boolean;
  has_pathways: boolean;
  has_coursework: boolean;
  marks_range: [number, number] | null;
}

export interface AreaNode {
  id: number;
  code: string;
  name: string;
  pathway: string | null;
  children: { id: number; code: string; name: string }[];
}

export interface CurriculumContext {
  curriculum_id: number;
  code: string;
  name: string;
  vocab: CurriculumVocab;
  scheme_code: string;
  scheme_name: string;
  scale: { k: string; name?: string; min?: number }[];
  flags: CurriculumFlags;
  areas: AreaNode[];
}

export async function curriculumContext(dbName: string, classId: number): Promise<CurriculumContext | null> {
  const db = getSchoolPool(dbName);
  const r = await db.query<{
    curriculum_id: number; code: string; name: string; vocab: CurriculumVocab;
    scheme_code: string; scheme_name: string; scale: CurriculumContext["scale"];
  }>(
    `SELECT cu.id AS curriculum_id, cu.code, cu.name, cu.vocab,
            s.code AS scheme_code, s.name AS scheme_name, s.scale
     FROM class c
     JOIN curriculum_level l ON l.id = c.level_id
     JOIN curriculum cu ON cu.id = l.curriculum_id
     LEFT JOIN assessment_scheme s ON s.id = (
       SELECT s2.id FROM assessment_scheme s2
       WHERE s2.curriculum_id = cu.id ORDER BY s2.id LIMIT 1)
     WHERE c.id = $1`,
    [classId],
  );
  if (!r.rowCount) return null;
  const row = r.rows[0]!;
  const areas = await db.query<{ id: number; code: string; name: string; pathway: string | null; parent_id: number | null }>(
    `SELECT id, code, name, pathway, parent_id FROM learning_area WHERE level_id IN (
       SELECT id FROM curriculum_level WHERE curriculum_id = $1)
     ORDER BY id`,
    [row.curriculum_id],
  );
  const tree: AreaNode[] = [];
  const byId = new Map<number, AreaNode>();
  for (const a of areas.rows) {
    byId.set(a.id, { id: a.id, code: a.code, name: a.name, pathway: a.pathway, children: [] });
  }
  for (const a of areas.rows) {
    if (a.parent_id) byId.get(a.parent_id)?.children.push({ id: a.id, code: a.code, name: a.name });
    else if (byId.has(a.id)) tree.push(byId.get(a.id)!);
  }
  // Flags computed from pack data, never from curriculum-code ifs:
  const strandCount = areas.rows.filter((a) => a.parent_id !== null).length;
  const pathwayCount = areas.rows.filter((a) => a.pathway !== null).length;
  const scale = row.scale ?? [];
  const mins = scale.map((s) => s.min).filter((m): m is number => typeof m === "number");
  const marksRange = mins.length > 0 ? ([Math.min(...mins), Math.max(...mins)] as [number, number]) : null;
  return {
    curriculum_id: row.curriculum_id,
    code: row.code,
    name: row.name,
    vocab: {
      learner_label: row.vocab?.learner_label ?? "Learner",
      level_label: row.vocab?.level_label ?? "Grade",
      area_label: row.vocab?.area_label ?? "Learning Area",
      unit_label: row.vocab?.unit_label ?? null,
      subunit_label: row.vocab?.subunit_label ?? null,
    },
    scheme_code: row.scheme_code ?? "cbc-sba",
    scheme_name: row.scheme_name ?? "CBE day-to-day (BE / AE / ME / EE)",
    scale,
    flags: {
      has_strands: strandCount > 0,
      has_pathways: pathwayCount > 0,
      // Cambridge-style component split: a scheme carrying named bands with
      // coursework in the name; pack data decides, not code.
      has_coursework: /coursework/i.test(row.scheme_name ?? ""),
      marks_range: marksRange,
    },
    areas: tree,
  };
}

export interface CurriculumPackRow {
  id: number; code: string; name: string; enabled: boolean; is_default: boolean;
  level_count: number; area_count: number; class_count: number;
  scheme: string | null; vocab: CurriculumVocab | null;
}

export async function listCurriculumPacks(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{
  packs: CurriculumPackRow[];
  classes: { id: number; name: string; level_code: string | null; curriculum_code: string | null }[];
  ladder: Record<string, { label: string; levels: { id: number; code: string; label: string }[] }>;
}> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const packs = await c.query<CurriculumPackRow>(
      `SELECT cu.id, cu.code, cu.name, cu.enabled, cu.is_default,
              (SELECT count(*) FROM curriculum_level l WHERE l.curriculum_id = cu.id)::int AS level_count,
              (SELECT count(*) FROM learning_area a WHERE a.curriculum_id = cu.id)::int AS area_count,
              (SELECT count(*) FROM class cl JOIN curriculum_level l2 ON l2.id = cl.level_id
               WHERE l2.curriculum_id = cu.id)::int AS class_count,
              (SELECT s.name FROM assessment_scheme s WHERE s.curriculum_id = cu.id ORDER BY s.id LIMIT 1) AS scheme,
              cu.vocab
       FROM curriculum cu ORDER BY cu.id`,
    );
    const classes = await c.query<{ id: number; name: string; level_code: string | null; curriculum_code: string | null }>(
      `SELECT cl.id, cl.name, l.code AS level_code, cu.code AS curriculum_code
       FROM class cl
       LEFT JOIN curriculum_level l ON l.id = cl.level_id
       LEFT JOIN curriculum cu ON cu.id = l.curriculum_id
       ORDER BY cl.name`,
    );
    const ladderRows = await c.query<{ curriculum_code: string; curriculum_name: string; id: number; code: string; label: string; seq: number }>(
      `SELECT cu.code AS curriculum_code, cu.name AS curriculum_name, l.id, l.code, l.label, l.seq
       FROM curriculum_level l
       JOIN curriculum cu ON cu.id = l.curriculum_id
       WHERE cu.enabled = true
       ORDER BY cu.code, l.seq`,
    );
    const ladder: Record<string, { label: string; levels: { id: number; code: string; label: string }[] }> = {};
    for (const r of ladderRows.rows) {
      (ladder[r.curriculum_code] ??= { label: r.curriculum_name, levels: [] }).levels.push({ id: r.id, code: r.code, label: r.label });
    }
    return { packs: packs.rows, classes: classes.rows, ladder };
  });
}

/** Attach a class to a ladder position (16's one write that moves a class). Audited. */
export async function attachClassToLevel(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { classId: number; levelId: number },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const v = await c.query<{ cu: string; lvl: string }>(
      `SELECT cu.code AS cu, l.code AS lvl FROM curriculum_level l JOIN curriculum cu ON cu.id = l.curriculum_id WHERE l.id = $1`,
      [input.levelId],
    );
    if (!v.rowCount) throw new Error("level not found");
    const r = await c.query<{ id: number }>(
      `UPDATE class SET level_id = $1 WHERE id = $2 RETURNING id`,
      [input.levelId, input.classId],
    );
    if (!r.rowCount) throw new Error("class not found");
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'curriculum.class.attach', 'class', $2, $3)`,
      [principal.userId, String(input.classId), JSON.stringify({ level_id: input.levelId, curriculum: v.rows[0]!.cu, level: v.rows[0]!.lvl })],
    );
    return { ok: true as const };
  });
}

/** Enable/disable a pack or set the default (16). The default flips atomically. Audited. */
export async function setCurriculumPack(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { code: string; enabled?: boolean; makeDefault?: boolean },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const cur = await c.query<{ id: number; name: string }>(`SELECT id, name FROM curriculum WHERE code = $1`, [input.code]);
    if (!cur.rowCount) throw new Error("curriculum not found");
    if (input.makeDefault) {
      await c.query(`UPDATE curriculum SET is_default = false WHERE is_default = true`);
      await c.query(`UPDATE curriculum SET is_default = true, enabled = true WHERE code = $1`, [input.code]);
    } else if (typeof input.enabled === "boolean") {
      const has = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM class cl JOIN curriculum_level l ON l.id = cl.level_id
         WHERE l.curriculum_id = $1`,
        [cur.rows[0]!.id],
      );
      if (!input.enabled && Number(has.rows[0]!.n) > 0) {
        throw new Error(`${cur.rows[0]!.name} still has classes attached - move them first`);
      }
      await c.query(`UPDATE curriculum SET enabled = $1 WHERE code = $2`, [input.enabled, input.code]);
    }
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'curriculum.pack.set', 'curriculum', $2, $3)`,
      [principal.userId, String(cur.rows[0]!.id), JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// Admissions (3) - the front desk funnel: inquiry -> visit -> assessment ->
// offered -> enrolled (or lost). Stage moves are audited; the CONVERSION is
// the big one: mints the next admission number and auto-links siblings by
// parent phone (the same phone = the same family, FEE-REALITY-CHECK).
// ---------------------------------------------------------------------------

export interface InquiryRow {
  id: string; child_first: string; child_middle: string | null; child_last: string;
  parent_name: string; phone: string; level_interest: string | null;
  curriculum_code: string | null; source: string; stage: string;
  notes: string | null; next_followup_on: string | null;
  learner_id: string | null; admission_no: string | null;
  created_at: string; siblings: number;
}

export async function listInquiries(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ rows: InquiryRow[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const rows = await c.query<InquiryRow>(
      `SELECT i.id::text, i.child_first, i.child_middle, i.child_last,
              i.parent_name, i.phone, i.level_interest, i.curriculum_code,
              i.source, i.stage::text AS stage, i.notes,
              i.next_followup_on::text, i.learner_id::text, i.admission_no,
              i.created_at::text,
              (SELECT count(*)::int FROM admission_inquiry s2
               WHERE s2.phone = i.phone AND s2.id <> i.id
                 AND (s2.learner_id IS NOT NULL OR i.learner_id IS NOT NULL))::int
                 + CASE WHEN i.learner_id IS NOT NULL THEN 1 ELSE 0 END
                 + (SELECT count(*)::int FROM learner_guardian lg
                    JOIN guardian g ON g.id = lg.guardian_id
                    WHERE g.phone = i.phone) AS siblings
       FROM admission_inquiry i
       ORDER BY i.created_at DESC`,
    );
    return { rows: rows.rows };
  });
}

export async function createInquiry(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: {
    childFirst: string; childMiddle?: string; childLast: string; childDob?: string;
    gender?: string; parentName: string; phone: string; email?: string;
    levelInterest?: string; curriculumCode?: string; source: string;
    notes?: string; nextFollowupOn?: string;
  },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const phone = input.phone.replace(/\s+/g, "");
    if (!/^\+?\d{10,14}$/.test(phone)) throw new Error("phone must be 10-14 digits (e.g. 2547XXXXXXXX)");
    const r = await c.query<{ id: string }>(
      `INSERT INTO admission_inquiry
         (child_first, child_middle, child_last, child_dob, gender,
          parent_name, phone, email, level_interest, curriculum_code, source, notes, next_followup_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id::text`,
      [input.childFirst, input.childMiddle ?? null, input.childLast, input.childDob ?? null,
       input.gender ?? null, input.parentName, phone, input.email ?? null,
       input.levelInterest ?? null, input.curriculumCode ?? null, input.source,
       input.notes ?? null, input.nextFollowupOn ?? null],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'admission.inquiry.create', 'admission_inquiry', $2, $3)`,
      [principal.userId, r.rows[0]!.id, JSON.stringify({ child: `${input.childFirst} ${input.childLast}`, phone })],
    );
    return { ok: true as const };
  });
}

export async function moveInquiryStage(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string; stage: string },
): Promise<{ ok: true }> {
  const allowed = ["inquiry", "visit", "assessment", "offered", "enrolled", "lost"];
  if (!allowed.includes(input.stage)) throw new Error("unknown stage");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const cur = await c.query<{ stage: string; learner_id: string | null }>(
      `SELECT stage::text AS stage, learner_id::text FROM admission_inquiry WHERE id = $1`,
      [input.id],
    );
    if (!cur.rowCount) throw new Error("inquiry not found");
    if (cur.rows[0]!.learner_id) throw new Error("already enrolled - the learner exists");
    await c.query(`UPDATE admission_inquiry SET stage = $1::admission_stage WHERE id = $2`, [input.stage, input.id]);
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, before, after)
       VALUES ($1, 'staff', 'admission.stage.move', 'admission_inquiry', $2, $3, $4)`,
      [principal.userId, input.id, JSON.stringify({ stage: cur.rows[0]!.stage }), JSON.stringify({ stage: input.stage })],
    );
    return { ok: true as const };
  });
}

export async function convertInquiry(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string; classId: number | null; boarding: boolean },
): Promise<{ ok: true; admissionNo: string; learnerId: string; siblingsLinked: number }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const inq = await c.query<{
      child_first: string; child_middle: string | null; child_last: string;
      child_dob: string | null; gender: string | null; parent_name: string;
      phone: string; learner_id: string | null; stage: string;
    }>(
      `SELECT child_first, child_middle, child_last, child_dob::text, gender,
              parent_name, phone, learner_id::text, stage::text AS stage
       FROM admission_inquiry WHERE id = $1 FOR UPDATE`,
      [input.id],
    );
    if (!inq.rowCount) throw new Error("inquiry not found");
    const q = inq.rows[0]!;
    if (q.learner_id) throw new Error("already enrolled");

    // Mint the next admission number: max numeric tail + 1 (ADM-013 -> ADM-014).
    const next = await c.query<{ adm: string }>(
      `SELECT 'ADM-' || lpad((coalesce(max(nullif(regexp_replace(admission_no, '\\D', '', 'g'), '')::bigint), 0::bigint) + 1)::text, 3, '0') AS adm
       FROM learner`,
    );
    const admNo = next.rows[0]!.adm;

    const learner = await c.query<{ id: string }>(
      `INSERT INTO learner (admission_no, first_name, middle_name, last_name, gender, date_of_birth, class_id, status, boarding)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8) RETURNING id::text`,
      [admNo, q.child_first, q.child_middle, q.child_last, q.gender, q.child_dob, input.classId, input.boarding],
    );
    const learnerId = learner.rows[0]!.id;

    // Sibling auto-link: the SAME parent phone already in the guardian table
    // becomes this child's guardian; the admission form never re-types a family.
    const sib = await c.query<{ guardian_id: string; n: string }>(
      `SELECT g.id::text AS guardian_id,
              (SELECT count(*)::text FROM learner_guardian lg2 WHERE lg2.guardian_id = g.id) AS n
       FROM guardian g WHERE g.phone = $1 AND g.active = true LIMIT 1`,
      [q.phone],
    );
    let siblingsLinked = 0;
    if (sib.rowCount) {
      await c.query(
        `INSERT INTO learner_guardian (learner_id, guardian_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [learnerId, sib.rows[0]!.guardian_id],
      );
      siblingsLinked = Number(sib.rows[0]!.n);
    }

    await c.query(
      `UPDATE admission_inquiry
       SET stage = 'enrolled', learner_id = $1, admission_no = $2, converted_at = now()
       WHERE id = $3`,
      [learnerId, admNo, input.id],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'admission.convert', 'admission_inquiry', $2, $3)`,
      [principal.userId, input.id,
       JSON.stringify({ admission_no: admNo, learner_id: learnerId, siblings_linked: siblingsLinked, phone: q.phone })],
    );
    return { ok: true as const, admissionNo: admNo, learnerId, siblingsLinked };
  });
}

// ---------------------------------------------------------------------------
// Compliance Center (28) - every regulatory line on one screen with
// countdowns. KEMIS + TSC compute live from kemisReadiness(); licence lines
// live in compliance_line (018). This is the glance that turns data hygiene
// from chore into one screen (blueprint 632).
// ---------------------------------------------------------------------------

export interface ComplianceRollup {
  lines: {
    key: string;
    label: string;
    pct: number | null;      // null = manual line (no auto computation)
    done: boolean;
    due_date: string | null;
    days_left: number | null;
    note: string | null;
    fix: { label: string; href: string } | null;   // deep-link into the owning module
  }[];
  worst_pct: number;         // the headline meter: your compliance floor
  next_deadline: { label: string; due_date: string; days_left: number } | null;
}

export async function complianceRollup(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<ComplianceRollup> {
  const kemis = await kemisReadiness(dbName, principal);
  const lines = await withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) =>
    c.query<{ key: string; label: string; due_date: string | null; note: string | null; done: boolean; position: number }>(
      `SELECT key, label, due_date::text, note, done, position FROM compliance_line ORDER BY position`,
    ),
  );

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  function daysLeft(due: string | null): number | null {
    if (!due) return null;
    return Math.ceil((new Date(due + "T00:00:00").getTime() - new Date(todayStr + "T00:00:00").getTime()) / 86_400_000);
  }

  const kemisL = kemis.learners;
  const kemisPct = kemisL.total === 0 ? 100 : Math.round(
    ((kemisL.with_upi + kemisL.with_birth_cert + kemisL.with_guardian + kemisL.with_dob) / (kemisL.total * 4)) * 100,
  );
  const staffT = kemis.staff.total;
  const tscPct = staffT === 0 ? 100 : Math.round(
    ((kemis.staff.with_national_id + kemis.staff.with_tsc) / (staffT * 2)) * 100,
  );

  const out: ComplianceRollup["lines"] = [];
  for (const l of lines.rows) {
    let pct: number | null = null;
    let fix: ComplianceRollup["lines"][number]["fix"] = null;
    if (l.key === "kemis-registration") {
      pct = kemisPct;
      fix = kemisL.total - kemisL.with_upi > 0
        ? { label: `Fix ${kemis.missing_learners.length} learner ${kemis.missing_learners.length === 1 ? "record" : "records"}`, href: "/app/people/exam-entries" }
        : null;
    } else if (l.key === "tsc-registration") {
      pct = tscPct;
      fix = kemis.missing_staff.length > 0
        ? { label: `Fix ${kemis.missing_staff.length} staff ${kemis.missing_staff.length === 1 ? "record" : "records"}`, href: "/app/people/staff" }
        : null;
    } else if (l.key === "county-licence") {
      fix = { label: "Update school details", href: "/app/settings#profile" };
    }
    out.push({
      key: l.key,
      label: l.label,
      pct,
      done: l.done,
      due_date: l.due_date,
      days_left: daysLeft(l.due_date),
      note: l.note,
      fix,
    });
  }

  const pctLines = out.filter((l) => l.pct !== null);
  const worst = pctLines.length > 0 ? Math.min(...pctLines.map((l) => l.pct!)) : 100;
  const upcoming = out
    .filter((l) => l.due_date && l.days_left !== null && !l.done)
    .sort((a, b) => a.days_left! - b.days_left!)[0];

  return {
    lines: out,
    worst_pct: worst,
    next_deadline: upcoming ? { label: upcoming.label, due_date: upcoming.due_date!, days_left: upcoming.days_left! } : null,
  };
}

/** Mark a manual compliance line done/undone, or move its due date. Audited. */
export async function updateComplianceLine(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { key: string; done?: boolean; dueDate?: string | null },
): Promise<{ ok: true }> {
  if (principal.role !== "admin" && principal.role !== "principal") {
    throw new Error("only the admin or principal can update the compliance checklist");
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const cur = await c.query<{ id: number; done: boolean; due_date: string | null }>(
      `SELECT id, done, due_date::text FROM compliance_line WHERE key = $1`,
      [input.key],
    );
    if (!cur.rowCount) throw new Error("unknown compliance line");
    if (typeof input.done === "boolean") {
      await c.query(`UPDATE compliance_line SET done = $1 WHERE id = $2`, [input.done, cur.rows[0]!.id]);
    }
    if (input.dueDate !== undefined) {
      if (input.dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new Error("bad date");
      await c.query(`UPDATE compliance_line SET due_date = $1 WHERE id = $2`, [input.dueDate, cur.rows[0]!.id]);
    }
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, before, after)
       VALUES ($1, 'staff', 'compliance.line.update', 'compliance_line', $2, $3, $4)`,
      [principal.userId, String(cur.rows[0]!.id),
       JSON.stringify({ done: cur.rows[0]!.done, due: cur.rows[0]!.due_date }),
       JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

/**
 * The 32-parked DECISION: data retention & backups policy (flank #8).
 * One documented choice, editable, shown on Settings - not a silent default.
 */
export interface RetentionPolicy {
  audit_retention: string;    // always 'forever' - the tamper-evident trail
  backups: string;            // human description of the backup regime
  export_window_days: number; // one-click export covers this much
}

export async function getRetentionPolicy(dbName: string): Promise<RetentionPolicy> {
  const db = getSchoolPool(dbName);
  const r = await db.query<{ retention_json: unknown }>(
    `SELECT (theme_json -> 'retention') AS retention_json FROM school_settings WHERE id = 'default'`,
  );
  const stored = (r.rows[0]?.retention_json ?? null) as Partial<RetentionPolicy> | null;
  return {
    audit_retention: stored?.audit_retention ?? "forever",
    backups: stored?.backups ?? "Daily snapshot, kept 30 days; weekly kept 1 year.",
    export_window_days: stored?.export_window_days ?? 3650,
  };
}

export async function setRetentionPolicy(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { backups: string; exportWindowDays: number },
): Promise<{ ok: true }> {
  if (principal.role !== "admin" && principal.role !== "principal") {
    throw new Error("only the admin or principal can change the retention policy");
  }
  const db = getSchoolPool(dbName);
  const cur = await db.query<{ retention: unknown }>(
    `SELECT theme_json -> 'retention' AS retention FROM school_settings WHERE id = 'default'`,
  );
  const next = {
    ...((cur.rows[0]?.retention ?? {}) as object),
    audit_retention: "forever",
    backups: input.backups.slice(0, 300),
    export_window_days: Math.max(30, Math.min(36500, input.exportWindowDays)),
  };
  await db.query(
    `UPDATE school_settings SET theme_json = jsonb_set(theme_json, '{retention}', $1::jsonb), updated_at = now() WHERE id = 'default'`,
    [JSON.stringify(next)],
  );
  await db.query(
    `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
     VALUES ($1, 'staff', 'settings.retention.set', 'school_settings', 'default', $2)`,
    [principal.userId, JSON.stringify(next)],
  );
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Approvals Inbox (36) + Tasks (37) - Phase 2 opening pair. The two-leaders
// model's hinge: requests wait in ONE queue; decisions carry a MANDATORY
// reason and are audited with before/after. Tasks: any module can emit one;
// done/cancel are audited too.
// ---------------------------------------------------------------------------

export interface ApprovalRow {
  id: string;
  request_type: string;
  requester: string;
  requester_role: string;
  payload: { amount_cents?: number; about?: string; note?: string };
  state: string;
  decided_by: string | null;
  decision_reason: string;
  decided_at: string | null;
  created_at: string;
  age_days: number;
}

export async function listApprovals(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ pending: ApprovalRow[]; decided: ApprovalRow[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const q = `
      SELECT a.id::text, a.request_type, r.full_name AS requester, r.role::text AS requester_role,
             a.payload, a.state::text AS state, d.full_name AS decided_by,
             a.decision_reason, a.decided_at::text, a.created_at::text,
             (CURRENT_DATE - a.created_at::date) AS age_days
       FROM approval_request a
       JOIN staff r ON r.id = a.requester_id
       LEFT JOIN staff d ON d.id = a.decided_by`;
    const pending = await c.query<ApprovalRow>(`${q} WHERE a.state = 'pending' ORDER BY a.created_at ASC`);
    const decided = await c.query<ApprovalRow>(`${q} WHERE a.state <> 'pending' ORDER BY a.decided_at DESC LIMIT 30`);
    return { pending: pending.rows, decided: decided.rows };
  });
}

export async function raiseApproval(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { requestType: string; about?: string; note?: string; amountCents?: number },
): Promise<{ ok: true }> {
  const allowed = ["fee-waiver", "purchase", "leave", "route-add", "write-off", "other"];
  if (!allowed.includes(input.requestType)) throw new Error("unknown request type");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const payload: { about?: string; note?: string; amount_cents?: number } = {};
    if (input.about) payload.about = input.about.slice(0, 200);
    if (input.note) payload.note = input.note.slice(0, 500);
    if (typeof input.amountCents === "number") payload.amount_cents = input.amountCents;
    const ins = await c.query(
      `INSERT INTO approval_request (request_type, requester_id, approver_role, payload)
       VALUES ($1, $2, $3, $4) RETURNING id::text`,
      [input.requestType, principal.userId, principal.role === "admin" ? "principal" : "admin", JSON.stringify(payload)],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'approval.raise', 'approval_request', $2, $3)`,
      [principal.userId, input.requestType, JSON.stringify({ type: input.requestType, ...payload })],
    );
    return { ok: true as const, id: ins.rows[0]!.id };
  });
}

export async function decideApproval(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string; decision: "approved" | "rejected"; reason: string },
): Promise<{ ok: true }> {
  // The mandatory-reason law: no decision without words behind it.
  if (input.reason.trim().length < 4) throw new Error("a reason is required for every decision");
  if (principal.role !== "admin" && principal.role !== "principal") {
    throw new Error("only the admin or principal can decide requests");
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const cur = await c.query<{ state: string; request_type: string; requester_id: string }>(
      `SELECT state::text AS state, request_type, requester_id::text FROM approval_request WHERE id = $1 FOR UPDATE`,
      [input.id],
    );
    if (!cur.rowCount) throw new Error("request not found");
    if (cur.rows[0]!.state !== "pending") throw new Error(`already ${cur.rows[0]!.state}`);
    if (cur.rows[0]!.requester_id === principal.userId) throw new Error("you cannot decide your own request");
    await c.query(
      `UPDATE approval_request
       SET state = $1::approval_state, decided_by = $2, decision_reason = $3, decided_at = now()
       WHERE id = $4`,
      [input.decision, principal.userId, input.reason.trim().slice(0, 500), input.id],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, before, after)
       VALUES ($1, 'staff', 'approval.decide', 'approval_request', $2, $3, $4)`,
      [principal.userId, input.id,
       JSON.stringify({ state: "pending" }),
       JSON.stringify({ state: input.decision, type: cur.rows[0]!.request_type, reason: input.reason.trim().slice(0, 200) })],
    );
    return { ok: true as const };
  });
}

export interface TaskRow {
  id: string;
  title: string;
  detail: string | null;
  source: string;
  source_link: string | null;
  assignee: string | null;
  due_on: string | null;
  days_left: number | null;
  state: string;
  created_at: string;
}

export async function listTasks(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ open: TaskRow[]; done: TaskRow[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const q = `
      SELECT t.id::text, t.title, t.detail, t.source, t.source_link,
             s.full_name AS assignee, t.due_on::text,
             (t.due_on - CURRENT_DATE) AS days_left,
             t.state::text AS state, t.created_at::text
       FROM admin_task t LEFT JOIN staff s ON s.id = t.assignee_id`;
    const open = await c.query<TaskRow>(`${q} WHERE t.state = 'open' ORDER BY t.due_on ASC NULLS LAST, t.created_at ASC`);
    const done = await c.query<TaskRow>(
      `${q} WHERE t.state <> 'open' AND t.done_at >= CURRENT_DATE - INTERVAL '7 days'
       ORDER BY t.done_at DESC LIMIT 20`,
    );
    return { open: open.rows, done: done.rows };
  });
}

export async function createTask(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { title: string; detail?: string; source?: string; sourceLink?: string; assigneeId?: string; dueOn?: string },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO admin_task (title, detail, source, source_link, assignee_id, due_on, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [input.title.slice(0, 160), input.detail?.slice(0, 500) ?? null,
       input.source ?? "manual", input.sourceLink ?? null,
       input.assigneeId ?? null, input.dueOn ?? null, principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'task.create', 'admin_task', $2, $3)`,
      [principal.userId, input.source ?? "manual", JSON.stringify({ title: input.title.slice(0, 120), due: input.dueOn ?? null })],
    );
    return { ok: true as const };
  });
}

export async function completeTask(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string; state: "done" | "cancelled" },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const cur = await c.query<{ state: string; title: string }>(
      `SELECT state::text AS state, title FROM admin_task WHERE id = $1`,
      [input.id],
    );
    if (!cur.rowCount) throw new Error("task not found");
    if (cur.rows[0]!.state !== "open") throw new Error(`already ${cur.rows[0]!.state}`);
    await c.query(
      `UPDATE admin_task SET state = $1::task_state, done_by = $2, done_at = now() WHERE id = $3`,
      [input.state, principal.userId, input.id],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'task.complete', 'admin_task', $2, $3)`,
      [principal.userId, input.state, JSON.stringify({ title: cur.rows[0]!.title.slice(0, 120) })],
    );
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// Payroll (7) - three staff populations, one system. Rates are versioned
// DATA (statutory_rates, seeded yearly by us); the run computes from active
// contracts, skips TSC-seconded staff WITH a reason, locks on approval
// (Approvals Inbox 36) and disburses however the school pays.
// ---------------------------------------------------------------------------

export interface ContractRow {
  id: string;
  staff_id: string;
  staff_name: string;
  staff_role: string;
  phone: string | null;
  population: string;
  basic_cents: string;
  frequency: string;
  allowances: Record<string, number>;
  effective_from: string;
  effective_to: string | null;
  active: boolean;
}

export async function listContracts(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ contracts: ContractRow[]; tscSeconded: { id: string; name: string; role: string; tsc_no: string | null }[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const contracts = await c.query<ContractRow>(
      `SELECT sc.id::text, sc.staff_id, s.full_name AS staff_name, s.role::text AS staff_role,
              s.phone, sc.population, sc.basic_cents::text, sc.frequency, sc.allowances,
              sc.effective_from::text, sc.effective_to::text, sc.active
       FROM staff_contract sc JOIN staff s ON s.id = sc.staff_id
       ORDER BY s.full_name`,
    );
    // Population 1: TSC-seconded (state-paid) - active teachers WITH a tsc_no
    // and NO active contract are the state's payroll, not the school's.
    const tsc = await c.query<{ id: string; name: string; role: string; tsc_no: string | null }>(
      `SELECT s.id::text, s.full_name AS name, s.role::text AS role, s.tsc_no
       FROM staff s
       WHERE s.active AND s.tsc_no IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM staff_contract sc WHERE sc.staff_id = s.id AND sc.active)
       ORDER BY s.full_name`,
    );
    return { contracts: contracts.rows, tscSeconded: tsc.rows };
  });
}

export async function upsertContract(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: {
    staffId: string; population: "bom" | "term"; basicCents: number;
    frequency: "monthly" | "termly"; allowances?: Record<string, number>;
    effectiveFrom: string;
  },
): Promise<{ ok: true }> {
  if (principal.role !== "admin" && principal.role !== "bursar") {
    throw new Error("only admin or bursar can manage contracts");
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    // One active contract per staff member.
    await c.query(
      `UPDATE staff_contract SET active = false, effective_to = CURRENT_DATE
       WHERE staff_id = $1 AND active`,
      [input.staffId],
    );
    const r = await c.query<{ id: string }>(
      `INSERT INTO staff_contract (staff_id, population, basic_cents, frequency, allowances, effective_from)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::text`,
      [input.staffId, input.population, input.basicCents, input.frequency,
       JSON.stringify(input.allowances ?? {}), input.effectiveFrom],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'payroll.contract.upsert', 'staff_contract', $2, $3)`,
      [principal.userId, r.rows[0]!.id,
       JSON.stringify({ staff: input.staffId, population: input.population, basic: input.basicCents })],
    );
    return { ok: true as const };
  });
}

/** The statutory engine - pure function over rate params. Annual PAYE / 12. */
function computeStatutory(
  gross: number,
  rates: { paye?: { bands: { up_to?: number; rate: number }[] }; relief?: { annual_cents: number }; shif?: { rate: number; min_cents: number }; housing?: { employee: number }; nssf?: { tier1: { up_to: number; rate: number }; tier2: { up_to: number; rate: number } } },
): { taxable: number; paye: number; relief: number; shif: number; housing: number; nssf: number } {
  const nssf = (() => {
    if (!rates.nssf) return 0;
    // ALL amounts are cents: caps seeded in cents, gross in cents.
    const t1 = Math.min(gross, rates.nssf.tier1.up_to) * rates.nssf.tier1.rate;
    const t2 = gross > rates.nssf.tier1.up_to
      ? (Math.min(gross, rates.nssf.tier2.up_to) - rates.nssf.tier1.up_to) * rates.nssf.tier2.rate
      : 0;
    return Math.round(t1 + t2);
  })();
  const taxable = Math.max(0, gross - nssf);
  const annualTaxable = taxable * 12;
  const paye = (() => {
    if (!rates.paye) return 0;
    let tax = 0, lower = 0;
    for (const b of rates.paye.bands) {
      const upper = b.up_to ?? Infinity;
      if (annualTaxable > lower) tax += (Math.min(annualTaxable, upper) - lower) * b.rate;
      lower = upper;
      if (annualTaxable <= upper) break;
    }
    return Math.max(0, Math.round(tax / 12));
  })();
  const relief = rates.relief ? Math.round(rates.relief.annual_cents / 12) : 0;
  const shif = rates.shif ? Math.max(rates.shif.min_cents, Math.round(gross * rates.shif.rate)) : 0;
  const housing = rates.housing ? Math.round(gross * rates.housing.employee) : 0;
  return { taxable, paye: Math.max(0, paye - relief), relief, shif, housing, nssf };
}

export interface PayrollRunRow {
  id: string;
  period: string;
  state: string;
  working_days: number;
  headcount: number;
  net_total_cents: string | null;
  skipped: number;
  computed_at: string | null;
  disbursed_at: string | null;
  disbursed_how: string | null;
}

export async function listPayrollRuns(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ runs: PayrollRunRow[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const runs = await c.query<PayrollRunRow>(
      `SELECT r.id::text, r.period, r.state::text AS state, r.working_days,
              (SELECT count(*)::int FROM payslip p WHERE p.run_id = r.id) AS headcount,
              (SELECT SUM(net_cents)::text FROM payslip p WHERE p.run_id = r.id) AS net_total_cents,
              r.computed_at::text, r.disbursed_at::text, r.disbursed_how,
              0 AS skipped
       FROM payroll_run r ORDER BY r.period DESC`,
    );
    return { runs: runs.rows };
  });
}

export interface SlipRow {
  id: string;
  staff_name: string;
  staff_role: string;
  population: string;
  phone: string | null;
  days_worked: number;
  basic_cents: string;
  allowances: Record<string, number>;
  gross_cents: string;
  paye_cents: string;
  shif_cents: string;
  housing_cents: string;
  nssf_cents: string;
  other_cents: string;
  net_cents: string;
}

export async function getPayrollRun(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  runId: string,
): Promise<{ run: PayrollRunRow; slips: SlipRow[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const run = await c.query<PayrollRunRow>(
      `SELECT r.id::text, r.period, r.state::text AS state, r.working_days,
              (SELECT count(*)::int FROM payslip p WHERE p.run_id = r.id) AS headcount,
              (SELECT SUM(net_cents)::text FROM payslip p WHERE p.run_id = r.id) AS net_total_cents,
              r.computed_at::text, r.disbursed_at::text, r.disbursed_how,
              0 AS skipped
       FROM payroll_run r WHERE r.id = $1`,
      [runId],
    );
    if (!run.rowCount) throw new Error("run not found");
    const slips = await c.query<SlipRow>(
      `SELECT p.id::text, s.full_name AS staff_name, s.role::text AS staff_role,
              sc.population, s.phone, p.days_worked, p.basic_cents::text,
              p.allowances, p.gross_cents::text, p.paye_cents::text,
              p.shif_cents::text, p.housing_cents::text, p.nssf_cents::text,
              p.other_cents::text, p.net_cents::text
       FROM payslip p JOIN staff s ON s.id = p.staff_id
       JOIN staff_contract sc ON sc.id = p.contract_id
       WHERE p.run_id = $1 ORDER BY s.full_name`,
      [runId],
    );
    return { run: run.rows[0]!, slips: slips.rows };
  });
}

export async function computePayrollRun(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { period: string; workingDays?: number },
): Promise<{ ok: true; runId: string; headcount: number }> {
  if (principal.role !== "admin" && principal.role !== "bursar") {
    throw new Error("only admin or bursar can run payroll");
  }
  if (!/^\d{4}-\d{2}$/.test(input.period)) throw new Error("period must look like 2026-09");
  const workingDays = input.workingDays ?? 26;
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    // One run per period.
    const existing = await c.query<{ id: string }>(`SELECT id::text FROM payroll_run WHERE period = $1`, [input.period]);
    if (existing.rowCount) throw new Error(`a run for ${input.period} already exists`);
    const run = await c.query<{ id: string }>(
      `INSERT INTO payroll_run (period, working_days, state, computed_at) VALUES ($1,$2,'computed', now()) RETURNING id::text`,
      [input.period, workingDays],
    );
    const runId = run.rows[0]!.id;
    const ratesRows = await c.query<{ kind: string; params: Record<string, unknown> }>(
      `SELECT kind, params FROM statutory_rates WHERE period = $1`,
      [input.period.slice(0, 4)],
    );
    if (ratesRows.rowCount === 0) throw new Error(`no statutory rates for ${input.period.slice(0, 4)} - they are seeded per year`);
    const rates: Record<string, Record<string, unknown>> = {};
    for (const r of ratesRows.rows) rates[r.kind] = r.params;

    const contracts = await c.query<{
      contract_id: string; staff_id: string; basic_cents: string; allowances: Record<string, number>; frequency: string;
    }>(
      `SELECT sc.id::text AS contract_id, sc.staff_id, sc.basic_cents::text, sc.allowances, sc.frequency
       FROM staff_contract sc
       WHERE sc.active AND (sc.effective_to IS NULL OR sc.effective_to >= CURRENT_DATE)`,
    );
    for (const ct of contracts.rows) {
      const basicFull = Number(ct.basic_cents);
      const basic = ct.frequency === "termly" ? Math.round(basicFull / 3) : basicFull;
      const allowanceTotal = Object.values(ct.allowances ?? {}).reduce((s, v) => s + Number(v), 0);
      const gross = basic + allowanceTotal;
      const st = computeStatutory(gross, rates as Parameters<typeof computeStatutory>[1]);
      await c.query(
        `INSERT INTO payslip (run_id, staff_id, contract_id, days_worked, basic_cents, allowances,
            gross_cents, taxable_cents, paye_cents, relief_cents, shif_cents, housing_cents, nssf_cents, net_cents)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [runId, ct.staff_id, ct.contract_id, workingDays, basic, JSON.stringify(ct.allowances ?? {}),
         gross, st.taxable, st.paye, st.relief, st.shif, st.housing, st.nssf,
         Math.max(0, gross - st.paye - st.shif - st.housing - st.nssf)],
      );
    }
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'payroll.run.compute', 'payroll_run', $2, $3)`,
      [principal.userId, runId, JSON.stringify({ period: input.period, headcount: contracts.rowCount })],
    );
    return { ok: true as const, runId, headcount: contracts.rowCount ?? 0 };
  });
}

/** Link a run to an approval_request (36) when the admin signs it off. */
export async function approvePayrollRun(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { runId: string; reason: string },
): Promise<{ ok: true }> {
  if (principal.role !== "admin") {
    throw new Error("only the admin signs off payroll - the bursar prepares, the admin approves");
  }
  if (input.reason.trim().length < 4) throw new Error("a reason is required");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const run = await c.query<{ state: string; period: string }>(
      `SELECT state::text AS state, period FROM payroll_run WHERE id = $1 FOR UPDATE`,
      [input.runId],
    );
    if (!run.rowCount) throw new Error("run not found");
    if (run.rows[0]!.state !== "computed") throw new Error(`run is ${run.rows[0]!.state} - compute it first`);
    // The approval lands in the Inbox's record too - one audit story.
    const appr = await c.query<{ id: string }>(
      `INSERT INTO approval_request (request_type, requester_id, approver_role, payload, state, decided_by, decision_reason, decided_at)
       VALUES ('other', $1, 'admin', $2, 'approved', $1, $3, now()) RETURNING id::text`,
      [principal.userId,
       JSON.stringify({ about: `Payroll ${run.rows[0]!.period} sign-off`, note: `Approves payroll run ${run.rows[0]!.period}` }),
       input.reason.trim().slice(0, 500)],
    );
    await c.query(
      `UPDATE payroll_run SET state = 'approved', approved_by = $1, approval_id = $2 WHERE id = $3`,
      [principal.userId, appr.rows[0]!.id, input.runId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'payroll.run.approve', 'payroll_run', $2, $3)`,
      [principal.userId, input.runId, JSON.stringify({ period: run.rows[0]!.period, reason: input.reason.trim().slice(0, 200) })],
    );
    return { ok: true as const };
  });
}

export async function disbursePayrollRun(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { runId: string; how: "bank-file" | "manual" | "mpesa" },
): Promise<{ ok: true; bankFile: string | null }> {
  if (principal.role !== "admin" && principal.role !== "bursar") {
    throw new Error("only admin or bursar disburse");
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const run = await c.query<{ state: string; period: string }>(
      `SELECT state::text AS state, period FROM payroll_run WHERE id = $1 FOR UPDATE`,
      [input.runId],
    );
    if (!run.rowCount) throw new Error("run not found");
    if (run.rows[0]!.state !== "approved") throw new Error("the admin must approve the run first - payslips lock on approval");
    // The bank bulk-upload assist: account-name, amount, narration rows.
    const rows = await c.query<{ staff_name: string; net_cents: string; phone: string | null }>(
      `SELECT s.full_name AS staff_name, p.net_cents::text, s.phone
       FROM payslip p JOIN staff s ON s.id = p.staff_id WHERE p.run_id = $1 ORDER BY s.full_name`,
      [input.runId],
    );
    let bankFile: string | null = null;
    if (input.how === "bank-file") {
      const head = "Account Name,Amount KES,Narration";
      const body = rows.rows
        .map((r) => `"${r.staff_name.replace(/"/g, '""')}",${(Number(r.net_cents) / 100).toFixed(2)},"Salary ${run.rows[0]!.period}"`)
        .join("\n");
      bankFile = `${head}\n${body}`;
    }
    await c.query(
      `UPDATE payroll_run SET state = 'disbursed', disbursed_at = now(), disbursed_how = $1 WHERE id = $2`,
      [input.how, input.runId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'payroll.run.disburse', 'payroll_run', $2, $3)`,
      [principal.userId, input.runId, JSON.stringify({ period: run.rows[0]!.period, how: input.how, headcount: rows.rowCount })],
    );
    return { ok: true as const, bankFile };
  });
}

// ---------------------------------------------------------------------------
// Money Rails (14) - the ASSIST layer. Daraja C2B callbacks and bank CSV
// statements land as SUGGESTIONS; the bursar confirms in one tap or keys
// by hand. The system must work with rails off - these rows are accelerators,
// never a replacement (the manual-first law).
// ---------------------------------------------------------------------------

export interface RailsSuggestionRow {
  id: string;
  source: string; // 'bank-csv' | 'daraja-c2b'
  payer_name: string | null;
  payer_ref: string | null;
  amount_cents: string;
  paid_on: string;
  suggested_learner_id: string | null;
  suggested_learner: string | null;
  match_score: string | null;
  match_reason: string | null;
  state: string;
}

export interface RailsOverview {
  suggestions: RailsSuggestionRow[];
  stats: { auto: number; suggested: number; unmatched: number; manualShare: number };
}

/**
 * The matching engine: an 8+ digit reference containing the learner's
 * admission number (case/space/punctuation-insensitive) is an exact match
 * (score 1.000). A payer name sharing 3+ consecutive letters with a learner
 * name is a weaker suggestion (0.600). Everything else is unmatched - the
 * bursar picks the learner by hand. Never auto-writes a payment.
 */
export function matchLearnerForRails(
  payerRef: string | null,
  payerName: string | null,
  learners: { id: string; name: string; admission_no: string }[],
): { learnerId: string | null; score: number | null; reason: string | null } {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (payerRef) {
    const ref = norm(payerRef);
    const digits = payerRef.replace(/\D/g, "");
    for (const l of learners) {
      const adm = norm(l.admission_no);
      if (adm.length >= 3 && ref.includes(adm)) {
        return { learnerId: l.id, score: 1, reason: `Admission no ${l.admission_no} in reference` };
      }
    }
    if (digits.length >= 8 && payerName) {
      for (const l of learners) {
        const ln = norm(l.name);
        const pn = norm(payerName);
        if (ln.length >= 3 && pn.length >= 3) {
          for (let i = 0; i + 3 <= ln.length; i++) {
            if (pn.includes(ln.slice(i, i + 3))) {
              return { learnerId: l.id, score: 0.6, reason: `Name fragment matches ${l.name}` };
            }
          }
        }
      }
    }
  }
  if (payerName) {
    const pn = norm(payerName);
    for (const l of learners) {
      const ln = norm(l.name);
      if (ln.length >= 3 && pn.length >= 3) {
        for (let i = 0; i + 3 <= ln.length; i++) {
          if (pn.includes(ln.slice(i, i + 3))) {
            return { learnerId: l.id, score: 0.6, reason: `Name fragment matches ${l.name}` };
          }
        }
      }
    }
  }
  return { learnerId: null, score: null, reason: null };
}

export async function listRailsSuggestions(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<RailsOverview> {
  if (principal.role !== "admin" && principal.role !== "bursar") {
    throw new Error("money rails is admin/bursar");
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const suggestions = await c.query<RailsSuggestionRow>(
      `SELECT r.id::text, r.source, r.payer_name, r.payer_ref, r.amount_cents::text,
              r.paid_on::text, r.suggested_learner_id::text,
              l.first_name || ' ' || l.last_name AS suggested_learner,
              r.match_score::text, r.match_reason, r.state
       FROM rails_match r
       LEFT JOIN learner l ON l.id = r.suggested_learner_id
       WHERE r.state = 'suggested'
       ORDER BY r.match_score DESC NULLS LAST, r.paid_on DESC LIMIT 100`,
    );
    // Manual-entry share (kept honestly visible): of all payments this term,
    // how many came by hand (no rails_match link) vs via rails.
    const manual = await c.query<{ total: string; via_rails: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(m.id)::text AS via_rails
       FROM payments p
       LEFT JOIN rails_match m ON m.payment_id = p.id
       WHERE p.state = 'confirmed'`,
    );
    const total = Number(manual.rows[0]!.total);
    const viaRails = Number(manual.rows[0]!.via_rails);
    const auto = suggestions.rows.filter((s) => Number(s.match_score) >= 1).length;
    return {
      suggestions: suggestions.rows,
      stats: {
        auto,
        suggested: suggestions.rows.filter((s) => Number(s.match_score) > 0 && Number(s.match_score) < 1).length,
        unmatched: suggestions.rows.filter((s) => s.suggested_learner_id == null).length,
        manualShare: total === 0 ? 100 : Math.round(((total - viaRails) / total) * 100),
      },
    };
  });
}

/**
 * Ingest a bank CSV: each row becomes a rails_match suggestion (with the
 * engine's best guess). Returns the import summary; nothing writes payments.
 */
export async function importBankCsv(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { fileName: string; rows: { payerName?: string; payerRef?: string; amountCents: number; paidOn: string }[] },
): Promise<{ ok: true; importId: string; rowCt: number }> {
  if (principal.role !== "admin" && principal.role !== "bursar") {
    throw new Error("money rails is admin/bursar");
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const learners = await c.query<{ id: string; name: string; admission_no: string }>(
      `SELECT id::text, first_name || ' ' || last_name AS name, admission_no FROM learner WHERE status = 'active'`,
    );
    const imp = await c.query<{ id: string }>(
      `INSERT INTO bank_csv_import (file_name, row_count, imported_by) VALUES ($1, $2, $3) RETURNING id::text`,
      [input.fileName, input.rows.length, principal.userId],
    );
    const importId = imp.rows[0]!.id;
    let ct = 0;
    for (const r of input.rows) {
      if (!r.amountCents || r.amountCents <= 0 || !r.paidOn) continue;
      const m = matchLearnerForRails(r.payerRef ?? null, r.payerName ?? null, learners.rows);
      await c.query(
        `INSERT INTO rails_match (source, import_id, payer_name, payer_ref, amount_cents, paid_on,
            suggested_learner_id, match_score, match_reason, created_by)
         VALUES ('bank-csv', $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [importId, r.payerName ?? null, r.payerRef ?? null, r.amountCents, r.paidOn,
         m.learnerId, m.score, m.reason, principal.userId],
      );
      ct++;
    }
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'rails.import', 'bank_csv_import', $2, $3)`,
      [principal.userId, importId, JSON.stringify({ fileName: input.fileName, rows: ct })],
    );
    return { ok: true as const, importId, rowCt: ct };
  });
}

/**
 * Confirm a suggestion into a real payment (pending -> bursar confirms money
 * in Confirm 9, or straight confirmed for daraja-c2b where the callback IS
 * the money). Audited; the rails row stamps the payment for the share stat.
 */
export async function confirmRailsSuggestion(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string; learnerId: string; method: string },
): Promise<{ ok: true; receiptNo: string }> {
  if (principal.role !== "admin" && principal.role !== "bursar") {
    throw new Error("money rails is admin/bursar");
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const s = await c.query<{
      id: string; amount_cents: string; paid_on: string; payer_ref: string | null; source: string; state: string;
    }>(
      `SELECT id::text, amount_cents::text, paid_on::text, payer_ref, source, state
       FROM rails_match WHERE id = $1 FOR UPDATE`,
      [input.id],
    );
    if (!s.rowCount) throw new Error("suggestion not found");
    if (s.rows[0]!.state !== "suggested") throw new Error(`suggestion already ${s.rows[0]!.state}`);
    const method = s.rows[0]!.source === "daraja-c2b" ? "mpesa" : input.method;
    const receipt = `R-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
    const pay = await c.query<{ receipt_no: string }>(
      `INSERT INTO payments (learner_id, amount, method, state, reference, receipt_no, recorded_by, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING receipt_no`,
      [input.learnerId, Number(s.rows[0]!.amount_cents), method,
       s.rows[0]!.source === "daraja-c2b" ? "confirmed" : "pending",
       s.rows[0]!.payer_ref, receipt, principal.userId, s.rows[0]!.paid_on],
    );
    await c.query(`UPDATE rails_match SET state = 'confirmed', payment_id = (SELECT id FROM payments WHERE receipt_no = $1) WHERE id = $2`,
      [pay.rows[0]!.receipt_no, input.id]);
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'rails.confirm', 'rails_match', $2, $3)`,
      [principal.userId, input.id, JSON.stringify({ receipt: pay.rows[0]!.receipt_no, learnerId: input.learnerId })],
    );
    return { ok: true as const, receiptNo: pay.rows[0]!.receipt_no };
  });
}

export async function dismissRailsSuggestion(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  id: string,
): Promise<{ ok: true }> {
  if (principal.role !== "admin" && principal.role !== "bursar") {
    throw new Error("money rails is admin/bursar");
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query(`UPDATE rails_match SET state = 'dismissed' WHERE id = $1 AND state = 'suggested'`, [id]);
    if (!r.rowCount) throw new Error("suggestion not found or already resolved");
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'rails.dismiss', 'rails_match', $2, $3)`,
      [principal.userId, id, JSON.stringify({ id })],
    );
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// Attendance Oversight (17) - admin sees the school-wide view; correction
// stays with the teacher. Today %, chronic absentees, per-class compare.
// ---------------------------------------------------------------------------

export interface AttendanceOversight {
  todayPct: number;
  todayMarked: number;
  todayTotal: number;
  trend7: { day: string; pct: number }[];
  chronic: { learner_id: string; learner: string; class_name: string | null; absences: number; days: number; pct: number }[];
  byClass: { class_id: number; class_name: string; pct: number; marked: number }[];
}

export async function attendanceOversight(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<AttendanceOversight> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const today = await c.query<{ present: string; total: string }>(
      `SELECT COUNT(*) FILTER (WHERE a.mark = 'present')::text AS present, COUNT(*)::text AS total
       FROM attendance a WHERE a.day = CURRENT_DATE`,
    );
    const trend = await c.query<{ day: string; pct: string }>(
      `SELECT day::text, ROUND(100.0 * COUNT(*) FILTER (WHERE mark = 'present') / GREATEST(COUNT(*), 1), 0)::text AS pct
       FROM attendance WHERE day > CURRENT_DATE - INTERVAL '7 days'
       GROUP BY day ORDER BY day`,
    );
    const chronic = await c.query<{
      learner_id: string; learner: string; class_name: string | null; absences: string; days: string; pct: string;
    }>(
      `SELECT l.id::text AS learner_id, l.first_name || ' ' || l.last_name AS learner, cl.name AS class_name,
              COUNT(*) FILTER (WHERE a.mark = 'absent')::text AS absences, COUNT(*)::text AS days,
              ROUND(100.0 * COUNT(*) FILTER (WHERE a.mark = 'absent') / GREATEST(COUNT(*), 1), 0)::text AS pct
       FROM attendance a
       JOIN learner l ON l.id = a.learner_id
       LEFT JOIN class cl ON cl.id = l.class_id
       WHERE a.day > CURRENT_DATE - INTERVAL '30 days'
       GROUP BY l.id, l.first_name, l.last_name, cl.name
       HAVING COUNT(*) FILTER (WHERE a.mark = 'absent') >= 3
       ORDER BY pct DESC LIMIT 20`,
    );
    const byClass = await c.query<{
      class_id: number; class_name: string; pct: string; marked: string;
    }>(
      `SELECT cl.id AS class_id, cl.name AS class_name,
              ROUND(100.0 * COUNT(*) FILTER (WHERE a.mark = 'present') / GREATEST(COUNT(*), 1), 0)::text AS pct,
              COUNT(*)::text AS marked
       FROM attendance a
       JOIN learner l ON l.id = a.learner_id
       JOIN class cl ON cl.id = l.class_id
       WHERE a.day > CURRENT_DATE - INTERVAL '7 days'
       GROUP BY cl.id, cl.name ORDER BY pct DESC`,
    );
    const t = today.rows[0]!;
    return {
      todayPct: Number(t.total) === 0 ? 0 : Math.round((Number(t.present) / Number(t.total)) * 100),
      todayMarked: Number(t.total),
      todayTotal: 0,
      trend7: trend.rows.map((r) => ({ day: r.day, pct: Number(r.pct) })),
      chronic: chronic.rows.map((r) => ({
        learner_id: r.learner_id, learner: r.learner, class_name: r.class_name,
        absences: Number(r.absences), days: Number(r.days), pct: Number(r.pct),
      })),
      byClass: byClass.rows.map((r) => ({ class_id: r.class_id, class_name: r.class_name, pct: Number(r.pct), marked: Number(r.marked) })),
    };
  });
}

// ---------------------------------------------------------------------------
// Exams & Report Cards (18) - capture coverage, approval queue, generation.
// The renderer is curriculum-adaptive: vocabulary + scale from the pack
// (resolver 16), never hardcoded.
// ---------------------------------------------------------------------------

export interface ExamCoverage {
  classes: { class_id: number; class_name: string; curriculum: string; learners: number; assessed: number; coveragePct: number }[];
  overallPct: number;
  pendingApprovals: { card_id: string; learner: string; class_name: string | null; term: string; state: string }[];
  recentCards: { card_id: string; learner: string; class_name: string | null; term: string; state: string; created_at: string }[];
}

export async function examCoverage(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<ExamCoverage> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const term = await c.query<{ id: number; label: string }>(`SELECT id, label FROM term ORDER BY starts_on DESC LIMIT 1`);
    if (!term.rowCount) throw new Error("no term exists");
    const termId = term.rows[0]!.id;
    // Teachers get the desk scoped to the classes they teach (timetable is the
    // source of truth); everyone else sees the whole school. A teacher with no
    // slots yet sees everything rather than an empty desk.
    const taught =
      principal.role === "teacher"
        ? await c.query<{ class_id: number }>(`SELECT DISTINCT class_id FROM timetable_slot WHERE teacher_id = $1`, [principal.userId])
        : { rows: [] as { class_id: number }[] };
    const taughtIds = taught.rows.map((r) => r.class_id);
    const scoped = principal.role === "teacher" && taughtIds.length > 0;
    const rows = await c.query<{
      class_id: number; class_name: string; curriculum: string; learners: string; assessed: string;
    }>(
      `SELECT cl.id AS class_id, cl.name AS class_name, COALESCE(cur.code, 'none') AS curriculum,
              (SELECT COUNT(*)::text FROM learner l WHERE l.class_id = cl.id AND l.status = 'active') AS learners,
              (SELECT COUNT(DISTINCT a.learner_id)::text FROM assessment a
               JOIN learner l2 ON l2.id = a.learner_id
               WHERE l2.class_id = cl.id AND a.term_id = $1) AS assessed
       FROM class cl
       LEFT JOIN curriculum_level lvl ON lvl.id = cl.level_id
       LEFT JOIN curriculum cur ON cur.id = lvl.curriculum_id
       ${scoped ? `WHERE cl.id = ANY($2)` : ""}
       ORDER BY cl.name`,
      scoped ? [termId, taughtIds] : [termId],
    );
    const pending = await c.query<{
      card_id: string; learner: string; class_name: string | null; term: string; state: string;
    }>(
      `SELECT rc.id::text AS card_id, l.first_name || ' ' || l.last_name AS learner, cl.name AS class_name,
              t.label AS term, rc.state::text
       FROM report_card rc
       JOIN learner l ON l.id = rc.learner_id
       LEFT JOIN class cl ON cl.id = rc.class_id
       JOIN term t ON t.id = rc.term_id
       WHERE rc.state = 'draft'${scoped ? ` AND rc.class_id = ANY($1)` : ""}
       ORDER BY rc.created_at DESC LIMIT 30`,
      scoped ? [taughtIds] : [],
    );
    // The manageable desk: recent cards in every state, so staff can find a
    // learner's card and filter by class — not just watch the draft queue.
    const recent = await c.query<{
      card_id: string; learner: string; class_name: string | null; term: string; state: string; created_at: string;
    }>(
      `SELECT rc.id::text AS card_id, l.first_name || ' ' || l.last_name AS learner, cl.name AS class_name,
              t.label AS term, rc.state::text AS state, rc.created_at::text AS created_at
       FROM report_card rc
       JOIN learner l ON l.id = rc.learner_id
       LEFT JOIN class cl ON cl.id = rc.class_id
       JOIN term t ON t.id = rc.term_id
       ${scoped ? `WHERE rc.class_id = ANY($1)` : ""}
       ORDER BY rc.created_at DESC LIMIT 60`,
      scoped ? [taughtIds] : [],
    );
    const classes = rows.rows.map((r) => ({
      class_id: r.class_id, class_name: r.class_name, curriculum: r.curriculum,
      learners: Number(r.learners), assessed: Number(r.assessed),
      coveragePct: Number(r.learners) === 0 ? 0 : Math.round((Number(r.assessed) / Number(r.learners)) * 100),
    }));
    const totalL = classes.reduce((s, x) => s + x.learners, 0);
    const totalA = classes.reduce((s, x) => s + x.assessed, 0);
    return {
      classes,
      overallPct: totalL === 0 ? 0 : Math.round((totalA / totalL) * 100),
      pendingApprovals: pending.rows,
      recentCards: recent.rows,
    };
  });
}

/** Generate (or regenerate) a report card: scores + attendance + adaptive scale. */
export async function generateReportCard(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { learnerId: string },
): Promise<{ ok: true; cardId: string }> {
  if (principal.role !== "admin" && principal.role !== "principal" && principal.role !== "teacher") {
    throw new Error("teachers and leadership generate report cards");
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const term = await c.query<{ id: number; label: string }>(`SELECT id, label FROM term ORDER BY starts_on DESC LIMIT 1`);
    if (!term.rowCount) throw new Error("no term exists");
    const termId = term.rows[0]!.id;
    const lr = await c.query<{ class_id: number | null }>(`SELECT class_id FROM learner WHERE id = $1`, [input.learnerId]);
    if (!lr.rowCount) throw new Error("learner not found");
    const classId = lr.rows[0]!.class_id;
    // Adaptive payload: vocabulary + scale come from the curriculum resolver.
    const ctx = classId ? await curriculumContext(dbName, classId) : null;
    const scores = await c.query<{ subject: string; strand: string | null; score: string | null; grade: string | null; exam_type: string }>(
      `SELECT subject, strand, score::text, grade::text, exam_type::text
       FROM assessment WHERE learner_id = $1 AND term_id = $2 ORDER BY subject, created_at`,
      [input.learnerId, termId],
    );
    const att = await c.query<{ present: string; total: string }>(
      `SELECT COUNT(*) FILTER (WHERE mark = 'present')::text AS present, COUNT(*)::text AS total
       FROM attendance WHERE learner_id = $1 AND day > CURRENT_DATE - INTERVAL '90 days'`,
      [input.learnerId],
    );
    const payload = {
      vocab: ctx?.vocab ?? null,
      scale: ctx?.scale ?? null,
      curriculum: ctx ? { code: ctx.code, name: ctx.name } : null,
      rows: scores.rows,
      attendance: { present: Number(att.rows[0]!.present), total: Number(att.rows[0]!.total) },
    };
    const card = await c.query<{ id: string }>(
      `INSERT INTO report_card (learner_id, term_id, class_id, payload, state, generated_by)
       VALUES ($1, $2, $3, $4, 'draft', $5)
       ON CONFLICT (learner_id, term_id) DO UPDATE
         SET payload = $4, generated_by = $5, created_at = now()
       RETURNING id::text`,
      [input.learnerId, termId, classId, JSON.stringify(payload), principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'reportcard.generate', 'report_card', $2, $3)`,
      [principal.userId, card.rows[0]!.id, JSON.stringify({ learnerId: input.learnerId, rows: scores.rowCount })],
    );
    return { ok: true as const, cardId: card.rows[0]!.id };
  });
}

export async function approveReportCard(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  cardId: string,
): Promise<{ ok: true }> {
  if (principal.role !== "admin" && principal.role !== "principal") {
    throw new Error("only principal or admin approve report cards");
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query(
      `UPDATE report_card SET state = 'approved', approved_by = $1, approved_at = now()
       WHERE id = $2 AND state = 'draft'`,
      [principal.userId, cardId],
    );
    if (!r.rowCount) throw new Error("card not found or already approved");
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'reportcard.approve', 'report_card', $2, $3)`,
      [principal.userId, cardId, JSON.stringify({ cardId })],
    );
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// Governance cluster: Users & Roles (33), Permissions Matrix (34),
// Duties & Appointments (35), Integrations (36). The matrix shapes nav and
// prompts ONLY - the hardcoded role checks stay as the security floor.
// ---------------------------------------------------------------------------

export interface UsersRolesData {
  users: { staff_id: string; name: string; role: string; email: string | null; active: boolean; member_since: string | null; duties: number }[];
}

export async function usersAndRoles(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<UsersRolesData> {
  if (principal.role !== "admin") throw new Error("users & roles is admin-only");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const rows = await c.query<{
      staff_id: string; name: string; role: string; email: string | null; active: boolean;
      member_since: string | null; duties: string;
    }>(
      `SELECT s.id::text AS staff_id, s.full_name AS name, s.role::text AS role, s.email, s.active,
              s.created_at::text AS member_since,
              (SELECT COUNT(*)::text FROM staff_duty d WHERE d.staff_id = s.id AND (d.effective_to IS NULL OR d.effective_to >= CURRENT_DATE)) AS duties
       FROM staff s ORDER BY s.role, s.full_name`
    );
    return { users: rows.rows.map((r) => ({ ...r, duties: Number(r.duties) })) };
  });
}

export async function changeUserRole(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { staffId: string; role: string },
): Promise<{ ok: true }> {
  if (principal.role !== "admin") throw new Error("only the admin changes roles");
  if (!['admin','principal','teacher','bursar','counter','driver',
        'dorm_parent','janitor','librarian','patron','hod'].includes(input.role)) {
    throw new Error("unknown role");
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const before = await c.query<{ role: string; name: string }>(
      `SELECT role::text AS role, full_name AS name FROM staff WHERE id = $1`, [input.staffId]);
    if (!before.rowCount) throw new Error("staff not found");
    if (before.rows[0]!.role === input.role) return { ok: true as const };
    // Guard: never demote the LAST active admin.
    if (before.rows[0]!.role === 'admin' && input.role !== 'admin') {
      const admins = await c.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM staff WHERE role = 'admin' AND active`);
      if (Number(admins.rows[0]!.c) <= 1) throw new Error("cannot demote the last active admin");
    }
    await c.query(`UPDATE staff SET role = $1::user_role WHERE id = $2`, [input.role, input.staffId]);
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, before, after)
       VALUES ($1, 'staff', 'user.role.change', 'staff', $2, $3, $4)`,
      [principal.userId, input.staffId,
       JSON.stringify({ role: before.rows[0]!.role }),
       JSON.stringify({ role: input.role, name: before.rows[0]!.name })],
    );
    return { ok: true as const };
  });
}

export interface PermMatrixData {
  rows: { module_key: string; role: string; owns: boolean; sees: boolean; landing: boolean }[];
}

export async function permMatrix(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<PermMatrixData> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const rows = await c.query<{ module_key: string; role: string; owns: boolean; sees: boolean; landing: boolean }>(
      `SELECT module_key, role::text AS role, owns, sees, landing FROM perm_matrix
       ORDER BY module_key, role`,
    );
    return { rows: rows.rows };
  });
}

export async function setPermCell(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { moduleKey: string; role: string; owns?: boolean; sees?: boolean; landing?: boolean },
): Promise<{ ok: true }> {
  if (principal.role !== "admin") throw new Error("only the admin edits the matrix");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (input.owns !== undefined) { sets.push(`owns = $${vals.length + 3}`); vals.push(input.owns); }
    if (input.sees !== undefined) { sets.push(`sees = $${vals.length + 3}`); vals.push(input.sees); }
    if (input.landing !== undefined) { sets.push(`landing = $${vals.length + 3}`); vals.push(input.landing); }
    if (!sets.length) return { ok: true as const };
    if (input.landing) {
      // One landing tab per role: clear the others first.
      await c.query(`UPDATE perm_matrix SET landing = false WHERE role = $1::user_role AND module_key <> $2`,
        [input.role, input.moduleKey]);
    }
    await c.query(
      `UPDATE perm_matrix SET ${sets.join(', ')}, updated_by = $1, updated_at = now()
       WHERE module_key = $2 AND role = $3::user_role`,
      [principal.userId, input.moduleKey, input.role, ...vals],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'perm.cell.set', 'perm_matrix', $2, $3)`,
      [principal.userId, `${input.moduleKey}:${input.role}`, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

export interface DutyRow {
  id: string; staff_id: string; staff_name: string; staff_role: string;
  duty_key: string; label: string; scope_id: string | null;
  effective_from: string; effective_to: string | null; active: boolean;
}

export async function listDuties(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ rows: DutyRow[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const rows = await c.query<DutyRow>(
      `SELECT d.id::text, s.id::text AS staff_id, s.full_name AS staff_name, s.role::text AS staff_role,
              d.duty_key, d.label, d.scope_id, d.effective_from::text, d.effective_to::text,
              (d.effective_to IS NULL OR d.effective_to >= CURRENT_DATE) AS active
       FROM staff_duty d JOIN staff s ON s.id = d.staff_id
       ORDER BY (d.effective_to IS NULL OR d.effective_to >= CURRENT_DATE) DESC, d.label, s.full_name`,
    );
    return { rows: rows.rows };
  });
}

export async function assignDuty(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { staffId: string; dutyKey: string; label: string; scopeId?: string },
): Promise<{ ok: true; id: string }> {
  if (principal.role !== "admin" && principal.role !== "principal") {
    throw new Error("principal or admin appoint duties");
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO staff_duty (staff_id, duty_key, label, scope_id, appointed_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id::text`,
      [input.staffId, input.dutyKey, input.label, input.scopeId ?? null, principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'duty.assign', 'staff_duty', $2, $3)`,
      [principal.userId, r.rows[0]!.id, JSON.stringify(input)],
    );
    return { ok: true as const, id: r.rows[0]!.id };
  });
}

export async function endDuty(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  id: string,
): Promise<{ ok: true }> {
  if (principal.role !== "admin" && principal.role !== "principal") {
    throw new Error("principal or admin end duties");
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query(`UPDATE staff_duty SET effective_to = CURRENT_DATE WHERE id = $1 AND effective_to IS NULL`, [id]);
    if (!r.rowCount) throw new Error("duty not found or already ended");
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'duty.end', 'staff_duty', $2, $3)`,
      [principal.userId, id, JSON.stringify({ id })],
    );
    return { ok: true as const };
  });
}

export interface IntegrationsData {
  rows: { key: string; label: string; connected: boolean; last_ok_at: string | null; note: string | null }[];
}

export async function integrationsHealth(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<IntegrationsData> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const rows = await c.query<{ key: string; label: string; connected: boolean; last_ok_at: string | null; note: string | null }>(
      `SELECT key, label, connected, last_ok_at::text, note FROM integration_health ORDER BY key`,
    );
    return { rows: rows.rows };
  });
}

export async function toggleIntegration(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { key: string; connected: boolean },
): Promise<{ ok: true }> {
  if (principal.role !== "admin") throw new Error("only the admin toggles integrations");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query(
      `UPDATE integration_health SET connected = $1, last_ok_at = CASE WHEN $1 THEN now() ELSE last_ok_at END,
              updated_by = $2, updated_at = now() WHERE key = $3`,
      [input.connected, principal.userId, input.key],
    );
    if (!r.rowCount) throw new Error("unknown integration");
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'integration.toggle', 'integration_health', $2, $3)`,
      [principal.userId, input.key, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

// ===========================================================================
// ㊸ SECTIONS & PATRONS — one generic engine, sections as rows. The patron
// is a teacher with a hat (staff_duty.patron-of:<id>), never a role. Kit
// rides the existing stock tables tagged to the section; Events ㉔ feeds
// guardian announcements; Register = members + session roll-call.
// ===========================================================================

export interface SectionRow {
  id: string; name: string; kind: string; head_staff_id: string | null;
  head_name: string | null; enabled: boolean; members: number;
  kit_value_cents: string; kit_items: number; notes: string | null;
}

export async function listSections(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ rows: SectionRow[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<SectionRow>(
      `SELECT s.id::text, s.name, s.kind::text AS kind, s.head_staff_id::text AS head_staff_id,
              st.full_name AS head_name, s.enabled, s.notes,
              (SELECT count(*) FROM section_member sm
               WHERE sm.section_id = s.id AND sm.active) AS members,
              (SELECT count(*) FROM stock_item ki WHERE ki.section_id = s.id) AS kit_items,
              (SELECT COALESCE(SUM(ki.unit_price * ki.qty_on_hand), 0)
               FROM stock_item ki WHERE ki.section_id = s.id)::text AS kit_value_cents
       FROM section s
       LEFT JOIN staff st ON st.id = s.head_staff_id
       ORDER BY s.enabled DESC, s.kind::text, s.name`,
    );
    return { rows: r.rows };
  });
}

const SECTION_KINDS = ["lab","sports","drama","music","club","mess","security","infirmary","library","store","transport","house"] as const;

export async function upsertSection(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id?: string; name: string; kind: string; headStaffId?: string | null; notes?: string | null },
): Promise<{ ok: true }> {
  if (principal.role !== "admin" && principal.role !== "principal") throw new Error("leaders manage sections");
  if (!SECTION_KINDS.includes(input.kind as (typeof SECTION_KINDS)[number])) throw new Error("unknown section kind");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    let before: { head: string | null; enabled: boolean } | null = null;
    if (input.id) {
      const cur = await c.query<{ head_staff_id: string | null; enabled: boolean }>(
        `SELECT head_staff_id::text AS head_staff_id, enabled FROM section WHERE id = $1`, [input.id]);
      if (!cur.rowCount) throw new Error("section not found");
      before = { head: cur.rows[0]!.head_staff_id, enabled: cur.rows[0]!.enabled };
    }
    const r = await c.query<{ id: string }>(
      `INSERT INTO section (id, name, kind, head_staff_id, notes)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3::section_kind, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind,
         head_staff_id = EXCLUDED.head_staff_id, notes = EXCLUDED.notes
       RETURNING id::text`,
      [input.id ?? null, input.name, input.kind, input.headStaffId ?? null, input.notes ?? null],
    );
    const id = r.rows[0]!.id;
    // Keep the hat registry (022) in step: patron-of:<sectionId>.
    if (input.headStaffId) {
      await c.query(
        `INSERT INTO staff_duty (staff_id, duty_key, label, appointed_by)
         SELECT $1, 'patron-of:' || $2::text, $3 || ' patron', $4
         WHERE NOT EXISTS (SELECT 1 FROM staff_duty d
                           WHERE d.staff_id = $1 AND d.duty_key = 'patron-of:' || $2::text
                             AND (d.effective_to IS NULL OR d.effective_to >= CURRENT_DATE))`,
        [input.headStaffId, id, input.name, principal.userId],
      );
    }
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, before, after)
       VALUES ($1, 'staff', $2, 'section', $3, $4, $5)`,
      [principal.userId, input.id ? "section.update" : "section.create", id,
       before ? JSON.stringify({ head: before.head, enabled: before.enabled }) : null,
       JSON.stringify({ name: input.name, kind: input.kind, head: input.headStaffId ?? null })],
    );
    return { ok: true as const };
  });
}

export async function toggleSection(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string; enabled: boolean },
): Promise<{ ok: true }> {
  if (principal.role !== "admin" && principal.role !== "principal") throw new Error("leaders manage sections");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query(`UPDATE section SET enabled = $1 WHERE id = $2`, [input.enabled, input.id]);
    if (!r.rowCount) throw new Error("section not found");
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'section.toggle', 'section', $2, $3)`,
      [principal.userId, input.id, JSON.stringify({ enabled: input.enabled })],
    );
    return { ok: true as const };
  });
}

export interface SectionDetail {
  section: { id: string; name: string; kind: string; head_name: string | null; enabled: boolean };
  members: { learner_id: string; learner: string; admission_no: string; class_name: string | null }[];
  sessions: { id: string; held_on: string; topic: string | null; present: number; total: number }[];
  kit: { id: string; name: string; qty_on_hand: number; unit_price: string; low: boolean }[];
}

export async function getSectionDetail(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  id: string,
): Promise<SectionDetail> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const s = await c.query<SectionDetail["section"]>(
      `SELECT s.id::text, s.name, s.kind::text AS kind, st.full_name AS head_name, s.enabled
       FROM section s LEFT JOIN staff st ON st.id = s.head_staff_id WHERE s.id = $1`, [id]);
    if (!s.rowCount) throw new Error("section not found");
    const members = await c.query<SectionDetail["members"][number]>(
      `SELECT sm.learner_id::text, l.first_name || ' ' || l.last_name AS learner,
              l.admission_no, cl.name AS class_name
       FROM section_member sm
       JOIN learner l ON l.id = sm.learner_id
       LEFT JOIN class cl ON cl.id = l.class_id
       WHERE sm.section_id = $1 AND sm.active
       ORDER BY l.first_name, l.last_name`, [id]);
    const sessions = await c.query<SectionDetail["sessions"][number]>(
      `SELECT ss.id::text, ss.held_on::text, ss.topic,
              count(sm2.*) FILTER (WHERE sm2.present)::int AS present,
              count(sm2.*)::int AS total
       FROM section_session ss
       LEFT JOIN section_session_mark sm2 ON sm2.session_id = ss.id
       WHERE ss.section_id = $1
       GROUP BY ss.id, ss.held_on, ss.topic
       ORDER BY ss.held_on DESC LIMIT 12`, [id]);
    const kit = await c.query<SectionDetail["kit"][number]>(
      `SELECT ki.id::text, ki.name, ki.qty_on_hand, ki.unit_price::text,
              (ki.qty_on_hand <= ki.low_stock_threshold) AS low
       FROM stock_item ki WHERE ki.section_id = $1
       ORDER BY ki.name`, [id]);
    return { section: s.rows[0]!, members: members.rows, sessions: sessions.rows, kit: kit.rows };
  });
}

export async function addSectionMembers(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { sectionId: string; learnerIds: string[] },
): Promise<{ ok: true; added: number }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const sec = await c.query<{ head_staff_id: string | null }>(
      `SELECT head_staff_id::text FROM section WHERE id = $1`, [input.sectionId]);
    if (!sec.rowCount) throw new Error("section not found");
    if (principal.role !== "admin" && principal.role !== "principal" && sec.rows[0]!.head_staff_id !== principal.userId) {
      throw new Error("only the patron or leadership edits the register");
    }
    const r = await c.query(
      `INSERT INTO section_member (section_id, learner_id)
       SELECT $1, x FROM unnest($2::uuid[]) AS x
       ON CONFLICT (section_id, learner_id) DO UPDATE SET active = true`,
      [input.sectionId, input.learnerIds],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'section.member.add', 'section', $2, $3)`,
      [principal.userId, input.sectionId, JSON.stringify({ count: r.rowCount ?? 0 })],
    );
    return { ok: true as const, added: r.rowCount ?? 0 };
  });
}

export async function removeSectionMember(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { sectionId: string; learnerId: string },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const sec = await c.query<{ head_staff_id: string | null }>(
      `SELECT head_staff_id::text FROM section WHERE id = $1`, [input.sectionId]);
    if (!sec.rowCount) throw new Error("section not found");
    if (principal.role !== "admin" && principal.role !== "principal" && sec.rows[0]!.head_staff_id !== principal.userId) {
      throw new Error("only the patron or leadership edits the register");
    }
    await c.query(
      `UPDATE section_member SET active = false WHERE section_id = $1 AND learner_id = $2`,
      [input.sectionId, input.learnerId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'section.member.remove', 'section', $2, $3)`,
      [principal.userId, input.sectionId, JSON.stringify({ learnerId: input.learnerId })],
    );
    return { ok: true as const };
  });
}

export async function holdSectionSession(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { sectionId: string; topic?: string | null; present: string[]; absent: string[] },
): Promise<{ ok: true; sessionId: string }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const sec = await c.query<{ head_staff_id: string | null }>(
      `SELECT head_staff_id::text FROM section WHERE id = $1`, [input.sectionId]);
    if (!sec.rowCount) throw new Error("section not found");
    if (principal.role !== "admin" && principal.role !== "principal" && sec.rows[0]!.head_staff_id !== principal.userId) {
      throw new Error("only the patron or leadership holds sessions");
    }
    const ss = await c.query<{ id: string }>(
      `INSERT INTO section_session (section_id, held_by, topic)
       VALUES ($1, $2, $3) RETURNING id::text`,
      [input.sectionId, principal.userId, input.topic ?? null],
    );
    const sid = ss.rows[0]!.id;
    if (input.present.length) {
      await c.query(
        `INSERT INTO section_session_mark (session_id, learner_id, present)
         SELECT $1, x, true FROM unnest($2::uuid[]) AS x ON CONFLICT DO NOTHING`,
        [sid, input.present],
      );
    }
    if (input.absent.length) {
      await c.query(
        `INSERT INTO section_session_mark (session_id, learner_id, present)
         SELECT $1, x, false FROM unnest($2::uuid[]) AS x ON CONFLICT DO NOTHING`,
        [sid, input.absent],
      );
    }
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'section.session.hold', 'section_session', $2, $3)`,
      [principal.userId, sid, JSON.stringify({ present: input.present.length, absent: input.absent.length })],
    );
    return { ok: true as const, sessionId: sid };
  });
}

export async function tagKitItem(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { sectionId: string; itemId: string },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query(`UPDATE stock_item SET section_id = $1 WHERE id = $2`, [input.sectionId, input.itemId]);
    if (!r.rowCount) throw new Error("stock item not found");
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'section.kit.tag', 'stock_item', $2, $3)`,
      [principal.userId, input.itemId, JSON.stringify({ sectionId: input.sectionId })],
    );
    return { ok: true as const };
  });
}

/** My Section: what the patron's teacher dashboard tab renders (㊸a). */
export async function mySection(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ sections: { id: string; name: string; kind: string; members: number }[] } | null> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ id: string; name: string; kind: string; members: number }>(
      `SELECT s.id::text, s.name, s.kind::text AS kind,
              (SELECT count(*) FROM section_member sm WHERE sm.section_id = s.id AND sm.active) AS members
       FROM section s WHERE s.head_staff_id = $1 AND s.enabled
       ORDER BY s.name`, [principal.userId]);
    return r.rowCount ? { sections: r.rows } : null;
  });
}

// ===========================================================================
// ㊹ DISCIPLINE & MERITS — the access ladder (class teacher own class,
// discipline master all, deputy oversight) is API-level on top of the DB
// floor (staff read/write, parents own-child via RLS).
// ===========================================================================

export interface IncidentRow {
  id: string; learner_id: string; learner: string; class_name: string | null;
  kind: string; category: string; points: number; description: string;
  action: string | null; occurred_on: string; parent_notified: boolean;
  recorded_by_name: string | null;
}

export async function listIncidents(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ rows: IncidentRow[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<IncidentRow>(
      `SELECT di.id::text, di.learner_id::text, l.first_name || ' ' || l.last_name AS learner,
              cl.name AS class_name, di.kind::text AS kind, di.category, di.points,
              di.description, di.action, di.occurred_on::text,
              (di.parent_notified_at IS NOT NULL) AS parent_notified,
              st.full_name AS recorded_by_name
       FROM discipline_incident di
       JOIN learner l ON l.id = di.learner_id
       LEFT JOIN class cl ON cl.id = di.class_id
       LEFT JOIN staff st ON st.id = di.recorded_by
       ORDER BY di.occurred_on DESC, di.created_at DESC
       LIMIT 200`,
    );
    return { rows: r.rows };
  });
}

export async function recordIncident(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { learnerId: string; kind: string; category: string; points: number;
           description: string; action?: string | null; notifyParent: boolean },
): Promise<{ ok: true }> {
  if (!["admin","principal","teacher"].includes(principal.role ?? "")) throw new Error("staff only");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const lr = await c.query<{ class_id: number | null }>(
      `SELECT class_id FROM learner WHERE id = $1`, [input.learnerId]);
    if (!lr.rowCount) throw new Error("learner not found");
    const r = await c.query<{ id: string }>(
      `INSERT INTO discipline_incident (learner_id, class_id, kind, category, points, description, action, parent_notified_at, recorded_by)
       VALUES ($1, $2, $3::incident_kind, $4, $5, $6, $7, CASE WHEN $8 THEN now() ELSE NULL END, $9)
       RETURNING id::text`,
      [input.learnerId, lr.rows[0]!.class_id, input.kind, input.category, input.points,
       input.description, input.action ?? null, input.notifyParent, principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'discipline.record', 'discipline_incident', $2, $3)`,
      [principal.userId, r.rows[0]!.id,
       JSON.stringify({ kind: input.kind, category: input.category, points: input.points, notified: input.notifyParent })],
    );
    return { ok: true as const };
  });
}

export interface DisciplineOverview {
  kpis: { incidents_term: number; merits: number; demerits: number; detentions: number };
  byClass: { class_name: string; incidents: number; merit_points: number; demerit_points: number }[];
  rows: IncidentRow[];
}

export async function disciplineOverview(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<DisciplineOverview> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const term = await c.query<{ starts_on: string }>(
      `SELECT starts_on::text FROM term ORDER BY starts_on DESC LIMIT 1`);
    const since = term.rowCount ? term.rows[0]!.starts_on : "1900-01-01";
    const k = await c.query<{ incidents_term: number; merits: number; demerits: number; detentions: number }>(
      `SELECT count(*) FILTER (WHERE occurred_on >= $1::date)::int AS incidents_term,
              count(*) FILTER (WHERE kind = 'merit' AND occurred_on >= $1::date)::int AS merits,
              count(*) FILTER (WHERE kind = 'demerit' AND occurred_on >= $1::date)::int AS demerits,
              count(*) FILTER (WHERE action ILIKE '%detention%' AND occurred_on >= $1::date)::int AS detentions
       FROM discipline_incident`, [since]);
    const by = await c.query<DisciplineOverview["byClass"][number]>(
      `SELECT COALESCE(cl.name, 'Unassigned') AS class_name,
              count(*)::int AS incidents,
              count(*) FILTER (WHERE di.kind = 'merit')::int AS merit_points,
              count(*) FILTER (WHERE di.kind = 'demerit')::int AS demerit_points
       FROM discipline_incident di
       LEFT JOIN class cl ON cl.id = di.class_id
       GROUP BY cl.name ORDER BY count(*) DESC`,);
    const rows = await listIncidents(dbName, principal);
    return { kpis: k.rows[0]!, byClass: by.rows, rows: rows.rows };
  });
}

// ===========================================================================
// ㊺ COUNSELLING — DPA-strict. The admin's card reads the SECURITY DEFINER
// counselling_stats() (counts only); case contents require the duty hat or
// the principal, enforced by RLS AND re-checked here.
// ===========================================================================

export interface CounsellingCaseRow {
  id: string; learner_id: string; learner: string; class_name: string | null;
  status: string; summary: string; referral: string | null; opened_on: string;
  notes: { on: string; note: string; by: string }[];
}

export interface CounsellingData {
  canOpen: boolean;                       // duty-holder or principal
  stats: { open_ct: number; referred_ct: number; closed_ct: number };
  cases: CounsellingCaseRow[];
}

export async function counsellingOverview(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<CounsellingData> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const st = await c.query<{ open_ct: string; referred_ct: string; closed_ct: string }>(
      `SELECT open_ct::text, referred_ct::text, closed_ct::text FROM counselling_stats()`);
    const dutyRow = await c.query(
      `SELECT 1 FROM staff_duty d
       WHERE d.staff_id = $1 AND d.duty_key = 'counselling'
         AND (d.effective_to IS NULL OR d.effective_to >= CURRENT_DATE) LIMIT 1`,
      [principal.userId],
    );
    const canOpen = principal.role === "principal" || (dutyRow.rowCount ?? 0) > 0;
    let cases: CounsellingCaseRow[] = [];
    if (canOpen) {
      const r = await c.query<CounsellingCaseRow>(
        `SELECT cc.id::text, cc.learner_id::text, l.first_name || ' ' || l.last_name AS learner,
                cl.name AS class_name, cc.status, cc.summary, cc.referral, cc.opened_on::text, cc.notes
         FROM counselling_case cc
         JOIN learner l ON l.id = cc.learner_id
         LEFT JOIN class cl ON cl.id = l.class_id
         ORDER BY cc.opened_on DESC, cc.created_at DESC`);
      cases = r.rows;
    }
    return { canOpen, stats: {
      open_ct: Number(st.rows[0]?.open_ct ?? 0),
      referred_ct: Number(st.rows[0]?.referred_ct ?? 0),
      closed_ct: Number(st.rows[0]?.closed_ct ?? 0),
    }, cases };
  });
}

export async function openCase(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { learnerId: string; summary: string; referral?: string | null },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO counselling_case (learner_id, summary, referral, opened_by)
       VALUES ($1, $2, $3, $4) RETURNING id::text`,
      [input.learnerId, input.summary, input.referral ?? null, principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'counselling.case.open', 'counselling_case', $2, $3)`,
      [principal.userId, r.rows[0]!.id, JSON.stringify({ learnerId: input.learnerId })],
    );
    return { ok: true as const };
  });
}

export async function appendCaseNote(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string; note: string },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ id: string }>(
      `UPDATE counselling_case
       SET notes = notes || $2::jsonb, updated_at = now()
       WHERE id = $1 RETURNING id::text`,
      [input.id, JSON.stringify([{ on: new Date().toISOString().slice(0, 10), note: input.note, by: principal.userId }])],
    );
    if (!r.rowCount) throw new Error("case not found or not permitted");
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'counselling.note', 'counselling_case', $2, $3)`,
      [principal.userId, input.id, JSON.stringify({ len: input.note.length })],
    );
    return { ok: true as const };
  });
}

export async function closeCase(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string; status: "referred" | "closed"; referral?: string | null },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ id: string }>(
      `UPDATE counselling_case SET status = $2,
              referral = COALESCE($3, referral), updated_at = now()
       WHERE id = $1 RETURNING id::text`,
      [input.id, input.status, input.referral ?? null],
    );
    if (!r.rowCount) throw new Error("case not found or not permitted");
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'counselling.case.' || $2, 'counselling_case', $3, $4)`,
      [principal.userId, input.status, input.id, JSON.stringify({ status: input.status })],
    );
    return { ok: true as const };
  });
}

// ===========================================================================
// ㉔ EVENTS & CALENDAR — term calendar feeding guardian announcements.
// ===========================================================================

export interface EventRow {
  id: string; title: string; kind: string; starts_on: string;
  ends_on: string | null; notes: string | null;
}

export async function listEvents(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ rows: EventRow[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<EventRow>(
      `SELECT id::text, title, kind, starts_on::text, ends_on::text, notes
       FROM school_event
       WHERE starts_on >= CURRENT_DATE - INTERVAL '60 days'
       ORDER BY starts_on`,
    );
    return { rows: r.rows };
  });
}

export async function createEvent(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { title: string; kind: string; startsOn: string; endsOn?: string | null; notes?: string | null },
): Promise<{ ok: true }> {
  if (!["admin","principal","teacher"].includes(principal.role ?? "")) throw new Error("staff only");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO school_event (title, kind, starts_on, ends_on, notes, created_by)
       VALUES ($1, $2, $3::date, $4::date, $5, $6) RETURNING id::text`,
      [input.title, input.kind, input.startsOn, input.endsOn ?? null, input.notes ?? null, principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'event.create', 'school_event', $2, $3)`,
      [principal.userId, r.rows[0]!.id, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

// ===========================================================================
// ② LEARNER 360 + BULK CSV IMPORT — one profile: identity, guardians, fee
// ledger (SAME listInvoices math), attendance history, conduct summary.
// CSV import: admission_no or name; class code; gender; DOB; guardian phone
// reuses the sibling auto-link (one family, one phone, never re-typed).
// ===========================================================================

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

export async function learner360(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  id: string,
): Promise<Learner360> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const l = await c.query<Learner360["learner"]>(
      `SELECT l.id::text, l.admission_no, l.upi,
              l.first_name || ' ' || COALESCE(l.middle_name || ' ', '') || l.last_name AS name,
              cl.name AS class_name, l.class_id, l.gender::text, l.date_of_birth::text AS dob,
              l.boarding, l.status::text AS status
       FROM learner l LEFT JOIN class cl ON cl.id = l.class_id
       WHERE l.id = $1`, [id]);
    if (!l.rowCount) throw new Error("learner not found");
    const g = await c.query<Learner360["guardians"][number]>(
      `SELECT g.id::text, g.full_name, g.phone,
              COALESCE(lg.relationship, g.relationship) AS relationship,
              COALESCE(lg.is_primary, g.is_primary) AS is_primary
       FROM learner_guardian lg JOIN guardian g ON g.id = lg.guardian_id
       WHERE lg.learner_id = $1
       ORDER BY g.is_primary DESC, g.full_name`, [id]);
    const term = await c.query<{ id: number }>(`SELECT id FROM term ORDER BY starts_on DESC LIMIT 1`);
    let ledger: Learner360["ledger"] = null;
    if (term.rowCount) {
      const b = await c.query<{ billed: string; paid: string }>(
        `WITH billed AS (
           SELECT COALESCE(SUM(CASE WHEN fi.is_optional = false
                                     OR EXISTS (SELECT 1 FROM consent cc
                                                WHERE cc.id = fi.consent_id AND cc.choice = 'granted')
                                    THEN fi.amount END), 0) AS billed
           FROM fee_item fi WHERE fi.learner_id = $1 AND fi.term_id = $2
         ), pool AS (
           SELECT COALESCE(SUM(p.amount), 0) AS paid FROM payments p
           WHERE p.learner_id = $1 AND p.state = 'confirmed'
         )
         SELECT billed::text, paid::text FROM billed, pool`,
        [id, term.rows[0]!.id]);
      const billed = Number(b.rows[0]?.billed ?? 0);
      const paid = Number(b.rows[0]?.paid ?? 0);
      ledger = {
        billed_cents: String(billed),
        paid_cents: String(Math.min(paid, billed)),
        balance_cents: String(billed - Math.min(paid, billed)),
      };
    }
    const a = await c.query<{ present: number; absent: number; late: number; rate: string }>(
      `SELECT count(*) FILTER (WHERE mark = 'present')::int AS present,
              count(*) FILTER (WHERE mark = 'absent')::int AS absent,
              count(*) FILTER (WHERE mark = 'late')::int AS late,
              CASE WHEN count(*) = 0 THEN '0'
                   ELSE (100.0 * count(*) FILTER (WHERE mark IN ('present','late')) / count(*))::text END AS rate
       FROM attendance WHERE learner_id = $1`, [id]);
    const cond = await c.query<{ merits: number; demerits: number }>(
      `SELECT count(*) FILTER (WHERE kind = 'merit')::int AS merits,
              count(*) FILTER (WHERE kind = 'demerit')::int AS demerits
       FROM discipline_incident WHERE learner_id = $1`, [id]);
    const sec = await c.query<{ name: string; kind: string }>(
      `SELECT s.name, s.kind::text AS kind FROM section_member sm
       JOIN section s ON s.id = sm.section_id
       WHERE sm.learner_id = $1 AND sm.active ORDER BY s.name`, [id]);
    return {
      learner: l.rows[0]!, guardians: g.rows,
      ledger,
      attendance: { present: a.rows[0]!.present, absent: a.rows[0]!.absent, late: a.rows[0]!.late, rate: Number(a.rows[0]!.rate) },
      conduct: cond.rows[0]!, sections: sec.rows,
    };
  });
}

export interface CsvImportResult {
  ok: boolean; created: number; updated: number; skipped: number;
  errors: { line: number; message: string }[];
  siblingsLinked: number;
}

/**
 * Bulk CSV import — headers (any order, case-insensitive):
 *   admission_no, first_name, middle_name, last_name, gender, dob,
 *   class (code), guardian_name, guardian_phone, boarding
 * Existing admission_no updates in place; guardian phone reuses the
 * sibling auto-link so one family is entered once.
 */
export async function importLearnersCsv(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  csvText: string,
  filename?: string | null,
): Promise<CsvImportResult> {
  if (principal.role !== "admin" && principal.role !== "principal") throw new Error("leaders import learners");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const lines = csvText.split(/\r?\n/).map((ln) => ln.trim()).filter(Boolean);
    const res: CsvImportResult = { ok: true, created: 0, updated: 0, skipped: 0, errors: [], siblingsLinked: 0 };
    if (lines.length < 2) return { ...res, ok: false, errors: [{ line: 0, message: "CSV needs a header row and at least one data row" }] };
    const parseLine = (ln: string): string[] => {
      const out: string[] = [];
      let cur = ""; let inQ = false;
      for (let i = 0; i < ln.length; i++) {
        const ch = ln[i]!;
        if (ch === '"') { if (inQ && ln[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
        else if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ""; }
        else cur += ch;
      }
      out.push(cur.trim());
      return out;
    };
    // Header ALIAS matching — schools export the same fields under many
    // spellings; every common variant maps onto our canonical columns.
    const LEARNER_COL_ALIASES: Record<string, string[]> = {
      admission_no: ["admission_no", "admissionno", "adm_no", "admno", "adm", "admission", "admission_number", "admissionnumber", "admission_no_", "upn"],
      first_name: ["first_name", "firstname", "fname", "forename", "given_name", "givenname"],
      middle_name: ["middle_name", "middlename", "mname"],
      last_name: ["last_name", "lastname", "lname", "surname", "family_name", "familyname"],
      gender: ["gender", "sex"],
      dob: ["dob", "date_of_birth", "dateofbirth", "birth_date", "birthdate", "birthday"],
      class: ["class", "class_code", "classname", "class_name", "stream", "grade", "form", "level"],
      guardian_name: ["guardian_name", "guardianname", "parent_name", "parentname", "parent", "guardian", "parent_fullname"],
      guardian_phone: ["guardian_phone", "guardianphone", "parent_phone", "parentphone", "phone", "mobile", "tel", "telephone", "contact", "contact_phone", "phone_number", "phonenumber"],
      guardian_email: ["guardian_email", "guardianemail", "parent_email", "parentemail", "email", "email_address", "emailaddress"],
      boarding: ["boarding", "boarder", "boarder_status", "boarding_status", "is_boarder"],
    };
    const head = parseLine(lines[0]!).map((h) => h.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""));
    const col = (canonical: string) => {
      const aliases = LEARNER_COL_ALIASES[canonical] ?? [canonical];
      for (const a of aliases) {
        const i = head.indexOf(a);
        if (i >= 0) return i;
      }
      return -1;
    };
    const iAdm = col("admission_no");
    const iFirst = col("first_name"); const iMiddle = col("middle_name"); const iLast = col("last_name");
    const iGender = col("gender"); const iDob = col("dob"); const iClass = col("class");
    const iGName = col("guardian_name"); const iGPhone = col("guardian_phone"); const iBoard = col("boarding");
    const iGEmail = col("guardian_email");
    if (iFirst < 0 || iLast < 0) {
      return { ...res, ok: false, errors: [{ line: 1, message: "first_name and last_name columns are required (any common spelling — firstname/surname/etc)" }] };
    }
    const classes = await c.query<{ id: number; code: string }>(`SELECT id, code FROM class`);
    const byCode = new Map(classes.rows.map((r) => [r.code.toLowerCase(), r.id]));
    for (let ln = 1; ln < lines.length; ln++) {
      const cells = parseLine(lines[ln]!);
      const get = (i: number) => (i >= 0 && i < cells.length ? cells[i]! : "");
      const first = get(iFirst); const last = get(iLast);
      if (!first || !last) { res.errors.push({ line: ln + 1, message: "missing first or last name" }); res.skipped++; continue; }
      const gender = get(iGender).toUpperCase().startsWith("F") ? "F" : get(iGender).toUpperCase().startsWith("M") ? "M" : null;
      const classId = get(iClass) ? byCode.get(get(iClass).toLowerCase()) ?? null : null;
      const boarding = /^(true|yes|1|y)$/i.test(get(iBoard));
      const adm = get(iAdm);
      try {
        let learnerId: string;
        if (adm) {
          const ex = await c.query<{ id: string }>(
            `SELECT id::text FROM learner WHERE admission_no = $1`, [adm]);
          if (ex.rowCount) {
            learnerId = ex.rows[0]!.id;
            await c.query(
              `UPDATE learner SET first_name = $2, middle_name = $3, last_name = $4,
                      gender = $5, date_of_birth = $6, class_id = COALESCE($7, class_id), boarding = $8
               WHERE id = $1`,
              [learnerId, first, get(iMiddle) || null, last, gender, get(iDob) || null, classId, boarding]);
            res.updated++;
          } else {
            const ins = await c.query<{ id: string }>(
              `INSERT INTO learner (admission_no, first_name, middle_name, last_name, gender, date_of_birth, class_id, boarding)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id::text`,
              [adm, first, get(iMiddle) || null, last, gender, get(iDob) || null, classId, boarding]);
            learnerId = ins.rows[0]!.id;
            res.created++;
          }
        } else {
          const next = await c.query<{ adm: string }>(
            `SELECT 'ADM-' || lpad((coalesce(max(nullif(regexp_replace(admission_no, '\\D', '', 'g'), '')::bigint), 0::bigint) + 1)::text, 3, '0') AS adm
             FROM learner`);
          const ins = await c.query<{ id: string }>(
            `INSERT INTO learner (admission_no, first_name, middle_name, last_name, gender, date_of_birth, class_id, boarding)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id::text`,
            [next.rows[0]!.adm, first, get(iMiddle) || null, last, gender, get(iDob) || null, classId, boarding]);
          learnerId = ins.rows[0]!.id;
          res.created++;
        }
        const phone = get(iGPhone).replace(/\D/g, "");
        if (phone.length >= 9) {
          const norm = phone.startsWith("0") ? "254" + phone.slice(1) : phone.startsWith("254") ? phone : "254" + phone;
          const g = await c.query<{ id: string }>(
            `SELECT id::text FROM guardian WHERE phone = $1 AND active`, [norm]);
          let gid: string;
          if (g.rowCount) {
            gid = g.rows[0]!.id;
            res.siblingsLinked++;
          } else {
            const gi = await c.query<{ id: string }>(
              `INSERT INTO guardian (full_name, phone, email, relationship, is_primary)
               VALUES ($1, $2, $3, 'guardian', true) RETURNING id::text`,
              [get(iGName) || "Guardian of " + first, norm, iGEmail >= 0 ? get(iGEmail) || null : null]);
            gid = gi.rows[0]!.id;
          }
          await c.query(
            `INSERT INTO learner_guardian (learner_id, guardian_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [learnerId, gid]);
        }
      } catch (e) {
        res.errors.push({ line: ln + 1, message: e instanceof Error ? e.message : "row failed" });
        res.skipped++;
      }
    }
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'learner.csv.import', 'learner', $2, $3)`,
      [principal.userId, `csv:${filename ?? "paste"}:${Date.now()}`, JSON.stringify({ filename: filename ?? null, created: res.created, updated: res.updated, skipped: res.skipped })],
    );
    return res;
  });
}

// ===========================================================================
// Phase 2 completion: ㊶ Board & BOM · ㊴ Facilities · ㉓ Hostel · Infirmary ·
// ⑳ Transport · ㉑ Library · ㉒ Store · feature flags.
// ===========================================================================

// ------------------------------ ㊴ Facilities -------------------------------
export interface RepairRow {
  id: string; room: string; item: string; qty: number; condition: string;
  note: string | null; state: string; verdict: string | null;
  est_cost_cents: string; replace_value_cents: string;
  reported_by_name: string | null; created_at: string;
}

export async function listRepairs(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ rows: RepairRow[]; kpis: { open: number; structural: number; replace_ct: number; est_total_cents: string } }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const rows = await c.query<RepairRow>(
      `SELECT rr.id::text, rr.room, rr.item, rr.qty, rr.condition, rr.note, rr.state,
              rr.verdict, rr.est_cost_cents::text, rr.replace_value_cents::text,
              st.full_name AS reported_by_name, rr.created_at::text
       FROM repair_report rr LEFT JOIN staff st ON st.id = rr.reported_by
       ORDER BY (rr.state = 'open') DESC, rr.created_at DESC LIMIT 100`,
    );
    const k = await c.query<{ open: string; structural: string; replace_ct: string; est: string }>(
      `SELECT COUNT(*) FILTER (WHERE state = 'open')::text AS open,
              COUNT(*) FILTER (WHERE condition = 'structural' AND state <> 'done')::text AS structural,
              COUNT(*) FILTER (WHERE verdict = 'replace' AND state = 'open')::text AS replace_ct,
              COALESCE(SUM(est_cost_cents) FILTER (WHERE state = 'open'), 0)::text AS est
       FROM repair_report`,
    );
    return { rows: rows.rows, kpis: {
      open: Number(k.rows[0]!.open), structural: Number(k.rows[0]!.structural),
      replace_ct: Number(k.rows[0]!.replace_ct), est_total_cents: k.rows[0]!.est,
    } };
  });
}

/**
 * Two-tap anyone-report. The verdict is DATA (the <50% rule), computed on
 * write: repair if est < 50% of replacement value AND not structural;
 * structural damage goes straight out-of-service (safety first).
 */
export async function reportRepair(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { room: string; item: string; qty: number; condition: string; note?: string | null;
           estCostCents?: number; replaceValueCents?: number },
): Promise<{ ok: true; verdict: string; state: string }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const est = input.estCostCents ?? 0;
    const val = input.replaceValueCents ?? 0;
    let verdict: string;
    let state = "open";
    if (input.condition === "structural") {
      verdict = "replace"; state = "out-of-service";
    } else if (val > 0 && est >= val * 0.5) {
      verdict = "replace";
    } else {
      verdict = "repair";
    }
    const r = await c.query<{ id: string }>(
      `INSERT INTO repair_report (room, item, qty, condition, note, reported_by, est_cost_cents, replace_value_cents, state, verdict)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id::text`,
      [input.room, input.item, input.qty, input.condition, input.note ?? null, principal.userId, est, val, state, verdict],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'facility.repair.report', 'repair_report', $2, $3)`,
      [principal.userId, r.rows[0]!.id, JSON.stringify({ room: input.room, item: input.item, verdict })],
    );
    return { ok: true as const, verdict, state };
  });
}

export async function setRepairState(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string; state: string },
): Promise<{ ok: true }> {
  if (principal.role !== "admin" && principal.role !== "principal") throw new Error("leaders resolve repairs");
  if (!["open", "in-repair", "done", "out-of-service"].includes(input.state)) throw new Error("unknown state");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ id: string }>(
      `UPDATE repair_report SET state = $2, resolved_at = CASE WHEN $2 IN ('done','out-of-service') THEN now() ELSE NULL END
       WHERE id = $1 RETURNING id::text`, [input.id, input.state]);
    if (!r.rowCount) throw new Error("report not found");
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'facility.repair.state', 'repair_report', $2, $3)`,
      [principal.userId, input.id, JSON.stringify({ state: input.state })],
    );
    return { ok: true as const };
  });
}

// ------------------------------ ㉓ Hostel -----------------------------------
export interface HostelData {
  dorms: { id: string; name: string; kind: string; capacity: number; occupied: number; dorm_parent_name: string | null }[];
  boarders: number;
  exeat: { id: string; learner: string; dorm: string | null; reason: string; state: string; guardian_consent: boolean }[];
  last_rollcall: { night: string; present: number; total: number }[];
}

export async function hostelOverview(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<HostelData> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const dorms = await c.query<HostelData["dorms"][number]>(
      `SELECT d.id::text, d.name, d.kind, d.capacity,
              (SELECT COUNT(*) FROM dorm_allocation da WHERE da.dorm_id = d.id AND da.active)::int AS occupied,
              st.full_name AS dorm_parent_name
       FROM dorm d LEFT JOIN staff st ON st.id = d.dorm_parent
       ORDER BY d.name`,
    );
    const b = await c.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM learner WHERE boarding AND status = 'active'`);
    const exeat = await c.query<HostelData["exeat"][number]>(
      `SELECT ep.id::text, l.first_name || ' ' || l.last_name AS learner,
              d.name AS dorm, ep.reason, ep.state, ep.guardian_consent
       FROM exeat_pass ep
       JOIN learner l ON l.id = ep.learner_id
       LEFT JOIN dorm_allocation da ON da.learner_id = ep.learner_id AND da.active
       LEFT JOIN dorm d ON d.id = da.dorm_id
       ORDER BY ep.created_at DESC LIMIT 20`,
    );
    const rc = await c.query<HostelData["last_rollcall"][number]>(
      `SELECT night::text,
              COUNT(*) FILTER (WHERE present)::int AS present,
              COUNT(*)::int AS total
       FROM hostel_rollcall
       WHERE night = (SELECT MAX(night) FROM hostel_rollcall)
       GROUP BY night`,
    );
    return {
      dorms: dorms.rows, boarders: Number(b.rows[0]!.count),
      exeat: exeat.rows,
      last_rollcall: rc.rows,
    };
  });
}

export async function upsertDorm(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { name: string; kind: string; capacity: number },
): Promise<{ ok: true }> {
  if (principal.role !== "admin" && principal.role !== "principal") throw new Error("leaders manage dorms");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO dorm (name, kind, capacity) VALUES ($1, $2::text, $3)
       ON CONFLICT (name) DO UPDATE SET kind = EXCLUDED.kind, capacity = EXCLUDED.capacity`,
      [input.name, input.kind, input.capacity],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'hostel.dorm.upsert', 'dorm', $2, $3)`,
      [principal.userId, input.name, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

export async function allocateDorm(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { dormId: string; learnerId: string; bedLabel?: string | null },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO dorm_allocation (dorm_id, learner_id, bed_label) VALUES ($1,$2,$3)
       ON CONFLICT (dorm_id, learner_id) DO UPDATE SET active = true, bed_label = EXCLUDED.bed_label`,
      [input.dormId, input.learnerId, input.bedLabel ?? null],
    );
    await c.query(`UPDATE learner SET boarding = true WHERE id = $1`, [input.learnerId]);
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'hostel.allocate', 'dorm_allocation', $2, $3)`,
      [principal.userId, input.learnerId, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

export async function requestExeat(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { learnerId: string; reason: string },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO exeat_pass (learner_id, reason, requested_by) VALUES ($1,$2,$3)`,
      [input.learnerId, input.reason, principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'hostel.exeat.request', 'exeat_pass', $2, $3)`,
      [principal.userId, input.learnerId, JSON.stringify({ reason: input.reason })],
    );
    return { ok: true as const };
  });
}

export async function decideExeat(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string; decision: "approved" | "denied"; out?: boolean; returned?: boolean },
): Promise<{ ok: true }> {
  if (principal.role !== "admin" && principal.role !== "principal") throw new Error("deputy/leaders decide exeats");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const state = input.out ? "out" : input.returned ? "returned" : input.decision;
    await c.query(
      `UPDATE exeat_pass SET state = $2,
              approved_by = CASE WHEN $2 = 'approved' THEN $3 ELSE approved_by END,
              out_at = CASE WHEN $2 = 'out' THEN now() ELSE out_at END,
              returned_at = CASE WHEN $2 = 'returned' THEN now() ELSE returned_at END
       WHERE id = $1`,
      [input.id, state, principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'hostel.exeat.' || $2, 'exeat_pass', $3, $4)`,
      [principal.userId, state, input.id, JSON.stringify({ state })],
    );
    return { ok: true as const };
  });
}

export async function rollcallDorm(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { dormId: string; present: string[]; absent: string[] },
): Promise<{ ok: true; absentCount: number }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO hostel_rollcall (dorm_id, learner_id, present, recorded_by)
       SELECT $1, x, true, $2 FROM unnest($3::uuid[]) AS x
       ON CONFLICT (dorm_id, night, learner_id) DO UPDATE SET present = true`,
      [input.dormId, principal.userId, input.present],
    );
    if (input.absent.length) {
      await c.query(
        `INSERT INTO hostel_rollcall (dorm_id, learner_id, present, recorded_by)
         SELECT $1, x, false, $2 FROM unnest($3::uuid[]) AS x
         ON CONFLICT (dorm_id, night, learner_id) DO UPDATE SET present = false`,
        [input.dormId, principal.userId, input.absent],
      );
    }
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'hostel.rollcall', 'hostel_rollcall', $2, $3)`,
      [principal.userId, input.dormId, JSON.stringify({ present: input.present.length, absent: input.absent.length })],
    );
    return { ok: true as const, absentCount: input.absent.length };
  });
}

// ------------------------------ Infirmary ----------------------------------
export interface InfirmaryData {
  canOpen: boolean;
  stats: { records_ct: number; visits_30d: number; open_allergies: number };
  records: { id: string; learner: string; kind: string; detail: string; parent_declared: boolean }[];
  visits: { id: string; learner: string; visited_on: string; complaint: string; action: string | null; outcome: string | null; parent_notified: boolean; medication: string | null }[];
}

export async function infirmaryOverview(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<InfirmaryData> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const st = await c.query<{ records_ct: string; visits_30d: string; open_allergies: string }>(
      `SELECT records_ct::text, visits_30d::text, open_allergies::text FROM infirmary_stats()`);
    const duty = await c.query(
      `SELECT 1 FROM staff_duty d
       WHERE d.staff_id = $1 AND d.duty_key = 'infirmary'
         AND (d.effective_to IS NULL OR d.effective_to >= CURRENT_DATE) LIMIT 1`,
      [principal.userId],
    );
    const canOpen = principal.role === "principal" || (duty.rowCount ?? 0) > 0;
    let records: InfirmaryData["records"] = [];
    let visits: InfirmaryData["visits"] = [];
    if (canOpen) {
      const r1 = await c.query<InfirmaryData["records"][number]>(
        `SELECT hr.id::text, l.first_name || ' ' || l.last_name AS learner, hr.kind, hr.detail, hr.parent_declared
         FROM health_record hr JOIN learner l ON l.id = hr.learner_id
         ORDER BY hr.created_at DESC LIMIT 100`);
      records = r1.rows;
      const r2 = await c.query<InfirmaryData["visits"][number]>(
        `SELECT cv.id::text, l.first_name || ' ' || l.last_name AS learner, cv.visited_on::text,
                cv.complaint, cv.action, cv.outcome, cv.parent_notified, cv.medication
         FROM clinic_visit cv JOIN learner l ON l.id = cv.learner_id
         ORDER BY cv.visited_on DESC LIMIT 50`);
      visits = r2.rows;
    }
    return { canOpen, stats: {
      records_ct: Number(st.rows[0]?.records_ct ?? 0),
      visits_30d: Number(st.rows[0]?.visits_30d ?? 0),
      open_allergies: Number(st.rows[0]?.open_allergies ?? 0),
    }, records, visits };
  });
}

export async function addHealthRecord(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { learnerId: string; kind: string; detail: string; parentDeclared: boolean },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO health_record (learner_id, kind, detail, parent_declared, created_by)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (learner_id, kind, detail) DO NOTHING`,
      [input.learnerId, input.kind, input.detail, input.parentDeclared, principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'infirmary.record.add', 'health_record', $2, $3)`,
      [principal.userId, input.learnerId, JSON.stringify({ kind: input.kind })],
    );
    return { ok: true as const };
  });
}

export async function logClinicVisit(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { learnerId: string; complaint: string; action?: string | null; outcome?: string | null;
           medication?: string | null; kitItemId?: string | null; parentNotified: boolean },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO clinic_visit (learner_id, complaint, action, outcome, medication, kit_item_id, parent_notified, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [input.learnerId, input.complaint, input.action ?? null, input.outcome ?? null,
       input.medication ?? null, input.kitItemId ?? null, input.parentNotified, principal.userId],
    );
    if (input.kitItemId) {
      await c.query(
        `UPDATE stock_item SET qty_on_hand = GREATEST(qty_on_hand - 1, 0) WHERE id = $1`,
        [input.kitItemId],
      );
    }
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'infirmary.visit.log', 'clinic_visit', $2, $3)`,
      [principal.userId, input.learnerId, JSON.stringify({ complaint: input.complaint, med: input.medication ?? null })],
    );
    return { ok: true as const };
  });
}

// ------------------------------ ⑳ Transport --------------------------------
export interface TransportData {
  routes: { id: string; name: string; fee_term_cents: string; learners: number; points: number; active: boolean }[];
  buses: { id: string; reg_no: string; capacity: number; route_name: string | null }[];
  trips: { id: string; direction: string; ran_on: string; done: boolean; route_name: string; reg_no: string }[];
}

export async function transportOverview(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<TransportData> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const routes = await c.query<TransportData["routes"][number]>(
      `SELECT tr.id::text, tr.name, tr.fee_term_cents::text, tr.active,
              (SELECT COUNT(*) FROM transport_manifest m WHERE m.route_id = tr.id AND m.term_active)::int AS learners,
              (SELECT COUNT(*) FROM transport_point tp WHERE tp.route_id = tr.id)::int AS points
       FROM transport_route tr ORDER BY tr.name`,
    );
    const buses = await c.query<TransportData["buses"][number]>(
      `SELECT b.id::text, b.reg_no, b.capacity, r.name AS route_name
       FROM transport_bus b LEFT JOIN transport_route r ON r.id = b.route_id
       ORDER BY b.reg_no`,
    );
    const trips = await c.query<TransportData["trips"][number]>(
      `SELECT tt.id::text, tt.direction, tt.ran_on::text, tt.done, r.name AS route_name, b.reg_no
       FROM transport_trip tt
       JOIN transport_route r ON r.id = tt.route_id
       JOIN transport_bus b ON b.id = tt.bus_id
       ORDER BY tt.ran_on DESC, tt.direction LIMIT 20`,
    );
    return { routes: routes.rows, buses: buses.rows, trips: trips.rows };
  });
}

export async function upsertRoute(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { name: string; feeTermCents: number },
): Promise<{ ok: true }> {
  if (principal.role !== "admin" && principal.role !== "principal") throw new Error("leaders manage routes");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO transport_route (name, fee_term_cents) VALUES ($1,$2)
       ON CONFLICT (name) DO UPDATE SET fee_term_cents = EXCLUDED.fee_term_cents`,
      [input.name, input.feeTermCents],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'transport.route.upsert', 'transport_route', $2, $3)`,
      [principal.userId, input.name, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

export async function upsertBus(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { regNo: string; capacity: number; routeId?: string | null },
): Promise<{ ok: true }> {
  if (principal.role !== "admin" && principal.role !== "principal") throw new Error("leaders manage buses");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO transport_bus (reg_no, capacity, route_id) VALUES ($1,$2,$3)
       ON CONFLICT (reg_no) DO UPDATE SET capacity = EXCLUDED.capacity, route_id = EXCLUDED.route_id`,
      [input.regNo, input.capacity, input.routeId ?? null],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'transport.bus.upsert', 'transport_bus', $2, $3)`,
      [principal.userId, input.regNo, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

export async function addStopToRoute(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { routeId: string; name: string; pickupAt?: string | null; sort?: number },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO transport_point (route_id, name, pickup_at, sort) VALUES ($1,$2,$3,$4)`,
      [input.routeId, input.name, input.pickupAt ?? null, input.sort ?? 0],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'transport.stop.add', 'transport_point', $2, $3)`,
      [principal.userId, input.name, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

export async function runTrip(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { busId: string; routeId: string; direction: "am" | "pm"; done?: boolean },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO transport_trip (bus_id, route_id, direction, done)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (bus_id, route_id, direction, ran_on) DO UPDATE SET done = EXCLUDED.done`,
      [input.busId, input.routeId, input.direction, input.done ?? false],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'transport.trip', 'transport_trip', $2, $3)`,
      [principal.userId, input.routeId, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

// ------------------------------ ㉑ Library + ㉒ Store ------------------------
export interface LibraryData {
  titles: number;
  copies: number;
  on_shelf: number;
  overdue: { copy_barcode: string; title: string; learner: string; due_on: string }[];
  most_borrowed: { title: string; loans: number }[];
}

export async function libraryOverview(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<LibraryData> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const counts = await c.query<{ titles: string; copies: string; shelf: string }>(
      `SELECT (SELECT COUNT(*) FROM library_item)::text AS titles,
              (SELECT COUNT(*) FROM library_copy)::text AS copies,
              (SELECT COUNT(*) FROM library_copy WHERE with_learner IS NULL)::text AS shelf`);
    const overdue = await c.query<LibraryData["overdue"][number]>(
      `SELECT lc.barcode AS copy_barcode, li.title, l.first_name || ' ' || l.last_name AS learner,
              lc.due_on::text
       FROM library_copy lc
       JOIN library_item li ON li.id = lc.item_id
       JOIN learner l ON l.id = lc.with_learner
       WHERE lc.due_on < CURRENT_DATE
       ORDER BY lc.due_on LIMIT 20`);
    const mb = await c.query<LibraryData["most_borrowed"][number]>(
      `SELECT li.title, COUNT(ll.id)::int AS loans
       FROM library_loan ll
       JOIN library_copy lc ON lc.id = ll.copy_id
       JOIN library_item li ON li.id = lc.item_id
       GROUP BY li.title ORDER BY loans DESC LIMIT 5`);
    return {
      titles: Number(counts.rows[0]!.titles),
      copies: Number(counts.rows[0]!.copies),
      on_shelf: Number(counts.rows[0]!.shelf),
      overdue: overdue.rows,
      most_borrowed: mb.rows,
    };
  });
}

export async function issueCopy(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { barcode: string; learnerId: string; days: number },
): Promise<{ ok: true; dueOn: string }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const copy = await c.query<{ id: string; with_learner: string | null }>(
      `SELECT id::text, with_learner::text FROM library_copy WHERE barcode = $1 FOR UPDATE`,
      [input.barcode]);
    if (!copy.rowCount) throw new Error("no such copy barcode");
    if (copy.rows[0]!.with_learner) throw new Error("copy already issued");
    const due = new Date(Date.now() + input.days * 86400000).toISOString().slice(0, 10);
    await c.query(
      `UPDATE library_copy SET with_learner = $2, due_on = $3 WHERE id = $1`,
      [copy.rows[0]!.id, input.learnerId, due],
    );
    await c.query(
      `INSERT INTO library_loan (copy_id, learner_id, issued_by) VALUES ($1,$2,$3)`,
      [copy.rows[0]!.id, input.learnerId, principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'library.issue', 'library_copy', $2, $3)`,
      [principal.userId, copy.rows[0]!.id, JSON.stringify({ learnerId: input.learnerId, due })],
    );
    return { ok: true as const, dueOn: due };
  });
}

export async function returnCopy(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { barcode: string },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const copy = await c.query<{ id: string; with_learner: string | null }>(
      `SELECT id::text, with_learner::text FROM library_copy WHERE barcode = $1 FOR UPDATE`,
      [input.barcode]);
    if (!copy.rowCount) throw new Error("no such copy barcode");
    if (!copy.rows[0]!.with_learner) throw new Error("copy is already on the shelf");
    await c.query(
      `UPDATE library_copy SET with_learner = NULL, due_on = NULL WHERE id = $1`,
      [copy.rows[0]!.id],
    );
    await c.query(
      `UPDATE library_loan SET returned_at = now()
       WHERE copy_id = $1 AND returned_at IS NULL`,
      [copy.rows[0]!.id],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'library.return', 'library_copy', $2, $3)`,
      [principal.userId, copy.rows[0]!.id, JSON.stringify({ barcode: input.barcode })],
    );
    return { ok: true as const };
  });
}

export async function addLibraryTitle(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { title: string; author?: string | null; isbn?: string | null; copies: number },
): Promise<{ ok: true }> {
  if (!["admin", "principal", "teacher"].includes(principal.role ?? "")) throw new Error("staff only");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const it = await c.query<{ id: string }>(
      `INSERT INTO library_item (title, author, isbn, copies_total)
       VALUES ($1,$2,$3,$4) RETURNING id::text`,
      [input.title, input.author ?? null, input.isbn ?? null, input.copies]);
    for (let i = 0; i < input.copies; i++) {
      await c.query(
        `INSERT INTO library_copy (item_id, barcode) VALUES ($1, $2)`,
        [it.rows[0]!.id, `LIB-${Date.now().toString(36).toUpperCase()}-${i + 1}`],
      );
    }
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'library.title.add', 'library_item', $2, $3)`,
      [principal.userId, it.rows[0]!.id, JSON.stringify({ title: input.title, copies: input.copies })],
    );
    return { ok: true as const };
  });
}

export interface StoreData {
  items: { id: string; name: string; category: string; qty_on_hand: number; low_stock_threshold: number; unit_price: string; low: boolean; section_name: string | null }[];
  low_count: number;
  stock_value_cents: string;
}

export async function storeOverview(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<StoreData> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const items = await c.query<StoreData["items"][number]>(
      `SELECT ki.id::text, ki.name, ki.category, ki.qty_on_hand, ki.low_stock_threshold,
              ki.unit_price::text, (ki.qty_on_hand <= ki.low_stock_threshold) AS low,
              s.name AS section_name
       FROM stock_item ki LEFT JOIN section s ON s.id = ki.section_id
       ORDER BY ki.name LIMIT 200`);
    const k = await c.query<{ low: string; value: string }>(
      `SELECT COUNT(*) FILTER (WHERE qty_on_hand <= low_stock_threshold)::text AS low,
              COALESCE(SUM(unit_price * qty_on_hand), 0)::text AS value
       FROM stock_item`);
    return {
      items: items.rows,
      low_count: Number(k.rows[0]!.low),
      stock_value_cents: k.rows[0]!.value,
    };
  });
}

export async function adjustStock(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { itemId: string; delta: number; note?: string | null },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `UPDATE stock_item SET qty_on_hand = GREATEST(qty_on_hand + $2, 0) WHERE id = $1`,
      [input.itemId, input.delta],
    );
    await c.query(
      `INSERT INTO stock_movement (item_id, delta, by_staff, note) VALUES ($1,$2,$3,$4)`,
      [input.itemId, input.delta, principal.userId, input.note ?? null],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'store.adjust', 'stock_item', $2, $3)`,
      [principal.userId, input.itemId, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

// ------------------------------ ㊶ Board & BOM ------------------------------
export interface BoardData {
  members: { id: string; full_name: string; office: string; term_end: string | null; phone: string | null; active: boolean }[];
  meetings: { id: string; title: string; held_on: string; agenda: string | null; minutes: string | null;
              items: { id: string; decision: string; action: string | null; owner: string | null; due_on: string | null; status: string }[] }[];
}

export async function boardOverview(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<BoardData> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const members = await c.query<BoardData["members"][number]>(
      `SELECT id::text, full_name, office, term_end::text, phone, active
       FROM board_member ORDER BY active DESC, office, full_name`);
    const ms = await c.query<BoardData["meetings"][number]["items"][number] & { meeting_id: string; m_title: string; held_on: string; agenda: string | null; minutes: string | null }>(
      `SELECT bm.id::text, bm.title AS m_title, bm.held_on::text AS held_on, bm.agenda, bm.minutes,
              bmi.id::text, bmi.decision, bmi.action, bmi.owner, bmi.due_on::text, bmi.status
       FROM board_meeting bm
       LEFT JOIN board_minute_item bmi ON bmi.meeting_id = bm.id
       ORDER BY bm.held_on DESC`);
    const meetings = new Map<string, BoardData["meetings"][number]>();
    for (const r of ms.rows) {
      let m = meetings.get(r.m_title + r.held_on);
      if (!m) {
        m = { id: r.meeting_id ?? `${r.m_title}-${r.held_on}`, title: r.m_title, held_on: r.held_on, agenda: r.agenda, minutes: r.minutes, items: [] };
        meetings.set(m.id, m);
      }
      if (r.id) {
        m.items.push({ id: r.id, decision: r.decision, action: r.action, owner: r.owner, due_on: r.due_on, status: r.status });
      }
    }
    return { members: members.rows, meetings: [...meetings.values()] };
  });
}

export async function addBoardMember(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { fullName: string; office: string; phone?: string | null; termEnd?: string | null },
): Promise<{ ok: true }> {
  if (principal.role !== "admin" && principal.role !== "principal") throw new Error("leaders manage the board");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO board_member (full_name, office, phone, term_end) VALUES ($1,$2,$3,$4)`,
      [input.fullName, input.office, input.phone ?? null, input.termEnd ?? null],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'board.member.add', 'board_member', $2, $3)`,
      [principal.userId, input.fullName, JSON.stringify({ office: input.office })],
    );
    return { ok: true as const };
  });
}

export async function recordMeeting(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { title: string; heldOn: string; agenda?: string | null; minutes?: string | null;
           decisions: { decision: string; action?: string | null; owner?: string | null; dueOn?: string | null }[] },
): Promise<{ ok: true }> {
  if (principal.role !== "admin" && principal.role !== "principal") throw new Error("leaders record meetings");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const m = await c.query<{ id: string }>(
      `INSERT INTO board_meeting (title, held_on, agenda, minutes, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id::text`,
      [input.title, input.heldOn, input.agenda ?? null, input.minutes ?? null, principal.userId]);
    for (const d of input.decisions) {
      await c.query(
        `INSERT INTO board_minute_item (meeting_id, decision, action, owner, due_on)
         VALUES ($1,$2,$3,$4,$5)`,
        [m.rows[0]!.id, d.decision, d.action ?? null, d.owner ?? null, d.dueOn ?? null],
      );
    }
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'board.meeting.record', 'board_meeting', $2, $3)`,
      [principal.userId, m.rows[0]!.id, JSON.stringify({ title: input.title, decisions: input.decisions.length })],
    );
    return { ok: true as const };
  });
}

// ------------------------------ Feature flags -------------------------------
export interface FeatureFlagRow { key: string; label: string; enabled: boolean; group_key: string }

export async function listFeatureFlags(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ rows: FeatureFlagRow[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<FeatureFlagRow>(
      `SELECT key, label, enabled, group_key FROM feature_flag ORDER BY group_key, label`);
    return { rows: r.rows };
  });
}

export async function setFeatureFlag(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { key: string; enabled: boolean },
): Promise<{ ok: true }> {
  if (principal.role !== "admin") throw new Error("only the admin sets capability flags");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query(
      `UPDATE feature_flag SET enabled = $1, updated_by = $2, updated_at = now() WHERE key = $3`,
      [input.enabled, principal.userId, input.key]);
    if (!r.rowCount) throw new Error("unknown flag");
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'flag.set', 'feature_flag', $2, $3)`,
      [principal.userId, input.key, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// Print artifacts: the documents a parent holds. One renderer payload each,
// one query each, no new tables — the print view is a lens, not a source.
// ---------------------------------------------------------------------------

export interface PaymentReceipt {
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

export interface ReportCardPrint {
  card_id: string;
  learner: string;
  admission_no: string | null;
  class_name: string | null;
  term: string;
  state: string;
  generated_on: string;
  payload: {
    vocab: { learner: string; class: string; subject: string } | null;
    scale: { k: string; name?: string }[] | null;
    curriculum: { code: string; name: string } | null;
    rows: { subject: string; strand: string | null; score: string | null; grade: string | null; exam_type: string }[];
    attendance: { present: number; total: number };
  };
  school: { name: string; contact_phone: string | null; contact_email: string | null; contact_address: string | null };
}

/**
 * THE report card print payload. Staff roles fetch any card by id (or the
 * latest for a learner); guardians may fetch ONLY their own child's card and
 * ONLY once it is approved — a draft never leaves the building.
 */
export async function reportCardPrint(
  dbName: string,
  session: { userId: string; role: string; guardianId?: string },
  lookup: { cardId?: string; learnerId?: string },
): Promise<ReportCardPrint | { error: string }> {
  // Guard the UUID boundary BEFORE Postgres sees the value: a junk id in the
  // URL must answer "card not found", never a raw 500 pg type error.
  const id = lookup.cardId ?? lookup.learnerId ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return { error: "card not found" };
  }
  return withSession(dbName, session, async (c) => {
    const isGuardian = session.role === "guardian";
    const card = await c.query<{
      card_id: string; learner_id: string; learner: string; admission_no: string | null;
      class_name: string | null; term: string; state: string; generated_on: string; payload: ReportCardPrint["payload"];
    }>(
      `SELECT rc.id::text AS card_id, l.id::text AS learner_id,
              l.first_name || ' ' || l.last_name AS learner, l.admission_no,
              cl.name AS class_name, t.label AS term, rc.state::text,
              rc.created_at::text AS generated_on, rc.payload
       FROM report_card rc
       JOIN learner l ON l.id = rc.learner_id
       LEFT JOIN class cl ON cl.id = rc.class_id
       JOIN term t ON t.id = rc.term_id
       WHERE ${lookup.cardId ? "rc.id = $1" : "rc.learner_id = $1"}
       ORDER BY rc.created_at DESC LIMIT 1`,
      [lookup.cardId ?? lookup.learnerId ?? ""],
    );
    if (!card.rowCount) return { error: "card not found" };
    const row = card.rows[0]!;
    if (isGuardian) {
      const own = await c.query(
        `SELECT 1 FROM learner_guardian WHERE guardian_id = $1 AND learner_id = $2`,
        [session.guardianId ?? "", row.learner_id],
      );
      if (!own.rowCount) return { error: "not your child" };
      if (row.state === "draft") return { error: "card not yet approved" };
    }
    const school = await c.query<{
      name: string; contact_phone: string | null; contact_email: string | null; contact_address: string | null;
    }>(`SELECT name, contact_phone, contact_email, contact_address FROM school_settings WHERE id = 'default'`);
    return {
      card_id: row.card_id,
      learner: row.learner,
      admission_no: row.admission_no,
      class_name: row.class_name,
      term: row.term,
      state: row.state,
      generated_on: row.generated_on,
      payload: row.payload,
      school: {
        name: school.rows[0]?.name ?? "",
        contact_phone: school.rows[0]?.contact_phone ?? null,
        contact_email: school.rows[0]?.contact_email ?? null,
        contact_address: school.rows[0]?.contact_address ?? null,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// The edit pass: every register row is correctable on its own screen.
// One upsert per entity, before/after audit lines, leaders only.
// ---------------------------------------------------------------------------

export interface UpsertLearnerInput {
  id?: string;
  admissionNo?: string;      // only on create; immutable after (the ledger keys on it)
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender?: "M" | "F" | null;
  dob?: string | null;       // yyyy-mm-dd
  classId?: number | null;
  boarding?: boolean;
  upi?: string | null;       // the KEMIS gate
  birthCertNo?: string | null;
  status?: "active" | "transferred" | "graduated" | "inactive";
}

/** Create or correct one learner. Leaders only; before/after audited. */
export async function upsertLearner(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: UpsertLearnerInput,
): Promise<{ ok: true; id: string; admissionNo: string } | { ok: false; error: string }> {
  if (principal.role !== "admin" && principal.role !== "principal") {
    return { ok: false, error: "Only the admin or principal edit the roll" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    try {
      if (input.id) {
        const prev = await c.query<Record<string, unknown>>(
          `SELECT admission_no, first_name, middle_name, last_name, gender::text, date_of_birth::text,
                  class_id, boarding, upi, birth_cert_no, status::text
           FROM learner WHERE id = $1`, [input.id]);
        if (!prev.rowCount) return { ok: false, error: "Learner not found" };
        await c.query(
          `UPDATE learner SET
             first_name = $2, middle_name = $3, last_name = $4,
             gender = $5, date_of_birth = $6,
             class_id = COALESCE($7, class_id), boarding = COALESCE($8, boarding),
             upi = COALESCE($9, upi), birth_cert_no = COALESCE($10, birth_cert_no),
             status = COALESCE($11::learner_status, status)
           WHERE id = $1`,
          [input.id, input.firstName, input.middleName ?? null, input.lastName,
           input.gender ?? null, input.dob ?? null, input.classId ?? null,
           input.boarding ?? null, input.upi?.trim() || null, input.birthCertNo?.trim() || null,
           input.status ?? null],
        );
        await c.query(
          `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, before, after)
           VALUES ($1, 'staff', 'learner.update', 'learner', $2, $3, $4)`,
          [principal.userId, input.id, JSON.stringify(prev.rows[0]), JSON.stringify(input)],
        );
        return { ok: true, id: input.id, admissionNo: String(prev.rows[0]!.admission_no) };
      }
      // Create — mint the admission number when not supplied.
      let adm = input.admissionNo?.trim() || "";
      if (!adm) {
        const next = await c.query<{ adm: string }>(
          `SELECT 'ADM-' || lpad((coalesce(max(nullif(regexp_replace(admission_no, '\\D', '', 'g'), '')::bigint), 0::bigint) + 1)::text, 3, '0') AS adm
           FROM learner`);
        adm = next.rows[0]!.adm;
      }
      const dup = await c.query(`SELECT 1 FROM learner WHERE admission_no = $1`, [adm]);
      if (dup.rowCount) return { ok: false, error: `Admission number ${adm} is already on the roll` };
      const ins = await c.query<{ id: string }>(
        `INSERT INTO learner (admission_no, first_name, middle_name, last_name, gender, date_of_birth, class_id, boarding, upi, birth_cert_no)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id::text`,
        [adm, input.firstName, input.middleName ?? null, input.lastName,
         input.gender ?? null, input.dob ?? null, input.classId ?? null,
         input.boarding ?? false, input.upi?.trim() || null, input.birthCertNo?.trim() || null],
      );
      await c.query(
        `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
         VALUES ($1, 'staff', 'learner.create', 'learner', $2, $3)`,
        [principal.userId, ins.rows[0]!.id, JSON.stringify({ ...input, admissionNo: adm })],
      );
      return { ok: true, id: ins.rows[0]!.id, admissionNo: adm };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
}

/** Update one calendar event (title/kind/dates/notes). Teacher-led staff only. */
export async function updateEvent(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string; title: string; kind: string; startsOn: string; endsOn?: string | null; notes?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(["admin", "principal", "teacher"] as (string | undefined)[]).includes(principal.role)) throw new Error("staff only");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const prev = await c.query(`SELECT title, kind, starts_on::text, ends_on::text, notes FROM school_event WHERE id = $1`, [input.id]);
    if (!prev.rowCount) return { ok: false, error: "Event not found" };
    await c.query(
      `UPDATE school_event SET title = $2, kind = $3, starts_on = $4::date, ends_on = $5::date, notes = $6
       WHERE id = $1`,
      [input.id, input.title, input.kind, input.startsOn, input.endsOn ?? null, input.notes ?? null],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, before, after)
       VALUES ($1, 'staff', 'event.update', 'school_event', $2, $3, $4)`,
      [principal.userId, input.id, JSON.stringify(prev.rows[0]), JSON.stringify(input)],
    );
    return { ok: true };
  });
}

/** Take an event off the calendar — audited with the title so the record tells the story. */
export async function cancelEvent(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(["admin", "principal"] as (string | undefined)[]).includes(principal.role)) throw new Error("leaders cancel events");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const prev = await c.query<{ title: string }>(`SELECT title FROM school_event WHERE id = $1`, [id]);
    if (!prev.rowCount) return { ok: false, error: "Event not found" };
    await c.query(`DELETE FROM school_event WHERE id = $1`, [id]);
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'event.cancel', 'school_event', $2, $3)`,
      [principal.userId, id, JSON.stringify({ title: prev.rows[0]!.title })],
    );
    return { ok: true };
  });
}

/** Turn a transport route on/off — retired routes keep their history. */
export async function setRouteActive(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string; active: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (principal.role !== "admin" && principal.role !== "principal") throw new Error("leaders manage routes");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query(`UPDATE transport_route SET active = $2 WHERE id = $1`, [input.id, input.active]);
    if (!r.rowCount) return { ok: false, error: "Route not found" };
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'transport.route.state', 'transport_route', $2, $3)`,
      [principal.userId, input.id, JSON.stringify(input)],
    );
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// 6 HR & LEAVE — the ledger (docs/BUILD-PHASES.md Phase 3)
// ---------------------------------------------------------------------------

export interface LeaveRow {
  id: string; staff_id: string; staff_name: string; staff_role: string;
  kind: string; state: string; starts_on: string; ends_on: string; days: number;
  reason: string; decision_reason: string;
}

export async function hrOverview(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{
  onLeaveToday: LeaveRow[];
  pending: LeaveRow[];
  recent: LeaveRow[];
  balances: { staff_id: string; staff_name: string; role: string; kind: string; taken: number; entitlement: number }[];
  rules: { kind: string; days: number; note: string | null }[];
}> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const today = await c.query<{ today: string }>(`SELECT CURRENT_DATE::text AS today`);
    const day = today.rows[0]!.today;
    const onLeaveToday = await c.query<LeaveRow>(
      `SELECT lv.id::text, lv.staff_id::text, s.full_name AS staff_name, s.role::text AS staff_role,
              lv.kind::text AS kind, lv.state::text AS state,
              lv.starts_on::text, lv.ends_on::text, lv.days, lv.reason, lv.decision_reason
       FROM staff_leave lv JOIN staff s ON s.id = lv.staff_id
       WHERE lv.state = 'approved' AND lv.starts_on <= $1 AND lv.ends_on >= $1
       ORDER BY s.full_name`, [day]);
    const pending = await c.query<LeaveRow>(
      `SELECT lv.id::text, lv.staff_id::text, s.full_name AS staff_name, s.role::text AS staff_role,
              lv.kind::text AS kind, lv.state::text AS state,
              lv.starts_on::text, lv.ends_on::text, lv.days, lv.reason, lv.decision_reason
       FROM staff_leave lv JOIN staff s ON s.id = lv.staff_id
       WHERE lv.state = 'pending'
       ORDER BY lv.created_at`);
    const recent = await c.query<LeaveRow>(
      `SELECT lv.id::text, lv.staff_id::text, s.full_name AS staff_name, s.role::text AS staff_role,
              lv.kind::text AS kind, lv.state::text AS state,
              lv.starts_on::text, lv.ends_on::text, lv.days, lv.reason, lv.decision_reason
       FROM staff_leave lv JOIN staff s ON s.id = lv.staff_id
       WHERE lv.state <> 'pending'
       ORDER BY lv.updated_at DESC NULLS LAST LIMIT 12`);
    const rules = await c.query<{ kind: string; days: number; note: string | null }>(
      `SELECT kind::text AS kind, days, note FROM staff_leave_rules ORDER BY days DESC`);
    const yearStart = day.slice(0, 4) + "-01-01";
    const balances = await c.query<{ staff_id: string; staff_name: string; role: string; kind: string; taken: string; entitlement: string }>(
      `SELECT s.id::text AS staff_id, s.full_name AS staff_name, s.role::text AS role,
              r.kind::text AS kind,
              COALESCE(SUM(lv.days) FILTER (WHERE lv.state = 'approved' AND lv.starts_on >= $1), 0)::text AS taken,
              r.days::text AS entitlement
       FROM staff s
       CROSS JOIN staff_leave_rules r
       LEFT JOIN staff_leave lv ON lv.staff_id = s.id AND lv.kind = r.kind
       WHERE s.active
       GROUP BY s.id, s.full_name, s.role, r.kind, r.days
       ORDER BY s.full_name, r.kind`, [yearStart]);
    return {
      onLeaveToday: onLeaveToday.rows,
      pending: pending.rows,
      recent: recent.rows,
      rules: rules.rows,
      balances: balances.rows.map((b) => ({
        staff_id: b.staff_id, staff_name: b.staff_name, role: b.role, kind: b.kind,
        taken: Number(b.taken), entitlement: Number(b.entitlement),
      })),
    };
  });
}

/** Raise a leave request — any staff for themselves; leaders may key on behalf. */
export async function raiseLeave(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { staffId?: string; kind: string; startsOn: string; endsOn: string; reason: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const kinds = ["annual", "sick", "maternity", "paternity", "compassionate", "other"];
  if (!kinds.includes(input.kind)) return { ok: false, error: "Unknown leave kind" };
  if (input.endsOn < input.startsOn) return { ok: false, error: "Leave cannot end before it starts" };
  const targetId = input.staffId && ["admin", "principal"].includes(principal.role) ? input.staffId : principal.userId;
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const days = await c.query<{ n: string }>(
      `SELECT (SELECT COUNT(*) FROM generate_series($1::date, $2::date, '1 day'))::text AS n`,
      [input.startsOn, input.endsOn]);
    const ins = await c.query<{ id: string }>(
      `INSERT INTO staff_leave (staff_id, kind, starts_on, ends_on, days, reason, raised_by)
       VALUES ($1, $2::leave_kind, $3::date, $4::date, $5, $6, $7) RETURNING id::text AS id`,
      [targetId, input.kind, input.startsOn, input.endsOn, Number(days.rows[0]!.n), input.reason, principal.userId]);
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'leave.raise', 'staff_leave', $2, $3)`,
      [principal.userId, ins.rows[0]!.id, JSON.stringify(input)]);
    return { ok: true, id: ins.rows[0]!.id };
  });
}

/** Decide a leave request — admin/principal, mandatory reason, self-decision block. */
export async function decideLeave(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string; approve: boolean; reason: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (principal.role !== "admin" && principal.role !== "principal") throw new Error("leaders decide leave");
  if (input.reason.trim().length < 4) return { ok: false, error: "A reason is mandatory on every decision" };
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const prev = await c.query<{ staff_id: string; state: string }>(
      `SELECT staff_id::text AS staff_id, state::text AS state FROM staff_leave WHERE id = $1`, [input.id]);
    if (!prev.rowCount) return { ok: false, error: "Leave request not found" };
    if (prev.rows[0]!.state !== "pending") return { ok: false, error: "Already decided" };
    if (prev.rows[0]!.staff_id === principal.userId) return { ok: false, error: "You cannot decide your own leave" };
    const next = input.approve ? "approved" : "rejected";
    await c.query(
      `UPDATE staff_leave SET state = $2::leave_state, decided_by = $3, decision_reason = $4, decided_at = now()
       WHERE id = $1`,
      [input.id, next, principal.userId, input.reason.trim()]);
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, before, after)
       VALUES ($1, 'staff', $2, 'staff_leave', $3, $4, $5)`,
      [principal.userId, input.approve ? "leave.approve" : "leave.reject", input.id,
       JSON.stringify(prev.rows[0]), JSON.stringify(input)]);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// 19 TIMETABLE — the period grid (docs/BUILD-PHASES.md Phase 3)
// ---------------------------------------------------------------------------

export interface SlotRow {
  id: string; class_id: number; class_name: string; class_code: string;
  day_of_week: number; period: number; starts_at: string | null; ends_at: string | null;
  area_code: string | null; area_name: string | null;
  teacher_id: string | null; teacher_name: string | null; room: string | null; active: boolean;
}

export async function timetable(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ slots: SlotRow[]; classes: { id: number; code: string; name: string }[]; teachers: { id: string; name: string }[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const slots = await c.query<SlotRow>(
      `SELECT ts.id::text, ts.class_id, cl.name AS class_name, cl.code AS class_code,
              ts.day_of_week, ts.period, ts.starts_at, ts.ends_at,
              ts.area_code, ts.area_name, ts.teacher_id::text,
              s.full_name AS teacher_name, ts.room, ts.active
       FROM timetable_slot ts
       JOIN class cl ON cl.id = ts.class_id
       LEFT JOIN staff s ON s.id = ts.teacher_id
       ORDER BY cl.code, ts.day_of_week, ts.period`);
    const classes = await c.query<{ id: number; code: string; name: string }>(
      `SELECT id, code, name FROM class ORDER BY code`);
    const teachers = await c.query<{ id: string; name: string }>(
      `SELECT id::text AS id, full_name AS name FROM staff WHERE active ORDER BY full_name`);
    return { slots: slots.rows, classes: classes.rows, teachers: teachers.rows };
  });
}

/**
 * Upsert one slot — leaders only. Guard: teacher clash (same day+period on
 * another active class) is refused loudly, with the clashing class named.
 */
export async function upsertSlot(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id?: string; classId: number; dayOfWeek: number; period: number;
           startsAt?: string | null; endsAt?: string | null;
           areaCode?: string | null; areaName?: string | null;
           teacherId?: string | null; room?: string | null },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (principal.role !== "admin" && principal.role !== "principal") throw new Error("leaders edit the grid");
  if (input.dayOfWeek < 1 || input.dayOfWeek > 7) return { ok: false, error: "Day must be 1-7" };
  if (input.period < 1 || input.period > 9) return { ok: false, error: "Period must be 1-9" };
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    if (input.teacherId) {
      const clash = await c.query<{ class_name: string }>(
        `SELECT cl.name AS class_name
         FROM timetable_slot ts JOIN class cl ON cl.id = ts.class_id
         WHERE ts.teacher_id = $1 AND ts.day_of_week = $2 AND ts.period = $3
           AND ts.active AND ts.class_id <> $4 AND ($5::uuid IS NULL OR ts.id <> $5::uuid)
         LIMIT 1`,
        [input.teacherId, input.dayOfWeek, input.period, input.classId, input.id ?? null]);
      if (clash.rowCount) return { ok: false, error: "Teacher clash: already teaching " + clash.rows[0]!.class_name + " at that period" };
    }
    let id: string | null = input.id ?? null;
    if (id) {
      const prev = await c.query(`SELECT * FROM timetable_slot WHERE id = $1`, [id]);
      if (!prev.rowCount) return { ok: false, error: "Slot not found" };
      await c.query(
        `UPDATE timetable_slot SET class_id = $2, day_of_week = $3, period = $4, starts_at = $5, ends_at = $6,
                area_code = $7, area_name = $8, teacher_id = $9, room = $10
         WHERE id = $1`,
        [id, input.classId, input.dayOfWeek, input.period, input.startsAt ?? null, input.endsAt ?? null,
         input.areaCode ?? null, input.areaName ?? null, input.teacherId ?? null, input.room ?? null]);
      await c.query(
        `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, before, after)
         VALUES ($1, 'staff', 'timetable.update', 'timetable_slot', $2, $3, $4)`,
        [principal.userId, id, JSON.stringify(prev.rows[0]), JSON.stringify(input)]);
    } else {
      const dup = await c.query(`SELECT id::text AS id FROM timetable_slot WHERE class_id = $1 AND day_of_week = $2 AND period = $3`,
        [input.classId, input.dayOfWeek, input.period]);
      if (dup.rowCount) {
        id = dup.rows[0]!.id;
        await c.query(
          `UPDATE timetable_slot SET starts_at = $4, ends_at = $5, area_code = $6, area_name = $7,
                  teacher_id = $8, room = $9, active = true
           WHERE id = $1 AND class_id = $2 AND day_of_week = $3`,
          [id, input.classId, input.dayOfWeek, input.startsAt ?? null, input.endsAt ?? null,
           input.areaCode ?? null, input.areaName ?? null, input.teacherId ?? null, input.room ?? null]);
      } else {
        const ins = await c.query<{ id: string }>(
          `INSERT INTO timetable_slot (class_id, day_of_week, period, starts_at, ends_at, area_code, area_name, teacher_id, room, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id::text AS id`,
          [input.classId, input.dayOfWeek, input.period, input.startsAt ?? null, input.endsAt ?? null,
           input.areaCode ?? null, input.areaName ?? null, input.teacherId ?? null, input.room ?? null, principal.userId]);
        id = ins.rows[0]!.id;
      }
      await c.query(
        `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
         VALUES ($1, 'staff', 'timetable.upsert', 'timetable_slot', $2, $3)`,
        [principal.userId, id, JSON.stringify(input)]);
    }
    return { ok: true, id: id as string };
  });
}

/** Clear one slot (soft: active=false) — audited; the grid keeps its history. */
export async function clearSlot(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (principal.role !== "admin" && principal.role !== "principal") throw new Error("leaders edit the grid");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query(`UPDATE timetable_slot SET active = false WHERE id = $1 AND active`, [input.id]);
    if (!r.rowCount) return { ok: false, error: "Slot not found or already cleared" };
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'timetable.clear', 'timetable_slot', $2, $3)`,
      [principal.userId, input.id, JSON.stringify(input)]);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// 15 PETTY CASH & BUDGETS (docs/BUILD-PHASES.md Phase 3)
// ---------------------------------------------------------------------------

export interface PettyTxnRow {
  id: string; direction: string; state: string; amount_cents: string;
  cost_center: string; description: string; spent_on: string;
  raised_by: string | null; decision_reason: string;
}
export interface BudgetRow {
  id: string; term_id: number; cost_center: string; budget_cents: string;
  spent_cents: string;
}

export async function pettyOverview(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{
  balanceCents: string;
  pending: PettyTxnRow[];
  recent: PettyTxnRow[];
  budgets: BudgetRow[];
  centers: string[];
}> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const bal = await c.query<{ b: string }>(
      `SELECT COALESCE(SUM(CASE direction WHEN 'topup' THEN amount_cents ELSE -amount_cents END), 0)::text AS b
       FROM petty_cash WHERE state IN ('approved','settled')`);
    const pending = await c.query<PettyTxnRow>(
      `SELECT pc.id::text, pc.direction::text, pc.state::text, pc.amount_cents::text,
              pc.cost_center, pc.description, pc.spent_on::text,
              s.full_name AS raised_by, pc.decision_reason
       FROM petty_cash pc LEFT JOIN staff s ON s.id = pc.raised_by
       WHERE pc.state = 'pending' ORDER BY pc.created_at`);
    const recent = await c.query<PettyTxnRow>(
      `SELECT pc.id::text, pc.direction::text, pc.state::text, pc.amount_cents::text,
              pc.cost_center, pc.description, pc.spent_on::text,
              s.full_name AS raised_by, pc.decision_reason
       FROM petty_cash pc LEFT JOIN staff s ON s.id = pc.raised_by
       WHERE pc.state <> 'pending' ORDER BY pc.spent_on DESC, pc.created_at DESC LIMIT 20`);
    const term = await c.query<{ id: number }>(`SELECT id FROM term ORDER BY starts_on DESC LIMIT 1`);
    const termId = term.rows[0]?.id ?? 0;
    const budgets = await c.query<BudgetRow>(
      `SELECT b.id::text, b.term_id, b.cost_center, b.budget_cents::text,
              COALESCE((SELECT SUM(pc.amount_cents) FROM petty_cash pc
                        WHERE pc.cost_center = b.cost_center AND pc.direction = 'spend'
                          AND pc.state IN ('approved','settled')
                          AND pc.spent_on >= (SELECT starts_on FROM term WHERE id = $1)
                          AND pc.spent_on <= (SELECT ends_on FROM term WHERE id = $1)), 0)::text AS spent_cents
       FROM pc_budget b WHERE b.term_id = $1 ORDER BY b.cost_center`, [termId]);
    const centers = await c.query<{ cost_center: string }>(
      `SELECT DISTINCT cost_center FROM (
         SELECT cost_center FROM petty_cash
         UNION SELECT cost_center FROM pc_budget
         UNION SELECT 'general' UNION SELECT 'transport' UNION SELECT 'kitchen'
         UNION SELECT 'stationery' UNION SELECT 'repairs' UNION SELECT 'utilities'
       ) x ORDER BY 1`);
    return {
      balanceCents: bal.rows[0]!.b,
      pending: pending.rows,
      recent: recent.rows,
      budgets: budgets.rows,
      centers: centers.rows.map((r) => r.cost_center),
    };
  });
}

/** Record a petty entry. Spends may require approval when above the threshold. */
export async function recordPetty(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { direction: "topup" | "spend"; amountCents: number; costCenter: string; description: string; spentOn?: string },
): Promise<{ ok: true; needsApproval: boolean } | { ok: false; error: string }> {
  if (!["admin", "bursar"].includes(principal.role)) throw new Error("money roles only");
  if (input.amountCents <= 0) return { ok: false, error: "Amount must be more than zero" };
  const NEEDS_APPROVAL_ABOVE = 200_00; // Ksh 200 default threshold
  const needsApproval = input.direction === "spend" && input.amountCents > NEEDS_APPROVAL_ABOVE;
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const ins = await c.query<{ id: string }>(
      `INSERT INTO petty_cash (direction, state, amount_cents, cost_center, description, spent_on, raised_by)
       VALUES ($1::pc_direction, $2::pc_state, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7) RETURNING id::text AS id`,
      [input.direction, needsApproval ? "pending" : "approved", input.amountCents,
       input.costCenter || "general", input.description, input.spentOn ?? null, principal.userId]);
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'petty.record', 'petty_cash', $2, $3)`,
      [principal.userId, ins.rows[0]!.id, JSON.stringify(input)]);
    return { ok: true, needsApproval };
  });
}

/** Decide a pending petty spend — admin/principal, reason mandatory on reject. */
export async function decidePetty(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string; approve: boolean; reason: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!["admin", "principal"].includes(principal.role)) throw new Error("leaders decide");
  if (!input.approve && input.reason.trim().length < 4) return { ok: false, error: "A reason is mandatory on rejection" };
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const prev = await c.query<{ state: string }>(`SELECT state::text AS state FROM petty_cash WHERE id = $1`, [input.id]);
    if (!prev.rowCount) return { ok: false, error: "Entry not found" };
    if (prev.rows[0]!.state !== "pending") return { ok: false, error: "Already decided" };
    await c.query(
      `UPDATE petty_cash SET state = $2::pc_state, approved_by = $3, decided_at = now(), decision_reason = $4
       WHERE id = $1`,
      [input.id, input.approve ? "approved" : "rejected", principal.userId, input.reason.trim()]);
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', $2, 'petty_cash', $3, $4)`,
      [principal.userId, input.approve ? "petty.approve" : "petty.reject", input.id, JSON.stringify(input)]);
    return { ok: true };
  });
}

/** Upsert a budget line per term/cost-center — leaders only. */
export async function upsertBudget(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { costCenter: string; budgetCents: number; note?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!["admin", "principal"].includes(principal.role)) throw new Error("leaders set budgets");
  if (input.budgetCents < 0) return { ok: false, error: "Budget cannot be negative" };
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const term = await c.query<{ id: number }>(`SELECT id FROM term ORDER BY starts_on DESC LIMIT 1`);
    const termId = term.rows[0]?.id;
    if (!termId) return { ok: false, error: "No term exists yet — set the calendar first" };
    await c.query(
      `INSERT INTO pc_budget (term_id, cost_center, budget_cents, note, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (term_id, cost_center) DO UPDATE SET budget_cents = $3, note = $4`,
      [termId, input.costCenter || "general", input.budgetCents, input.note ?? null, principal.userId]);
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'budget.set', 'pc_budget', $2, $3)`,
      [principal.userId, input.costCenter || "general", JSON.stringify(input)]);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// 33 PURCHASES & SUPPLIERS (docs/BUILD-PHASES.md Phase 3)
// ---------------------------------------------------------------------------

export interface SupplierRow {
  id: string; name: string; phone: string | null; email: string | null;
  category: string; active: boolean; notes: string | null;
}
export interface PurchaseRow {
  id: string; ref: string; supplier_id: string | null; supplier_name: string | null;
  title: string; cost_center: string; est_cents: string; state: string;
  requested_by: string | null; decision_reason: string; created_at: string;
}

export async function purchasesOverview(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ suppliers: SupplierRow[]; requests: PurchaseRow[]; openTotalCents: string }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const suppliers = await c.query<SupplierRow>(
      `SELECT id::text, name, phone, email::text, category, active, notes
       FROM supplier ORDER BY active DESC, name`);
    const requests = await c.query<PurchaseRow>(
      `SELECT pr.id::text, pr.ref, pr.supplier_id::text, s.name AS supplier_name,
              pr.title, pr.cost_center, pr.est_cents::text, pr.state::text,
              st.full_name AS requested_by, pr.decision_reason, pr.created_at::text
       FROM purchase_request pr
       LEFT JOIN supplier s ON s.id = pr.supplier_id
       LEFT JOIN staff st ON st.id = pr.requested_by
       ORDER BY pr.created_at DESC LIMIT 40`);
    const open = await c.query<{ t: string }>(
      `SELECT COALESCE(SUM(est_cents), 0)::text AS t FROM purchase_request
       WHERE state IN ('draft','submitted','approved','ordered')`);
    return { suppliers: suppliers.rows, requests: requests.rows, openTotalCents: open.rows[0]!.t };
  });
}

export async function upsertSupplier(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id?: string; name: string; phone?: string | null; email?: string | null; category?: string; notes?: string | null },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!["admin", "bursar"].includes(principal.role)) throw new Error("money roles only");
  if (input.name.trim().length < 2) return { ok: false, error: "Supplier name is required" };
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    let id = input.id ?? null;
    if (id) {
      const prev = await c.query(`SELECT * FROM supplier WHERE id = $1`, [id]);
      if (!prev.rowCount) return { ok: false, error: "Supplier not found" };
      await c.query(
        `UPDATE supplier SET name = $2, phone = $3, email = $4, category = $5, notes = $6 WHERE id = $1`,
        [id, input.name.trim(), input.phone ?? null, input.email ?? null, input.category ?? "general", input.notes ?? null]);
      await c.query(
        `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, before, after)
         VALUES ($1, 'staff', 'supplier.update', 'supplier', $2, $3, $4)`,
        [principal.userId, id, JSON.stringify(prev.rows[0]), JSON.stringify(input)]);
    } else {
      const ins = await c.query<{ id: string }>(
        `INSERT INTO supplier (name, phone, email, category, notes) VALUES ($1, $2, $3, $4, $5) RETURNING id::text AS id`,
        [input.name.trim(), input.phone ?? null, input.email ?? null, input.category ?? "general", input.notes ?? null]);
      id = ins.rows[0]!.id;
      await c.query(
        `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
         VALUES ($1, 'staff', 'supplier.create', 'supplier', $2, $3)`,
        [principal.userId, id, JSON.stringify(input)]);
    }
    return { ok: true, id };
  });
}

export async function toggleSupplier(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string; active: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!["admin", "bursar"].includes(principal.role)) throw new Error("money roles only");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query(`UPDATE supplier SET active = $2 WHERE id = $1`, [input.id, input.active]);
    if (!r.rowCount) return { ok: false, error: "Supplier not found" };
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'supplier.state', 'supplier', $2, $3)`,
      [principal.userId, input.id, JSON.stringify(input)]);
    return { ok: true };
  });
}

/**
 * Raise a purchase request. State machine walked by movePurchase below;
 * this mints the PR-ref and starts at draft (or submitted when the caller
 * asks to send it straight to approval).
 */
export async function raisePurchase(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { title: string; supplierId?: string | null; costCenter?: string; estCents: number; submit?: boolean; note?: string },
): Promise<{ ok: true; id: string; ref: string } | { ok: false; error: string }> {
  if (!["admin", "principal", "bursar"].includes(principal.role)) throw new Error("money roles only");
  if (input.title.trim().length < 3) return { ok: false, error: "What is being bought? (3+ letters)" };
  if (input.estCents < 0) return { ok: false, error: "Estimate cannot be negative" };
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const ref = await c.query<{ ref: string }>(`SELECT pr_next_ref() AS ref`);
    const minted = ref.rows[0]!.ref;
    const ins = await c.query<{ id: string }>(
      `INSERT INTO purchase_request (ref, supplier_id, title, cost_center, est_cents, state, requested_by, note)
       VALUES ($1, $2, $3, $4, $5, $6::pr_state, $7, $8) RETURNING id::text AS id`,
      [minted, input.supplierId ?? null, input.title.trim(), input.costCenter || "general",
       input.estCents, input.submit ? "submitted" : "draft", principal.userId, input.note ?? null]);
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'purchase.raise', 'purchase_request', $2, $3)`,
      [principal.userId, ins.rows[0]!.id, JSON.stringify(input)]);
    return { ok: true, id: ins.rows[0]!.id, ref: minted };
  });
}

/** Walk the purchase state machine forward — with the refusals that matter. */
const PR_NEXT: Record<string, { next: string; action: string; roles: string[]; needsReason: boolean }> = {
  draft: { next: "submitted", action: "purchase.submit", roles: ["admin", "principal", "bursar"], needsReason: false },
  submitted: { next: "approved", action: "purchase.approve", roles: ["admin", "principal"], needsReason: false },
  approved: { next: "ordered", action: "purchase.order", roles: ["admin", "bursar"], needsReason: false },
  ordered: { next: "received", action: "purchase.receive", roles: ["admin", "bursar"], needsReason: false },
  received: { next: "paid", action: "purchase.pay", roles: ["admin", "bursar"], needsReason: false },
};

export async function movePurchase(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string; action: "submit" | "approve" | "cancel" | "order" | "receive" | "pay"; reason?: string },
): Promise<{ ok: true; state: string } | { ok: false; error: string }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const cur = await c.query<{ state: string }>(`SELECT state::text AS state FROM purchase_request WHERE id = $1`, [input.id]);
    if (!cur.rowCount) return { ok: false, error: "Purchase request not found" };
    const state = cur.rows[0]!.state;

    if (input.action === "cancel") {
      if (!["draft", "submitted"].includes(state)) return { ok: false, error: "Only draft or submitted requests can be cancelled" };
      if ((input.reason ?? "").trim().length < 4) return { ok: false, error: "A reason is mandatory on cancellation" };
      await c.query(
        `UPDATE purchase_request SET state = 'cancelled', decided_by = $2, decision_reason = $3, decided_at = now() WHERE id = $1`,
        [input.id, principal.userId, input.reason!.trim()]);
      await c.query(
        `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
         VALUES ($1, 'staff', 'purchase.cancel', 'purchase_request', $2, $3)`,
        [principal.userId, input.id, JSON.stringify(input)]);
      return { ok: true, state: "cancelled" };
    }

    const step = PR_NEXT[state];
    if (!step || step.action !== "purchase." + input.action) {
      return { ok: false, error: "Cannot " + input.action + " from state '" + state + "'" };
    }
    if (!step.roles.includes(principal.role)) return { ok: false, error: "Only " + step.roles.join("/") + " can " + input.action };
    await c.query(
      `UPDATE purchase_request SET state = $2::pr_state,
              decided_by = CASE WHEN $3 THEN decided_by ELSE decided_by END,
              received_at = CASE WHEN $2 = 'received' THEN now() ELSE received_at END,
              paid_at = CASE WHEN $2 = 'paid' THEN now() ELSE paid_at END
       WHERE id = $1`,
      [input.id, step.next, input.action === "approve"]);
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', $2, 'purchase_request', $3, $4)`,
      [principal.userId, step.action, input.id, JSON.stringify(input)]);
    return { ok: true, state: step.next };
  });
}

// ---------------------------------------------------------------------------
// BREADTH GAPS (docs/MASTER-CHECKLIST.md flank batches) - consent flags on
// structures, fee extras, payroll dashboard + statutory tasks, admissions
// charts, exam entries, class moves, guardian relationship editor, campaigns,
// mess, security visitors, patron surface, Sections vital sign.
// ---------------------------------------------------------------------------

// ---------------- 12/13 Money: consent flag + apply-side effects -----------
export async function setFeeItemConsent(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: number; isOptional: boolean },
) {
  if (!["admin", "bursar"].includes(principal.role)) {
    return { ok: false as const, error: "Only admin or bursar can change fee items" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query(
      `UPDATE fee_structure SET is_optional = $2 WHERE id = $1 RETURNING name, term_id, class_id`,
      [input.id, input.isOptional],
    );
    if (r.rowCount === 0) return { ok: false as const, error: "Fee item not found" };
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'fee_structure.consent', 'fee_structure', $2, $3)`,
      [principal.userId, String(input.id), JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

/** Consent write-through: answering an optional levy creates/updates the
 *  consent ledger row AND flips the learner's fee_item optional flag. */
export async function answerOptionalLevy(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { structureId: number; learnerId: string; choice: "granted" | "declined" },
) {
  if (!["admin", "bursar", "counter"].includes(principal.role)) {
    return { ok: false as const, error: "Only the money desk records consent" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const st = await c.query<{ name: string; term_id: number }>(
      `SELECT name, term_id FROM fee_structure WHERE id = $1`, [input.structureId]);
    if (st.rowCount === 0) return { ok: false as const, error: "Fee item not found" };
    await c.query(
      `UPDATE fee_item SET is_optional = $3
       WHERE structure_id = $1 AND learner_id = $2`,
      [input.structureId, input.learnerId, input.choice === "declined"],
    );
    if (input.choice === "declined") {
      await c.query(
        `DELETE FROM fee_item WHERE structure_id = $1 AND learner_id = $2`,
        [input.structureId, input.learnerId],
      );
    }
    const g = await c.query<{ guardian_id: string }>(
      `SELECT guardian_id FROM learner_guardian WHERE learner_id = $1
       ORDER BY is_primary DESC, relationship LIMIT 1`, [input.learnerId]);
    await c.query(
      `INSERT INTO consent (subject_type, subject_ref, guardian_id, learner_id, choice, channel)
       VALUES ('fee_levy', $1, $2, $3, $4, 'in-person')`,
      [String(input.structureId), g.rows[0]?.guardian_id ?? null, input.learnerId, input.choice],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'consent.record', 'consent', $2, $3)`,
      [principal.userId, String(input.structureId), JSON.stringify({ ...input, levy: st.rows[0]!.name })],
    );
    return { ok: true as const };
  });
}

/** Fee extras: discount leakage (approved discounts this term) + avg fee
 *  per learner, both LIVE from the ledger. */
export async function feeExtras(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
) {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const leakage = await c.query<{ discount_cents: string; billed_cents: string; pct: string }>(
      `WITH term AS (SELECT id FROM term WHERE CURRENT_DATE BETWEEN starts_on AND ends_on LIMIT 1),
        billed AS (SELECT COALESCE(SUM(amount),0)::bigint AS v FROM fee_item, term WHERE fee_item.term_id = term.id)
       SELECT
         COALESCE((SELECT SUM((fd.percent_off / 100.0) * (SELECT SUM(amount) FROM fee_item fi WHERE fi.learner_id = l.id AND fi.term_id IN (SELECT id FROM term)))
                     FROM learner l), 0)::bigint AS discount_cents,
         (SELECT v FROM billed) AS billed_cents,
         CASE WHEN (SELECT v FROM billed) > 0
              THEN ROUND(100.0 * COALESCE((SELECT SUM((fd.percent_off / 100.0) * (SELECT SUM(amount) FROM fee_item fi WHERE fi.learner_id = l.id AND fi.term_id IN (SELECT id FROM term)))
                     FROM learner l), 0) / (SELECT v FROM billed), 1)::text
              ELSE '0' END AS pct`,
    );
    const avg = await c.query<{ avg_cents: string; learners: string }>(
      `SELECT COALESCE(ROUND(AVG(per)),0)::bigint::text AS avg_cents, COUNT(*)::text AS learners FROM (
         SELECT SUM(amount) AS per FROM fee_item GROUP BY learner_id
       ) x WHERE per > 0`,
    );
    const rules = await c.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM sibling_discount WHERE active`);
    return {
      ok: true as const,
      discountPct: Number(leakage.rows[0]!.pct),
      discountCents: Number(leakage.rows[0]!.discount_cents),
      billedCents: Number(leakage.rows[0]!.billed_cents),
      avgFeeCents: Number(avg.rows[0]!.avg_cents),
      learnersCharged: Number(avg.rows[0]!.learners),
      activeRules: Number(rules.rows[0]!.n),
    };
  });
}

// ---------------- 19 Payroll dashboard + statutory checklist ---------------
export async function payrollDashboard(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
) {
  if (!["admin", "principal", "bursar", "hr"].includes(principal.role)) {
    return { ok: false as const, error: "Only the office sees payroll" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const month = new Date().toISOString().slice(0, 7);
    const due = await c.query<{ gross: string; run_state: string; staff_n: string }>(
      `SELECT COALESCE(SUM(gross_cents),0)::bigint::text AS gross, COUNT(DISTINCT staff_id)::text AS staff_n,
              COALESCE((SELECT state::text FROM payroll_run WHERE period = $1 LIMIT 1), 'none') AS run_state
       FROM payslip ps JOIN payroll_run pr ON pr.id = ps.run_id WHERE pr.period = $1`,
      [month],
    );
    const collected = await c.query<{ paid: string }>(
      `SELECT COALESCE(SUM(amount),0)::bigint::text AS paid FROM payments
       WHERE created_at >= date_trunc('month', CURRENT_DATE)`,
    );
    const chart = await c.query<{ m: string; payroll: string; collections: string }>(
      `SELECT to_char(m, 'YYYY-MM') AS m,
              COALESCE((SELECT SUM(gross_cents) FROM payslip ps JOIN payroll_run pr ON pr.id = ps.run_id
                        WHERE date_trunc('month', pr.created_at) = m), 0)::bigint::text AS payroll,
              COALESCE((SELECT SUM(amount) FROM payments WHERE date_trunc('month', created_at) = m), 0)::bigint::text AS collections
       FROM generate_series(date_trunc('month', CURRENT_DATE) - interval '5 months',
                            date_trunc('month', CURRENT_DATE), interval '1 month') m
       ORDER BY m`,
    );
    // Statutory remittance checklist -> lands in Tasks (36/37) so the office
    // never misses PAYE (9th), SHIF/housing (9 working days), NSSF (15th).
    const day = new Date().getDate();
    const checks: { key: string; label: string; due: string; overdue: boolean }[] = [
      { key: "paye", label: "PAYE remittance", due: "9th", overdue: day > 9 },
      { key: "shif", label: "SHIF + housing levy", due: "9 working days", overdue: day > 12 },
      { key: "nssf", label: "NSSF Tier I+II", due: "15th", overdue: day > 15 },
    ];
    for (const ch of checks.filter((x) => x.overdue)) {
      await c.query(
        `INSERT INTO admin_task (title, detail, due_on, source)
         SELECT 'Remit ' || $1, 'Statutory deadline: ' || $2 || ' for ' || to_char(CURRENT_DATE, 'Month YYYY') || '. Confirm after payment - it is audited.', CURRENT_DATE + 1, 'payroll'
         WHERE NOT EXISTS (
           SELECT 1 FROM admin_task WHERE source = 'payroll' AND title = 'Remit ' || $1 AND state = 'open')`,
        [ch.label, ch.due],
      );
    }
    return {
      ok: true as const,
      month,
      grossDueCents: Number(due.rows[0]!.gross),
      staffPaid: Number(due.rows[0]!.staff_n),
      runState: due.rows[0]!.run_state,
      collectedCents: Number(collected.rows[0]!.paid),
      chart: chart.rows.map((r) => ({ month: r.m, payroll: Number(r.payroll), collections: Number(r.collections) })),
      checks,
    };
  });
}

/** CSV export seam (Solva/Workpay/Sage): the bank file format is already the
 *  truth; this returns the same rows as text for the school's accountant. */
export async function payrollExport(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  period: string,
) {
  if (!["admin", "bursar"].includes(principal.role)) {
    return { ok: false as const, error: "Only admin or bursar exports payroll" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ line: string }>(
      `SELECT s.full_name || ',' || COALESCE(s.national_id,'') || ',' ||
              COALESCE((SELECT bank_account FROM staff_contract sc WHERE sc.staff_id = s.id ORDER BY sc.id DESC LIMIT 1),'') || ',' ||
              (ps.net_cents / 100.0)::money::text AS line
       FROM payslip ps
       JOIN payroll_run pr ON pr.id = ps.run_id
       JOIN staff s ON s.id = ps.staff_id
       WHERE pr.period = $1 ORDER BY s.full_name`,
      [period],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'payroll.export', 'payroll_run', $2, $3)`,
      [principal.userId, period, JSON.stringify({ rows: r.rowCount })],
    );
    return { ok: true as const, csv: ["name,id_no,account,net", ...r.rows.map((x) => x.line)].join("\n") };
  });
}

// ---------------- 3 Admissions: live analytics -----------------------------
export async function admissionsAnalytics(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
) {
  if (!["admin", "principal", "counter"].includes(principal.role)) {
    return { ok: false as const, error: "Office only" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const funnel = await c.query<{ stage: string; n: string }>(
      `SELECT stage, COUNT(*)::text AS n FROM admission_inquiry GROUP BY stage`,
    );
    const sources = await c.query<{ source: string; n: string }>(
      `SELECT source, COUNT(*)::text AS n FROM admission_inquiry GROUP BY source ORDER BY COUNT(*) DESC`,
    );
    const trend = await c.query<{ m: string; inquiries: string; enrolled: string }>(
      `SELECT to_char(m, 'YYYY-MM') AS m,
              (SELECT COUNT(*) FROM admission_inquiry ai WHERE date_trunc('month', ai.created_at) = m)::text AS inquiries,
              (SELECT COUNT(*) FROM admission_inquiry ai WHERE date_trunc('month', ai.created_at) = m AND ai.stage = 'enrolled')::text AS enrolled
       FROM generate_series(date_trunc('month', CURRENT_DATE) - interval '5 months',
                            date_trunc('month', CURRENT_DATE), interval '1 month') m
       ORDER BY m`,
    );
    const all = funnel.rows.reduce((s, r) => s + Number(r.n), 0);
    const enrolledN = Number(funnel.rows.find((r) => r.stage === "enrolled")?.n ?? 0);
    return {
      ok: true as const,
      funnel: funnel.rows.map((r) => ({ stage: r.stage, n: Number(r.n) })),
      sources: sources.rows.map((r) => ({ source: r.source, n: Number(r.n) })),
      trend: trend.rows.map((r) => ({ month: r.m, inquiries: Number(r.inquiries), enrolled: Number(r.enrolled) })),
      conversion: all > 0 ? Math.round((100 * enrolledN) / all) : 0,
    };
  });
}

// ---------------- 5 Exam entries: per-curriculum candidate numbers ----------
export async function listExamEntries(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
) {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const rows = await c.query<{
      id: string; learner: string; admission_no: string; curriculum: string;
      exam_name: string; exam_year: number; candidate_no: string | null; status: string;
    }>(
      `SELECT e.id::text,
              l.first_name || ' ' || COALESCE(l.middle_name || ' ', '') || l.last_name AS learner,
              l.admission_no, e.curriculum,
              e.exam_name, e.exam_year, e.candidate_no, e.status
       FROM exam_entry e JOIN learner l ON l.id = e.learner_id
       ORDER BY e.exam_year DESC, e.exam_name, l.last_name LIMIT 200`,
    );
    const learners = await c.query<{ id: string; label: string }>(
      `SELECT id::text, first_name || ' ' || COALESCE(middle_name || ' ', '') || last_name || ' - ' || admission_no AS label
       FROM learner
       WHERE status = 'active' ORDER BY last_name, first_name LIMIT 500`,
    );
    return { ok: true as const, rows: rows.rows, learners: learners.rows };
  });
}

export async function upsertExamEntry(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id?: string; learnerId: string; curriculum: string; examName: string;
           examYear: number; candidateNo?: string; status: string },
) {
  if (!["admin", "principal", "teacher"].includes(principal.role)) {
    return { ok: false as const, error: "Exams desk only" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    if (input.id) {
      // Edit path: only candidate_no / status may change; identity is fixed.
      await c.query(
        `UPDATE exam_entry SET candidate_no = $2, status = $3, updated_at = now() WHERE id = $1`,
        [input.id, input.candidateNo ?? null, input.status],
      );
      await c.query(
        `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
         VALUES ($1, 'staff', 'exam_entry.upsert', 'exam_entry', $2, $3)`,
        [principal.userId, input.id, JSON.stringify(input)],
      );
      return { ok: true as const };
    }
    if (!input.learnerId) {
      return { ok: false as const, error: "Choose a learner to register." };
    }
    await c.query(
      `INSERT INTO exam_entry (learner_id, curriculum, exam_name, exam_year, candidate_no, status, registered_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (learner_id, exam_name, exam_year)
       DO UPDATE SET candidate_no = EXCLUDED.candidate_no, status = EXCLUDED.status, updated_at = now()`,
      [input.learnerId, input.curriculum, input.examName, input.examYear, input.candidateNo ?? null, input.status, principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'exam_entry.upsert', 'exam_entry', $2, $3)`,
      [principal.userId, input.learnerId, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

// ---------------- 7 Class moves with history -------------------------------
export async function moveLearnerClass(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { learnerId: string; toClassId: number; kind: string; reason?: string },
) {
  if (!["admin", "principal"].includes(principal.role)) {
    return { ok: false as const, error: "Only the two leaders move classes" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const from = await c.query<{ class_id: number | null; name: string }>(
      `SELECT l.class_id, cl.name FROM learner l LEFT JOIN class cl ON cl.id = l.class_id WHERE l.id = $1`,
      [input.learnerId],
    );
    if (from.rowCount === 0) return { ok: false as const, error: "Learner not found" };
    const to = await c.query<{ name: string }>(`SELECT name FROM class WHERE id = $1`, [input.toClassId]);
    if (to.rowCount === 0) return { ok: false as const, error: "Target class not found" };
    await c.query(`UPDATE learner SET class_id = $2 WHERE id = $1`, [input.learnerId, input.toClassId]);
    await c.query(
      `INSERT INTO class_move (learner_id, from_class_id, to_class_id, kind, reason, moved_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [input.learnerId, from.rows[0]!.class_id, input.toClassId, input.kind, input.reason ?? null, principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'learner.class_move', 'learner', $2, $3)`,
      [principal.userId, input.learnerId, JSON.stringify({ from: from.rows[0]!.name, to: to.rows[0]!.name, kind: input.kind })],
    );
    return { ok: true as const, from: from.rows[0]!.name ?? "none", to: to.rows[0]!.name };
  });
}

export async function learnerMoveHistory(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  learnerId: string,
) {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const rows = await c.query<{ moved_at: string; kind: string; from_name: string | null; to_name: string | null; reason: string | null }>(
      `SELECT cm.moved_at::text, cm.kind, cf.name AS from_name, ct.name AS to_name, cm.reason
       FROM class_move cm
       LEFT JOIN class cf ON cf.id = cm.from_class_id
       LEFT JOIN class ct ON ct.id = cm.to_class_id
       WHERE cm.learner_id = $1 ORDER BY cm.moved_at DESC`,
      [learnerId],
    );
    return { ok: true as const, rows: rows.rows };
  });
}

// ---------------- 12b Guardian relationship editor --------------------------
// ---------------------------------------------------------------------------
// Phase 3 — onboarding: role landing, start state, guardian link codes,
// admission with welcome WhatsApp. Docs/DEV-PHASES.md Phase 3.
// ---------------------------------------------------------------------------

/** Role key → the wording the interstitial shows ("You're joining as …"). */
const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  principal: "Principal",
  teacher: "Teacher",
  bursar: "Bursar",
  counter: "Counter (front desk)",
  driver: "Driver",
  dorm_parent: "Dorm parent",
  janitor: "Janitor",
  librarian: "Librarian",
  patron: "Patron",
  hod: "HOD",
};

/** Module key → the app route it opens (mirrors AppShell's tabToHref). */
const MODULE_PATH: Record<string, string> = {
  today: "/app",
  people: "/app/people",
  money: "/app/money",
  academics: "/app/academics",
  operations: "/app/operations",
  insights: "/app/insights",
  settings: "/app/settings",
};

/**
 * The role's home route from perm_matrix.landing (Settings-editable, as data).
 * Ties broken by the seeds' weight: today first. Falls back to /app.
 */
export async function resolveLanding(
  dbName: string,
  role: string,
): Promise<string> {
  const db = getSchoolPool(dbName);
  try {
    const r = await db.query<{ module_key: string }>(
      `SELECT module_key FROM perm_matrix
       WHERE role = $1::user_role AND landing = true
       ORDER BY CASE module_key WHEN 'today' THEN 0 WHEN 'money' THEN 1 WHEN 'academics' THEN 2 WHEN 'operations' THEN 3 ELSE 4 END
       LIMIT 1`,
      [role],
    );
    return MODULE_PATH[r.rows[0]?.module_key ?? ""] ?? "/app";
  } catch {
    return "/app";
  }
}

/**
 * Post-login start state — decides the interstitial. Un-landed staff get
 * role confirm + school name + one-tap landing redirect (spec §4.2).
 */
export async function getStartState(
  dbName: string,
  principal: Principal,
): Promise<
  | { landed: true; landing: string }
  | { landed: false; role: string; roleName: string; schoolName: string; landing: string }
  | { error: string }
> {
  try {
    const db = getSchoolPool(dbName);
    if (principal.kind === "staff") {
      const s = await db.query<{ joined: boolean; role: string }>(
        `SELECT joined, role::text AS role FROM staff WHERE id = $1`,
        [principal.userId],
      );
      const role = s.rows[0]?.role ?? principal.role ?? "teacher";
      if (s.rows[0] && !s.rows[0].joined) {
        const school = await db.query<{ name: string }>(`SELECT name FROM school_settings WHERE id = 'default'`);
        return {
          landed: false,
          role,
          roleName: ROLE_LABELS[role] ?? role,
          schoolName: school.rows[0]?.name ?? "your school",
          landing: await resolveLanding(dbName, role),
        };
      }
      return { landed: true, landing: await resolveLanding(dbName, role) };
    }
    // Guardians have no interstitial — the OTP login already shows the child.
    return { landed: true, landing: "/app" };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/** Confirm the role and land — flips staff.joined, audited. Self only. */
export async function confirmRoleAndLand(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ ok: boolean; landing: string; error?: string }> {
  try {
    const db = getSchoolPool(dbName);
    const up = await db.query<{ role: string }>(
      `UPDATE staff SET joined = true WHERE id = $1 AND active AND NOT joined
       RETURNING role::text AS role`,
      [principal.userId],
    );
    if (!up.rowCount) return { ok: false, landing: "/app", error: "Already landed — nothing to confirm." };
    await db.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1::uuid, 'staff', 'staff.landed', 'staff', $2::text, jsonb_build_object('role', $3::text))`,
      [principal.userId, principal.userId, up.rows[0]!.role],
    );
    return { ok: true, landing: await resolveLanding(dbName, up.rows[0]!.role) };
  } catch (err) {
    return { ok: false, landing: "/app", error: (err as Error).message };
  }
}

/**
 * Role flip BEFORE landing: the interstitial's self-undo (staffId omitted →
 * self, spec §4.2 "wrong? undo") or an admin correcting a joiner. Once
 * landed, only the admin can change roles (no self-escalation, spec §4.3).
 */
export async function changeJoinerRole(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { staffId?: string; role: string },
): Promise<{ ok: boolean; error?: string }> {
  const targetId = input.staffId ?? principal.userId;
  const isSelf = targetId === principal.userId;
  if (!isSelf && principal.role !== "admin") return { ok: false, error: "Only the admin changes roles." };
  if (input.role === "admin") return { ok: false, error: "Admin is claimed, not joined." };
  if (!(JOIN_ROLES as readonly string[]).includes(input.role)) return { ok: false, error: "Unknown role." };
  try {
    const db = getSchoolPool(dbName);
    const up = await db.query<{ full_name: string }>(
      `UPDATE staff SET role = $2::user_role WHERE id = $1 AND NOT joined
       RETURNING full_name`,
      [targetId, input.role],
    );
    if (!up.rowCount) return { ok: false, error: "That joiner has already landed (or does not exist)." };
    await db.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'staff.role.joiner', 'staff', $2, $3)`,
      [principal.userId, targetId, JSON.stringify(input)],
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * The Principal hat for the signed-in staff member (staff_duty duty_key
 * 'principal'). Admin pulse uses it to surface the §6.2 sections; profile
 * shows both titles (§5: one person, both hats).
 */
export async function getMyPrincipalHat(dbName: string, principal: Extract<Principal, { kind: "staff" }>): Promise<boolean> {
  try {
    const db = getSchoolPool(dbName);
    const r = await db.query<{ id: string }>(
      `SELECT id FROM staff_duty
       WHERE staff_id = $1 AND duty_key = 'principal' AND effective_to IS NULL
       LIMIT 1`,
      [principal.userId],
    );
    return r.rowCount ? r.rowCount > 0 : false;
  } catch {
    return false;
  }
}

/** Toggle the Principal hat on the signed-in account (admin self, audited). */
export async function setPrincipalHat(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { on: boolean },
): Promise<{ ok: boolean; error?: string }> {
  if (principal.role !== "admin") return { ok: false, error: "Only the admin wears the Principal hat." };
  try {
    const db = getSchoolPool(dbName);
    if (input.on) {
      await db.query(
        `INSERT INTO staff_duty (staff_id, duty_key, label, appointed_by)
         VALUES ($1, 'principal', 'Principal', $1)
         ON CONFLICT (staff_id, duty_key, effective_from)
         DO UPDATE SET effective_to = NULL, appointed_by = EXCLUDED.appointed_by`,
        [principal.userId],
      );
    } else {
      await db.query(
        `UPDATE staff_duty SET effective_to = CURRENT_DATE
         WHERE staff_id = $1 AND duty_key = 'principal' AND effective_to IS NULL`,
        [principal.userId],
      );
    }
    await db.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'duty.principal', 'staff_duty', $1, $2)`,
      [principal.userId, JSON.stringify({ on: input.on })],
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Guardian link code redeem — the child appears after the next login. One-time:
 * the code is cleared on success (spec: one-time use), audited either way.
 */
export async function redeemLinkCode(
  dbName: string,
  principal: Extract<Principal, { kind: "guardian" }>,
  rawCode: string,
): Promise<{ ok: boolean; learner?: string; error?: string }> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter the code from the school office." };
  try {
    const db = getSchoolPool(dbName);
    const up = await db.query<{
      learner_id: string | null;
      learner: string | null;
    }>(
      `WITH tgt AS (
         UPDATE guardian SET link_code = NULL
         WHERE id = $1 AND link_code = $2
         RETURNING id
       )
       SELECT lg.learner_id::text AS learner_id,
              l.first_name || ' ' || l.last_name AS learner
       FROM tgt
       JOIN learner_guardian lg ON lg.guardian_id = tgt.id
       JOIN learner l ON l.id = lg.learner_id
       LIMIT 1`,
      [principal.guardianId, code],
    );
    if (!up.rowCount) return { ok: false, error: "That code did not match — check the slip from the office." };
    await db.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES (NULL, 'guardian', 'guardian.link.redeemed', 'learner_guardian', $1, $2)`,
      [principal.guardianId, JSON.stringify({ learner: up.rows[0]!.learner })],
    );
    return { ok: true, learner: up.rows[0]!.learner ?? "" };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Admission desk moment (leaders): learner + guardian + link + code + welcome
 * WhatsApp in ONE call via the 041 definer `app_admit_learner`. Runs as
 * mandela_app with a permissive GUC — the definer re-checks the actor role.
 */
export async function admitLearnerWithLink(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: {
    firstName: string; middleName?: string | null; lastName: string;
    dob?: string | null; gender?: string | null; classId?: number | null; boarding?: boolean;
    guardianName: string; guardianPhone: string; guardianEmail?: string | null;
  },
): Promise<
  | { ok: true; learnerId: string; admissionNo: string; linkCode: string | null }
  | { ok: false; error: string }
> {
  try {
    const db = getSchoolPool(dbName);
    await db.query("BEGIN");
    try {
      await db.query("SELECT set_config('app.user_id', $1, true)", [principal.userId]);
      await db.query("SELECT set_config('app.role', $1, true)", [principal.role]);
      await db.query("SELECT set_config('app.admitting', 'on', true)");
      await db.query("SET LOCAL ROLE mandela_app");
      const r = await db.query<{
        learner_id: string | null; admission_no: string | null;
        guardian_id: string | null; link_code: string | null; error: string | null;
      }>(
        `SELECT * FROM app_admit_learner($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          principal.userId,
          input.firstName, input.middleName ?? null, input.lastName,
          input.dob ?? null, input.gender ?? null, input.classId ?? null, input.boarding ?? false,
          input.guardianName, input.guardianPhone, input.guardianEmail ?? null,
          config.WEB_ORIGIN,
        ],
      );
      await db.query("COMMIT");
      const row = r.rows[0];
      if (!row || row.error || !row.learner_id) {
        return { ok: false, error: row?.error ?? "Admission failed." };
      }
      return { ok: true, learnerId: row.learner_id, admissionNo: row.admission_no!, linkCode: row.link_code };
    } catch (e) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw e;
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function setGuardianLink(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { learnerId: string; guardianId: string; relationship: string; isPrimary: boolean },
) {
  if (!["admin", "principal"].includes(principal.role)) {
    return { ok: false as const, error: "Only the two leaders edit family links" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `UPDATE learner_guardian SET relationship = $3, is_primary = $4
       WHERE learner_id = $1 AND guardian_id = $2`,
      [input.learnerId, input.guardianId, input.relationship, input.isPrimary],
    );
    if (input.isPrimary) {
      await c.query(
        `UPDATE learner_guardian SET is_primary = false
         WHERE learner_id = $1 AND guardian_id <> $2`,
        [input.learnerId, input.guardianId],
      );
    }
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'learner_guardian.update', 'learner_guardian', $2, $3)`,
      [principal.userId, input.learnerId + "/" + input.guardianId, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

export async function linkGuardianToLearner(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { learnerId: string; guardianId: string; relationship: string },
) {
  if (!["admin", "principal"].includes(principal.role)) {
    return { ok: false as const, error: "Only the two leaders edit family links" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO learner_guardian (learner_id, guardian_id, relationship)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [input.learnerId, input.guardianId, input.relationship],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'learner_guardian.link', 'learner_guardian', $2, $3)`,
      [principal.userId, input.learnerId, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

export async function unlinkGuardianFromLearner(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { learnerId: string; guardianId: string },
) {
  if (!["admin", "principal"].includes(principal.role)) {
    return { ok: false as const, error: "Only the two leaders edit family links" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `DELETE FROM learner_guardian WHERE learner_id = $1 AND guardian_id = $2`,
      [input.learnerId, input.guardianId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'learner_guardian.unlink', 'learner_guardian', $2, $3)`,
      [principal.userId, input.learnerId, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

// ---------------- 30 Campaigns (bulk opt-in, feeds Talk) -------------------
export async function listCampaigns(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
) {
  if (!["admin", "principal"].includes(principal.role)) {
    return { ok: false as const, error: "Office only" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const rows = await c.query<{
      id: string; name: string; channel: string; audience: string; state: string;
      sent_count: number; opt_outs: number; created_at: string; body: string;
    }>(
      `SELECT id::text, name, channel, audience, state, sent_count, opt_outs,
              created_at::text, body
       FROM opt_in_campaign ORDER BY created_at DESC LIMIT 50`,
    );
    const reach = await c.query<{ audience: string; n: string }>(
      `SELECT 'all' AS audience, COUNT(DISTINCT g.id)::text AS n
         FROM guardian g JOIN learner_guardian lg ON lg.guardian_id = g.id
        WHERE g.wa_opt_in = true
       UNION ALL
       SELECT 'boarders', COUNT(DISTINCT g.id)::text
         FROM guardian g JOIN learner_guardian lg ON lg.guardian_id = g.id
         JOIN learner l ON l.id = lg.learner_id
        WHERE g.wa_opt_in = true AND l.boarding = true`,
    );
    return {
      ok: true as const,
      rows: rows.rows,
      reachAll: Number(reach.rows.find((r) => r.audience === "all")?.n ?? 0),
      reachBoarders: Number(reach.rows.find((r) => r.audience === "boarders")?.n ?? 0),
    };
  });
}

export async function sendCampaign(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string },
) {
  if (!["admin", "principal"].includes(principal.role)) {
    return { ok: false as const, error: "Office only" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const camp = await c.query<{ audience: string; class_id: number | null; channel: string; state: string }>(
      `SELECT audience, class_id, channel, state FROM opt_in_campaign WHERE id = $1`, [input.id]);
    if (camp.rowCount === 0) return { ok: false as const, error: "Campaign not found" };
    if (camp.rows[0]!.state === "sent") return { ok: false as const, error: "Already sent - campaigns send once" };
    const reach = await c.query<{ n: string }>(
      camp.rows[0]!.audience === "boarders"
        ? `SELECT COUNT(DISTINCT g.id)::text AS n FROM guardian g
             JOIN learner_guardian lg ON lg.guardian_id = g.id
             JOIN learner l ON l.id = lg.learner_id
            WHERE g.wa_opt_in = true AND l.boarding = true`
        : `SELECT COUNT(DISTINCT g.id)::text AS n FROM guardian g
             JOIN learner_guardian lg ON lg.guardian_id = g.id
            WHERE g.wa_opt_in = true`,
    );
    const n = Number(reach.rows[0]!.n);
    await c.query(
      `UPDATE opt_in_campaign SET state = 'sent', sent_count = $2, sent_at = now() WHERE id = $1`,
      [input.id, n],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'campaign.send', 'opt_in_campaign', $2, $3)`,
      [principal.userId, input.id, JSON.stringify({ reached: n })],
    );
    return { ok: true as const, reached: n };
  });
}

export async function createCampaignAction(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { name: string; channel: string; body: string; audience: string },
) {
  if (!["admin", "principal"].includes(principal.role)) {
    return { ok: false as const, error: "Office only" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO opt_in_campaign (name, channel, body, audience, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id::text`,
      [input.name, input.channel, input.body, input.audience, principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'campaign.create', 'opt_in_campaign', $2, $3)`,
      [principal.userId, r.rows[0]!.id, JSON.stringify(input)],
    );
    return { ok: true as const, id: r.rows[0]!.id };
  });
}

// ---------------- 26 Mess: weekly menu + head-counts -----------------------
export async function messWeek(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
) {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    // current week's Monday
    const monday = await c.query<{ ws: string }>(
      `SELECT to_char(date_trunc('week', CURRENT_DATE), 'YYYY-MM-DD') AS ws`,
    );
    const ws = monday.rows[0]!.ws;
    const menu = await c.query<{ day: number; meal: string; items: string }>(
      `SELECT day, meal, items FROM mess_menu WHERE week_start = $1 ORDER BY day, meal`,
      [ws],
    );
    const counts = await c.query<{ meal_day: string; meal: string; head_count: number }>(
      `SELECT meal_day::text, meal, head_count FROM mess_headcount
       WHERE meal_day >= $1::date - (EXTRACT(ISODOW FROM $1::date)::int - 1)
         AND meal_day < $1::date + 7
       ORDER BY meal_day, meal`,
      [ws],
    );
    return { ok: true as const, weekStart: ws, menu: menu.rows, counts: counts.rows };
  });
}

export async function setMeal(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { weekStart: string; day: number; meal: string; items: string },
) {
  if (!["admin", "principal", "mess"].includes(principal.role)) {
    return { ok: false as const, error: "Mess desk or office only" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO mess_menu (week_start, day, meal, items, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (week_start, day, meal)
       DO UPDATE SET items = EXCLUDED.items, created_by = EXCLUDED.created_by`,
      [input.weekStart, input.day, input.meal, input.items, principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'mess.menu', 'mess_menu', $2, $3)`,
      [principal.userId, input.weekStart + "/" + input.day + "/" + input.meal, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

export async function takeHeadCount(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { mealDay: string; meal: string; headCount: number; note?: string },
) {
  if (!["admin", "principal", "mess", "teacher"].includes(principal.role)) {
    return { ok: false as const, error: "Mess desk or staff only" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO mess_headcount (meal_day, meal, head_count, note, taken_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (meal_day, meal)
       DO UPDATE SET head_count = EXCLUDED.head_count, note = EXCLUDED.note, taken_by = EXCLUDED.taken_by`,
      [input.mealDay, input.meal, input.headCount, input.note ?? null, principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'mess.headcount', 'mess_headcount', $2, $3)`,
      [principal.userId, input.mealDay + "/" + input.meal, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

// ---------------- 26b Security: visitor log + gate passes ------------------
export async function listVisitors(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
) {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const rows = await c.query<{
      id: string; visitor: string; id_no: string | null; phone: string | null;
      visiting: string; purpose: string | null; time_in: string; time_out: string | null; pass_no: string | null;
    }>(
      `SELECT id::text, visitor, id_no, phone, visiting, purpose,
              time_in::text, time_out::text, pass_no
       FROM security_visitor WHERE time_in >= CURRENT_DATE - interval '7 days'
       ORDER BY time_in DESC LIMIT 200`,
    );
    const onSite = rows.rows.filter((r) => !r.time_out).length;
    return { ok: true as const, rows: rows.rows, onSite };
  });
}

export async function logVisitor(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { visitor: string; idNo?: string; phone?: string; visiting: string; purpose?: string },
) {
  if (!["admin", "principal", "security", "counter"].includes(principal.role)) {
    return { ok: false as const, error: "Gate desk only" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const pass = "GP-" + Date.now().toString(36).toUpperCase().slice(-6);
    const r = await c.query<{ id: string }>(
      `INSERT INTO security_visitor (visitor, id_no, phone, visiting, purpose, pass_no, logged_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text`,
      [input.visitor, input.idNo ?? null, input.phone ?? null, input.visiting, input.purpose ?? null, pass, principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'security.visitor_in', 'security_visitor', $2, $3)`,
      [principal.userId, r.rows[0]!.id, JSON.stringify({ ...input, pass })],
    );
    return { ok: true as const, pass };
  });
}

export async function checkoutVisitor(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string },
) {
  if (!["admin", "principal", "security", "counter"].includes(principal.role)) {
    return { ok: false as const, error: "Gate desk only" };
  }
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(`UPDATE security_visitor SET time_out = now() WHERE id = $1 AND time_out IS NULL`, [input.id]);
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'security.visitor_out', 'security_visitor', $2, '{}')`,
      [principal.userId, input.id],
    );
    return { ok: true as const };
  });
}

// ---------------- 43a Patron surface: full section data --------------------
export async function mySectionFull(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
) {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const sections = await c.query<{ id: string; name: string; kind: string; members: number }>(
      `SELECT s.id::text, s.name, s.kind::text AS kind,
              (SELECT count(*) FROM section_member sm WHERE sm.section_id = s.id AND sm.active) AS members
       FROM section s WHERE s.head_staff_id = $1 AND s.active
       ORDER BY s.name`,
      [principal.userId],
    );
    if (sections.rowCount === 0) return null;
    const out: {
      sections: { id: string; name: string; kind: string; members: number }[];
      register: { learner: string; admission_no: string; class_name: string | null; active: boolean }[];
      kit: { item: string; qty: number; min_qty: number }[];
      events: { title: string; starts_at: string }[];
      money: { col_in: string; col_out: string };
    } = {
      sections: sections.rows,
      register: [],
      kit: [],
      events: [],
      money: { col_in: "0", col_out: "0" },
    };
    const ids = sections.rows.map((s) => s.id);
    const reg = await c.query<{ learner: string; admission_no: string; class_name: string | null; active: boolean }>(
      `SELECT sm.id::text, l.first_name || ' ' || COALESCE(l.middle_name || ' ', '') || l.last_name AS learner, l.admission_no, cl.name AS class_name, sm.active
       FROM section_member sm JOIN learner l ON l.id = sm.learner_id
       LEFT JOIN class cl ON cl.id = l.class_id
       WHERE sm.section_id = ANY($1) ORDER BY l.last_name LIMIT 300`,
      [ids],
    );
    out.register = reg.rows;
    const kit = await c.query<{ item: string; qty: number; min_qty: number }>(
      `SELECT si.name AS item, sk.qty, si.min_qty
       FROM section_kit sk JOIN stock_item si ON si.id = sk.item_id
       WHERE sk.section_id = ANY($1) ORDER BY si.name`,
      [ids],
    );
    out.kit = kit.rows;
    const ev = await c.query<{ title: string; starts_at: string }>(
      `SELECT title, starts_at::text FROM school_event
       WHERE section_id = ANY($1) AND starts_at >= now() - interval '7 days'
       ORDER BY starts_at DESC LIMIT 20`,
      [ids],
    );
    out.events = ev.rows;
    // Money stays deliberately read-only for patrons (the bursar owns money).
    const mon = await c.query<{ col_in: string; col_out: string }>(
      `SELECT
         COALESCE((SELECT SUM(amount) FROM fee_item fi
                    JOIN section_member sm2 ON sm2.learner_id = fi.learner_id AND sm2.active
                   WHERE sm2.section_id = ANY($1)), 0)::bigint::text AS col_in,
         '0' AS col_out`,
      [ids],
    );
    out.money = mon.rows[0]!;
    return out;
  });
}

// ---------------------------------------------------------------------------
// FINAL FLANKS (docs/MASTER-CHECKLIST.md 14-23) — houses, co-curricular,
// duty rosters, documents vault, pocket money, alumni, media consent,
// switching import. RLS already applied by migration 028.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------- 19 HOUSES
export async function listHouses(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ houses: { id: string; name: string; points: string; members: number; events_this_term: number }[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ id: string; name: string; points: string; members: string; events_this_term: string }>(
      `SELECT s.id::text, s.name,
              (SELECT COALESCE(SUM(hp.points),0)::text FROM house_points hp WHERE hp.house_id = s.id) AS points,
              (SELECT count(*)::text FROM section_member sm WHERE sm.section_id = s.id AND sm.active) AS members,
              (SELECT count(*)::text FROM school_event e WHERE e.section_id = s.id AND e.starts_on >= CURRENT_DATE - interval '90 days') AS events_this_term
       FROM section s
       WHERE s.kind = 'house' AND s.enabled
       ORDER BY points DESC, s.name`,
    );
    return { houses: r.rows.map((h) => ({ ...h, members: Number(h.members), events_this_term: Number(h.events_this_term) })) };
  });
}

export async function awardHousePoints(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { houseId: string; points: number; reason: string; learnerId?: string | null },
): Promise<{ ok: true }> {
  if (!["admin", "principal", "teacher", "patron"].includes(principal.role ?? "")) throw new Error("staff only");
  if (!input.reason.trim()) throw new Error("give the reason — points without a why are noise");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO house_points (house_id, points, reason, learner_id, awarded_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.houseId, input.points, input.reason.trim(), input.learnerId ?? null, principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'house.points.award', 'house_points', $2, $3::jsonb)`,
      [principal.userId, input.houseId, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

// ------------------------------------------------------- 14 CO-CURRICULAR
export async function listCoCurricular(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ activities: { id: string; name: string; kind: string; members: number; sessions: number; events: number; fee_cents: string | null }[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ id: string; name: string; kind: string; members: string; sessions: string; events: string; fee_cents: string | null }>(
      `SELECT s.id::text, s.name, s.kind::text AS kind,
              (SELECT count(*)::text FROM section_member sm WHERE sm.section_id = s.id AND sm.active) AS members,
              (SELECT count(*)::text FROM section_session ss WHERE ss.section_id = s.id) AS sessions,
              (SELECT count(*)::text FROM school_event e WHERE e.section_id = s.id) AS events,
              (SELECT fi.amount::text FROM fee_item fi WHERE fi.section_id = s.id ORDER BY fi.created_at DESC LIMIT 1) AS fee_cents
       FROM section s
       WHERE s.kind IN ('sports','drama','music','club') AND s.enabled
       ORDER BY s.kind, s.name`,
    );
    return { activities: r.rows.map((a) => ({ ...a, members: Number(a.members), sessions: Number(a.sessions), events: Number(a.events) })) };
  });
}

/** Activity fee: one fee_item per active member of the section, tagged with
 *  section_id so the consent gate and statement keep treating it as a fee. */
export async function chargeActivityFee(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { sectionId: string; termId: number; name: string; amountCents: number },
): Promise<{ charged: number }> {
  if (!["admin", "bursar"].includes(principal.role ?? "")) throw new Error("money roles charge fees");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const members = await c.query<{ id: string }>(
      `SELECT sm.learner_id::text AS id FROM section_member sm
       JOIN learner l ON l.id = sm.learner_id AND l.status = 'active'
       WHERE sm.section_id = $1 AND sm.active
         AND NOT EXISTS (SELECT 1 FROM fee_item fi WHERE fi.learner_id = sm.learner_id
                         AND fi.name = $2 AND fi.section_id = $1 AND fi.term_id = $3)`,
      [input.sectionId, input.name, input.termId],
    );
    for (const m of members.rows) {
      await c.query(
        `INSERT INTO fee_item (learner_id, term_id, name, amount, is_optional, source, section_id)
         VALUES ($1, $2, $3, $4, false, 'manual', $5)`,
        [m.id, input.termId, input.name, input.amountCents, input.sectionId],
      );
    }
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'activity.fee.charge', 'section', $2, $3::jsonb)`,
      [principal.userId, input.sectionId, JSON.stringify({ ...input, charged: members.rowCount })],
    );
    return { charged: members.rowCount ?? 0 };
  });
}

/** Attach a fixture/competition to its section — feeds the section's event
 *  list and the Houses standings without a new engine. */
export async function linkSectionEvent(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { eventId: string; sectionId: string },
): Promise<{ ok: true }> {
  if (!["admin", "principal", "teacher"].includes(principal.role ?? "")) throw new Error("staff only");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(`UPDATE school_event SET section_id = $2 WHERE id = $1`, [input.eventId, input.sectionId]);
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'event.section.link', 'school_event', $2, $3::jsonb)`,
      [principal.userId, input.eventId, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

// ------------------------------------------------------------- 18 DUTY ROSTER
export async function listDutyRoster(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ rows: { id: string; staff: string; staff_id: string; weekday: number; slot: string; duty: string; place: string | null; active: boolean }[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ id: string; staff: string; staff_id: string; weekday: number; slot: string; duty: string; place: string | null; active: boolean }>(
      `SELECT dr.id::text, s.full_name AS staff, s.id::text AS staff_id, dr.weekday, dr.slot::text AS slot,
              dr.duty, dr.place, dr.active
       FROM duty_roster dr JOIN staff s ON s.id = dr.staff_id
       ORDER BY dr.weekday, dr.slot, s.full_name`,
    );
    return { rows: r.rows };
  });
}

export async function upsertDutyRoster(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { staffId: string; weekday: number; slot: string; duty: string; place?: string | null },
): Promise<{ ok: true }> {
  if (!["admin", "principal"].includes(principal.role ?? "")) throw new Error("leaders write the roster");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO duty_roster (staff_id, weekday, slot, duty, place, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (staff_id, weekday, slot, duty)
       DO UPDATE SET place = EXCLUDED.place, active = true`,
      [input.staffId, input.weekday, input.slot, input.duty, input.place ?? null, principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'duty.roster.upsert', 'duty_roster', $2, $3::jsonb)`,
      [principal.userId, input.staffId, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

export async function removeDutyRoster(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string },
): Promise<{ ok: true }> {
  if (!["admin", "principal"].includes(principal.role ?? "")) throw new Error("leaders write the roster");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(`UPDATE duty_roster SET active = false WHERE id = $1`, [input.id]);
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'duty.roster.remove', 'duty_roster', $2, '{}'::jsonb)`,
      [principal.userId, input.id],
    );
    return { ok: true as const };
  });
}

// ------------------------------------------------------ 16/31 DOCUMENT VAULT
export async function listDocuments(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ docs: { id: string; title: string; kind: string; doc_kind: string | null; entity_type: string | null; entity_id: string | null; entity_name: string | null; template_code: string | null; issued_by: string | null; created_at: string }[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query(
      `SELECT d.id::text, d.title, d.kind::text AS kind, d.doc_kind, d.entity_type, d.entity_id, d.template_code,
              i.full_name AS issued_by, d.created_at::text,
              CASE d.entity_type
                WHEN 'learner' THEN (SELECT trim(l.first_name || ' ' || l.last_name) FROM learner l WHERE l.id::text = d.entity_id)
                WHEN 'staff'   THEN (SELECT s.full_name FROM staff s WHERE s.id::text = d.entity_id)
                ELSE NULL
              END AS entity_name
       FROM document d LEFT JOIN staff i ON i.id = d.issued_by
       ORDER BY d.created_at DESC LIMIT 200`,
    );
    return { docs: r.rows };
  });
}

export async function listDocTemplates(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ templates: { code: string; name: string; doc_kind: string; body_md: string; style_json: Record<string, unknown> }[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ code: string; name: string; doc_kind: string; body_md: string; style_json: Record<string, unknown> }>(
      `SELECT code, name, doc_kind, body_md, style_json FROM doc_template WHERE active ORDER BY name`,
    );
    return { templates: r.rows };
  });
}

/** Issue a template document: placeholders are filled server-side, the school
 *  identity and issuer are overlaid (never typed twice), and the rendered
 *  copy is filed in the vault. The template's theme + signature options are
 *  frozen onto the issued copy (style_json/render_json) so the PDF download
 *  always prints exactly what the office saw. Storage keys arrive when the
 *  blob worker lands. */
export async function issueDocument(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { templateCode: string; entityType: string; entityId?: string | null; title?: string | null; placeholders: Record<string, string> },
): Promise<{ id: string; body_md: string; doc_kind: string; style_json: Record<string, unknown> }> {
  if (!["admin", "principal", "bursar", "secretary", "counter"].includes(principal.role ?? "")) throw new Error("office roles issue documents");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const tpl = await c.query<{ code: string; name: string; body_md: string; doc_kind: string; style_json: Record<string, unknown> }>(
      `SELECT code, name, body_md, doc_kind, style_json FROM doc_template WHERE code = $1 AND active`,
      [input.templateCode],
    );
    if (!tpl.rowCount) throw new Error("template not found: " + input.templateCode);
    const school = await c.query<{ name: string; county: string | null }>(
      `SELECT name, contact_address AS county FROM school_settings LIMIT 1`,
    );
    const me = await c.query<{ full_name: string; role: string }>(
      `SELECT full_name, role::text AS role FROM staff WHERE id = $1`,
      [principal.userId],
    );
    // Signer names ride in as signer1_name / signer2_name placeholders and
    // are lifted onto the frozen style instead of the body text.
    const raw = input.placeholders;
    const style: Record<string, unknown> = { ...(tpl.rows[0]!.style_json ?? {}) };
    if (raw["signer1_name"]) style["signer1Name"] = raw["signer1_name"];
    if (raw["signer2_name"]) style["signer2Name"] = raw["signer2_name"];
    const vars: Record<string, string> = {
      ...raw,
      school_name: school.rows[0]?.name ?? "",
      school_county: school.rows[0]?.county ?? "",
      issue_date: new Date().toISOString().slice(0, 10),
      issuer_name: me.rows[0]?.full_name ?? "",
      issuer_role: me.rows[0]?.role ?? "",
    };
    delete vars["signer1_name"];
    delete vars["signer2_name"];

    // REPORT CARDS FOLLOW THE CURRICULUM: a report-card document issued for a
    // learner auto-fills from the SAME sources as generateReportCard — the
    // class's curriculum vocabulary (Learning Area/Subject, Level), the
    // learner's term assessments as the item table, the grading scale and
    // 90-day attendance. The office types only the remark; the ledger speaks.
    if (tpl.rows[0]!.doc_kind === "report-card" && input.entityId) {
      const lr = await c.query<{ class_id: number | null }>(`SELECT class_id FROM learner WHERE id = $1`, [input.entityId]);
      const classId = lr.rows[0]?.class_id ?? null;
      if (classId) {
        const cur = await c.query<{
          vocab: { learner_label?: string; level_label?: string; area_label?: string } | null;
          curriculum_name: string; scale: { k: string; name?: string }[] | null;
        }>(
          `SELECT cu.vocab, cu.name AS curriculum_name, s.scale
           FROM class cl
           JOIN curriculum_level l ON l.id = cl.level_id
           JOIN curriculum cu ON cu.id = l.curriculum_id
           LEFT JOIN assessment_scheme s ON s.id = (
             SELECT s2.id FROM assessment_scheme s2 WHERE s2.curriculum_id = cu.id ORDER BY s2.id LIMIT 1)
           WHERE cl.id = $1`,
          [classId],
        );
        const v = cur.rows[0]?.vocab ?? null;
        const scale = cur.rows[0]?.scale ?? [];
        const termRow = await c.query<{ label: string }>(`SELECT label FROM term ORDER BY starts_on DESC LIMIT 1`);
        const scores = await c.query<{ subject: string; score: string | null; grade: string | null }>(
          `SELECT subject, score::text, grade::text FROM assessment
           WHERE learner_id = $1 AND term_id = (SELECT id FROM term ORDER BY starts_on DESC LIMIT 1)
           ORDER BY subject, created_at`,
          [input.entityId],
        );
        const att = await c.query<{ present: string; total: string }>(
          `SELECT COUNT(*) FILTER (WHERE mark = 'present')::text AS present, COUNT(*)::text AS total
           FROM attendance WHERE learner_id = $1 AND day > CURRENT_DATE - INTERVAL '90 days'`,
          [input.entityId],
        );
        const pct = Number(att.rows[0]?.total ?? 0) === 0 ? 0 : Math.round((Number(att.rows[0]!.present) / Number(att.rows[0]!.total)) * 100);
        const auto: Record<string, string> = {
          learner_label: v?.learner_label ?? "Learner",
          level_label: v?.level_label ?? "Grade",
          area_label: v?.area_label ?? "Learning Area",
          curriculum_name: cur.rows[0]?.curriculum_name ?? "",
          grading: scale.map((s) => s.k + (s.name ? `=${s.name}` : "")).join(" · "),
          term: termRow.rows[0]?.label ?? "",
          attendance: `${pct}% (${att.rows[0]?.present ?? 0}/${att.rows[0]?.total ?? 0} days)`,
          items_md: scores.rows.map((r) => `| ${r.subject} | ${r.score ?? "—"} | ${r.grade ?? "—"} |`).join("\n"),
        };
        // Fill gaps only — anything the office explicitly typed wins.
        for (const [k, val] of Object.entries(auto)) {
          if (vars[k] === undefined || vars[k] === "") vars[k] = val;
        }
      }
    }
    let body = tpl.rows[0]!.body_md;
    for (const [k, v] of Object.entries(vars)) {
      body = body.split("{{" + k + "}}").join(v);
    }
    const kindMap: Record<string, string> = {
      "transfer-cert": "certificate",
      "TRANSFER-CERT": "certificate",
      "id-card": "id-card",
      "ID-CARD": "id-card",
    };
    const r = await c.query<{ id: string }>(
      `INSERT INTO document (title, kind, doc_kind, entity_type, entity_id, template_code, body_md, style_json, issued_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9) RETURNING id::text`,
      [input.title ?? tpl.rows[0]!.name, kindMap[tpl.rows[0]!.code] ?? "letter", tpl.rows[0]!.doc_kind,
       input.entityType, input.entityId ?? null, input.templateCode, body, JSON.stringify(style), principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'doc.issue', 'document', $2, $3::jsonb)`,
      [principal.userId, r.rows[0]!.id, JSON.stringify({ template: input.templateCode, entity: input.entityType })],
    );
    return { id: r.rows[0]!.id, body_md: body, doc_kind: tpl.rows[0]!.doc_kind, style_json: style };
  });
}

export async function upsertDocTemplate(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { code: string; name: string; bodyMd: string; docKind?: string; styleJson?: Record<string, unknown> },
): Promise<{ ok: true }> {
  if (!["admin", "principal"].includes(principal.role ?? "")) throw new Error("admin and principal own templates");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const style = input.styleJson ?? {};
    await c.query(
      `INSERT INTO doc_template (code, name, body_md, doc_kind, style_json, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, body_md = EXCLUDED.body_md,
         doc_kind = EXCLUDED.doc_kind, style_json = EXCLUDED.style_json`,
      [input.code, input.name, input.bodyMd, input.docKind ?? "letter", JSON.stringify(style), principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'doc.template.upsert', 'doc_template', $2, '{}'::jsonb)`,
      [principal.userId, input.code],
    );
    return { ok: true as const };
  });
}

/**
 * THE one themed document render — the vault's PDF view reads this and nothing
 * else. Returns the rendered body, the template kind, the frozen theme options
 * and the school identity (name, contacts, traced logo path) so the A4 page
 * paints the school's own letterhead. Staff-only; guardians use their own
 * print artifacts (statement, report card).
 */
export async function renderDocument(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  documentId: string,
): Promise<{
  id: string; title: string; doc_kind: string | null; body_md: string | null;
  template_code: string | null; entity_name: string | null; issued_by: string | null; created_at: string;
  style_json: Record<string, unknown> | null;
  school: { name: string; contact_phone: string | null; contact_email: string | null; contact_address: string | null; logo_svg_path: string | null };
} | { error: string }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{
      id: string; title: string; doc_kind: string | null; body_md: string | null;
      template_code: string | null; issued_by: string | null; created_at: string;
      style_json: Record<string, unknown> | null; entity_type: string | null; entity_id: string | null;
    }>(
      `SELECT d.id::text, d.title, d.doc_kind, d.body_md, d.template_code,
              i.full_name AS issued_by, d.created_at::text, d.style_json, d.entity_type, d.entity_id
       FROM document d LEFT JOIN staff i ON i.id = d.issued_by
       WHERE d.id = $1`,
      [documentId],
    );
    if (!r.rowCount) return { error: "document not found" };
    const row = r.rows[0]!;
    const entityName = row.entity_id
      ? row.entity_type === "learner"
        ? (await c.query<{ n: string | null }>(`SELECT trim(first_name || ' ' || last_name) AS n FROM learner WHERE id::text = $1`, [row.entity_id])).rows[0]?.n ?? null
        : row.entity_type === "staff"
          ? (await c.query<{ n: string | null }>(`SELECT full_name AS n FROM staff WHERE id::text = $1`, [row.entity_id])).rows[0]?.n ?? null
          : null
      : null;
    const s = await c.query<{ name: string; contact_phone: string | null; contact_email: string | null; contact_address: string | null; logo_svg_path: string | null }>(
      `SELECT name, contact_phone, contact_email, contact_address, logo_svg_path FROM school_settings LIMIT 1`,
    );
    return {
      id: row.id,
      title: row.title,
      doc_kind: row.doc_kind,
      body_md: row.body_md,
      template_code: row.template_code,
      entity_name: entityName,
      issued_by: row.issued_by,
      created_at: row.created_at,
      style_json: row.style_json,
      school: {
        name: s.rows[0]?.name ?? "",
        contact_phone: s.rows[0]?.contact_phone ?? null,
        contact_email: s.rows[0]?.contact_email ?? null,
        contact_address: s.rows[0]?.contact_address ?? null,
        logo_svg_path: s.rows[0]?.logo_svg_path ?? null,
      },
    };
  });
}

// ------------------------------------------------- 23 POCKET MONEY & LAUNDRY
export async function getPocketWallets(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ wallets: { learner_id: string; learner: string; class_name: string | null; boarding: boolean; balance_cents: string }[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ learner_id: string; learner: string; class_name: string | null; boarding: boolean; balance_cents: string }>(
      `SELECT l.id::text AS learner_id,
              trim(l.first_name || ' ' || coalesce(l.middle_name || ' ', '') || l.last_name) AS learner,
              cl.name AS class_name, l.boarding,
              (SELECT COALESCE(SUM(CASE WHEN pt.direction IN ('topup','reimburse') THEN pt.amount ELSE -pt.amount END), 0)::text
               FROM pocket_txn pt WHERE pt.learner_id = l.id) AS balance_cents
       FROM learner l LEFT JOIN class cl ON cl.id = l.class_id
       WHERE l.status = 'active'
       ORDER BY l.boarding DESC NULLS LAST, balance_cents, l.first_name`,
    );
    return { wallets: r.rows };
  });
}

export async function recordPocketTxn(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { learnerId: string; direction: string; amountCents: number; note?: string | null },
): Promise<{ ok: true }> {
  if (!["admin", "bursar", "counter"].includes(principal.role ?? "")) throw new Error("money roles run wallets");
  if (input.amountCents <= 0) throw new Error("amount must be positive");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    // Never let a wallet go negative on a spend/laundry draw.
    if (input.direction === "spend" || input.direction === "laundry") {
      const bal = await c.query<{ balance: string }>(
        `SELECT COALESCE(SUM(CASE WHEN direction IN ('topup','reimburse') THEN amount ELSE -amount END), 0)::text AS balance
         FROM pocket_txn WHERE learner_id = $1`,
        [input.learnerId],
      );
      if (Number(bal.rows[0]?.balance ?? 0) < input.amountCents) {
        throw new Error("not enough pocket money — the wallet never lies");
      }
    }
    await c.query(
      `INSERT INTO pocket_txn (learner_id, direction, amount, note, taken_by) VALUES ($1, $2, $3, $4, $5)`,
      [input.learnerId, input.direction, input.amountCents, input.note ?? null, principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'pocket.txn', 'pocket_txn', $2, $3::jsonb)`,
      [principal.userId, input.learnerId, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------- 2 ALUMNI
export async function listAlumni(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ alumni: { learner_id: string; learner: string; adm: string; graduated_on: string; final_class: string | null; mentor_available: boolean }[]; total: string }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ learner_id: string; learner: string; adm: string; graduated_on: string; final_class: string | null; mentor_available: boolean }>(
      `SELECT a.learner_id::text,
              trim(l.first_name || ' ' || coalesce(l.middle_name || ' ', '') || l.last_name) AS learner,
              l.admission_no AS adm, a.graduated_on::text, a.final_class, a.mentor_available
       FROM alumni_profile a JOIN learner l ON l.id = a.learner_id
       ORDER BY a.graduated_on DESC LIMIT 500`,
    );
    const t = await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM alumni_profile`);
    return { alumni: r.rows, total: t.rows[0]?.n ?? "0" };
  });
}

export async function markAlumni(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { learnerId: string; graduatedOn: string; finalClass?: string | null; mentorAvailable?: boolean; notes?: string | null },
): Promise<{ ok: true }> {
  if (!["admin", "principal"].includes(principal.role ?? "")) throw new Error("leaders mark alumni");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO alumni_profile (learner_id, graduated_on, final_class, mentor_available, notes)
       VALUES ($1, $2::date, $3, $4, $5)
       ON CONFLICT (learner_id) DO UPDATE SET graduated_on = EXCLUDED.graduated_on,
         final_class = EXCLUDED.final_class, mentor_available = EXCLUDED.mentor_available, notes = EXCLUDED.notes`,
      [input.learnerId, input.graduatedOn, input.finalClass ?? null, input.mentorAvailable ?? false, input.notes ?? null],
    );
    await c.query(`UPDATE learner SET status = 'alumni' WHERE id = $1 AND status IN ('active','graduated')`, [input.learnerId]);
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'alumni.mark', 'alumni_profile', $2, $3::jsonb)`,
      [principal.userId, input.learnerId, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

// --------------------------------------------------------- 12 MEDIA CONSENT
export async function getMediaConsent(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ rows: { learner_id: string; learner: string; class_name: string | null; guardian_id: string; guardian: string; phone: string; state: string }[]; counts: { granted: string; declined: string; unasked: string } }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ learner_id: string; learner: string; class_name: string | null; guardian_id: string; guardian: string; phone: string; state: string }>(
      `SELECT l.id::text AS learner_id,
              trim(l.first_name || ' ' || coalesce(l.middle_name || ' ', '') || l.last_name) AS learner,
              cl.name AS class_name, g.id::text AS guardian_id, g.full_name AS guardian, g.phone,
              COALESCE((SELECT cs.choice::text FROM consent cs
                        WHERE cs.subject_type = 'photo_publish' AND cs.guardian_id = g.id
                          AND (cs.learner_id = l.id OR cs.learner_id IS NULL)
                        ORDER BY cs.decided_at DESC LIMIT 1), 'unasked') AS state
       FROM learner_guardian lg
       JOIN learner l ON l.id = lg.learner_id AND l.status = 'active'
       JOIN guardian g ON g.id = lg.guardian_id
       LEFT JOIN class cl ON cl.id = l.class_id
       ORDER BY l.first_name, g.full_name`,
    );
    const counts = { granted: "0", declined: "0", unasked: "0" };
    for (const row of r.rows) {
      const key = row.state === "granted" ? "granted" : row.state === "declined" ? "declined" : "unasked";
      counts[key as keyof typeof counts] = String(Number(counts[key as keyof typeof counts]) + 1);
    }
    return { rows: r.rows, counts };
  });
}

export async function setMediaConsent(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { guardianId: string; learnerId?: string | null; choice: "granted" | "declined" | "revoked" },
): Promise<{ ok: true }> {
  if (!["admin", "principal"].includes(principal.role ?? "")) throw new Error("leaders record consent");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO consent (subject_type, subject_ref, guardian_id, learner_id, choice, channel)
       VALUES ('photo_publish', $1, $2, $3, $4, 'web')`,
      [input.learnerId ?? null, input.guardianId, input.learnerId ?? null, input.choice],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'consent.photo_publish', 'consent', $2, $3::jsonb)`,
      [principal.userId, input.guardianId, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

// ----------------------------------------------------- 13 SWITCHING IMPORT
const SWITCH_FIELD_MAP: Record<string, string> = {
  adm_no: "admission_no", admno: "admission_no", adm: "admission_no", "admission number": "admission_no",
  admission_no: "admission_no", "admission no": "admission_no",
  first_name: "first_name", firstname: "first_name", fname: "first_name", "first name": "first_name",
  last_name: "last_name", lastname: "last_name", surname: "last_name", "last name": "last_name",
  middle_name: "middle_name", middlename: "middle_name",
  gender: "gender", sex: "gender",
  dob: "date_of_birth", date_of_birth: "date_of_birth", "date of birth": "date_of_birth", birth_date: "date_of_birth",
  class: "class_code", class_name: "class_code", stream: "class_code", form: "class_code", grade: "class_code",
  boarding: "boarding", boarder: "boarding",
  guardian_phone: "guardian_phone", parent_phone: "guardian_phone", phone: "guardian_phone",
  guardian_name: "guardian_name", parent_name: "guardian_name",
};

function mapSwitchRow(raw: Record<string, unknown>): { mapped: Record<string, string>; errors: string[] } {
  const mapped: Record<string, string> = {};
  const errors: string[] = [];
  for (const [k, v] of Object.entries(raw)) {
    const key = SWITCH_FIELD_MAP[k.trim().toLowerCase()] ?? SWITCH_FIELD_MAP[k.toLowerCase()];
    if (key && v != null && String(v).trim() !== "") mapped[key] = String(v).trim();
  }
  if (!mapped.first_name) errors.push("first_name missing");
  if (!mapped.last_name) errors.push("last_name missing");
  return { mapped, errors };
}

export async function createSwitchingImport(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { provider: string; filename?: string | null; rows: Record<string, unknown>[] },
): Promise<{ id: string; mappedCount: number; errorCount: number; errors: string[] }> {
  if (!["admin", "principal"].includes(principal.role ?? "")) throw new Error("leaders import");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const mapped: Record<string, string>[] = [];
    const errors: string[] = [];
    input.rows.forEach((raw, i) => {
      const { mapped: m, errors: e } = mapSwitchRow(raw);
      if (e.length) errors.push("row " + (i + 1) + ": " + e.join(", "));
      else mapped.push(m);
    });
    const r = await c.query<{ id: string }>(
      `INSERT INTO switching_import (provider, filename, raw, mapped, errors, state, created_by)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7) RETURNING id::text`,
      [input.provider, input.filename ?? null, JSON.stringify(input.rows), JSON.stringify(mapped),
       JSON.stringify(errors), errors.length && !mapped.length ? "failed" : "mapped", principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'switching.upload', 'switching_import', $2, $3::jsonb)`,
      [principal.userId, r.rows[0]!.id, JSON.stringify({ provider: input.provider, rows: input.rows.length })],
    );
    return { id: r.rows[0]!.id, mappedCount: mapped.length, errorCount: errors.length, errors };
  });
}

export async function commitSwitchingImport(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { id: string },
): Promise<{ imported: number }> {
  if (!["admin", "principal"].includes(principal.role ?? "")) throw new Error("leaders import");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const imp = await c.query<{ mapped: Record<string, string>[]; state: string }>(
      `SELECT mapped, state::text AS state FROM switching_import WHERE id = $1 FOR UPDATE`,
      [input.id],
    );
    if (!imp.rowCount) throw new Error("import not found");
    if (imp.rows[0]!.state === "imported") throw new Error("already imported — never twice");
    // Whole commit is one RLS transaction: any failing row rolls back ALL rows.
    // A half-imported school roster would be worse than none.
    const rows = imp.rows[0]!.mapped;
    // Class codes: match by code; unknown codes are created empty-named? No —
    // unmatched class rows import into the learner's hands to assign.
    const classes = await c.query<{ id: number; code: string }>(`SELECT id, code FROM class`);
    const byCode = new Map(classes.rows.map((cl) => [cl.code.toLowerCase(), cl.id]));
    let imported = 0;
    for (const m of rows) {
      const next = await c.query<{ adm: string }>(
        `SELECT 'ADM-' || lpad((coalesce(max(nullif(regexp_replace(admission_no, '\\D', '', 'g'), '')::bigint), 0::bigint) + 1)::text, 3, '0') AS adm
         FROM learner`,
      );
      const admNo = next.rows[0]!.adm;
      const classId = m.class_code ? byCode.get(m.class_code.toLowerCase()) ?? null : null;
      const gender = m.gender ? (m.gender.toUpperCase().startsWith("M") ? "M" : m.gender.toUpperCase().startsWith("F") ? "F" : null) : null;
      const learner = await c.query<{ id: string }>(
        `INSERT INTO learner (admission_no, first_name, middle_name, last_name, gender, date_of_birth, class_id, status, boarding)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8) RETURNING id::text`,
        [admNo, m.first_name, m.middle_name ?? null, m.last_name, gender,
         m.date_of_birth && /^\d{4}-\d{2}-\d{2}$/.test(m.date_of_birth) ? m.date_of_birth : null,
         classId, m.boarding ? ["true","yes","1","y"].includes(m.boarding.toLowerCase()) : false],
      );
      imported++;
      // Guardian auto-link by phone when the export carried it.
      if (m.guardian_phone) {
        const digits = m.guardian_phone.replace(/\D/g, "");
        const norm = digits.startsWith("254") ? digits : digits.startsWith("0") ? "254" + digits.slice(1) : digits;
        const g = await c.query<{ id: string }>(
          `INSERT INTO guardian (full_name, phone, relationship)
           VALUES ($1, $2, 'parent')
           ON CONFLICT (phone) DO UPDATE SET full_name = COALESCE(EXCLUDED.full_name, guardian.full_name)
           RETURNING id::text`,
          [m.guardian_name ?? "Parent of " + m.first_name, norm],
        );
        await c.query(
          `INSERT INTO learner_guardian (learner_id, guardian_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [learner.rows[0]!.id, g.rows[0]!.id],
        );
      }
    }
    await c.query(
      `UPDATE switching_import SET state = 'imported', imported_count = $2 WHERE id = $1`,
      [input.id, imported],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'switching.commit', 'switching_import', $2, $3::jsonb)`,
      [principal.userId, input.id, JSON.stringify({ imported })],
    );
    return { imported };
  });
}

export async function listSwitchingImports(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ imports: { id: string; provider: string; filename: string | null; state: string; mapped: number; errors: number; imported_count: number; created_at: string }[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query(
      `SELECT id::text, provider, filename, state::text AS state,
              jsonb_array_length(mapped) AS mapped, jsonb_array_length(errors) AS errors,
              imported_count, created_at::text
       FROM switching_import ORDER BY created_at DESC LIMIT 50`,
    );
    return { imports: r.rows };
  });
}

// ---------------------------------------------------------------------------
// FINAL FLANKS part 2 — payroll depth, OTP login, remark drafts, onboarding.
// ---------------------------------------------------------------------------

// ------------------------------------------------ 5 DISBURSEMENT RECONCILIATION
/** One payslip at a time: staff confirm receipt against the bank statement.
 *  The bursar ticks off who has acknowledged before the run is reconciled. */
export async function confirmPayslip(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { payslipId: string; note?: string | null },
): Promise<{ ok: true }> {
  if (!["admin", "bursar"].includes(principal.role ?? "")) throw new Error("money roles confirm receipts");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ run_id: string; confirmed_at: string | null }>(
      `UPDATE payslip SET confirmed_at = now(), confirm_note = $2 WHERE id = $1 RETURNING run_id::text, confirmed_at::text`,
      [input.payslipId, input.note ?? null],
    );
    if (!r.rowCount) throw new Error("payslip not found");
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'payroll.slip.confirm', 'payslip', $2, $3::jsonb)`,
      [principal.userId, input.payslipId, JSON.stringify({ note: input.note ?? null })],
    );
    return { ok: true as const };
  });
}

/** Close the run: every payslip must be confirmed first — no silent gaps. */
export async function reconcilePayrollRun(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { runId: string; note?: string | null },
): Promise<{ confirmed: number; total: number }> {
  if (!["admin", "bursar"].includes(principal.role ?? "")) throw new Error("money roles reconcile");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const run = await c.query<{ state: string }>(
      `SELECT state::text AS state FROM payroll_run WHERE id = $1 FOR UPDATE`,
      [input.runId],
    );
    if (!run.rowCount) throw new Error("run not found");
    if (run.rows[0]!.state !== "disbursed") throw new Error("disburse the run before reconciling it");
    const counts = await c.query<{ confirmed: string; total: string }>(
      `SELECT count(*) FILTER (WHERE confirmed_at IS NOT NULL)::text AS confirmed, count(*)::text AS total
       FROM payslip WHERE run_id = $1`,
      [input.runId],
    );
    const confirmed = Number(counts.rows[0]!.confirmed);
    const total = Number(counts.rows[0]!.total);
    if (confirmed < total) {
      throw new Error(confirmed + " of " + total + " payslips confirmed — chase the rest before closing");
    }
    await c.query(
      `UPDATE payroll_run SET reconciled_at = now(), reconciled_note = $2 WHERE id = $1`,
      [input.runId, input.note ?? null],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'payroll.run.reconcile', 'payroll_run', $2, $3::jsonb)`,
      [principal.userId, input.runId, JSON.stringify({ confirmed, total, note: input.note ?? null })],
    );
    return { confirmed, total };
  });
}

/** Payroll cost vs collections, by month — the admin's breathing-rate chart. */
export async function getPayrollVsCollections(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ months: { month: string; payroll_cents: string; collected_cents: string }[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ month: string; payroll_cents: string; collected_cents: string }>(
      `WITH months AS (
         SELECT to_char(m, 'YYYY-MM') AS month, m
         FROM generate_series(date_trunc('month', CURRENT_DATE) - interval '5 months',
                              date_trunc('month', CURRENT_DATE), interval '1 month') m
       )
       SELECT to_char(m.month, 'YYYY-MM') AS month,
              (SELECT COALESCE(SUM(p.gross_cents),0)::text FROM payslip p
               JOIN payroll_run r ON r.id = p.run_id
               WHERE to_char(r.period || '-01', 'YYYY-MM') = to_char(m.month, 'YYYY-MM')) AS payroll_cents,
              (SELECT COALESCE(SUM(pa.amount),0)::text FROM payment_allocation pa
               JOIN payments pm ON pm.id = pa.payment_id
               WHERE pm.state = 'confirmed' AND date_trunc('month', pm.paid_at) = m.month) AS collected_cents
       FROM months m ORDER BY m.month`,
    );
    return { months: r.rows };
  });
}

// ------------------------------------------------------------ 7 PRORATION
/** Leave proration: approved unpaid/sick leave inside the month reduces the
 *  payslip's worked days (never below 0). Annual leave does not deduct — it
 *  is part of the entitlement. Called by computePayrollRun's caller AFTER a
 *  slip exists; adjusting here re-runs the statutory math in place. */
export async function applyLeaveProration(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { period: string },
): Promise<{ adjusted: number }> {
  if (!["admin", "bursar"].includes(principal.role ?? "")) throw new Error("money roles adjust payroll");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const run = await c.query<{ id: string; working_days: number; state: string }>(
      `SELECT id::text, working_days, state::text AS state FROM payroll_run WHERE period = $1 FOR UPDATE`,
      [input.period],
    );
    if (!run.rowCount) throw new Error("no run for " + input.period);
    if (run.rows[0]!.state !== "computed") throw new Error("adjust before approval — approved payslips lock");
    const workingDays = run.rows[0]!.working_days;
    // Approved leave overlapping this month, not annual, per staff member.
    const leaves = await c.query<{ staff_id: string; days: string; kind: string }>(
      `SELECT sl.staff_id::text, sl.days::text, sl.kind::text AS kind
       FROM staff_leave sl
       WHERE sl.state = 'approved' AND sl.kind <> 'annual'
         AND (sl.starts_on, sl.ends_on) OVERLAPS
             (make_date($1::int, $2::int, 1), (date_trunc('month', make_date($1::int, $2::int, 1)) + interval '1 month - 1 day')::date)`,
      [Number(input.period.slice(0, 4)), Number(input.period.slice(5, 7))],
    );
    let adjusted = 0;
    for (const lv of leaves.rows) {
      const slip = await c.query<{ id: string; basic_cents: string; allowances: Record<string, number>; days_worked: number }>(
        `SELECT id::text, basic_cents::text, allowances, days_worked FROM payslip WHERE run_id = $1 AND staff_id = $2`,
        [run.rows[0]!.id, lv.staff_id],
      );
      if (!slip.rowCount) continue;
      const s = slip.rows[0]!;
      const perDay = Math.round(Number(s.basic_cents) / Math.max(1, workingDays));
      const deductDays = Math.min(Number(lv.days), workingDays);
      const newBasic = Math.max(0, Number(s.basic_cents) - perDay * deductDays);
      const allowanceTotal = Object.values(s.allowances ?? {}).reduce((acc, v) => acc + Number(v), 0);
      const gross = newBasic + allowanceTotal;
      const ratesRows = await c.query<{ kind: string; params: Record<string, unknown> }>(
        `SELECT kind, params FROM statutory_rates WHERE period = $1`,
        [input.period.slice(0, 4)],
      );
      if (!ratesRows.rowCount) continue;
      const rates: Record<string, Record<string, unknown>> = {};
      for (const rr of ratesRows.rows) rates[rr.kind] = rr.params;
      const st = computeStatutory(gross, rates as Parameters<typeof computeStatutory>[1]);
      const net = Math.max(0, gross - st.paye - st.shif - st.housing - st.nssf);
      await c.query(
        `UPDATE payslip SET days_worked = $2, basic_cents = $3, gross_cents = $4, taxable_cents = $5,
            paye_cents = $6, shif_cents = $7, housing_cents = $8, nssf_cents = $9, net_cents = $10
         WHERE id = $1`,
        [s.id, Math.max(0, workingDays - deductDays), newBasic, gross, st.taxable, st.paye, st.shif, st.housing, st.nssf, net],
      );
      adjusted++;
    }
    if (adjusted > 0) {
      await c.query(
        `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
         VALUES ($1, 'staff', 'payroll.leave.proration', 'payroll_run', $2, $3::jsonb)`,
        [principal.userId, run.rows[0]!.id, JSON.stringify({ period: input.period, adjusted })],
      );
    }
    return { adjusted };
  });
}

// ------------------------------------------------------ 6 PAYSLIP BY PHONE
/** Staff self-read: the payslip endpoint runs under the caller's own session,
 *  so RLS (payslip_self_read) only ever returns their own rows. */
export async function getMyPayslips(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ slips: { id: string; period: string; gross_cents: string; net_cents: string; paye_cents: string; shif_cents: string; housing_cents: string; nssf_cents: string; days_worked: number; disbursed_at: string | null; confirmed_at: string | null }[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query(
      `SELECT p.id::text, r.period, p.gross_cents::text, p.net_cents::text, p.paye_cents::text,
              p.shif_cents::text, p.housing_cents::text, p.nssf_cents::text, p.days_worked,
              r.disbursed_at::text, p.confirmed_at::text
       FROM payslip p JOIN payroll_run r ON r.id = p.run_id
       WHERE p.staff_id = $1
       ORDER BY r.period DESC LIMIT 12`,
      [principal.userId],
    );
    return { slips: r.rows };
  });
}

/** The teacher's own "got paid" confirmation from their phone. */
export async function confirmMyPayslip(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { payslipId: string },
): Promise<{ ok: true }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query(
      `UPDATE payslip SET confirmed_at = now()
       WHERE id = $1 AND staff_id = $2 AND confirmed_at IS NULL RETURNING id::text`,
      [input.payslipId, principal.userId],
    );
    if (!r.rowCount) throw new Error("not your payslip, or already confirmed");
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'payroll.slip.self_confirm', 'payslip', $2, '{}'::jsonb)`,
      [principal.userId, input.payslipId],
    );
    return { ok: true as const };
  });
}

// --------------------------------------------------------- 9 OTP LOGIN CODES
const OTP_RESEND_SECONDS = 45;

export async function requestLoginCode(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }> | null,
  input: { identifier: string; purpose: "staff" | "guardian" },
): Promise<{ ok: true; sent: boolean; devCode?: string }> {
  const db = getSchoolPool(dbName);
  const identifier = input.identifier.trim().toLowerCase();
  // Throttle: one code per 45s per identifier.
  const recent = await db.query<{ id: string }>(
    `SELECT id FROM login_code WHERE identifier = $1 AND purpose = $2 AND created_at > now() - interval '${OTP_RESEND_SECONDS} seconds' LIMIT 1`,
    [identifier, input.purpose],
  );
  if (recent.rowCount) return { ok: true, sent: false };
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await db.query(
    `INSERT INTO login_code (identifier, purpose, code) VALUES ($1, $2, $3)`,
    [identifier, input.purpose, code],
  );
  // Delivery: queued into Talk for guardians with WhatsApp; staff codes are
  // emailed/sms'd by the platform worker when credentials land. In dev we
  // surface the code so the flow is testable end-to-end.
  const isDev = process.env.NODE_ENV !== "production";
  return { ok: true, sent: true, ...(isDev ? { devCode: code } : {}) };
}

export async function verifyLoginCode(
  dbName: string,
  input: { identifier: string; purpose: "staff" | "guardian"; code: string },
): Promise<{ token: string; staff?: { id: string; full_name: string; role: string }; guardian?: { id: string; full_name: string } } | null> {
  const db = getSchoolPool(dbName);
  const identifier = input.identifier.trim().toLowerCase();
  const row = await db.query<{ id: string; code: string; attempts: number; expires_at: string; consumed_at: string | null }>(
    `SELECT id, code, attempts, expires_at::text, consumed_at::text
     FROM login_code WHERE identifier = $1 AND purpose = $2
     ORDER BY created_at DESC LIMIT 1`,
    [identifier, input.purpose],
  );
  if (!row.rowCount) return null;
  const lc = row.rows[0]!;
  if (lc.consumed_at) return null;
  if (new Date(lc.expires_at).getTime() < Date.now()) return null;
  if (lc.attempts >= 5) return null;
  if (lc.code !== input.code) {
    await db.query(`UPDATE login_code SET attempts = attempts + 1 WHERE id = $1`, [lc.id]);
    return null;
  }
  await db.query(`UPDATE login_code SET consumed_at = now() WHERE id = $1`, [lc.id]);
  if (input.purpose === "staff") {
    const r = await resolveStaffLogin(dbName, identifier);
    return r ? { token: r.token, staff: r.staff } : null;
  }
  const g = await resolveGuardianLogin(dbName, identifier);
  return g ? { token: g.token, guardian: g.guardian } : null;
}

// ------------------------------------------------ 22 REPORT-CARD REMARK DRAFTS
/** Draft-only assist: a plain-language remark from the card's own numbers.
 *  Never auto-saved — the teacher edits and chooses what to keep. */
export async function draftReportRemark(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { learnerName: string; className: string; termName: string; meanScore: number; attendancePct: number; strongest: string; weakest: string },
): Promise<{ remark: string }> {
  if (!["admin", "principal", "teacher"].includes(principal.role ?? "")) throw new Error("staff only");
  const name = input.learnerName.trim().split(/\s+/)[0] ?? "The learner";
  const good = input.meanScore >= 75;
  const fair = input.meanScore >= 50 && input.meanScore < 75;
  const att = input.attendancePct >= 90 ? "attends school consistently" : input.attendancePct >= 75 ? "attendance is steady" : "attendance needs attention at home";
  const lines = good
    ? [name + " has worked hard this term in " + input.className + ". " + (input.strongest ? "Strongest in " + input.strongest + ". " : "") + name.charAt(0).toUpperCase() + name.slice(1) + " " + att + ". Keep it up."]
    : fair
      ? [name + " is making steady progress in " + input.className + (input.strongest ? ", strongest in " + input.strongest : "") + (input.weakest ? " and needs more practice in " + input.weakest : "") + ". " + name.charAt(0).toUpperCase() + name.slice(1) + " " + att + "."]
      : [name + " found this term challenging in " + input.className + (input.weakest ? ", especially " + input.weakest : "") + ". " + name.charAt(0).toUpperCase() + name.slice(1) + " " + att + ". A daily reading routine at home would help."];
  const remark = lines[0]! + " — " + input.termName + ".";
  return { remark };
}

/** Draft-only plain-language parent message. The leader writes their intent
 *  in staff shorthand; the drafter renders a warm, jargon-free version. The
 *  result is a DRAFT — the UI always shows an editable textarea and sending
 *  stays a separate human action. No learner names go anywhere else. */
export async function draftParentMessage(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { subject: string; intent: string; tone?: string | null },
): Promise<{ draft: string }> {
  if (!["admin", "principal", "teacher"].includes(principal.role ?? "")) throw new Error("staff only");
  const tone = (input.tone ?? "warm").toLowerCase();
  const openers: Record<string, string> = {
    warm: "Dear Parent,",
    formal: "Dear Parent/Guardian,",
    urgent: "Dear Parent — URGENT,",
  };
  const opener = openers[tone] ?? openers.warm!;
  // One-paragraph plain render: keep the sender's facts, drop the jargon.
  const cleaned = input.intent.replace(/\s+/g, " ").trim();
  const draft = [
    opener,
    "",
    cleaned + (/[.!?]$/.test(cleaned) ? "" : "."),
    "",
    "Kindly reach us at the school office if anything is unclear. Thank you for walking with us.",
  ].join("\n");
  return { draft };
}

// ============================================================================
// FLANK CLOSURE (docs/MASTER-CHECKLIST.md flanks #1 #5 #6 #11 #12) — the
// final Phase-3 sweep. Migration 032. Every write audited; draft-only AI;
// money never queues.
// ============================================================================

// ------------------------------------------------ 6 DUTY ROSTERS -> TASKS
/** The fold the flank asked for: today's active roster slots become admin_task
 *  rows (source 'roster', assigned to the rostered staff), so the assignee
 *  sees "you're on break duty today" in the Tasks inbox. Idempotent per day:
 *  a slot+day pair already emitted is skipped. Returns what it emitted. */
export async function emitRosterTasks(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ emitted: number }> {
  if (!["admin", "principal"].includes(principal.role ?? "")) throw new Error("leaders fold the roster into tasks");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const wd = new Date().getDay();
    const slots = await c.query<{ staff_id: string; slot: string; duty: string; place: string | null }>(
      `SELECT staff_id, slot::text AS slot, duty, place FROM duty_roster
       WHERE weekday = $1 AND active`,
      [wd],
    );
    let emitted = 0;
    for (const s of slots.rows) {
      const title = `Duty today (${s.slot}): ${s.duty}`;
      const exists = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM admin_task
         WHERE source = 'roster' AND title = $1 AND assignee_id = $2
           AND due_on = CURRENT_DATE`,
        [title, s.staff_id],
      );
      if (Number(exists.rows[0]?.n ?? 0) > 0) continue;
      await c.query(
        `INSERT INTO admin_task (title, detail, source, source_link, assignee_id, due_on, created_by)
         VALUES ($1, $2, 'roster', '/app/operations/rosters', $3, CURRENT_DATE, $4)`,
        [title, s.place ? `Cover ${s.place} — ${s.slot} slot.` : `The ${s.slot} slot.`, s.staff_id, principal.userId],
      );
      emitted++;
    }
    if (emitted > 0) {
      await c.query(
        `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
         VALUES ($1, 'staff', 'duty.roster.emit_tasks', 'admin_task', $2, $3::jsonb)`,
        [principal.userId, "roster:" + wd, JSON.stringify({ weekday: wd, emitted })],
      );
    }
    return { emitted };
  });
}

/** Roster rows with their task-emit state for today (the "when" board shows
 *  which slots already reached the assignee's inbox). */
export async function listDutyRosterWithTasks(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ rows: { id: string; staff: string; staff_id: string; weekday: number; slot: string; duty: string; place: string | null; active: boolean; tasked_today: boolean }[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ id: string; staff: string; staff_id: string; weekday: number; slot: string; duty: string; place: string | null; active: boolean; tasked_today: boolean }>(
      `SELECT dr.id::text, s.full_name AS staff, s.id::text AS staff_id, dr.weekday, dr.slot::text AS slot,
              dr.duty, dr.place, dr.active,
              EXISTS (
                SELECT 1 FROM admin_task t
                WHERE t.source = 'roster' AND t.assignee_id = dr.staff_id
                  AND t.due_on = CURRENT_DATE
                  AND t.title = 'Duty today (' || dr.slot::text || '): ' || dr.duty
              ) AS tasked_today
       FROM duty_roster dr JOIN staff s ON s.id = dr.staff_id
       ORDER BY dr.weekday, dr.slot, s.full_name`,
    );
    return { rows: r.rows };
  });
}

// ------------------------------------------------ 1 HOUSE COMPETITIONS
/** A competition is a calendar row (kind 'house-competition') pointing at a
 *  house; results arrive later as house_points awards with the event in the
 *  reason. No new engine — the flank's own lean position. */
export async function createHouseCompetition(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { houseId: string; title: string; startsOn: string; notes?: string | null },
): Promise<{ ok: true }> {
  if (!["admin", "principal", "teacher"].includes(principal.role ?? "")) throw new Error("staff only");
  if (!/\d{4}-\d{2}-\d{2}/.test(input.startsOn)) throw new Error("pick a date for the competition");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO school_event (title, kind, starts_on, audience, notes, created_by, house_id)
       VALUES ($1, 'house-competition', $2::date, '{"all":true}'::jsonb, $3, $4, $5)
       RETURNING id::text`,
      [input.title.trim(), input.startsOn, input.notes ?? null, principal.userId, input.houseId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'house.competition.create', 'school_event', $2, $3::jsonb)`,
      [principal.userId, r.rows[0]!.id, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

export async function listHouseCompetitions(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ rows: { id: string; title: string; house: string; house_id: string; starts_on: string; notes: string | null }[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ id: string; title: string; house: string; house_id: string; starts_on: string; notes: string | null }>(
      `SELECT e.id::text, e.title, s.name AS house, s.id::text AS house_id, e.starts_on::text, e.notes
       FROM school_event e JOIN section s ON s.id = e.house_id
       WHERE e.kind = 'house-competition'
       ORDER BY e.starts_on DESC LIMIT 30`,
    );
    return { rows: r.rows };
  });
}

// ------------------------------------------------ 12 LAUNDRY CUSTODY
/** Garment handover per boarder: 'out' to the laundry, 'in' back to the
 *  dorm. Custody history answers "where is my sweater" without a module. */
export async function getLaundryCustody(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ rows: { learner_id: string; learner: string; class_name: string | null; out_items: string; out_at: string | null; bag_ref: string | null }[] }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ learner_id: string; learner: string; class_name: string | null; out_items: string; out_at: string | null; bag_ref: string | null }>(
      `SELECT l.id::text AS learner_id,
              trim(l.first_name || ' ' || coalesce(l.middle_name || ' ', '') || l.last_name) AS learner,
              cl.name AS class_name,
              outx.items AS out_items, outx.created_at::text AS out_at, outx.bag_ref
       FROM learner l
       LEFT JOIN class cl ON cl.id = l.class_id
       LEFT JOIN LATERAL (
         SELECT lc.items, lc.created_at, lc.bag_ref
         FROM laundry_custody lc
         WHERE lc.learner_id = l.id AND lc.direction = 'out'
           AND NOT EXISTS (
             SELECT 1 FROM laundry_custody lc2
             WHERE lc2.learner_id = lc.learner_id AND lc2.direction = 'in'
               AND lc2.created_at > lc.created_at
           )
         ORDER BY lc.created_at DESC LIMIT 1
       ) outx ON true
       WHERE l.boarding AND l.status = 'active'
       ORDER BY outx.created_at DESC NULLS LAST, l.first_name`,
    );
    return { rows: r.rows };
  });
}

export async function recordLaundryMove(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { learnerId: string; direction: "out" | "in"; items?: string | null; bagRef?: string | null },
): Promise<{ ok: true }> {
  if (!["admin", "principal", "teacher"].includes(principal.role ?? "")) throw new Error("dorm staff run laundry");
  if (input.direction === "out" && !(input.items ?? "").trim())
    throw new Error("say what went out — 'items' cannot be empty");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO laundry_custody (learner_id, items, direction, bag_ref, handled_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.learnerId, (input.items ?? "").trim() || "—", input.direction, input.bagRef ?? null, principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', $2, 'laundry_custody', $3, $4::jsonb)`,
      [principal.userId, "laundry." + input.direction, input.learnerId, JSON.stringify(input)],
    );
    return { ok: true as const };
  });
}

// ------------------------------------------------ 5 SYNC OUTBOX (offline)
/** Flush one queued client op. The SERVER re-runs the endpoint's semantics
 *  (never trusts the client's claim): only allowlisted write kinds apply.
 *  Money endpoints are refused at flush and marked rejected — the manual-first
 *  law means payments are always keyed online, never replayed from a queue. */
const OUTBOX_ALLOWED = new Set(["attendance.mark"]);
const OUTBOX_MONEY = new Set(["payment.record", "payment.confirm", "pocket.txn", "invoice.item"]);

export async function flushOutboxOp(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { clientId: string; op: string; payload: Record<string, unknown> },
): Promise<{ state: "applied" | "rejected" | "duplicate"; note?: string }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const dup = await c.query<{ id: string }>(
      `SELECT id::text FROM sync_outbox WHERE client_id = $1`, [input.clientId]);
    if (dup.rowCount) return { state: "duplicate" as const };
    if (OUTBOX_MONEY.has(input.op)) {
      await c.query(
        `INSERT INTO sync_outbox (client_id, endpoint, payload, state, applied_by, reject_note)
         VALUES ($1, $2, $3::jsonb, 'rejected', $4, 'money never queues — key it online')`,
        [input.clientId, input.op, JSON.stringify(input.payload), principal.userId],
      );
      return { state: "rejected" as const, note: "Money is keyed online, never replayed from a queue." };
    }
    if (!OUTBOX_ALLOWED.has(input.op)) {
      await c.query(
        `INSERT INTO sync_outbox (client_id, endpoint, payload, state, applied_by, reject_note)
         VALUES ($1, $2, $3::jsonb, 'rejected', $4, 'op not allowlisted for offline')`,
        [input.clientId, input.op, JSON.stringify(input.payload), principal.userId],
      );
      return { state: "rejected" as const, note: "This kind of write is not allowed offline yet." };
    }
    // attendance.mark: payload { marks: [{ learnerId, mark }] }
    if (input.op === "attendance.mark") {
      const marks = Array.isArray((input.payload as { marks?: unknown }).marks)
        ? (input.payload as { marks: { learnerId: string; mark: string }[] }).marks
        : [];
      if (marks.length === 0) {
        await c.query(
          `INSERT INTO sync_outbox (client_id, endpoint, payload, state, applied_by, reject_note)
           VALUES ($1, $2, $3::jsonb, 'rejected', $4, 'empty marks payload')`,
          [input.clientId, input.op, JSON.stringify(input.payload), principal.userId],
        );
        return { state: "rejected" as const, note: "empty marks payload" };
      }
      for (const m of marks) {
        await c.query(
          `INSERT INTO attendance (learner_id, day, mark, marked_by)
           VALUES ($1, CURRENT_DATE, $2, $3)
           ON CONFLICT (learner_id, day) DO NOTHING`,
          [m.learnerId, String(m.mark).slice(0, 8), principal.userId],
        );
      }
    }
    await c.query(
      `INSERT INTO sync_outbox (client_id, endpoint, payload, state, applied_by, applied_at)
       VALUES ($1, $2, $3::jsonb, 'applied', $4, now())`,
      [input.clientId, input.op, JSON.stringify(input.payload), principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'offline.flush', 'sync_outbox', $2, $3::jsonb)`,
      [principal.userId, input.clientId, JSON.stringify({ op: input.op, n: Array.isArray((input.payload as { marks?: unknown[] }).marks) ? (input.payload as { marks: unknown[] }).marks.length : 0 })],
    );
    return { state: "applied" as const };
  });
}

/** The sync-state read the PWA banner renders: pending count for me. */
export async function outboxState(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ pending: number; last_synced_at: string | null }> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ pending: string; last: string | null }>(
      `SELECT count(*) FILTER (WHERE state = 'pending')::text AS pending,
              max(applied_at)::text AS last
       FROM sync_outbox`,
    );
    return { pending: Number(r.rows[0]?.pending ?? 0), last_synced_at: r.rows[0]?.last ?? null };
  });
}

// ------------------------------------------------ 11 AI ASSISTS (draft-only)
/** One anomaly flag, today, for the leader's morning: the learner with the
 *  worst three-way signal (attendance drop + fee arrears + recent demerits).
 *  Reads aggregates only; writes nothing until the human acts. */
export async function detectAnomaly(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ flagged: { learner: string; learner_id: string; class_name: string | null; att_pct: number; arrears_cents: string; demerits_14d: number; why: string } | null }> {
  if (!["admin", "principal", "teacher"].includes(principal.role ?? "")) throw new Error("staff only");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const r = await c.query<{ learner_id: string; learner: string; class_name: string | null; att_pct: string | null; arrears_cents: string | null; demerits_14d: string; score: string }>(
      `WITH att AS (
         SELECT learner_id,
                round(100.0 * count(*) FILTER (WHERE mark = 'present') / GREATEST(count(*), 1))::int AS pct,
                count(*) AS days
         FROM attendance WHERE day >= CURRENT_DATE - 30 GROUP BY learner_id HAVING count(*) >= 5
       ), billed AS (
         SELECT fi.learner_id,
                COALESCE(SUM(CASE WHEN fi.is_optional = false
                                   OR EXISTS (SELECT 1 FROM consent cc
                                              WHERE cc.id = fi.consent_id AND cc.choice = 'granted')
                                  THEN fi.amount END), 0) AS cents
         FROM fee_item fi
         WHERE fi.term_id = (SELECT id FROM term ORDER BY starts_on DESC LIMIT 1)
         GROUP BY fi.learner_id
       ), paid AS (
         SELECT p.learner_id, SUM(p.amount) AS cents
         FROM payments p WHERE p.state = 'confirmed' GROUP BY p.learner_id
       ), arrears AS (
         SELECT b.learner_id,
                GREATEST(b.cents - COALESCE(MAX(p2.cents), 0), 0)::text AS cents
         FROM billed b LEFT JOIN paid p2 ON p2.learner_id = b.learner_id
         GROUP BY b.learner_id, b.cents
         HAVING GREATEST(b.cents - COALESCE(MAX(p2.cents), 0), 0) > 0
       ), dem AS (
         SELECT learner_id, count(*)::text AS ct FROM discipline_incident
         WHERE kind = 'demerit' AND occurred_on >= CURRENT_DATE - 14 GROUP BY learner_id
       )
       SELECT l.id::text AS learner_id,
              trim(l.first_name || ' ' || l.last_name) AS learner, cl.name AS class_name,
              att.pct::text AS att_pct, arrears.cents AS arrears_cents,
              COALESCE(dem.ct, '0') AS demerits_14d,
              (COALESCE(100 - att.pct, 0) + CASE WHEN arrears.cents::bigint > 0 THEN 40 ELSE 0 END
               + COALESCE(dem.ct, '0')::int * 10) AS score
       FROM learner l
       JOIN att ON att.learner_id = l.id
       LEFT JOIN arrears ON arrears.learner_id = l.id
       LEFT JOIN dem ON dem.learner_id = l.id
       LEFT JOIN class cl ON cl.id = l.class_id
       WHERE l.status = 'active'
       ORDER BY score DESC LIMIT 1`,
    );
    const row = r.rows[0];
    if (!row || Number(row.score) < 60) return { flagged: null };
    const attPct = row.att_pct ? Number(row.att_pct) : 100;
    const arrears = row.arrears_cents ?? "0";
    const dems = Number(row.demerits_14d);
    const why = [
      attPct < 85 ? `attendance at ${attPct}% over 30 days` : null,
      Number(arrears) > 0 ? `fee arrears of Ksh ${(Number(arrears) / 100).toLocaleString()}` : null,
      dems > 0 ? `${dems} demerit${dems === 1 ? "" : "s"} in 14 days` : null,
    ].filter(Boolean).join(" + ");
    return {
      flagged: {
        learner: row.learner, learner_id: row.learner_id, class_name: row.class_name,
        att_pct: attPct, arrears_cents: arrears, demerits_14d: dems, why,
      },
    };
  });
}

/** Record an anomaly flag the human chose to act on (or dismiss). Draft-only:
 *  the flag exists to prompt a look, not a decision. */
export async function recordAnomalyDraft(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
  input: { learnerId: string; subject: string; body: string; params: Record<string, unknown> },
): Promise<{ ok: true }> {
  if (!["admin", "principal", "teacher"].includes(principal.role ?? "")) throw new Error("staff only");
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    await c.query(
      `INSERT INTO ai_draft (kind, ref_id, subject, body, params, drafted_by)
       VALUES ('anomaly', $1, $2, $3, $4::jsonb, $5)`,
      [input.learnerId, input.subject, input.body, JSON.stringify(input.params), principal.userId],
    );
    await c.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'ai.draft.anomaly', 'ai_draft', $2, $3::jsonb)`,
      [principal.userId, input.learnerId, JSON.stringify({ subject: input.subject })],
    );
    return { ok: true as const };
  });
}

// ------------------------------------------------- 10 ONBOARDING WIZARD
/** One audited write each: the wizard's five steps are just the existing
 *  primitives (settings, pack, term, structure+apply, CSV import) invoked in
 *  order. This function is the state probe so the UI knows where to resume. */
export async function getOnboardingState(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{
  profile_done: boolean; pack_code: string | null; term_open: boolean;
  structures: number; learners: number; steps_done: number;
}> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const s = await c.query<{ name: string; county: string | null; phone: string | null }>(
      `SELECT name, contact_address AS county, contact_phone AS phone FROM school_settings LIMIT 1`,
    );
    const pack = await c.query<{ code: string | null }>(
      `SELECT c.code FROM curriculum c WHERE c.is_default LIMIT 1`,
    );
    const term = await c.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM term WHERE CURRENT_DATE BETWEEN starts_on AND ends_on`,
    );
    const structures = await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM fee_structure`);
    const learners = await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM learner WHERE status = 'active'`);
    const profileDone = Boolean(s.rows[0]?.name && s.rows[0]?.county && s.rows[0]?.phone);
    const packCode = pack.rows[0]?.code ?? null;
    const termOpen = Number(term.rows[0]?.n ?? 0) > 0;
    const structCount = Number(structures.rows[0]?.n ?? 0);
    const learnerCount = Number(learners.rows[0]?.n ?? 0);
    const steps = [profileDone, Boolean(packCode), termOpen, structCount > 0, learnerCount > 0];
    return {
      profile_done: profileDone, pack_code: packCode, term_open: termOpen,
      structures: structCount, learners: learnerCount,
      steps_done: steps.filter(Boolean).length,
    };
  });
}

// ---------------------------------------------------------------------------
// Phase 1 (docs/DEV-PHASES.md): join-platform registration.
// Public endpoints (no session) — the tenant is chosen by join code, never
// guessed. Secrets stay in the school DB; control plane only routes codes.
// Rate limiting lives in the controller (in-memory, per IP+code).
// ---------------------------------------------------------------------------

const JOIN_ROLES = [
  "admin", "principal", "teacher", "bursar", "counter", "driver",
  "dorm_parent", "janitor", "librarian", "patron", "hod",
] as const;

function normalizeJoinCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Regenerate this school's join code (admin only). The school_settings row
 * is canonical; the control routing row is mirrored so lookups keep
 * resolving. Audited — an admin can rotate a leaked code in one action.
 */
export async function regenerateJoinCode(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<{ ok: true; joinCode: string } | { ok: false; error: string }> {
  if (principal.role !== "admin") return { ok: false, error: "Only the admin regenerates the code" };
  const db = getSchoolPool(dbName);
  const r = await db.query<{ join_code: string }>(
    `UPDATE school_settings
     SET join_code = app_generate_join_code(), join_code_updated_at = now()
     WHERE id = 'default'
     RETURNING join_code`,
  );
  const code = r.rows[0]?.join_code;
  if (!code) return { ok: false, error: "Could not regenerate the code" };
  const control = await getControlPool();
  await control.query(
    `UPDATE school SET join_code = $1, join_code_updated_at = now() WHERE db_name = $2`,
    [code, dbName],
  );
  await db.query(
    `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
     VALUES ($1, 'staff', 'school.code.regenerated', 'school_settings', 'default',
             jsonb_build_object('code_tail', right($2, 4)))`,
    [principal.userId, code],
  );
  return { ok: true, joinCode: code };
}

/** Look up which tenant a join code belongs to (control plane only). */
export async function schoolByJoinCode(
  rawCode: string,
): Promise<{ slug: string; dbName: string; name: string } | null> {
  const code = normalizeJoinCode(rawCode);
  if (!/^MANDELA-[0-9A-Z]{4,12}$/.test(code)) return null;
  const control = await getControlPool();
  const r = await control.query<{ slug: string; db_name: string; name: string }>(
    `SELECT slug, db_name, name FROM school WHERE join_code = $1 AND state = 'active'`,
    [code],
  );
  return r.rowCount ? { slug: r.rows[0]!.slug, dbName: r.rows[0]!.db_name, name: r.rows[0]!.name } : null;
}

/**
 * Claim a freshly-provisioned school: first staff row becomes the admin
 * (optionally wearing the Principal hat). Refuses if anyone already claims
 * the school. Uses the 036 definer claim path; password hashed here.
 */
export async function registerSchoolAdmin(
  dbName: string,
  input: { fullName: string; schoolName: string; email: string; phone: string | null; password: string; alsoPrincipal: boolean },
): Promise<{ ok: true; token: string; staffId: string; joinCode: string } | { ok: false; error: string }> {
  const db = getSchoolPool(dbName);
  const hash = hashPassword(input.password);
  const r = await db.query<{ staff_id: string; join_code: string | null; error: string | null }>(
    `SELECT * FROM app_claim_school($1, $2, $3, $4, $5, $6)`,
    [input.fullName, input.schoolName, input.email, input.phone, hash, input.alsoPrincipal],
  );
  const row = r.rows[0];
  if (!row || row.error || !row.staff_id) return { ok: false, error: row?.error ?? "Could not claim the school" };
  if (!row.join_code) return { ok: false, error: "School claimed but the join code did not generate" };
  // Mirror the code into the control row — the control plane routes
  // codes to tenants, so a code that only lives in the school DB would
  // never resolve for joining staff.
  const control = await getControlPool();
  await control.query(
    `UPDATE school SET join_code = $1, join_code_updated_at = now() WHERE db_name = $2`,
    [row.join_code, dbName],
  );
  return {
    ok: true,
    token: issueToken({ kind: "staff", userId: row.staff_id, role: "admin" }),
    staffId: row.staff_id,
    joinCode: row.join_code,
  };
}

/**
 * Join a school as staff: validates the code, creates the staff row with
 * the chosen role (via the 036 definer function — same audit + uniqueness
 * semantics), then issues the session token. Role changes stay admin-only
 * afterwards (no self-escalation surface).
 */
export async function registerStaffByCode(
  rawCode: string,
  input: { fullName: string; email: string; phone: string | null; role: string; password: string },
): Promise<{ ok: true; token: string; staffId: string; role: string } | { ok: false; error: string }> {
  if (!JOIN_ROLES.includes(input.role as (typeof JOIN_ROLES)[number]) || input.role === "admin") {
    return { ok: false, error: "Pick a role from the list. Admin accounts are created when a school is set up." };
  }
  const tenant = await schoolByJoinCode(rawCode);
  if (!tenant) return { ok: false, error: "Unknown school code" };
  const db = getSchoolPool(tenant.dbName);
  const hash = hashPassword(input.password);
  const r = await db.query<{ staff_id: string | null; full_name: string | null; role: string | null; error: string | null }>(
    `SELECT * FROM app_register_staff($1, $2, $3, $4, $5, $6)`,
    [normalizeJoinCode(rawCode), input.fullName, input.email, input.phone, input.role, hash],
  );
  const row = r.rows[0];
  if (!row || row.error || !row.staff_id) return { ok: false, error: row?.error ?? "Could not join the school" };
  return {
    ok: true,
    token: issueToken({ kind: "staff", userId: row.staff_id, role: row.role! }),
    staffId: row.staff_id,
    role: row.role!,
  };
}

// ---------------------------------------------------------------------------
// Phase 6 — Settings → Team (§7.7). One read that gathers what the admin runs
// the team from: the join code (display side of the Phase-1 regen endpoint),
// who joined vs who is still pending their start screen (staff.joined from
// 041), and the hats list shape the duties screen already renders.
// ---------------------------------------------------------------------------

export interface TeamOverviewData {
  joinCode: string | null;
  joined: { staff_id: string; name: string; role: string; joined_at: string | null }[];
  pending: { staff_id: string; name: string; role: string; created_at: string | null }[];
}

export async function teamOverview(
  dbName: string,
  principal: Extract<Principal, { kind: "staff" }>,
): Promise<TeamOverviewData | { error: string }> {
  if (principal.role !== "admin") return { error: "Team overview is admin-only" };
  const db = getSchoolPool(dbName);
  const r = await db.query<{ join_code: string | null }>(
    `SELECT join_code FROM school_settings WHERE id = 'default'`,
  );
  const people = await db.query<{
    staff_id: string; name: string; role: string; joined: boolean;
    joined_at: string | null; created_at: string | null;
  }>(
    `SELECT s.id::text AS staff_id, s.full_name AS name, s.role::text AS role,
            s.joined, COALESCE(s.updated_at, s.created_at)::text AS joined_at,
            s.created_at::text AS created_at
     FROM staff s WHERE s.active
     ORDER BY s.joined ASC, s.created_at ASC NULLS LAST`,
  );
  return {
    joinCode: r.rows[0]?.join_code ?? null,
    joined: people.rows.filter((p) => p.joined).map(({ staff_id, name, role, joined_at }) => ({ staff_id, name, role, joined_at })),
    pending: people.rows.filter((p) => !p.joined).map(({ staff_id, name, role, created_at }) => ({ staff_id, name, role, created_at })),
  };
}
