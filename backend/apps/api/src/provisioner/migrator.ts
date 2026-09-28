import crypto from "node:crypto";
import fs from "node:fs";
import { Pool, PoolClient } from "pg";
import { SQL_PATHS } from "../config.js";

/**
 * Minimal Flyway-style migration runner for school databases.
 * - Tracks applied files in `_mandela_migrations` (name, checksum, applied_at)
 * - Refuses to re-apply a file whose contents changed (checksum guard)
 * - Runs each file in a transaction; a failed migration leaves no trace.
 *
 * Cluster-level SQL (roles) is applied out-of-band by bootstrap-cluster.
 */

interface MigrationFile {
  name: string;
  fullPath: string;
  sql: string;
  checksum: string;
}

export const SCHOOL_MIGRATIONS: MigrationFile[] = [
  { name: "001_schema.sql", fullPath: SQL_PATHS.schoolSchema },
  { name: "002_rls.sql", fullPath: SQL_PATHS.schoolRls },
  { name: "003_settings.sql", fullPath: SQL_PATHS.schoolSettings },
  { name: "004_audit_partitions.sql", fullPath: SQL_PATHS.schoolAuditPartitions },
  { name: "005_modules.sql", fullPath: SQL_PATHS.schoolModules },
  { name: "006_quote.sql", fullPath: SQL_PATHS.schoolQuote },
  { name: "007_attendance_rls.sql", fullPath: SQL_PATHS.schoolAttendanceRls },
  { name: "008_classroom_curriculum.sql", fullPath: SQL_PATHS.schoolClassroomCurriculum },
  { name: "009_curriculum_packs.sql", fullPath: SQL_PATHS.schoolCurriculumPacks },
  { name: "010_reference_rls.sql", fullPath: SQL_PATHS.schoolReferenceRls },
  { name: "011_admin_ops.sql", fullPath: SQL_PATHS.schoolAdminOps },
  { name: "012_staff_rls_tighten.sql", fullPath: SQL_PATHS.schoolStaffRlsTighten },
  { name: "013_assessment_upsert.sql", fullPath: SQL_PATHS.schoolAssessmentUpsert },
  { name: "014_assessment_level.sql", fullPath: SQL_PATHS.schoolAssessmentLevel },
  { name: "015_admin_write_policies.sql", fullPath: SQL_PATHS.schoolAdminWritePolicies },
  { name: "016_fee_rules.sql", fullPath: SQL_PATHS.schoolFeeRules },
  { name: "017_admissions_curriculum.sql", fullPath: SQL_PATHS.schoolAdmissionsCurriculum },
  { name: "018_compliance.sql", fullPath: SQL_PATHS.schoolCompliance },
  { name: "019_approvals_tasks.sql", fullPath: SQL_PATHS.schoolApprovalsTasks },
  { name: "020_payroll.sql", fullPath: SQL_PATHS.schoolPayroll },
  { name: "021_payroll_fix.sql", fullPath: SQL_PATHS.schoolPayrollFix },
  { name: "022_rails_classroom_governance.sql", fullPath: SQL_PATHS.schoolRailsGovernance },
  { name: "023_sections_welfare_calendar.sql", fullPath: SQL_PATHS.schoolSectionsWelfare },
  { name: "024_board_ops_flags.sql", fullPath: SQL_PATHS.schoolBoardOpsFlags },
  { name: "025_hr_timetable.sql", fullPath: SQL_PATHS.schoolHrTimetable },
  { name: "026_petty_purchases.sql", fullPath: SQL_PATHS.schoolPettyPurchases },
  { name: "027_breadth_gaps.sql", fullPath: SQL_PATHS.schoolBreadthGaps },
  { name: "027b_section_kit.sql", fullPath: SQL_PATHS.schoolSectionKit },
  { name: "028_lifecycle_platform.sql", fullPath: SQL_PATHS.schoolLifecyclePlatform },
  { name: "029_payslip_self_read.sql", fullPath: SQL_PATHS.schoolPayslipSelfRead },
  { name: "030_ia_eight_mains.sql", fullPath: SQL_PATHS.schoolIaEightMains },
  { name: "031_hardening_auth_rails.sql", fullPath: SQL_PATHS.schoolHardening },
  { name: "032_flank_closure.sql", fullPath: SQL_PATHS.schoolFlankClosure },
  { name: "033_channels_daily_loop_records.sql", fullPath: SQL_PATHS.schoolChannelsDailyLoopRecords },
  { name: "034_message_body.sql", fullPath: SQL_PATHS.schoolMessageBody },
  { name: "035_doc_templates_theme.sql", fullPath: SQL_PATHS.schoolDocTemplatesTheme },
  { name: "036_join_platform.sql", fullPath: SQL_PATHS.schoolJoinPlatform },
  { name: "037_join_platform_data.sql", fullPath: SQL_PATHS.schoolJoinPlatformData },
  { name: "038_claim_adopt_seed.sql", fullPath: SQL_PATHS.schoolClaimAdoptSeed },
  { name: "039_claim_v3.sql", fullPath: SQL_PATHS.schoolClaimV3 },
  { name: "040_claim_fix_out_param.sql", fullPath: SQL_PATHS.schoolClaimFix },
  { name: "041_onboarding_landing.sql", fullPath: SQL_PATHS.schoolOnboardingLanding },
  { name: "042_role_pulse_landings.sql", fullPath: SQL_PATHS.schoolRolePulseLandings },
  { name: "043_wave1_landings.sql", fullPath: SQL_PATHS.schoolWave1Landings },
  { name: "044_phase6_roles.sql", fullPath: SQL_PATHS.schoolPhase6Roles },
  { name: "045_broadcast_staff.sql", fullPath: SQL_PATHS.schoolBroadcastStaff },
  { name: "046_perf_indexes.sql", fullPath: SQL_PATHS.schoolPerfIndexes },
  { name: "047_role_pulse.sql", fullPath: SQL_PATHS.schoolRolePulse },
  { name: "048_payment_details.sql", fullPath: SQL_PATHS.schoolPaymentDetails },
  { name: "049_wave2_visibility.sql", fullPath: SQL_PATHS.schoolWave2Visibility },
  { name: "050_driver_transport_read.sql", fullPath: SQL_PATHS.schoolDriverTransportRead },
  { name: "051_pulse_cross_role_reads.sql", fullPath: SQL_PATHS.schoolPulseCrossRoleReads },
  { name: "052_perm_matrix_grants.sql", fullPath: SQL_PATHS.schoolPermMatrixGrants },
].map(load);

export const CONTROL_MIGRATIONS: MigrationFile[] = [
  { name: "001_schema.sql", fullPath: SQL_PATHS.controlSchema },
  { name: "002_join_code.sql", fullPath: SQL_PATHS.controlJoinCode },
].map(load);

function load(f: { name: string; fullPath: string }): MigrationFile {
  const sql = fs.readFileSync(f.fullPath, "utf8");
  return { ...f, sql, checksum: sha256(sql) };
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _mandela_migrations (
      name       text PRIMARY KEY,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

/**
 * Apply pending migrations inside one transaction per file.
 * Returns the names applied (empty array = already up to date).
 */
export async function applyMigrations(
  pool: Pool,
  migrations: MigrationFile[],
  label: string,
): Promise<string[]> {
  const applied: string[] = [];
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    for (const m of migrations) {
      const existing = await client.query<{ checksum: string }>(
        "SELECT checksum FROM _mandela_migrations WHERE name = $1",
        [m.name],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        const recorded = existing.rows[0]!.checksum;
        if (recorded !== m.checksum) {
          throw new Error(
            `[${label}] migration ${m.name} changed on disk (checksum mismatch). ` +
            `Write a NEW numbered migration instead of editing applied ones.`,
          );
        }
        continue;
      }
      try {
        await client.query("BEGIN");
        await client.query(m.sql);
        await client.query(
          "INSERT INTO _mandela_migrations (name, checksum) VALUES ($1, $2)",
          [m.name, m.checksum],
        );
        await client.query("COMMIT");
        applied.push(m.name);
        console.log(`[${label}] applied ${m.name}`);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw new Error(`[${label}] migration ${m.name} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    client.release();
  }
  return applied;
}
