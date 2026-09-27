import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, useEmbeddedPostgres } from "../config.js";
import { startEmbeddedPostgres, stopEmbeddedPostgres } from "../embedded-postgres.js";
import { getControlPool, getSchoolPool, closeAllPools } from "../db/pool.js";

/**
 * seed:branding — load the traced logo (scripts/logo-traced.json) and the
 * role navigation labels into school_settings. Branding is DATA: the mark
 * arrives from the DB to every surface, never bundled into the app.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
// repoRoot/scripts/logo-traced.json (this file is at repoRoot/backend/apps/api/src/scripts)
const tracedPath = path.resolve(here, "../../../../..", "scripts", "logo-traced.json");

const TENANT = config.WEB_DEFAULT_TENANT;
const DB = `mandela_${TENANT}`;

async function main() {
  if (!fs.existsSync(tracedPath)) {
    throw new Error(`missing ${tracedPath} — run: node scripts/trace-logo.mjs frontend/mandela.png`);
  }
  const traced = JSON.parse(fs.readFileSync(tracedPath, "utf8")) as {
    d: string; aspect: number;
  };

  if (useEmbeddedPostgres) await startEmbeddedPostgres();
  try {
    const control = await getControlPool();
    const row = await control.query<{ db_name: string }>(
      `SELECT db_name FROM school WHERE slug = $1`,
      [TENANT],
    );
    if (!row.rowCount) throw new Error(`school '${TENANT}' not provisioned`);
    const db = getSchoolPool(row.rows[0]!.db_name);

    const r = await db.query(
      `UPDATE school_settings
       SET logo_svg_path = $1, logo_aspect = $2,
           nav_json = $3::jsonb
       WHERE id = 'default'
       RETURNING name`,
      [
        traced.d,
        traced.aspect,
        JSON.stringify({
          parent: ["Home", "Pay", "Homework", "Messages", "Profile"],
          teacher: ["Today", "Mark", "Homework", "Messages", "Class"],
          bursar: ["Today", "Collect", "Reconcile", "Levies", "Reports"],
          principal: ["Today", "Academics", "Operations", "Approve", "Reports", "Broadcast", "Directory"],
          // 028_ia_eight_mains: eight mains x 4-5 children (owner-approved).
          admin: ["Today", "Money", "Spend", "People", "Academics", "Operations", "Care", "Insights", "Settings"],
          driver: ["Route", "Manifest", "Done"],
          counter: ["Today", "Visitors", "Inquiries", "Directory", "Calendar"],
        }),
      ],
    );
    console.log(`[branding] logo + nav loaded for "${r.rows[0]?.name ?? TENANT}" (path ${traced.d.length} chars)`);
  } finally {
    await closeAllPools();
    if (useEmbeddedPostgres) await stopEmbeddedPostgres();
  }
}

main().catch((err) => {
  console.error("[branding] failed:", err.message ?? err);
  process.exit(1);
});
