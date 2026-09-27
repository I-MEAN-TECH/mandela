import { effectivePg, useEmbeddedPostgres, config } from "../config.js";
import { hashPassword } from "../web/password.js";
import { startEmbeddedPostgres, stopEmbeddedPostgres } from "../embedded-postgres.js";
import { getControlPool, getSchoolPool, closeAllPools } from "../db/pool.js";

/**
 * seed:demo — idempotent demo content so the web app has a living school.
 * Re-running never duplicates (natural keys + ON CONFLICT everywhere).
 *
 * Seeds into the school DB named mandela_<WEB_DEFAULT_TENANT>:
 *   staff (principal/teacher/bursar), classes, learners, guardians + links,
 *   current term, fee structures + items, confirmed payments, today's
 *   attendance, homework and announcements.
 *
 * No passwords here: staff "login" in dev is by email match only
 * (better-auth replaces this in v2).
 */

const TENANT = config.WEB_DEFAULT_TENANT;
const DB = `mandela_${TENANT}`;

interface SeedStaff { auth: string; name: string; email: string; phone: string; role: string; classes: string[] }
const STAFF: SeedStaff[] = [
  { auth: "seed_principal_1", name: "Wanjiru Kariuki", email: "principal@demo.mandela.school", phone: "254711000001", role: "principal", classes: [] },
  { auth: "seed_teacher_1", name: "David Otieno", email: "teacher@demo.mandela.school", phone: "254711000002", role: "teacher", classes: ["G7B"] },
  { auth: "seed_bursar_1", name: "Halima Yusuf", email: "bursar@demo.mandela.school", phone: "254711000003", role: "bursar", classes: [] },
  { auth: "seed_admin_1", name: "Njeri Kamau", email: "admin@demo.mandela.school", phone: "254711000004", role: "admin", classes: [] },
];

interface SeedLearner { adm: string; first: string; middle: string | null; last: string; gender: "M" | "F"; classCode: string; boarding: boolean }
const LEARNERS: SeedLearner[] = [
  { adm: "ADM-001", first: "Amina", middle: null, last: "Otieno", gender: "F", classCode: "G7B", boarding: false },
  { adm: "ADM-002", first: "Brian", middle: null, last: "Kimani", gender: "M", classCode: "G7B", boarding: true },
  { adm: "ADM-003", first: "Cynthia", middle: "Njeri", last: "Mwangi", gender: "F", classCode: "G7B", boarding: false },
  { adm: "ADM-004", first: "Daniel", middle: null, last: "Wafula", gender: "M", classCode: "G7B", boarding: false },
  { adm: "ADM-005", first: "Esther", middle: null, last: "Njoki", gender: "F", classCode: "G7B", boarding: true },
  { adm: "ADM-006", first: "Felix", middle: null, last: "Omondi", gender: "M", classCode: "G7B", boarding: false },
];

interface SeedGuardian { name: string; phone: string; relationship: string; children: string[]; wa: boolean }
const GUARDIANS: SeedGuardian[] = [
  { name: "Grace Otieno", phone: "254733000001", relationship: "mother", children: ["ADM-001"], wa: true },
  { name: "Peter Kimani", phone: "254733000002", relationship: "father", children: ["ADM-002"], wa: true },
  { name: "Mary Mwangi", phone: "254733000003", relationship: "mother", children: ["ADM-003", "ADM-006"], wa: true },
  { name: "Joseph Wafula", phone: "254733000004", relationship: "father", children: ["ADM-004"], wa: false },
  { name: "Rose Njoki", phone: "254733000005", relationship: "mother", children: ["ADM-005"], wa: true },
];

const TUITION_CENTS = 1_250_000; // KES 12,500
const LUNCH_CENTS = 450_000;     // KES 4,500 (optional levy, consent-gated)

async function main() {
  if (useEmbeddedPostgres) await startEmbeddedPostgres();
  try {
    const control = await getControlPool();
    const schoolRow = await control.query<{ db_name: string }>(
      `SELECT db_name FROM school WHERE slug = $1`,
      [TENANT],
    );
    if (!schoolRow.rowCount) {
      throw new Error(`school '${TENANT}' not provisioned — run pnpm provision:school first`);
    }

    const db = getSchoolPool(DB);
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // ---- current academic year + term ------------------------------------
      const year = new Date().getUTCFullYear();
      const y = await client.query<{ id: number }>(
        `INSERT INTO academic_year (year, starts_on, ends_on, is_current)
         VALUES ($1, make_date($1, 1, 1), make_date($1, 12, 31), true)
         ON CONFLICT (year) DO UPDATE SET is_current = true RETURNING id`,
        [year],
      );
      const month = new Date().getUTCMonth();
      const termLabel = month < 4 ? "Term 1" : month < 8 ? "Term 2" : "Term 3";
      const termStart = month < 4 ? `${year}-01-06` : month < 8 ? `${year}-05-05` : `${year}-09-01`;
      const termEnd = month < 4 ? `${year}-04-04` : month < 8 ? `${year}-08-01` : `${year}-11-22`;
      const term = await client.query<{ id: number }>(
        `INSERT INTO term (year_id, label, starts_on, ends_on)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (year_id, label) DO UPDATE SET starts_on = EXCLUDED.starts_on RETURNING id`,
        [y.rows[0]!.id, termLabel, termStart, termEnd],
      );

      // ---- staff -------------------------------------------------------------
      const staffIds = new Map<string, string>();
      for (const s of STAFF) {
        // upsert by email (the auth_user_id from an older run may differ)
        const existing = await client.query<{ id: string }>(
          `SELECT id FROM staff WHERE email = $1`,
          [s.email],
        );
        if (existing.rowCount) {
          staffIds.set(s.auth, existing.rows[0]!.id);
          continue;
        }
        const r = await client.query<{ id: string }>(
          `INSERT INTO staff (auth_user_id, full_name, email, phone, role, classes, active)
           VALUES ($1, $2, $3, $4, $5, $6, true)
           RETURNING id`,
          [s.auth, s.name, s.email, s.phone, s.role, s.classes],
        );
        staffIds.set(s.auth, r.rows[0]!.id);
      }

      // ---- dev-only password grant ---------------------------------------
      // Demo staff get the password "demo" so the password path is exercised
      // in dev. NEVER run this line against a real school's database.
      await client.query(
        `UPDATE staff SET login_hash = $1
         WHERE email = ANY($2::text[]) AND login_hash IS NULL`,
        [hashPassword("demo"), STAFF.map((s) => s.email)],
      );

      // ---- audit sample: every staff insert is logged (governance heartbeat) --
      await client.query(
        `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
         SELECT s.id, 'staff', 'staff.create', 'staff', s.id::text,
                jsonb_build_object('full_name', s.full_name, 'role', s.role::text)
         FROM staff s
         WHERE s.email IN ('principal@demo.mandela.school','teacher@demo.mandela.school',
                           'bursar@demo.mandela.school','admin@demo.mandela.school')
         ON CONFLICT DO NOTHING`,
      );

      // ---- classes (attached to the CBE ladder — 008_classroom_curriculum) -----
      const g7b = await client.query<{ id: number }>(
        `INSERT INTO class (code, name, level, stream, teacher_id, level_id)
         SELECT 'G7B', 'Grade 7 Blue', 'Grade 7', 'Blue', $1, lv.id
         FROM curriculum_level lv JOIN curriculum cu ON cu.id = lv.curriculum_id
         WHERE cu.code = 'cbe' AND lv.code = 'G7'
         ON CONFLICT (code) DO UPDATE SET teacher_id = EXCLUDED.teacher_id, level_id = EXCLUDED.level_id
         RETURNING id`,
        [staffIds.get("seed_teacher_1")],
      );

      // ---- learners -------------------------------------------------------------
      const learnerIds = new Map<string, string>();
      for (const l of LEARNERS) {
        const r = await client.query<{ id: string }>(
          `INSERT INTO learner (admission_no, first_name, middle_name, last_name, gender, class_id, boarding)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (admission_no) DO UPDATE SET class_id = EXCLUDED.class_id RETURNING id`,
          [l.adm, l.first, l.middle, l.last, l.gender, g7b.rows[0]!.id, l.boarding],
        );
        learnerIds.set(l.adm, r.rows[0]!.id);
      }

      // ---- guardians + links ------------------------------------------------------
      const guardianIds = new Map<string, string>();
      for (const g of GUARDIANS) {
        const r = await client.query<{ id: string }>(
          `INSERT INTO guardian (full_name, phone, relationship, is_primary, wa_opt_in, wa_opt_in_at)
           VALUES ($1, $2, $3, true, $4, CASE WHEN $4 THEN now() ELSE NULL END)
           ON CONFLICT (phone) DO UPDATE SET full_name = EXCLUDED.full_name RETURNING id`,
          [g.name, g.phone, g.relationship, g.wa],
        );
        guardianIds.set(g.phone, r.rows[0]!.id);
        for (const adm of g.children) {
          await client.query(
            `INSERT INTO learner_guardian (learner_id, guardian_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [learnerIds.get(adm), r.rows[0]!.id],
          );
        }
      }

      // ---- fees: structure + items --------------------------------------------------
      const structTuition = await client.query<{ id: number }>(
        `INSERT INTO fee_structure (term_id, class_id, name, amount, is_optional)
         VALUES ($1, $2, 'Tuition', $3, false)
         ON CONFLICT (term_id, class_id, name) DO UPDATE SET amount = EXCLUDED.amount RETURNING id`,
        [term.rows[0]!.id, g7b.rows[0]!.id, TUITION_CENTS],
      );
      const structLunch = await client.query<{ id: number }>(
        `INSERT INTO fee_structure (term_id, class_id, name, amount, is_optional)
         VALUES ($1, $2, 'Lunch program', $3, true)
         ON CONFLICT (term_id, class_id, name) DO UPDATE SET amount = EXCLUDED.amount RETURNING id`,
        [term.rows[0]!.id, g7b.rows[0]!.id, LUNCH_CENTS],
      );

      for (const l of LEARNERS) {
        const learnerId = learnerIds.get(l.adm)!;
        await client.query(
          `INSERT INTO fee_item (learner_id, structure_id, term_id, name, amount, is_optional, source)
           SELECT $1, $2, $3, 'Tuition', $4, false, 'structure'
           WHERE NOT EXISTS (SELECT 1 FROM fee_item WHERE learner_id = $1 AND name = 'Tuition' AND term_id = $3)`,
          [learnerId, structTuition.rows[0]!.id, term.rows[0]!.id, TUITION_CENTS],
        );
        await client.query(
          `INSERT INTO fee_item (learner_id, structure_id, term_id, name, amount, is_optional, source)
           SELECT $1, $2, $3, 'Lunch program', $4, true, 'structure'
           WHERE NOT EXISTS (SELECT 1 FROM fee_item WHERE learner_id = $1 AND name = 'Lunch program' AND term_id = $3)`,
          [learnerId, structLunch.rows[0]!.id, term.rows[0]!.id, LUNCH_CENTS],
        );
      }

      // consent ledger: Grace + Mary granted the lunch levy (evidence: WA button)
      const lunchConsents: Array<[string, string]> = [
        ["254733000001", "ADM-001"],
        ["254733000003", "ADM-003"],
        ["254733000003", "ADM-006"],
      ];
      for (const [phone, adm] of lunchConsents) {
        await client.query(
          `INSERT INTO consent (subject_type, subject_ref, guardian_id, learner_id, choice, channel)
           SELECT 'fee_levy', fi.id, $1, $2, 'granted', 'whatsapp_button'
           FROM fee_item fi WHERE fi.learner_id = $2 AND fi.name = 'Lunch program' AND fi.term_id = $3
           AND NOT EXISTS (
             SELECT 1 FROM consent c
             WHERE c.subject_type = 'fee_levy' AND c.guardian_id = $1 AND c.learner_id = $2
           )`,
          [guardianIds.get(phone), learnerIds.get(adm), term.rows[0]!.id],
        );
      }

      // ---- payments: a believable mix (some full, some partial, some none) ----------
      const paidRows: Array<[string, number]> = [
        ["ADM-001", TUITION_CENTS],
        ["ADM-002", 800_000],
        ["ADM-003", TUITION_CENTS + LUNCH_CENTS],
        ["ADM-006", 400_000],
      ];
      let paySeq = 1;
      for (const [adm, cents] of paidRows) {
        await client.query(
          `INSERT INTO payments (learner_id, amount, method, state, receipt_no, recorded_by, paid_at)
           SELECT $1, $2, 'mpesa', 'confirmed', $3, $4, now() - INTERVAL '2 days'
           WHERE NOT EXISTS (SELECT 1 FROM payments WHERE receipt_no = $3)`,
          [learnerIds.get(adm)!, cents, `DEMO-${String(paySeq++).padStart(3, "0")}`, staffIds.get("seed_bursar_1")],
        );
      }

      // ---- attendance: last 5 school days (Mon-Fri this week) ------------------------
      // attendance is PARTITIONED by month — create the partitions we need first.
      for (let back = 0; back <= 1; back++) {
        const d = new Date();
        d.setUTCDate(1);
        d.setUTCMonth(d.getUTCMonth() - back);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const start = `${y}-${m}-01`;
        const next = new Date(Date.UTC(y, d.getUTCMonth() + 1, 1));
        // DDL can't take bind params; dates are constructed here, not user input.
        await client.query(
          `CREATE TABLE IF NOT EXISTS attendance_${y}_${m}
           PARTITION OF attendance FOR VALUES FROM ('${start}') TO ('${next.toISOString().slice(0, 10)}')`,
        );
      }
      const marksPool = ["present", "present", "present", "present", "late", "absent"] as const;
      let mIdx = 0;
      for (let d = 1; d <= 5; d++) {
        const day = new Date();
        day.setUTCDate(day.getUTCDate() - d);
        const dow = day.getUTCDay();
        if (dow === 0 || dow === 6) continue;
        for (const l of LEARNERS) {
          const mark = marksPool[mIdx++ % marksPool.length];
          await client.query(
            `INSERT INTO attendance (learner_id, day, mark, marked_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING`,
            [learnerIds.get(l.adm)!, day.toISOString().slice(0, 10), mark, staffIds.get("seed_teacher_1")],
          );
        }
      }

      // ---- homework -------------------------------------------------------------------
      await client.query(
        `INSERT INTO homework (class_id, subject, title, body, due_on, created_by)
         SELECT $1, 'Mathematics', 'Fractions worksheet 3', 'Complete exercises 1-12 on page 34. Show your working.', CURRENT_DATE + 2, $2
         WHERE NOT EXISTS (SELECT 1 FROM homework WHERE title = 'Fractions worksheet 3')`,
        [g7b.rows[0]!.id, staffIds.get("seed_teacher_1")],
      );
      await client.query(
        `INSERT INTO homework (class_id, subject, title, body, due_on, created_by)
         SELECT $1, 'English', 'Reading: The River Between', 'Read chapters 4-5 and write a one-paragraph summary.', CURRENT_DATE + 4, $2
         WHERE NOT EXISTS (SELECT 1 FROM homework WHERE title = 'Reading: The River Between')`,
        [g7b.rows[0]!.id, staffIds.get("seed_teacher_1")],
      );

      // ---- announcements -----------------------------------------------------------------
      await client.query(
        `INSERT INTO announcement (title, body, audience, urgency, channel, created_by)
         SELECT 'Sports day moved to Friday', 'Sports day moves to this Friday. Learners come in house kits. Parents are welcome from 10am.', '{"all":true}'::jsonb, 'update', 'whatsapp', $1
         WHERE NOT EXISTS (SELECT 1 FROM announcement WHERE title = 'Sports day moved to Friday')`,
        [staffIds.get("seed_principal_1")],
      );
      await client.query(
        `INSERT INTO announcement (title, body, audience, urgency, channel, created_by)
         SELECT 'Fee receipts now automatic', 'Every M-Pesa payment now returns a receipt in the app instantly. No more paper queues.', '{"all":true}'::jsonb, 'update', 'whatsapp', $1
         WHERE NOT EXISTS (SELECT 1 FROM announcement WHERE title = 'Fee receipts now automatic')`,
        [staffIds.get("seed_principal_1")],
      );

      await client.query("COMMIT");
      console.log(`[seed] demo content ready in ${DB}`);
      console.log(`[seed] staff logins (dev): ${STAFF.map((s) => s.email).join(", ")}`);
      console.log(`[seed] guardian logins (dev, phone): ${GUARDIANS.map((g) => g.phone).join(", ")}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await closeAllPools();
    if (useEmbeddedPostgres) await stopEmbeddedPostgres();
  }
}

main().catch((err) => {
  console.error("[seed] failed:", err.message ?? err);
  process.exit(1);
});
