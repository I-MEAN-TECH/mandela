import "dotenv/config";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const API_ROOT = path.resolve(here, "..");
export const BACKEND_ROOT = path.resolve(API_ROOT, "..", "..");

/** Paths to the SQL that the provisioner applies (single source of truth). */
export const SQL_PATHS = {
  clusterRoles: path.join(BACKEND_ROOT, "db", "cluster", "000_roles.sql"),
  controlSchema: path.join(BACKEND_ROOT, "db", "control", "001_schema.sql"),
  controlJoinCode: path.join(BACKEND_ROOT, "db", "control", "002_join_code.sql"),
  schoolSchema: path.join(BACKEND_ROOT, "db", "school", "001_schema.sql"),
  schoolRls: path.join(BACKEND_ROOT, "db", "school", "002_rls.sql"),
  schoolSettings: path.join(BACKEND_ROOT, "db", "school", "003_settings.sql"),
  schoolAuditPartitions: path.join(BACKEND_ROOT, "db", "school", "004_audit_partitions.sql"),
  schoolModules: path.join(BACKEND_ROOT, "db", "school", "005_modules.sql"),
  schoolQuote: path.join(BACKEND_ROOT, "db", "school", "006_quote.sql"),
  schoolAttendanceRls: path.join(BACKEND_ROOT, "db", "school", "007_attendance_rls.sql"),
  schoolClassroomCurriculum: path.join(BACKEND_ROOT, "db", "school", "008_classroom_curriculum.sql"),
  schoolCurriculumPacks: path.join(BACKEND_ROOT, "db", "school", "009_curriculum_packs.sql"),
  schoolReferenceRls: path.join(BACKEND_ROOT, "db", "school", "010_reference_rls.sql"),
  schoolAdminOps: path.join(BACKEND_ROOT, "db", "school", "011_admin_ops.sql"),
  schoolStaffRlsTighten: path.join(BACKEND_ROOT, "db", "school", "012_staff_rls_tighten.sql"),
  schoolAssessmentUpsert: path.join(BACKEND_ROOT, "db", "school", "013_assessment_upsert.sql"),
  schoolAssessmentLevel: path.join(BACKEND_ROOT, "db", "school", "014_assessment_level.sql"),
  schoolAdminWritePolicies: path.join(BACKEND_ROOT, "db", "school", "015_admin_write_policies.sql"),
  schoolFeeRules: path.join(BACKEND_ROOT, "db", "school", "016_fee_rules.sql"),
  schoolAdmissionsCurriculum: path.join(BACKEND_ROOT, "db", "school", "017_admissions_curriculum.sql"),
  schoolCompliance: path.join(BACKEND_ROOT, "db", "school", "018_compliance.sql"),
  schoolApprovalsTasks: path.join(BACKEND_ROOT, "db", "school", "019_approvals_tasks.sql"),
  schoolPayroll: path.join(BACKEND_ROOT, "db", "school", "020_payroll.sql"),
  schoolPayrollFix: path.join(BACKEND_ROOT, "db", "school", "021_payroll_fix.sql"),
  schoolRailsGovernance: path.join(BACKEND_ROOT, "db", "school", "022_rails_classroom_governance.sql"),
  schoolSectionsWelfare: path.join(BACKEND_ROOT, "db", "school", "023_sections_welfare_calendar.sql"),
  schoolBoardOpsFlags: path.join(BACKEND_ROOT, "db", "school", "024_board_ops_flags.sql"),
  schoolHrTimetable: path.join(BACKEND_ROOT, "db", "school", "025_hr_timetable.sql"),
  schoolPettyPurchases: path.join(BACKEND_ROOT, "db", "school", "026_petty_purchases.sql"),
  schoolBreadthGaps: path.join(BACKEND_ROOT, "db", "school", "027_breadth_gaps.sql"),
  schoolSectionKit: path.join(BACKEND_ROOT, "db", "school", "027b_section_kit.sql"),
  schoolLifecyclePlatform: path.join(BACKEND_ROOT, "db", "school", "028_lifecycle_platform.sql"),
  schoolPayslipSelfRead: path.join(BACKEND_ROOT, "db", "school", "029_payslip_self_read.sql"),
  schoolIaEightMains: path.join(BACKEND_ROOT, "db", "school", "030_ia_eight_mains.sql"),
  schoolHardening: path.join(BACKEND_ROOT, "db", "school", "031_hardening_auth_rails.sql"),
  schoolFlankClosure: path.join(BACKEND_ROOT, "db", "school", "032_flank_closure.sql"),
  schoolChannelsDailyLoopRecords: path.join(BACKEND_ROOT, "db", "school", "033_channels_daily_loop_records.sql"),
  schoolMessageBody: path.join(BACKEND_ROOT, "db", "school", "034_message_body.sql"),
  schoolDocTemplatesTheme: path.join(BACKEND_ROOT, "db", "school", "035_doc_templates_theme.sql"),
  schoolJoinPlatform: path.join(BACKEND_ROOT, "db", "school", "036_join_platform.sql"),
  schoolJoinPlatformData: path.join(BACKEND_ROOT, "db", "school", "037_join_platform_data.sql"),
  schoolClaimAdoptSeed: path.join(BACKEND_ROOT, "db", "school", "038_claim_adopt_seed.sql"),
  schoolClaimV3: path.join(BACKEND_ROOT, "db", "school", "039_claim_v3.sql"),
  schoolClaimFix: path.join(BACKEND_ROOT, "db", "school", "040_claim_fix_out_param.sql"),
  schoolOnboardingLanding: path.join(BACKEND_ROOT, "db", "school", "041_onboarding_landing.sql"),
  schoolRolePulseLandings: path.join(BACKEND_ROOT, "db", "school", "042_role_pulse_landings.sql"),
  schoolWave1Landings: path.join(BACKEND_ROOT, "db", "school", "043_wave1_landings.sql"),
  schoolPhase6Roles: path.join(BACKEND_ROOT, "db", "school", "044_phase6_roles.sql"),
  schoolBroadcastStaff: path.join(BACKEND_ROOT, "db", "school", "045_broadcast_staff.sql"),
  schoolPerfIndexes: path.join(BACKEND_ROOT, "db", "school", "046_perf_indexes.sql"),
  schoolRolePulse: path.join(BACKEND_ROOT, "db", "school", "047_role_pulse.sql"),
  schoolPaymentDetails: path.join(BACKEND_ROOT, "db", "school", "048_payment_details.sql"),
  schoolWave2Visibility: path.join(BACKEND_ROOT, "db", "school", "049_wave2_visibility.sql"),
  schoolDriverTransportRead: path.join(BACKEND_ROOT, "db", "school", "050_driver_transport_read.sql"),
  schoolPulseCrossRoleReads: path.join(BACKEND_ROOT, "db", "school", "051_pulse_cross_role_reads.sql"),
} as const;

const envSchema = z.object({
  POSTGRES_HOST: z.string().default(""),
  POSTGRES_PORT: z.coerce.number().default(0),
  POSTGRES_USER: z.string().default("mandela"),
  POSTGRES_PASSWORD: z.string().default("mandela_dev_pw"),
  POSTGRES_CONTROL_DB: z.string().default("mandela_control"),
  DEV_PG_DATA: z.string().default(".devpg"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  VAULT_MASTER_KEY: z.string().default(""),
  SCHOOL_HOST_ROOT: z.string().default("mandela.school"),
  // Web module: session signing secret + fallback tenant when host has no subdomain.
  WEB_SESSION_SECRET: z.string().default("mandela_dev_web_secret_change_me"),
  /** Gates the public "claim my new school" call — issued by the setup flow. */
  PROVISION_TOKEN: z.string().default("mandela_dev_provision_token"),
  WEB_DEFAULT_TENANT: z.string().default("demo"),
  // Dev CORS for the Next.js app (http://localhost:3000)
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  // Talk delivery provider: "simulate" flips queued to sent locally (dev);
  // "meta" calls the WhatsApp Cloud API (needs token + phone number id).
  WHATSAPP_PROVIDER: z.enum(["simulate", "meta"]).default("simulate"),
  WHATSAPP_TOKEN: z.string().default(""),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(""),
  // Daraja C2B: shared validation token Safaricom echoes on the callback.
  // Empty = endpoint accepts (dev); set it before pointing Daraja at prod.
  DARAJA_VALIDATION_TOKEN: z.string().default(""),
  DARAJA_SHORTCODE: z.string().default(""),
  // Fleet capacity: per-school pool size × active schools must fit inside the
  // Postgres max_connections budget (or sit behind pgbouncer in transaction
  // mode on big fleets). Defaults are right for dev + small VPS.
  PG_POOL_MAX_SCHOOL: z.coerce.number().int().min(1).max(100).default(5),
  PG_POOL_MAX_CONTROL: z.coerce.number().int().min(1).max(100).default(10),
});

const parsed = envSchema.parse(process.env);

/** PORT="" (or 0) in the ambient env must not hijack the default. */
const rawPort = Number(process.env.PORT);
const PORT = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 4000;

export const config = { ...parsed, PORT };

/** Pool sizing the fleet math depends on — see PG_POOL_MAX_* in the env schema. */
export const POOL_MAX = {
  school: config.PG_POOL_MAX_SCHOOL,
  control: config.PG_POOL_MAX_CONTROL,
};

/**
 * Dev mode: no POSTGRES_HOST configured => run an embedded, user-space
 * Postgres (no Docker, no Windows service, no admin rights).
 * Production (VPS): host must be set; the embedded server never starts.
 */
export const useEmbeddedPostgres =
  config.NODE_ENV !== "production" && config.POSTGRES_HOST === "";

/** Dev embedded Postgres port (override with DEV_PG_PORT if the default is taken). */
export const DEV_PG_PORT = Number(process.env.DEV_PG_PORT) > 0 ? Number(process.env.DEV_PG_PORT) : 54329;

export const effectivePg = {
  host: useEmbeddedPostgres ? "127.0.0.1" : config.POSTGRES_HOST,
  port: useEmbeddedPostgres ? DEV_PG_PORT : config.POSTGRES_PORT || 5432,
  user: config.POSTGRES_USER,
  password: config.POSTGRES_PASSWORD,
  controlDb: config.POSTGRES_CONTROL_DB,
};
