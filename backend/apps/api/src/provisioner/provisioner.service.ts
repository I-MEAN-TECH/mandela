import { z } from "zod";
import { SQL_PATHS, config } from "../config.js";
import { getControlPool, getSchoolPool } from "../db/pool.js";
import { SCHOOL_MIGRATIONS, applyMigrations } from "./migrator.js";
import { applySchoolGrants } from "./grants.js";

/**
 * The Provisioner — implements backend/docs/PROVISIONER.md.
 * Dev scope (v0): create_db → run_migrations → seed_admin → verify.
 * VPS-only steps (Caddy TLS, PowerSync registration, credential vault,
 * WhatsApp templates) are stubbed as no-ops until infra lands.
 *
 * Every step is idempotent: re-running provisionSchool never duplicates work.
 */

export const provisionSchoolSchema = z.object({
  name: z.string().min(3).max(120),
  slug: z
    .string()
    .regex(/^[a-z][a-z0-9-]{2,30}$/, "3-31 chars: lowercase letters, digits, hyphens"),
  county: z.string().max(80).optional(),
  plan: z.enum(["ubuntu", "sizwe", "longwalk"]).default("ubuntu"),
  tier: z.enum(["standard", "dedicated"]).default("standard"),
  admin: z.object({
    name: z.string().min(3),
    email: z.string().email(),
    phone: z.string().regex(/^2547\d{8}$/, "normalized Kenyan format 2547XXXXXXXX"),
  }),
});

export type ProvisionSchoolInput = z.infer<typeof provisionSchoolSchema>;

const PLAN_CAPS: Record<ProvisionSchoolInput["plan"], number> = {
  ubuntu: 150,
  sizwe: 700,
  longwalk: 1500,
};

export interface ProvisionResult {
  schoolId: string;
  dbName: string;
  state: string;
  steps: {
    create_db: StepOutcome;
    run_migrations: StepOutcome;
    apply_grants: StepOutcome;
    vault_credentials: StepOutcome;
    register_caddy: StepOutcome;
    register_powersync: StepOutcome;
    seed_admin: StepOutcome;
    seed_settings: StepOutcome;
    register_paybill: StepOutcome;
    register_wa_templates: StepOutcome;
    verify: StepOutcome;
  };
}

export type StepOutcome = "succeeded" | "skipped" | "noop";

export async function provisionSchool(input: ProvisionSchoolInput): Promise<ProvisionResult> {
  const control = await getControlPool();
  const dbName = `mandela_${input.slug}`;

  // --- register school (idempotent on slug) ---
  let schoolId: string;
  const existing = await control.query<{ id: string; state: string }>(
    "SELECT id, state::text AS state FROM school WHERE slug = $1",
    [input.slug],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    schoolId = existing.rows[0]!.id;
    console.log(`[provisioner] school ${input.slug} exists (${schoolId}); resuming pipeline`);
  } else {
    const inserted = await control.query<{ id: string }>(
      `INSERT INTO school (slug, name, county, tier, state, db_name, caddy_host, plan, learner_cap)
       VALUES ($1, $2, $3, $4, 'provisioning', $5, $6, $7, $8)
       RETURNING id`,
      [
        input.slug,
        input.name,
        input.county ?? null,
        input.tier,
        dbName,
        `${input.slug}.${config.SCHOOL_HOST_ROOT}`,
        input.plan,
        PLAN_CAPS[input.plan],
      ],
    );
    schoolId = inserted.rows[0]!.id;
    console.log(`[provisioner] registered school ${input.slug} (${schoolId})`);
  }

  const  steps: ProvisionResult["steps"] = {} as ProvisionResult["steps"];

  // Seed a starter class if none exists (learners need one; it's data, editable in Settings).

  // --- step 1: create_db (idempotent) ---
  steps.create_db = await step(`create_db:${input.slug}`, async () => {
    const found = await control.query<{ datname: string }>(
      "SELECT datname FROM pg_database WHERE datname = $1",
      [dbName],
    );
    if (found.rowCount && found.rowCount > 0) return "skipped";
    // Explicit UTF8: the cluster may have been initdb'd with a Windows
    // locale (WIN1252), and template inheritance would propagate that —
    // any migration with a character above U+00FF would then fail to
    // convert. LC_COLLATE/LC_CTYPE 'C' keeps creation locale-independent.
    await control.query(
      `CREATE DATABASE ${quoteIdent(dbName)} WITH ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`,
    );
    return "succeeded";
  });

  // --- step 2: run_migrations (checksummed, tracked, transactional) ---
  steps.run_migrations = await step(`run_migrations:${input.slug}`, async () => {
    const school = getSchoolPool(dbName);
    const applied = await applyMigrations(school, SCHOOL_MIGRATIONS, dbName);
    return applied.length === 0 ? "skipped" : "succeeded";
  });

  // --- step 2b: per-database privilege hardening (no PUBLIC, service roles only) ---
  steps.apply_grants = await step(`apply_grants:${input.slug}`, async () => {
    await applySchoolGrants(dbName);
    return "succeeded";
  });

  // --- step 3: vault_credentials (dev: no-op; prod: AES-256-GCM envelope) ---
  steps.vault_credentials = "noop";

  // --- step 4/5: register_caddy + register_powersync (VPS infra stubs) ---
  steps.register_caddy = "noop";
  steps.register_powersync = "noop";

  // --- step 6: seed_admin (idempotent by email) ---
  steps.seed_admin = await step(`seed_admin:${input.slug}`, async () => {
    const school = getSchoolPool(dbName);
    const client = await school.connect();
    try {
      await client.query("BEGIN");
      const staff = await client.query<{ id: string }>(
        `SELECT id FROM staff WHERE email = $1`,
        [input.admin.email],
      );
      if (staff.rowCount && staff.rowCount > 0) {
        await client.query("COMMIT");
        return "skipped";
      }
      // better-auth will own auth_user_id later; seed uses a placeholder now.
      const authUserId = `seed_${input.slug}_${Date.now()}`;
      const principal = await client.query<{ id: string }>(
        `INSERT INTO staff (auth_user_id, full_name, email, phone, role, classes, active)
         VALUES ($1, $2, $3, $4, 'principal', '{}', true)
         RETURNING id`,
        [authUserId, input.admin.name, input.admin.email, input.admin.phone],
      );
      await client.query(
        `INSERT INTO academic_year (year, starts_on, ends_on, is_current)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (year) DO NOTHING`,
        [new Date().getUTCFullYear(), `${new Date().getUTCFullYear()}-01-01`, `${new Date().getUTCFullYear()}-12-31`],
      );
      await client.query(
        `INSERT INTO class (code, name, level, stream)
         VALUES ('DEMOA', 'Demo A', 'Grade 7', 'A')
         ON CONFLICT (code) DO NOTHING`,
      );
      await client.query("COMMIT");
      console.log(`[provisioner] seeded principal ${input.admin.email} (${principal.rows[0]!.id})`);
      return "succeeded";
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  });

  // --- step 7/8: paybill + WA templates (needs real credentials; dev stubs) ---
  steps.register_paybill = "noop";
  steps.register_wa_templates = "noop";

  // --- step 6b: seed_settings — branding as data (the web app reads this) ---
  steps.seed_settings = await step(`seed_settings:${input.slug}`, async () => {
    const school = getSchoolPool(dbName);
    const settings = await school.query<{ name: string; tagline: string | null }>(
      `SELECT name, tagline FROM school_settings WHERE id = 'default'`,
    );
    const already = settings.rowCount && settings.rowCount > 0 && settings.rows[0]!.name !== "School";
    if (already) return "skipped";
    await school.query(
      `UPDATE school_settings
       SET name = $1, tagline = $2, motto = $3, contact_phone = $4, contact_email = $5,
           quote_text = $6, quote_author = $7
       WHERE id = 'default'`,
      [
        input.name,
        "Run the school.\nSee everything.",
        input.county ? `${input.name} · ${input.county}` : input.name,
        input.admin.phone,
        input.admin.email,
        "Education is the most powerful weapon which you can use to change the world.",
        "Nelson Rolihlahla Mandela",
      ],
    );
    return "succeeded";
  });

  // --- step 9: verify ---
  steps.verify = await step(`verify:${input.slug}`, async () => {
    const school = getSchoolPool(dbName);
    const checks = await school.query<{ staff_ok: boolean; rls_on: boolean }>(
      `SELECT
         (SELECT COUNT(*) > 0 FROM staff) AS staff_ok,
         (SELECT COUNT(*) > 0 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relrowsecurity = true
            AND c.relname IN ('learner','fee_item','payments','attendance')) AS rls_on`,
    );
    const row = checks.rows[0]!;
    if (!row.staff_ok || !row.rls_on) {
      throw new Error(
        `verify failed: staff_ok=${row.staff_ok} rls_on=${row.rls_on} — school DB not healthy`,
      );
    }
    await control.query(
      "UPDATE school SET state = 'active', onboarded_at = now() WHERE id = $1 AND state <> 'active'",
      [schoolId],
    );
    return "succeeded";
  });

  const finalState = await control
    .query<{ state: string }>("SELECT state::text AS state FROM school WHERE id = $1", [schoolId])
    .then((r) => r.rows[0]!.state);

  return { schoolId, dbName, state: finalState, steps };
}

async function step(
  key: string,
  fn: () => Promise<"succeeded" | "skipped">,
): Promise<"succeeded" | "skipped" | "noop"> {
  try {
    const result = await fn();
    console.log(`[provisioner] ${key}: ${result}`);
    return result;
  } catch (err) {
    console.error(`[provisioner] ${key} FAILED: ${(err as Error).message}`);
    throw err;
  }
}

function quoteIdent(name: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`invalid db name: ${name}`);
  }
  return `"${name}"`;
}
