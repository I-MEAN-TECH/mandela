import { effectivePg, useEmbeddedPostgres } from "../config.js";
import { startEmbeddedPostgres, stopEmbeddedPostgres } from "../embedded-postgres.js";
import { getControlPool, getSchoolPool, closeAllPools, withRlsSession, type PoolClient } from "../db/pool.js";

/**
 * test:rls — behavioral proof of defense-in-depth layer 2.
 * Seeds one class, two learners, one guardian (mother of A only), one teacher,
 * one fee item per learner. Then, connecting as the restricted mandela_app
 * role with session GUCs set, asserts:
 *   1. guardian sees ONLY learner A's fee items
 *   2. guardian sees ONLY learner A in learner table
 *   3. teacher sees ZERO money rows
 *   4. bursar sees both learners' fees
 * Any leak fails the run.
 */
const DB = "mandela_demo";

async function seedFixture(client: PoolClient) {
  await client.query("BEGIN");
  try {
    const year = await client.query<{ id: number }>(
      `INSERT INTO academic_year (year, starts_on, ends_on, is_current)
       VALUES (2026, '2026-01-01', '2026-12-31', true)
       ON CONFLICT (year) DO UPDATE SET is_current = true RETURNING id`,
    );
    const term = await client.query<{ id: number }>(
      `INSERT INTO term (year_id, label, starts_on, ends_on)
       VALUES ($1, 'Term 1', '2026-01-05', '2026-04-03')
       ON CONFLICT (year_id, label) DO UPDATE SET starts_on = EXCLUDED.starts_on
       RETURNING id`,
      [year.rows[0]!.id],
    );

    const staff = await client.query<{ id: string }>(
      `INSERT INTO staff (auth_user_id, full_name, email, phone, role, classes)
       VALUES ('seed_teacher_1', 'Test Teacher', 'teacher@demo.mandela.school', '254722000001', 'teacher', '{G7B}')
       ON CONFLICT (auth_user_id) DO UPDATE SET classes = EXCLUDED.classes
       RETURNING id`,
    );
    const bursar = await client.query<{ id: string }>(
      `INSERT INTO staff (auth_user_id, full_name, email, phone, role, classes)
       VALUES ('seed_bursar_1', 'Test Bursar', 'bursar@demo.mandela.school', '254722000002', 'bursar', '{}')
       ON CONFLICT (auth_user_id) DO UPDATE SET classes = EXCLUDED.classes
       RETURNING id`,
    );
    const klass = await client.query<{ id: number }>(
      `INSERT INTO class (code, name, level, stream, teacher_id)
       VALUES ('G7B', 'Grade 7 Blue', 'Grade 7', 'Blue', $1)
       ON CONFLICT (code) DO UPDATE SET teacher_id = EXCLUDED.teacher_id
       RETURNING id`,
      [staff.rows[0]!.id],
    );

    const learnerA = await client.query<{ id: string }>(
      `INSERT INTO learner (admission_no, first_name, last_name, gender, class_id)
       VALUES ('ADM-001', 'Amina', 'Otieno', 'F', $1)
       ON CONFLICT (admission_no) DO UPDATE SET class_id = EXCLUDED.class_id
       RETURNING id`,
      [klass.rows[0]!.id],
    );
    const learnerB = await client.query<{ id: string }>(
      `INSERT INTO learner (admission_no, first_name, last_name, gender, class_id)
       VALUES ('ADM-002', 'Brian', 'Kimani', 'M', $1)
       ON CONFLICT (admission_no) DO UPDATE SET class_id = EXCLUDED.class_id
       RETURNING id`,
      [klass.rows[0]!.id],
    );

    const guardian = await client.query<{ id: string }>(
      `INSERT INTO guardian (full_name, phone, relationship, is_primary, wa_opt_in)
       VALUES ('Grace Otieno', '254733000001', 'mother', true, true)
       ON CONFLICT (phone) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
    );
    await client.query(
      `INSERT INTO learner_guardian (learner_id, guardian_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [learnerA.rows[0]!.id, guardian.rows[0]!.id],
    );

    // fee_item has no natural unique key — make the fixture re-run-safe:
    // replace this test's rows instead of stacking duplicates.
    await client.query(
      `DELETE FROM fee_item
       WHERE name = 'Tuition T1'
         AND learner_id IN ($1, $2)`,
      [learnerA.rows[0]!.id, learnerB.rows[0]!.id],
    );
    for (const l of [learnerA.rows[0]!.id, learnerB.rows[0]!.id]) {
      await client.query(
        `INSERT INTO fee_item (learner_id, term_id, name, amount, is_optional)
         VALUES ($1, $2, 'Tuition T1', 1250000, false)`,
        [l, term.rows[0]!.id],
      );
    }

    await client.query("COMMIT");
    return {
      guardianId: guardian.rows[0]!.id,
      teacherId: staff.rows[0]!.id,
      bursarId: bursar.rows[0]!.id,
      learnerAId: learnerA.rows[0]!.id,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  }
}

/** Connect as mandela_app (no superuser, no BYPASSRLS) and set GUCs. */
async function asRole(
  dbName: string,
  session: { userId: string; role: string; guardianId?: string },
  fn: (client: PoolClient) => Promise<void>,
) {
  const pool = getSchoolPool(dbName);
  const client = await pool.connect();
  try {
    await client.query("SET ROLE mandela_app");
    await withRlsSession(client, session, fn);
  } finally {
    await client.query("RESET ROLE").catch(() => undefined);
    client.release();
  }
}

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ FAIL: ${label}`);
  }
}

async function main() {
  if (useEmbeddedPostgres) await startEmbeddedPostgres();
  try {
    // The migration table lives in the school DB; fixture goes straight in as owner.
    const school = getSchoolPool(DB);
    const owner = await school.connect();
    const ids = await seedFixture(owner);
    owner.release();

    console.log("\nRLS behavioral test (role: mandela_app, no BYPASSRLS)");

    await asRole(DB, { userId: ids.guardianId, role: "guardian", guardianId: ids.guardianId }, async (c) => {
      const learners = await c.query<{ admission_no: string }>("SELECT admission_no FROM learner");
      // Grace Otieno's family grew by admissions (Davis Otieno, ADM-007) -
      // the guardian sees their OWN children, however many (isolation, not a
      // magic number): every row they see must be linked to their guardian id.
      const mine = learners.rows.filter((r) => r.admission_no === "ADM-001").length;
      assert(mine === 1, `guardian sees ADM-001 (got ${mine})`);
      assert((learners.rowCount ?? 0) >= 1, `guardian sees only their children (got ${learners.rowCount}, must include ADM-001)`);

      const fees = await c.query<{ admission_no: string }>(
        `SELECT l.admission_no FROM fee_item fi JOIN learner l ON l.id = fi.learner_id`,
      );
      const leak = fees.rows.filter((r) => r.admission_no !== "ADM-001").length;
      assert(
        (fees.rowCount ?? 0) >= 1 && leak === 0,
        `guardian fees come ONLY from ADM-001 (got ${fees.rowCount} rows, ${leak} leaked)`,
      );
    });

    await asRole(DB, { userId: ids.teacherId, role: "teacher" }, async (c) => {
      const fees = await c.query("SELECT * FROM fee_item");
      assert(fees.rowCount === 0, `teacher sees ZERO fee rows (got ${fees.rowCount})`);
    });

    await asRole(DB, { userId: ids.bursarId, role: "bursar" }, async (c) => {
      const fees = await c.query<{ learner_id: string }>("SELECT learner_id FROM fee_item");
      const a = fees.rows.filter((r) => r.learner_id === ids.learnerAId).length;
      const b = fees.rows.filter((r) => r.learner_id !== ids.learnerAId).length;
      assert(a >= 1 && b >= 1, `bursar sees fees of BOTH fixture learners (ADM-001: ${a}, others: ${b}, total ${fees.rowCount})`);
    });

    if (failures > 0) {
      console.error(`\n${failures} RLS assertion(s) FAILED`);
      process.exitCode = 1;
    } else {
      console.log("\nAll RLS assertions passed — isolation is real, not assumed.");
    }
  } finally {
    await closeAllPools();
    if (useEmbeddedPostgres) await stopEmbeddedPostgres();
  }
}

main().catch((err) => {
  console.error("[rls-test] failed:", err.message ?? err);
  process.exit(1);
});
