import { useEmbeddedPostgres, config } from "../config.js";
import { startEmbeddedPostgres, stopEmbeddedPostgres } from "../embedded-postgres.js";
import { getControlPool, getSchoolPool, closeAllPools } from "../db/pool.js";
import { applyMigrations, SCHOOL_MIGRATIONS } from "../provisioner/migrator.js";

/**
 * migrate — apply pending school-DB migrations to the default tenant
 * (mandela_<WEB_DEFAULT_TENANT>). Idempotent: the migrator tracks applied
 * files by checksum; already-applied files are skipped, edited files refused.
 * New schools get the same files from the provisioner at creation time.
 */

const TENANT = config.WEB_DEFAULT_TENANT;

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
    const dbName = schoolRow.rows[0]!.db_name;
    const applied = await applyMigrations(getSchoolPool(dbName), SCHOOL_MIGRATIONS, `migrate:${TENANT}`);
    console.log(
      applied.length > 0
        ? `[migrate] ${dbName}: applied ${applied.join(", ")}`
        : `[migrate] ${dbName}: already up to date`,
    );
  } finally {
    await closeAllPools();
    if (useEmbeddedPostgres) await stopEmbeddedPostgres();
  }
}

main().catch((err) => {
  console.error(`[migrate] failed: ${(err as Error).message}`);
  process.exitCode = 1;
});
