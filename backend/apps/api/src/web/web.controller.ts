import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import * as z from "zod";
import { config } from "../config.js";
import * as web from "./queries.js";
import * as rolePulse from "./rolePulse.js";
import * as pdf from "./pdf.js";
import { freshRollup } from "./rollupWorker.js";
import { resolveTenant } from "./queries.js";
import { getSchoolPool } from "../db/pool.js";
import * as channels from "../talk/channels.js";
import * as talkWorker from "../talk/worker.js";
import * as records from "../records/records.js";
import * as integrity from "../money/integrity.js";
import { passwordPolicyError } from "./password.js";

/**
 * Web REST surface — consumed by the Next.js app (frontend/).
 * Auth: `mandela_session` cookie (HMAC-signed token). In dev the app may
 * also POST who the user is; production moves to better-auth + cookies.
 * Every response is derived from the tenant's school database.
 */

const SESSION_COOKIE = "mandela_session";

/**
 * Normalize a Kenyan phone to 2547XXXXXXXX / 2541XXXXXXXX. Accepts what the
 * login page suggests ("0733 000 001") and what guardians actually type.
 */
function normalizeKenyanPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  return null;
}

/**
 * Zod parse failures on the auth paths must be a 400 the UI can show, not an
 * unhandled exception -> 500 (the harness caught exactly that on guardian
 * phone login). Everything else keeps Nest's default error semantics.
 */
function parseInput<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const err = new Error(result.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ")) as Error & { status: number };
    err.status = 400;
    throw err;
  }
  return result.data;
}

type TenantRequest = Request & { mandelaTenant?: { dbName: string; slug: string } };

function tenantFromReq(req: Request): Promise<{ dbName: string; slug: string }> {
  return (async () => {
    // The Next.js server forwards the original school host via x-mandela-host.
    const host = (req.headers["x-mandela-host"] as string | undefined) ?? req.headers.host;
    const t = await resolveTenant(host);
    if (!t) {
      throw new Error("no tenant resolved — provision a school or set WEB_DEFAULT_TENANT");
    }
    (req as TenantRequest).mandelaTenant = t;
    return t;
  })();
}

function principalFromReq(req: Request): web.Principal | null {
  const tenant = (req as TenantRequest).mandelaTenant;
  return tenant ? web.verifyToken(parseCookies(req)[SESSION_COOKIE], tenant.slug) : null;
}

// Tiny cookie parse/serialize (avoids a dependency; better-auth replaces later)
function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

@Controller("web")
export class WebController {
  // -- session ---------------------------------------------------------------

  @Post("login/staff")
  @HttpCode(200)
  async loginStaff(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(
      z.object({ email: z.string().email(), password: z.string().max(128).optional() }),
      body,
    );
    const tenant = await tenantFromReq(req);
    // Throttle per (ip + email): 5 failures in 15 minutes lock the pair.
    const ip =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "?";
    const throttleKey = `${ip}|${input.email.toLowerCase()}`;
    if (await web.loginThrottleBlocked(tenant.dbName, throttleKey)) {
      return { ok: false as const, error: "Too many attempts - wait 15 minutes and try again." };
    }
    const result = await web.resolveStaffLogin(tenant.dbName, tenant.slug, input.email, input.password);
    if (!result) {
      await web.loginThrottleFail(tenant.dbName, throttleKey);
      return { ok: false as const, error: "Check the email and password - no match on the active staff roll." };
    }
    await web.loginThrottleReset(tenant.dbName, throttleKey);
    const res = req.res!;
    res.cookie(SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.NODE_ENV === "production",
      maxAge: web.SESSION_TTL_SECONDS * 1000,
      path: "/",
    });
    return { ok: true as const, staff: result.staff, needsPassword: result.needsPassword };
  }

  @Post("login/guardian")
  @HttpCode(200)
  async loginGuardian(@Req() req: Request, @Body() body: unknown) {
    const raw = parseInput(z.object({ phone: z.string().min(9).max(20) }), body).phone;
    const phone = normalizeKenyanPhone(raw);
    if (!phone) return { ok: false as const, error: "Enter a valid Kenyan phone number, e.g. 0733 000 001." };
    await tenantFromReq(req);
    // A phone number is an identifier, not proof of identity. Guardian
    // sessions are issued only by POST /web/auth/verify-code.
    return { ok: false as const, error: "Enter the one-time code sent to this phone." };
  }

  @Post("logout")
  @HttpCode(200)
  logout(@Req() req: Request) {
    req.res?.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }

  @Get("whoami")
  async whoami(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal) return { authenticated: false as const, tenant: tenant.slug };
    if (principal.kind === "staff") {
      const db = getSchoolPool(tenant.dbName);
      const r = await db.query<{ full_name: string; role: string; email: string | null }>(
        `SELECT full_name, role::text AS role, email FROM staff WHERE id = $1`,
        [principal.userId],
      );
      if (!r.rowCount) return { authenticated: false as const, tenant: tenant.slug };
      return { authenticated: true as const, tenant: tenant.slug, principal: { kind: "staff" as const, ...r.rows[0] } };
    }
    const db = getSchoolPool(tenant.dbName);
    const r = await db.query<{ full_name: string }>(
      `SELECT full_name FROM guardian WHERE id = $1`,
      [principal.guardianId],
    );
    if (!r.rowCount) return { authenticated: false as const, tenant: tenant.slug };
    return { authenticated: true as const, tenant: tenant.slug, principal: { kind: "guardian" as const, ...r.rows[0] } };
  }

  // -- branding + navigation (the shell is data) ------------------------------

  /**
   * On-demand TLS ask endpoint — Caddy calls this before issuing a certificate
   * for an unknown host (enterprise custom domains). 200 = domain belongs to a
   * provisioned school; 404 = refuse the cert. Public by design, leaks nothing
   * (only yes/no for a hostname the caller already knows).
   */
  @Get("tenant-check")
  @HttpCode(200)
  async tenantCheck(@Query("host") host: string | undefined) {
    if (!host || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(host))
      throw new BadRequestException("bad host");
    // fallback:false — TLS issuance must never succeed because a dev default exists.
    const tenant = await resolveTenant(host.toLowerCase(), { fallback: false });
    if (!tenant) throw new NotFoundException("unknown host");
    return { ok: true, slug: tenant.slug };
  }

  @Get("bootstrap")
  async bootstrap(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const boot = await web.getBootstrap(tenant.dbName);
    return { tenant: tenant.slug, ...boot };
  }

  /** Public aggregates for the landing's live card — no session, no personal rows. */
  @Get("pulse")
  async pulse(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    return web.publicPulse(tenant.dbName);
  }

  /** Cheap change-detection payloads for LiveRefresh polling. */
  @Get("watch/staff")
  async watchStaff(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return { hash: await web.pulseHash(tenant.dbName) };
  }

  @Get("watch/guardian")
  async watchGuardian(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "guardian") return { error: "guardian session required" };
    return { hash: await web.guardianHash(tenant.dbName, principal.guardianId) };
  }

  // -- role homes -------------------------------------------------------------

  @Get("home/guardian")
  async guardianHome(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "guardian") return { error: "guardian session required" };
    return web.guardianHome(tenant.dbName, principal.guardianId);
  }

  @Get("home/staff")
  async staffHome(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.staffHome(tenant.dbName, principal);
  }

  /**
   * Admin pulse — the governance read for the Admin Today screen.
   * The UI stays role-routed: only admin/principal call this; the
   * register + audit numbers themselves stay RLS-guarded in the DB.
   */
  @Get("admin/pulse")
  async adminPulse(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal"].includes(principal.role ?? "")) return { error: "admin only" };
    return web.adminPulse(tenant.dbName, principal);
  }

  /** School-wide search for the topbar — staff sessions; RLS scopes rows. */
  @Get("search")
  async search(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    const q = String(req.query.q ?? "");
    return { hits: await web.schoolSearch(tenant.dbName, principal, q) };
  }

  /** The bell's live counts — any staff session; RLS scopes what's counted. */
  @Get("bell")
  async bell(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.bellState(tenant.dbName, principal);
  }

  /**
   * Audit trail — admin/principal only in the API AND in RLS (audit_read).
   * Filters: action prefix (e.g. "staff", "payment"), actor_kind.
   */
  /** Terms & Calendar — read for all staff; writes admin/principal only (RLS-enforced). */
  @Get("admin/terms")
  async termsCalendar(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.termsCalendar(tenant.dbName, principal);
  }

  /** Create/update a term (+ its academic year). Audit-logged. */
  @Post("admin/terms/upsert")
  @HttpCode(200)
  async upsertTerm(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        year: z.coerce.number().int().min(2000).max(2100),
        label: z.string().trim().min(3).max(40),
        startsOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
        endsOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "admin" && principal.role !== "principal") {
      return { ok: false, error: "Only admin or principal can change the calendar" };
    }
    return web.upsertTerm(tenant.dbName, principal, input);
  }

  /** Guardians & Parents — the contact register (staff read; writes below). */
  @Get("admin/guardians")
  async guardianDirectory(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.guardianDirectory(tenant.dbName, principal);
  }

  /** Create/update one guardian. Audit-logged. */
  @Post("admin/guardians/upsert")
  @HttpCode(200)
  async upsertGuardian(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        id: z.string().uuid().optional(),
        fullName: z.string().trim().min(3).max(120),
        phone: z.string().trim().min(9).max(20),
        email: z.string().trim().email().max(160).optional().or(z.literal("")),
        relationship: z.enum(["mother", "father", "guardian"]),
        waOptIn: z.boolean().optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "admin" && principal.role !== "principal") {
      return { ok: false, error: "Only admin or principal can edit the guardian register" };
    }
    return web.upsertGuardian(tenant.dbName, principal, input);
  }

  // -- Fee Structures ⑫ (docs/BUILD-PHASES.md Phase 1) ------------------------

  /** Structures for the current term + the term label. Staff-wide read. */
  @Get("admin/fees/structures")
  async feeStructures(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listFeeStructures(tenant.dbName, principal);
  }

  /** Create/update one structure line. Audit-logged. */
  @Post("admin/fees/structures/upsert")
  @HttpCode(200)
  async upsertFeeStructure(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        id: z.string().optional(),
        name: z.string().trim().min(2).max(80),
        classId: z.coerce.number().int().nullable(),
        amountCents: z.coerce.number().int().min(0),
        isOptional: z.boolean(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal", "bursar"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only admin, principal or bursar can edit fee structures" };
    }
    return web.upsertFeeStructure(tenant.dbName, principal, input);
  }

  /** Bulk-apply a structure line to a class — the assist. Audited with count. */
  @Post("admin/fees/structures/apply")
  @HttpCode(200)
  async applyFeeStructure(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ structureId: z.string() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal", "bursar"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only admin, principal or bursar can apply fee structures" };
    }
    return web.bulkApplyFeeStructure(tenant.dbName, principal, input);
  }

  /** Sibling-discount rules. */
  @Get("admin/fees/discounts")
  async feeDiscounts(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listDiscounts(tenant.dbName, principal);
  }

  @Post("admin/fees/discounts/upsert")
  @HttpCode(200)
  async upsertFeeDiscount(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        id: z.string().optional(),
        name: z.string().trim().min(2).max(80),
        classId: z.coerce.number().int().nullable(),
        appliesFrom: z.coerce.number().int().min(2).max(12),
        percentOff: z.coerce.number().min(0.5).max(100),
        active: z.boolean(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal", "bursar"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only admin, principal or bursar can edit discounts" };
    }
    return web.upsertDiscount(tenant.dbName, principal, input);
  }

  /** Instalment plans (per learner-term). */
  @Get("admin/fees/plans")
  async feePlans(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listPlans(tenant.dbName, principal);
  }

  @Post("admin/fees/plans/create")
  @HttpCode(200)
  async createFeePlan(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        learnerId: z.string().uuid(),
        name: z.string().trim().min(2).max(80),
        parts: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(60),
              dueOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
              amountCents: z.coerce.number().int().min(1),
            }),
          )
          .min(2)
          .max(6),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal", "bursar"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only admin, principal or bursar can create plans" };
    }
    return web.createPlan(tenant.dbName, principal, input);
  }

  // -- Invoices & Statements 13 (docs/BUILD-PHASES.md Phase 1) -----------------

  /** Per-learner term ledger: billed / paid / balance. Money roles + counter. */
  @Get("admin/invoices")
  async invoices(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal", "bursar", "counter"].includes(principal.role ?? "")) {
      return { error: "money roles only" };
    }
    return web.listInvoices(tenant.dbName, principal);
  }

  /** THE learner-term statement — the same function the guardian app calls. */
  @Get("admin/invoices/statement/:learnerId")
  async invoiceStatement(@Req() req: Request, @Param("learnerId") learnerId: string) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal", "bursar", "counter"].includes(principal.role ?? "")) {
      return { error: "money roles only" };
    }
    const termId = await web.currentTermId(tenant.dbName);
    if (!termId) return { error: "no term exists" };
    return web.learnerTermStatement(
      tenant.dbName,
      { userId: principal.userId, role: principal.role ?? "admin" },
      learnerId,
      termId,
    );
  }

  /**
   * Print artifacts. The statement reuses THE one statement query; the report
   * card enforces draft-never-leaves for guardians. Both are lenses over the
   * ledger, not new sources — no new tables, no new math.
   */
  /** THE receipt print payload — by receipt number. Guardians may fetch their own. */
  @Get("print/receipt")
  async printReceipt(@Req() req: Request, @Query("receiptNo") receiptNo?: string) {
    if (!receiptNo) return { error: "receiptNo required" };
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal) return { error: "session required" };
    return web.paymentReceipt(tenant.dbName, principal, receiptNo);
  }

  @Get("print/report-card")
  async printReportCard(
    @Req() req: Request,
    @Query("cardId") cardId?: string,
    @Query("learnerId") learnerId?: string,
  ) {
    if (!cardId && !learnerId) return { error: "cardId or learnerId required" };
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal) return { error: "session required" };
    return web.reportCardPrint(
      tenant.dbName,
      principal.kind === "guardian"
        ? { userId: principal.guardianId, role: "guardian", guardianId: principal.guardianId }
        : { userId: principal.userId, role: principal.role ?? "admin" },
      cardId ? { cardId } : { learnerId: learnerId! },
    );
  }

  @Get("print/statement/:learnerId")
  async printStatement(@Req() req: Request, @Param("learnerId") learnerId: string) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal) return { error: "session required" };
    const termId = await web.currentTermId(tenant.dbName);
    if (!termId) return { error: "no term exists" };
    return web.learnerTermStatement(
      tenant.dbName,
      principal.kind === "guardian"
        ? { userId: principal.guardianId, role: "guardian", guardianId: principal.guardianId }
        : { userId: principal.userId, role: principal.role ?? "admin" },
      learnerId,
      termId,
    );
  }

  /** Manual invoice line — the bursar keys the bill. Audited; refuses duplicates loudly. */
  @Post("admin/invoices/item")
  @HttpCode(200)
  async addInvoiceItem(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        learnerId: z.string().uuid(),
        name: z.string().trim().min(2).max(80),
        amountCents: z.coerce.number().int().min(1),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal", "bursar"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only admin, principal or bursar can bill items" };
    }
    return web.createInvoiceItem(tenant.dbName, principal, input);
  }

  // -- Curriculum Setup (16) - pack controls + the class ladder -------------------

  @Get("admin/curriculum")
  async curriculumSetup(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listCurriculumPacks(tenant.dbName, principal);
  }

  /** Resolver probe — the SAME context every classroom form will consume. */
  @Get("admin/curriculum/context/:classId")
  async curriculumContextProbe(@Req() req: Request, @Param("classId") classId: string) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return { context: await web.curriculumContext(tenant.dbName, Number(classId)) };
  }

  @Post("admin/curriculum/pack")
  @HttpCode(200)
  async setCurriculumPack(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        code: z.string().trim().min(2).max(30),
        enabled: z.boolean().optional(),
        makeDefault: z.boolean().optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only admin or principal can change curriculum packs" };
    }
    return web.setCurriculumPack(tenant.dbName, principal, input);
  }

  @Post("admin/curriculum/attach")
  @HttpCode(200)
  async attachClassLevel(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({ classId: z.coerce.number().int().positive(), levelId: z.coerce.number().int().positive() })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only admin or principal can move classes between grades" };
    }
    return web.attachClassToLevel(tenant.dbName, principal, input);
  }

  // -- Admissions (3) - the front desk funnel --------------------------------------

  @Get("admin/admissions")
  async admissionsBoard(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listInquiries(tenant.dbName, principal);
  }

  @Post("admin/admissions/inquiry")
  @HttpCode(200)
  async newInquiry(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        childFirst: z.string().trim().min(2).max(50),
        childMiddle: z.string().trim().max(50).optional(),
        childLast: z.string().trim().min(2).max(50),
        childDob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        gender: z.enum(["M", "F"]).optional(),
        parentName: z.string().trim().min(3).max(80),
        phone: z.string().trim().min(9).max(15),
        email: z.string().email().optional(),
        levelInterest: z.string().trim().max(40).optional(),
        curriculumCode: z.string().trim().max(30).optional(),
        source: z.enum(["walk-in", "phone", "referral", "event"]),
        notes: z.string().trim().max(500).optional(),
        nextFollowupOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal", "counter", "dorm_parent", "janitor", "librarian", "patron", "hod"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only admin, principal or counter can log admissions" };
    }
    return web.createInquiry(tenant.dbName, principal, input);
  }

  @Post("admin/admissions/stage")
  @HttpCode(200)
  async stageInquiry(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({ id: z.string().uuid(), stage: z.enum(["inquiry", "visit", "assessment", "offered", "enrolled", "lost"]) })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal", "counter", "dorm_parent", "janitor", "librarian", "patron", "hod"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only admin, principal or counter can move the funnel" };
    }
    return web.moveInquiryStage(tenant.dbName, principal, input);
  }

  @Post("admin/admissions/convert")
  @HttpCode(200)
  async convertInquiry(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({ id: z.string().uuid(), classId: z.coerce.number().int().positive().nullable(), boarding: z.boolean() })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal", "counter"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only admin, principal or counter can enrol a learner" };
    }
    return web.convertInquiry(tenant.dbName, principal, input);
  }

  // -- Compliance Center (28) - one glance, countdowns, fix deep-links ------------

  @Get("admin/compliance")
  async compliance(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.complianceRollup(tenant.dbName, principal);
  }

  @Post("admin/compliance/line")
  @HttpCode(200)
  async updateComplianceLine(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        key: z.string().trim().min(2).max(60),
        done: z.boolean().optional(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only admin or principal can update the compliance checklist" };
    }
    return web.updateComplianceLine(tenant.dbName, principal, input);
  }

  // -- Retention policy (32-parked decision, flank #8) -----------------------------

  @Get("admin/retention")
  async retention(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.getRetentionPolicy(tenant.dbName);
  }

  @Post("admin/retention")
  @HttpCode(200)
  async setRetention(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({ backups: z.string().trim().min(4).max(300), exportWindowDays: z.coerce.number().int().min(30).max(36500) })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only admin or principal can change the retention policy" };
    }
    return web.setRetentionPolicy(tenant.dbName, principal, input);
  }

  // -- Approvals Inbox (36) + Tasks (37) - the two-leaders hinge -------------------

  @Get("admin/approvals")
  async approvals(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listApprovals(tenant.dbName, principal);
  }

  @Post("admin/approvals/raise")
  @HttpCode(200)
  async raiseApproval(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        requestType: z.enum(["fee-waiver", "purchase", "leave", "route-add", "write-off", "other"]),
        about: z.string().trim().max(200).optional(),
        note: z.string().trim().max(500).optional(),
        amountCents: z.coerce.number().int().min(1).optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.raiseApproval(tenant.dbName, principal, input);
  }

  @Post("admin/approvals/decide")
  @HttpCode(200)
  async decideApproval(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        reason: z.string().trim().min(4).max(500),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only admin or principal can decide requests" };
    }
    return web.decideApproval(tenant.dbName, principal, input);
  }

  @Get("admin/tasks")
  async tasks(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listTasks(tenant.dbName, principal);
  }

  @Post("admin/tasks/create")
  @HttpCode(200)
  async createTask(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        title: z.string().trim().min(3).max(160),
        detail: z.string().trim().max(500).optional(),
        source: z.enum(["manual", "compliance", "kemis", "defaulters", "term-close", "board"]).optional(),
        sourceLink: z.string().trim().max(120).optional(),
        assigneeId: z.string().uuid().optional(),
        dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.createTask(tenant.dbName, principal, input);
  }

  @Post("admin/tasks/complete")
  @HttpCode(200)
  async completeTask(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({ id: z.string().uuid(), state: z.enum(["done", "cancelled"]) })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only admin or principal can close tasks" };
    }
    return web.completeTask(tenant.dbName, principal, input);
  }

  // -- Payroll (7) - contracts, runs, approve-via-Inbox, disburse ------------------

  @Get("admin/payroll/contracts")
  async payrollContracts(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "bursar"].includes(principal.role ?? "")) return { error: "payroll is admin/bursar" };
    return web.listContracts(tenant.dbName, principal);
  }

  @Post("admin/payroll/contracts/upsert")
  @HttpCode(200)
  async upsertContract(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        staffId: z.string().uuid(),
        population: z.enum(["bom", "term"]),
        basicCents: z.coerce.number().int().min(0),
        frequency: z.enum(["monthly", "termly"]),
        allowances: z.record(z.number()).optional(),
        effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "bursar"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only admin or bursar can manage contracts" };
    }
    return web.upsertContract(tenant.dbName, principal, input);
  }

  @Get("admin/payroll/runs")
  async payrollRuns(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "bursar"].includes(principal.role ?? "")) return { error: "payroll is admin/bursar" };
    return web.listPayrollRuns(tenant.dbName, principal);
  }

  @Get("admin/payroll/runs/:runId")
  async payrollRun(@Req() req: Request, @Param("runId") runId: string) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "bursar"].includes(principal.role ?? "")) return { error: "payroll is admin/bursar" };
    return web.getPayrollRun(tenant.dbName, principal, runId);
  }

  @Post("admin/payroll/runs/compute")
  @HttpCode(200)
  async computePayroll(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({ period: z.string().regex(/^\d{4}-\d{2}$/), workingDays: z.coerce.number().int().min(1).max(31).optional() })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "bursar"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only admin or bursar can run payroll" };
    }
    return web.computePayrollRun(tenant.dbName, principal, input);
  }

  @Post("admin/payroll/runs/approve")
  @HttpCode(200)
  async approvePayroll(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({ runId: z.string().uuid(), reason: z.string().trim().min(4).max(500) })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "admin") {
      return { ok: false, error: "Only the admin signs off payroll" };
    }
    return web.approvePayrollRun(tenant.dbName, principal, input);
  }

  @Post("admin/payroll/runs/disburse")
  @HttpCode(200)
  async disbursePayroll(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({ runId: z.string().uuid(), how: z.enum(["bank-file", "manual", "mpesa"]) })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "bursar"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only admin or bursar disburse" };
    }
    return web.disbursePayrollRun(tenant.dbName, principal, input);
  }

  /** Guardian statement — SAME query as the staff view. Trust by construction. */
  @Get("guardian/statement/:learnerId")
  async guardianStatement(@Req() req: Request, @Param("learnerId") learnerId: string) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "guardian") return { error: "guardian session required" };
    const termId = await web.currentTermId(tenant.dbName);
    if (!termId) return { error: "no term exists" };
    return web.learnerTermStatement(
      tenant.dbName,
      { userId: principal.guardianId, role: "guardian", guardianId: principal.guardianId },
      learnerId,
      termId,
    );
  }

  /** Bulk CSV import of guardians. Row-validated, phone-normalized, audit-logged. */
  @Post("admin/guardians/import")
  @HttpCode(200)
  async importGuardians(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        rows: z
          .array(
            z.object({
              fullName: z.string().trim().min(3).max(120),
              phone: z.string().trim().min(9).max(20),
              email: z.string().trim().email().max(160).optional().or(z.literal("")),
              relationship: z.enum(["mother", "father", "guardian"]).default("guardian"),
            }),
          )
          .min(1)
          .max(2000),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "admin" && principal.role !== "principal") {
      return { ok: false, error: "Only admin or principal can import guardians" };
    }
    return web.importGuardians(tenant.dbName, principal, input.rows);
  }

  @Get("admin/audit")
  async auditTrail(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal"].includes(principal.role ?? "")) return { error: "admin only" };
    const { action, actor, limit } = req.query as { action?: string; actor?: string; limit?: string };
    const entries = await web.auditTrail(tenant.dbName, principal, {
      action: action || undefined,
      actor: actor || undefined,
      limit: limit ? Math.min(Number(limit) || 100, 500) : 100,
    });
    return { entries };
  }

  /** Exam Entries — the KEMIS readiness read (admin/principal). */
  @Get("admin/kemis")
  async kemisReadiness(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal"].includes(principal.role ?? "")) return { error: "admin only" };
    return web.kemisReadiness(tenant.dbName, principal);
  }

  // -- people ------------------------------------------------------------------

  @Get("learners")
  async learners(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return { learners: await web.listLearners(tenant.dbName, principal) };
  }

  @Get("classes")
  async classes(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return { classes: await web.listClasses(tenant.dbName, principal) };
  }

  // -- classroom ----------------------------------------------------------------

  @Get("roster/:classId")
  async roster(@Req() req: Request, @Param("classId") classId: string) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return { roster: await web.rosterForToday(tenant.dbName, principal, Number(classId)) };
  }

  @Post("attendance")
  @HttpCode(200)
  async markAttendance(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        marks: z.array(z.object({ learnerId: z.string().uuid(), mark: z.enum(["present", "absent", "late", "excused"]) })).min(1),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    const marked = await web.markAttendance(tenant.dbName, principal, input.marks);
    return { ok: true, marked };
  }

  @Get("homework")
  async homework(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return { homework: await web.listHomework(tenant.dbName, principal) };
  }

  @Post("homework")
  @HttpCode(200)
  async createHomework(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        classId: z.number().int(),
        subject: z.string().min(1),
        title: z.string().min(1),
        body: z.string().min(1),
        dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    const id = await web.createHomework(tenant.dbName, principal, input);
    return { ok: true, id };
  }

  // -- money ---------------------------------------------------------------------

  @Get("money/collections")
  async collections(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return { collections: await web.collectionByClass(tenant.dbName, principal) };
  }

  @Get("money/payments")
  async payments(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return { payments: await web.recentPayments(tenant.dbName, principal) };
  }

  @Post("money/payments")
  @HttpCode(200)
  async recordPayment(@Req() req: Request, @Body() body: unknown) {
    const detailsShape = z
      .object({
        mpesa_code: z.string().max(40).optional(),
        mpesa_phone: z.string().max(20).optional(),
        mpesa_time: z.string().max(40).optional(),
        slip_no: z.string().max(40).optional(),
        bank_name: z.string().max(60).optional(),
        cheque_no: z.string().max(40).optional(),
        cheque_date: z.string().max(40).optional(),
      })
      .strict()
      .optional();
    const input = z
      .object({
        learnerId: z.string().uuid(),
        amountCents: z.number().int().positive(),
        method: z.enum(["mpesa", "bank", "cash", "cheque"]),
        reference: z.string().max(80).optional(),
        details: detailsShape,
        paidAt: z.string().max(40).optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal) return { error: "session required" };
    const result = await web.recordPayment(tenant.dbName, principal, input);
    return { ok: true, ...result };
  }

  /** Edit a recorded payment — audited before/after, money roles only. */
  @Post("money/payments/update")
  @HttpCode(200)
  async updatePayment(@Req() req: Request, @Body() body: unknown) {
    const detailsShape = z
      .object({
        mpesa_code: z.string().max(40).optional(),
        mpesa_phone: z.string().max(20).optional(),
        mpesa_time: z.string().max(40).optional(),
        slip_no: z.string().max(40).optional(),
        bank_name: z.string().max(60).optional(),
        cheque_no: z.string().max(40).optional(),
        cheque_date: z.string().max(40).optional(),
      })
      .strict()
      .optional();
    const input = z
      .object({
        paymentId: z.string().uuid(),
        amountCents: z.number().int().positive().optional(),
        method: z.enum(["mpesa", "bank", "cash", "cheque"]).optional(),
        reference: z.string().max(80).nullable().optional(),
        details: detailsShape,
        paidAt: z.string().max(40).nullable().optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "bursar"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only admin or bursar can edit payments" };
    }
    return web.updatePayment(tenant.dbName, principal, input.paymentId, input);
  }

  // -- talk ------------------------------------------------------------------------

  @Get("messages")
  async messages(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return { messages: await web.listMessages(tenant.dbName, principal) };
  }

  @Get("announcements")
  async announcements(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal) return { error: "session required" };
    return { announcements: await web.listAnnouncements(tenant.dbName, principal) };
  }

  @Post("announcements")
  @HttpCode(200)
  async createAnnouncement(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        title: z.string().min(1).max(120),
        body: z.string().min(1),
        urgency: z.enum(["alert", "update"]).default("update"),
        audience: z.record(z.unknown()).default({ all: true }),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    const id = await web.createAnnouncement(tenant.dbName, principal, input);
    return { ok: true, id };
  }

  // -- insights ----------------------------------------------------------------------

  @Get("insights")
  async insights(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.insights(tenant.dbName, principal);
  }

  // -- people: staff register (read: admin/principal; write: admin/principal) ---

  @Get("staff")
  async staff(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return { staff: await web.listStaff(tenant.dbName, principal) };
  }

  @Post("staff")
  @HttpCode(200)
  async createStaff(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        fullName: z.string().trim().min(3).max(120),
        email: z.string().trim().email().max(160),
        phone: z.string().trim().max(20).optional(),
        role: z.enum(["admin", "principal", "teacher", "bursar", "counter", "driver"]),
        classes: z.array(z.string().trim().min(1).max(20)).max(12).default([]),
        tscNo: z.string().trim().max(20).optional(),
        nationalId: z.string().trim().max(20).optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "admin" && principal.role !== "principal") {
      return { ok: false, error: "Only admin or principal can add staff" };
    }
    return web.createStaff(tenant.dbName, principal, input);
  }

  // -- classroom: CBC/CBE assessment capture ------------------------------------

  @Get("class/:classId/areas")
  async classAreas(@Req() req: Request, @Param("classId") classId: string) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return { areas: await web.classLearningAreas(tenant.dbName, principal, Number(classId)) };
  }

  @Get("class/:classId/assessments")
  async classAssessments(@Req() req: Request, @Param("classId") classId: string) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return { assessments: await web.listAssessments(tenant.dbName, principal, Number(classId)) };
  }

  @Post("assessment/record")
  @HttpCode(200)
  async recordAssessment(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        classId: z.number().int().positive(),
        entries: z
          .array(
            z.object({
              learnerId: z.string().uuid(),
              areaCode: z.string().trim().min(1).max(30),
              level: z.string().trim().min(1).max(5),
            }),
          )
          .min(1)
          .max(200),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.recordAssessment(tenant.dbName, principal, input);
  }

  @Post("staff/update")
  @HttpCode(200)
  async updateStaff(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        id: z.string().uuid(),
        role: z.enum(["admin", "principal", "teacher", "bursar", "counter", "driver"]).optional(),
        active: z.boolean().optional(),
        classes: z.array(z.string().trim().min(1).max(20)).max(12).optional(),
        tscNo: z.string().trim().max(20).optional(),
        nationalId: z.string().trim().max(20).optional(),
        phone: z.string().trim().max(20).optional(),
      })
      .refine((v) => Object.keys(v).length > 1, { message: "Nothing to update" })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "admin" && principal.role !== "principal") {
      return { ok: false, error: "Only admin or principal can edit staff" };
    }
    return web.updateStaff(tenant.dbName, principal, input);
  }

  // -- money: levies + pending payments --------------------------------------------

  @Get("money/levies")
  async levies(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return { levies: await web.listLevies(tenant.dbName, principal) };
  }

  @Get("money/pending")
  async pending(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return { pending: await web.listPendingPayments(tenant.dbName, principal) };
  }

  @Post("money/payments/confirm")
  @HttpCode(200)
  async confirmPayment(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ receiptNo: z.string().min(3).max(40) }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    const result = await web.confirmPayment(tenant.dbName, principal, input.receiptNo);
    return { ok: true, ...result };
  }

  // -- settings: the school edits its own identity ----------------------------------

  @Get("settings")
  async settings(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.getSettings(tenant.dbName);
  }

  @Post("settings")
  @HttpCode(200)
  async updateSettings(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        name: z.string().min(1).max(120).optional(),
        tagline: z.string().max(200).optional(),
        motto: z.string().max(160).optional(),
        contact_phone: z.string().max(30).nullable().optional(),
        contact_email: z.string().max(120).nullable().optional(),
        contact_address: z.string().max(160).nullable().optional(),
        quote_text: z.string().max(400).nullable().optional(),
        quote_author: z.string().max(120).nullable().optional(),
        modules: z.array(z.object({ title: z.string().min(1).max(60), body: z.string().min(1).max(300) })).max(8).optional(),
        nav: z.record(z.array(z.string().max(24)).max(6)).optional(),
        prime_questions: z.record(z.string().max(160)).optional(),
        // Per-school color overrides — strict hex, applied as CSS var overrides.
        theme: z.record(z.string().regex(/^#[0-9a-fA-F]{6}$/)).optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    try {
      await web.updateSettings(tenant.dbName, principal, input);
      return { ok: true };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  // -- guardian: profile + message history ------------------------------------------

  @Get("guardian/profile")
  async guardianProfile(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "guardian") return { error: "guardian session required" };
    return web.guardianProfile(tenant.dbName, principal.guardianId);
  }

  @Get("guardian/messages")
  async guardianMessages(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "guardian") return { error: "guardian session required" };
    return { messages: await web.guardianMessages(tenant.dbName, principal.guardianId) };
  }

  /** Guardian picks their daily-loop channel + email (self-service, RLS-scoped). */
  @Post("guardian/channel")
  @HttpCode(200)
  async guardianChannel(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        prefChannel: z.enum(["whatsapp", "email", "none"]),
        email: z.string().email().max(200).nullable().optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "guardian") return { error: "guardian session required" };
    try {
      await web.updateGuardianChannel(tenant.dbName, principal.guardianId, input);
      return { ok: true };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  // -- Money Rails (14) -------------------------------------------------------
  @Get("admin/rails")
  async railsOverview(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "bursar"].includes(principal.role ?? "")) return { error: "money rails is admin/bursar" };
    return web.listRailsSuggestions(tenant.dbName, principal);
  }

  @Post("admin/rails/import-csv")
  @HttpCode(200)
  async railsImportCsv(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        fileName: z.string().min(1).max(200),
        rows: z.array(z.object({
          payerName: z.string().max(120).optional(),
          payerRef: z.string().max(120).optional(),
          amountCents: z.coerce.number().int().positive(),
          paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })).min(1).max(500),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "bursar"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only admin or bursar import bank statements" };
    }
    return web.importBankCsv(tenant.dbName, principal, input);
  }

  @Post("admin/rails/confirm")
  @HttpCode(200)
  async railsConfirm(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({ id: z.string().uuid(), learnerId: z.string().uuid(), method: z.enum(["bank", "cash", "cheque", "mpesa"]) })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "bursar"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only admin or bursar confirm rails entries" };
    }
    return web.confirmRailsSuggestion(tenant.dbName, principal, input);
  }

  @Post("admin/rails/dismiss")
  @HttpCode(200)
  async railsDismiss(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ id: z.string().uuid() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "bursar"].includes(principal.role ?? "")) return { ok: false, error: "admin/bursar only" };
    return web.dismissRailsSuggestion(tenant.dbName, principal, input.id);
  }

  // -- Attendance Oversight (17) + Exams & Report Cards (18) ------------------
  @Get("admin/attendance-oversight")
  async attendanceOversight(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal"].includes(principal.role ?? "")) return { error: "leadership view" };
    return web.attendanceOversight(tenant.dbName, principal);
  }

  @Get("admin/exam-coverage")
  async examCoverage(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    // Teachers run their own classes' card desk (draft + manage); the query
    // scopes them to the classes on their timetable. Approval is separate.
    if (!["admin", "principal", "teacher"].includes(principal.role ?? "")) return { error: "leadership view" };
    return web.examCoverage(tenant.dbName, principal);
  }

  @Post("admin/report-cards/generate")
  @HttpCode(200)
  async reportCardGenerate(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ learnerId: z.string().uuid() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal", "teacher"].includes(principal.role ?? "")) {
      return { ok: false, error: "teachers and leadership generate report cards" };
    }
    return web.generateReportCard(tenant.dbName, principal, input);
  }

  @Post("admin/report-cards/approve")
  @HttpCode(200)
  async reportCardApprove(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ cardId: z.string().uuid() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal"].includes(principal.role ?? "")) {
      return { ok: false, error: "Only principal or admin approve" };
    }
    return web.approveReportCard(tenant.dbName, principal, input.cardId);
  }

  // -- Governance cluster (33/34/35/36) ---------------------------------------
  @Get("admin/users-roles")
  async usersRoles(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "admin") return { error: "users & roles is admin-only" };
    return web.usersAndRoles(tenant.dbName, principal);
  }

  @Post("admin/users-roles/change")
  @HttpCode(200)
  async userRoleChange(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({ staffId: z.string().uuid(), role: z.enum(["admin", "principal", "teacher", "bursar", "counter", "driver", "dorm_parent", "janitor", "librarian", "patron", "hod"]) })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "admin") return { ok: false, error: "Only the admin changes roles" };
    return web.changeUserRole(tenant.dbName, principal, input);
  }

  @Get("admin/perm-matrix")
  async permMatrix(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.permMatrix(tenant.dbName, principal);
  }

  @Post("admin/perm-matrix/set")
  @HttpCode(200)
  async permMatrixSet(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        moduleKey: z.string().min(1).max(40),
        role: z.enum(["admin", "principal", "teacher", "bursar", "counter", "driver", "dorm_parent", "janitor", "librarian", "patron", "hod"]),
        owns: z.boolean().optional(),
        sees: z.boolean().optional(),
        landing: z.boolean().optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "admin") return { ok: false, error: "Only the admin edits the matrix" };
    return web.setPermCell(tenant.dbName, principal, input);
  }

  @Get("admin/duties")
  async duties(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listDuties(tenant.dbName, principal);
  }

  @Post("admin/duties/assign")
  @HttpCode(200)
  async dutyAssign(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({ staffId: z.string().uuid(), dutyKey: z.string().min(1).max(80), label: z.string().min(1).max(120), scopeId: z.string().max(80).optional() })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal"].includes(principal.role ?? "")) {
      return { ok: false, error: "Principal or admin appoint duties" };
    }
    return web.assignDuty(tenant.dbName, principal, input);
  }

  @Post("admin/duties/end")
  @HttpCode(200)
  async dutyEnd(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ id: z.string().uuid() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal"].includes(principal.role ?? "")) return { ok: false, error: "Principal or admin end duties" };
    return web.endDuty(tenant.dbName, principal, input.id);
  }

  @Get("admin/integrations")
  async integrations(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.integrationsHealth(tenant.dbName, principal);
  }

  @Post("admin/integrations/toggle")
  @HttpCode(200)
  async integrationsToggle(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ key: z.string().min(1).max(40), connected: z.boolean() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "admin") return { ok: false, error: "Only the admin toggles integrations" };
    return web.toggleIntegration(tenant.dbName, principal, input);
  }

  // ------------------------- ㊸ Sections & Patrons -------------------------
  @Get("admin/sections")
  async sections(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listSections(tenant.dbName, principal);
  }

  @Get("admin/sections/:id")
  async sectionDetail(@Req() req: Request, @Param("id") id: string) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.getSectionDetail(tenant.dbName, principal, id);
  }

  @Get("admin/my-section")
  async mySection(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.mySection(tenant.dbName, principal);
  }

  @Post("admin/sections/upsert")
  @HttpCode(200)
  async sectionUpsert(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({
      id: z.string().uuid().optional(), name: z.string().min(2).max(80),
      kind: z.string().min(2).max(20), headStaffId: z.string().uuid().nullable().optional(),
      notes: z.string().max(400).nullable().optional(),
    }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.upsertSection(tenant.dbName, principal, input);
  }

  @Post("admin/sections/toggle")
  @HttpCode(200)
  async sectionToggle(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.toggleSection(tenant.dbName, principal, input);
  }

  @Post("admin/sections/members/add")
  @HttpCode(200)
  async sectionMembersAdd(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ sectionId: z.string().uuid(), learnerIds: z.array(z.string().uuid()).min(1).max(200) }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.addSectionMembers(tenant.dbName, principal, input);
  }

  @Post("admin/sections/members/remove")
  @HttpCode(200)
  async sectionMembersRemove(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ sectionId: z.string().uuid(), learnerId: z.string().uuid() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.removeSectionMember(tenant.dbName, principal, input);
  }

  @Post("admin/sections/sessions/hold")
  @HttpCode(200)
  async sectionSessionHold(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({
      sectionId: z.string().uuid(), topic: z.string().max(200).nullable().optional(),
      present: z.array(z.string().uuid()), absent: z.array(z.string().uuid()),
    }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.holdSectionSession(tenant.dbName, principal, input);
  }

  @Post("admin/sections/kit/tag")
  @HttpCode(200)
  async sectionKitTag(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ sectionId: z.string().uuid(), itemId: z.string().uuid() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.tagKitItem(tenant.dbName, principal, input);
  }

  // --------------------- ㊹ Discipline & ㊺ Counselling ---------------------
  @Get("admin/discipline")
  async discipline(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.disciplineOverview(tenant.dbName, principal);
  }

  @Post("admin/discipline/record")
  @HttpCode(200)
  async disciplineRecord(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({
      learnerId: z.string().uuid(), kind: z.enum(["merit", "demerit"]),
      category: z.string().min(2).max(60), points: z.number().int().min(1).max(100),
      description: z.string().min(3).max(1000), action: z.string().max(300).nullable().optional(),
      notifyParent: z.boolean(),
    }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.recordIncident(tenant.dbName, principal, input);
  }

  @Get("admin/counselling")
  async counselling(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.counsellingOverview(tenant.dbName, principal);
  }

  @Post("admin/counselling/open")
  @HttpCode(200)
  async counsellingOpen(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({
      learnerId: z.string().uuid(), summary: z.string().min(4).max(1000),
      referral: z.string().max(300).nullable().optional(),
    }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.openCase(tenant.dbName, principal, input);
  }

  @Post("admin/counselling/note")
  @HttpCode(200)
  async counsellingNote(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ id: z.string().uuid(), note: z.string().min(2).max(2000) }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.appendCaseNote(tenant.dbName, principal, input);
  }

  @Post("admin/counselling/close")
  @HttpCode(200)
  async counsellingClose(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({
      id: z.string().uuid(), status: z.enum(["referred", "closed"]),
      referral: z.string().max(300).nullable().optional(),
    }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.closeCase(tenant.dbName, principal, input);
  }

  // --------------------------- ㉔ Events & Calendar -------------------------
  @Get("admin/events")
  async events(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listEvents(tenant.dbName, principal);
  }

  @Post("admin/events/create")
  @HttpCode(200)
  async eventsCreate(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({
      title: z.string().min(2).max(120), kind: z.enum(["event", "exam-window", "open-day", "holiday", "meeting"]),
      startsOn: z.string().min(8).max(10), endsOn: z.string().min(8).max(10).nullable().optional(),
      notes: z.string().max(400).nullable().optional(),
    }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.createEvent(tenant.dbName, principal, input);
  }

  // ---------------------- ② Learner 360 + CSV import -----------------------
  @Get("admin/learners/:id/360")
  async learner360(@Req() req: Request, @Param("id") id: string) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.learner360(tenant.dbName, principal, id);
  }

  @Post("admin/learners/import-csv")
  @HttpCode(200)
  async learnersImportCsv(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ csv: z.string().min(10).max(500_000), filename: z.string().max(255).nullish() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.importLearnersCsv(tenant.dbName, principal, input.csv, input.filename ?? null);
  }

  // ------------------------------ ㊴ Facilities -----------------------------
  @Get("admin/facilities")
  async facilities(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listRepairs(tenant.dbName, principal);
  }

  @Post("admin/facilities/report")
  @HttpCode(200)
  async facilitiesReport(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({
      room: z.string().min(1).max(80), item: z.string().min(1).max(80),
      qty: z.number().int().min(1).max(500), condition: z.enum(["worn", "broken", "structural"]),
      note: z.string().max(300).nullable().optional(),
      estCostCents: z.number().int().min(0).optional(),
      replaceValueCents: z.number().int().min(0).optional(),
    }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.reportRepair(tenant.dbName, principal, input);
  }

  @Post("admin/facilities/state")
  @HttpCode(200)
  async facilitiesState(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ id: z.string().uuid(), state: z.enum(["open", "in-repair", "done", "out-of-service"]) }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.setRepairState(tenant.dbName, principal, input);
  }

  // -------------------------------- ㉓ Hostel -------------------------------
  @Get("admin/hostel")
  async hostel(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.hostelOverview(tenant.dbName, principal);
  }

  @Post("admin/hostel/dorm")
  @HttpCode(200)
  async hostelDorm(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ name: z.string().min(2).max(60), kind: z.enum(["boys", "girls", "mixed"]), capacity: z.number().int().min(0).max(500) }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.upsertDorm(tenant.dbName, principal, input);
  }

  @Post("admin/hostel/allocate")
  @HttpCode(200)
  async hostelAllocate(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ dormId: z.string().uuid(), learnerId: z.string().uuid(), bedLabel: z.string().max(20).nullable().optional() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.allocateDorm(tenant.dbName, principal, input);
  }

  @Post("admin/hostel/exeat/request")
  @HttpCode(200)
  async hostelExeatRequest(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ learnerId: z.string().uuid(), reason: z.string().min(3).max(300) }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.requestExeat(tenant.dbName, principal, input);
  }

  @Post("admin/hostel/exeat/decide")
  @HttpCode(200)
  async hostelExeatDecide(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({
      id: z.string().uuid(), decision: z.enum(["approved", "denied"]),
      out: z.boolean().optional(), returned: z.boolean().optional(),
    }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.decideExeat(tenant.dbName, principal, input);
  }

  @Post("admin/hostel/rollcall")
  @HttpCode(200)
  async hostelRollcall(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ dormId: z.string().uuid(), present: z.array(z.string().uuid()), absent: z.array(z.string().uuid()) }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.rollcallDorm(tenant.dbName, principal, input);
  }

  // ------------------------------- Infirmary --------------------------------
  @Get("admin/infirmary")
  async infirmary(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.infirmaryOverview(tenant.dbName, principal);
  }

  @Post("admin/infirmary/record")
  @HttpCode(200)
  async infirmaryRecord(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({
      learnerId: z.string().uuid(), kind: z.enum(["allergy", "chronic", "immunization", "note"]),
      detail: z.string().min(2).max(300), parentDeclared: z.boolean(),
    }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.addHealthRecord(tenant.dbName, principal, input);
  }

  @Post("admin/infirmary/visit")
  @HttpCode(200)
  async infirmaryVisit(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({
      learnerId: z.string().uuid(), complaint: z.string().min(2).max(300),
      action: z.string().max(300).nullable().optional(), outcome: z.string().max(300).nullable().optional(),
      medication: z.string().max(120).nullable().optional(), kitItemId: z.string().uuid().nullable().optional(),
      parentNotified: z.boolean(),
    }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.logClinicVisit(tenant.dbName, principal, input);
  }

  // ------------------------------- ⑳ Transport -----------------------------
  @Get("admin/transport")
  async transport(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.transportOverview(tenant.dbName, principal);
  }

  @Post("admin/transport/route")
  @HttpCode(200)
  async transportRoute(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ name: z.string().min(2).max(60), feeTermCents: z.number().int().min(0) }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.upsertRoute(tenant.dbName, principal, input);
  }

  @Post("admin/transport/bus")
  @HttpCode(200)
  async transportBus(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ regNo: z.string().min(3).max(20), capacity: z.number().int().min(1).max(100), routeId: z.string().uuid().nullable().optional() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.upsertBus(tenant.dbName, principal, input);
  }

  @Post("admin/transport/stop")
  @HttpCode(200)
  async transportStop(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ routeId: z.string().uuid(), name: z.string().min(2).max(80), pickupAt: z.string().max(10).nullable().optional(), sort: z.number().int().min(0).optional() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.addStopToRoute(tenant.dbName, principal, input);
  }

  @Post("admin/transport/trip")
  @HttpCode(200)
  async transportTrip(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ busId: z.string().uuid(), routeId: z.string().uuid(), direction: z.enum(["am", "pm"]), done: z.boolean().optional() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.runTrip(tenant.dbName, principal, input);
  }

  // --------------------------- ㉑ Library + ㉒ Store --------------------------
  @Get("admin/library")
  async library(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.libraryOverview(tenant.dbName, principal);
  }

  @Post("admin/library/title")
  @HttpCode(200)
  async libraryTitle(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ title: z.string().min(2).max(160), author: z.string().max(120).nullable().optional(), isbn: z.string().max(20).nullable().optional(), copies: z.number().int().min(1).max(50) }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.addLibraryTitle(tenant.dbName, principal, input);
  }

  @Post("admin/library/issue")
  @HttpCode(200)
  async libraryIssue(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ barcode: z.string().min(3).max(40), learnerId: z.string().uuid(), days: z.number().int().min(1).max(60) }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.issueCopy(tenant.dbName, principal, input);
  }

  @Post("admin/library/return")
  @HttpCode(200)
  async libraryReturn(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ barcode: z.string().min(3).max(40) }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.returnCopy(tenant.dbName, principal, input);
  }

  @Get("admin/store")
  async store(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.storeOverview(tenant.dbName, principal);
  }

  @Post("admin/store/adjust")
  @HttpCode(200)
  async storeAdjust(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ itemId: z.string().uuid(), delta: z.number().int().min(-1000).max(1000), note: z.string().max(200).nullable().optional() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.adjustStock(tenant.dbName, principal, input);
  }

  // ------------------------------ ㊶ Board & BOM ----------------------------
  @Get("admin/board")
  async board(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal"].includes(principal.role ?? "")) return { error: "leaders only" };
    return web.boardOverview(tenant.dbName, principal);
  }

  @Post("admin/board/member")
  @HttpCode(200)
  async boardMember(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ fullName: z.string().min(2).max(80), office: z.enum(["chair", "treasurer", "secretary", "member", "bom-rep"]), phone: z.string().max(20).nullable().optional(), termEnd: z.string().max(10).nullable().optional() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.addBoardMember(tenant.dbName, principal, input);
  }

  @Post("admin/board/meeting")
  @HttpCode(200)
  async boardMeeting(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({
      title: z.string().min(2).max(120), heldOn: z.string().min(8).max(10),
      agenda: z.string().max(2000).nullable().optional(), minutes: z.string().max(4000).nullable().optional(),
      decisions: z.array(z.object({
        decision: z.string().min(2).max(400), action: z.string().max(200).nullable().optional(),
        owner: z.string().max(80).nullable().optional(), dueOn: z.string().max(10).nullable().optional(),
      })).max(30),
    }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.recordMeeting(tenant.dbName, principal, input);
  }

  // ------------------------------ Feature flags -----------------------------
  @Get("admin/flags")
  async flags(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listFeatureFlags(tenant.dbName, principal);
  }  @Post("admin/flags/set")
  @HttpCode(200)
  async flagsSet(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ key: z.string().min(2).max(40), enabled: z.boolean() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.setFeatureFlag(tenant.dbName, principal, input);
  }

  // ------------------------------ The edit pass -----------------------------
  // Every register row correctable on its own screen — the audit line carries
  // before AND after, so the trail stays tamper-evident.
  @Post("admin/learners/upsert")
  @HttpCode(200)
  async upsertLearner(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        id: z.string().uuid().optional(),
        admissionNo: z.string().max(20).optional(),
        firstName: z.string().trim().min(2).max(60),
        middleName: z.string().trim().max(60).nullable().optional(),
        lastName: z.string().trim().min(2).max(60),
        gender: z.enum(["M", "F"]).nullable().optional(),
        dob: z.string().max(10).nullable().optional(),
        classId: z.number().int().nullable().optional(),
        boarding: z.boolean().optional(),
        upi: z.string().max(30).nullable().optional(),
        birthCertNo: z.string().max(30).nullable().optional(),
        status: z.enum(["active", "transferred", "graduated", "inactive"]).optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.upsertLearner(tenant.dbName, principal, input);
  }

  @Post("admin/events/update")
  @HttpCode(200)
  async updateEvent(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        id: z.string().uuid(),
        title: z.string().trim().min(2).max(120),
        kind: z.enum(["event", "exam-window", "open-day", "holiday", "meeting"]),
        startsOn: z.string().min(8).max(10),
        endsOn: z.string().max(10).nullable().optional(),
        notes: z.string().max(400).nullable().optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.updateEvent(tenant.dbName, principal, input);
  }

  @Post("admin/events/cancel")
  @HttpCode(200)
  async cancelEvent(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ id: z.string().uuid() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.cancelEvent(tenant.dbName, principal, input.id);
  }

  @Post("admin/transport/route-state")
  @HttpCode(200)
  async routeState(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ id: z.string(), active: z.boolean() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.setRouteActive(tenant.dbName, principal, input);
  }

  // ---------------------- 6 HR & LEAVE + 19 TIMETABLE ----------------------

  @Get("admin/hr")
  async hr(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.hrOverview(tenant.dbName, principal);
  }

  @Post("admin/hr/leave/raise")
  @HttpCode(200)
  async leaveRaise(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        staffId: z.string().uuid().optional(),
        kind: z.enum(["annual", "sick", "maternity", "paternity", "compassionate", "other"]),
        startsOn: z.string().min(8),
        endsOn: z.string().min(8),
        reason: z.string().default(""),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.raiseLeave(tenant.dbName, principal, input);
  }

  @Post("admin/hr/leave/decide")
  @HttpCode(200)
  async leaveDecide(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({ id: z.string().uuid(), approve: z.boolean(), reason: z.string().min(4) })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.decideLeave(tenant.dbName, principal, input);
  }

  @Get("admin/timetable")
  async timetable(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.timetable(tenant.dbName, principal);
  }

  @Post("admin/timetable/slot")
  @HttpCode(200)
  async slotUpsert(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        id: z.string().uuid().optional(),
        classId: z.coerce.number().int(),
        dayOfWeek: z.coerce.number().int().min(1).max(7),
        period: z.coerce.number().int().min(1).max(9),
        startsAt: z.string().nullable().optional(),
        endsAt: z.string().nullable().optional(),
        areaCode: z.string().nullable().optional(),
        areaName: z.string().nullable().optional(),
        teacherId: z.string().uuid().nullable().optional(),
        room: z.string().nullable().optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.upsertSlot(tenant.dbName, principal, input);
  }

  @Post("admin/timetable/clear")
  @HttpCode(200)
  async slotClear(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ id: z.string().uuid() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.clearSlot(tenant.dbName, principal, input);
  }

  // ------------------- 15 PETTY CASH + 33 PURCHASES -----------------------

  @Get("admin/petty")
  async petty(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.pettyOverview(tenant.dbName, principal);
  }

  @Post("admin/petty/record")
  @HttpCode(200)
  async pettyRecord(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        direction: z.enum(["topup", "spend"]),
        amountCents: z.coerce.number().int().positive(),
        costCenter: z.string().default("general"),
        description: z.string().default(""),
        spentOn: z.string().optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.recordPetty(tenant.dbName, principal, input);
  }

  @Post("admin/petty/decide")
  @HttpCode(200)
  async pettyDecide(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({ id: z.string().uuid(), approve: z.boolean(), reason: z.string().default("") })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.decidePetty(tenant.dbName, principal, input);
  }

  @Post("admin/petty/budget")
  @HttpCode(200)
  async pettyBudget(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({ costCenter: z.string().min(1), budgetCents: z.coerce.number().int().min(0), note: z.string().optional() })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.upsertBudget(tenant.dbName, principal, input);
  }

  @Get("admin/purchases")
  async purchases(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.purchasesOverview(tenant.dbName, principal);
  }

  @Post("admin/purchases/supplier")
  @HttpCode(200)
  async supplierUpsert(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(2),
        phone: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        category: z.string().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.upsertSupplier(tenant.dbName, principal, input);
  }

  @Post("admin/purchases/supplier-state")
  @HttpCode(200)
  async supplierState(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ id: z.string().uuid(), active: z.boolean() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.toggleSupplier(tenant.dbName, principal, input);
  }

  @Post("admin/purchases/raise")
  @HttpCode(200)
  async purchaseRaise(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        title: z.string().min(3),
        supplierId: z.string().uuid().nullable().optional(),
        costCenter: z.string().optional(),
        estCents: z.coerce.number().int().min(0),
        submit: z.boolean().optional(),
        note: z.string().optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.raisePurchase(tenant.dbName, principal, input);
  }

  @Post("admin/purchases/move")
  @HttpCode(200)
  async purchaseMove(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        id: z.string().uuid(),
        action: z.enum(["submit", "approve", "cancel", "order", "receive", "pay"]),
        reason: z.string().optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.movePurchase(tenant.dbName, principal, input);
  }

  // --------------------- BREADTH GAPS (flank batches) ---------------------

  @Post("admin/fees/structure/consent")
  @HttpCode(200)
  async feeConsent(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ id: z.coerce.number().int(), isOptional: z.boolean() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.setFeeItemConsent(tenant.dbName, principal, input);
  }

  @Post("admin/fees/levy/answer")
  @HttpCode(200)
  async levyAnswer(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        structureId: z.coerce.number().int(),
        learnerId: z.string().uuid(),
        choice: z.enum(["granted", "declined"]),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.answerOptionalLevy(tenant.dbName, principal, input);
  }

  @Get("admin/fees/extras")
  async feeExtras(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.feeExtras(tenant.dbName, principal);
  }

  @Get("admin/payroll/dashboard")
  async payrollDash(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.payrollDashboard(tenant.dbName, principal);
  }

  @Post("admin/payroll/export")
  @HttpCode(200)
  async payrollExport(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ period: z.string().min(4).max(7) }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.payrollExport(tenant.dbName, principal, input.period);
  }

  @Get("admin/admissions/analytics")
  async admAnalytics(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.admissionsAnalytics(tenant.dbName, principal);
  }

  @Get("admin/exam-entries")
  async examEntries(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listExamEntries(tenant.dbName, principal);
  }

  @Post("admin/exam-entries/upsert")
  @HttpCode(200)
  async examEntryUpsert(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        id: z.string().uuid().optional(),
        learnerId: z.string().uuid().or(z.literal("")),
        curriculum: z.string().min(1),
        examName: z.string().min(1),
        examYear: z.coerce.number().int().min(2020).max(2100),
        candidateNo: z.string().optional(),
        status: z.enum(["planned", "registered", "entered", "withdrawn"]),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.upsertExamEntry(tenant.dbName, principal, input);
  }

  @Post("admin/learners/move-class")
  @HttpCode(200)
  async moveClass(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        learnerId: z.string().uuid(),
        toClassId: z.coerce.number().int(),
        kind: z.enum(["promotion", "transfer", "correction"]),
        reason: z.string().optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.moveLearnerClass(tenant.dbName, principal, input);
  }

  @Get("admin/learners/moves")
  async learnerMoves(@Req() req: Request, @Query() q: { learnerId?: string }) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!q.learnerId) return { error: "learnerId required" };
    return web.learnerMoveHistory(tenant.dbName, principal, q.learnerId);
  }

  @Post("admin/guardians/link")
  @HttpCode(200)
  async guardianLink(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        learnerId: z.string().uuid(),
        guardianId: z.string().uuid(),
        relationship: z.string().min(2).max(40),
        isPrimary: z.boolean().optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.linkGuardianToLearner(tenant.dbName, principal, input);
  }

  @Post("admin/guardians/unlink")
  @HttpCode(200)
  async guardianUnlink(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({ learnerId: z.string().uuid(), guardianId: z.string().uuid() })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.unlinkGuardianFromLearner(tenant.dbName, principal, input);
  }

  @Post("admin/guardians/relationship")
  @HttpCode(200)
  async guardianRel(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        learnerId: z.string().uuid(),
        guardianId: z.string().uuid(),
        relationship: z.string().min(2).max(40),
        isPrimary: z.boolean(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.setGuardianLink(tenant.dbName, principal, input);
  }

  @Get("admin/campaigns")
  async campaigns(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listCampaigns(tenant.dbName, principal);
  }

  @Post("admin/campaigns/create")
  @HttpCode(200)
  async campaignCreate(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        name: z.string().min(2).max(80),
        channel: z.enum(["whatsapp", "sms", "both"]),
        body: z.string().min(2).max(1000),
        audience: z.enum(["all", "boarders", "dayscholars", "class"]),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.createCampaignAction(tenant.dbName, principal, input);
  }

  @Post("admin/campaigns/send")
  @HttpCode(200)
  async campaignSend(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ id: z.string().uuid() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.sendCampaign(tenant.dbName, principal, input);
  }

  @Get("admin/mess")
  async mess(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.messWeek(tenant.dbName, principal);
  }

  @Post("admin/mess/menu")
  @HttpCode(200)
  async messMenu(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        weekStart: z.string().min(8).max(10),
        day: z.coerce.number().int().min(1).max(7),
        meal: z.enum(["breakfast", "tea", "lunch", "supper"]),
        items: z.string().min(1).max(300),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.setMeal(tenant.dbName, principal, input);
  }

  @Post("admin/mess/headcount")
  @HttpCode(200)
  async messHeadcount(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        mealDay: z.string().min(8).max(10),
        meal: z.enum(["breakfast", "tea", "lunch", "supper"]),
        headCount: z.coerce.number().int().min(0).max(5000),
        note: z.string().max(300).optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.takeHeadCount(tenant.dbName, principal, input);
  }

  @Get("admin/visitors")
  async visitors(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listVisitors(tenant.dbName, principal);
  }

  @Post("admin/visitors/in")
  @HttpCode(200)
  async visitorIn(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        visitor: z.string().min(2).max(80),
        idNo: z.string().max(20).optional(),
        phone: z.string().max(20).optional(),
        visiting: z.string().min(1).max(120),
        purpose: z.string().max(200).optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.logVisitor(tenant.dbName, principal, input);
  }

  @Post("admin/visitors/out")
  @HttpCode(200)
  async visitorOut(@Req() req: Request, @Body() body: unknown) {
    const input = z.object({ id: z.string().uuid() }).parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.checkoutVisitor(tenant.dbName, principal, input);
  }

  @Get("admin/sections/mine-full")
  async mySectionsFull(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.mySectionFull(tenant.dbName, principal);
  }


  // -- final flanks: houses / co-curricular / rosters / vault / pocket / alumni / consent / switching ------------------------------------------------

  @Get("admin/houses")
  async houses(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listHouses(tenant.dbName, principal);
  }

  @Post("admin/houses/award")
  @HttpCode(200)
  async awardHouse(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ houseId: z.string().min(1), points: z.number().int(), reason: z.string().min(1), learnerId: z.string().uuid().optional().nullable() }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.awardHousePoints(tenant.dbName, principal, input);
  }

  @Get("admin/cocurricular")
  async cocurricular(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listCoCurricular(tenant.dbName, principal);
  }

  @Post("admin/cocurricular/fee")
  @HttpCode(200)
  async cocurricularFee(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ sectionId: z.string().min(1), termId: z.number().int(), name: z.string().min(1), amountCents: z.number().int().min(0) }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.chargeActivityFee(tenant.dbName, principal, input);
  }

  @Post("admin/cocurricular/event-link")
  @HttpCode(200)
  async cocurricularEvent(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ eventId: z.string().min(1), sectionId: z.string().min(1) }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.linkSectionEvent(tenant.dbName, principal, input);
  }

  @Get("admin/houses/competitions")
  async houseCompetitions(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listHouseCompetitions(tenant.dbName, principal);
  }

  @Post("admin/houses/competitions/create")
  @HttpCode(200)
  async houseCompetitionCreate(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ houseId: z.string().min(1), title: z.string().min(3), startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), notes: z.string().optional().nullable() }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.createHouseCompetition(tenant.dbName, principal, input);
  }

  @Get("admin/laundry")
  async laundry(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.getLaundryCustody(tenant.dbName, principal);
  }

  @Post("admin/laundry/move")
  @HttpCode(200)
  async laundryMove(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ learnerId: z.string().min(1), direction: z.enum(["out", "in"]), items: z.string().optional().nullable(), bagRef: z.string().optional().nullable() }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.recordLaundryMove(tenant.dbName, principal, input);
  }

  @Get("admin/offline/state")
  async offlineState(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.outboxState(tenant.dbName, principal);
  }

  @Post("admin/offline/flush")
  @HttpCode(200)
  async offlineFlush(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ clientId: z.string().uuid(), op: z.string().min(3), payload: z.record(z.unknown()) }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { state: "rejected", note: "staff session required" };
    return web.flushOutboxOp(tenant.dbName, principal, input as { clientId: string; op: string; payload: Record<string, unknown> });
  }

  @Get("admin/ai/anomaly")
  async aiAnomaly(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.detectAnomaly(tenant.dbName, principal);
  }

  @Post("admin/ai/anomaly/record")
  @HttpCode(200)
  async aiAnomalyRecord(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ learnerId: z.string().min(1), subject: z.string().min(1), body: z.string().min(1), params: z.record(z.unknown()).default({}) }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.recordAnomalyDraft(tenant.dbName, principal, input as { learnerId: string; subject: string; body: string; params: Record<string, unknown> });
  }

  @Post("admin/ai/parent-message")
  @HttpCode(200)
  async aiParentMessage(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ subject: z.string().min(1), intent: z.string().min(3), tone: z.string().optional().nullable() }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.draftParentMessage(tenant.dbName, principal, input);
  }

  @Get("admin/rosters")
  async rosters(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listDutyRosterWithTasks(tenant.dbName, principal);
  }

  @Post("admin/rosters/emit-tasks")
  @HttpCode(200)
  async rosterEmit(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.emitRosterTasks(tenant.dbName, principal);
  }

  @Post("admin/rosters/upsert")
  @HttpCode(200)
  async rosterUpsert(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ staffId: z.string().min(1), weekday: z.number().int().min(0).max(6), slot: z.string().min(1), duty: z.string().min(1), place: z.string().optional().nullable() }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.upsertDutyRoster(tenant.dbName, principal, input);
  }

  @Post("admin/rosters/remove")
  @HttpCode(200)
  async rosterRemove(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ id: z.string().min(1) }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.removeDutyRoster(tenant.dbName, principal, input);
  }

  @Get("admin/documents")
  async documents(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listDocuments(tenant.dbName, principal);
  }

  @Get("admin/documents/templates")
  async docTemplates(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listDocTemplates(tenant.dbName, principal);
  }

  @Post("admin/documents/issue")
  @HttpCode(200)
  async documentIssue(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ templateCode: z.string().min(1), entityType: z.string().min(1), entityId: z.string().uuid().optional().nullable(), title: z.string().optional().nullable(), placeholders: z.record(z.string()) }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.issueDocument(tenant.dbName, principal, input);
  }

  @Post("admin/documents/templates/upsert")
  @HttpCode(200)
  async docTemplateUpsert(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ code: z.string().min(1), name: z.string().min(1), bodyMd: z.string().min(1), docKind: z.string().min(1).optional(), styleJson: z.record(z.unknown()).optional() }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.upsertDocTemplate(tenant.dbName, principal, input as { code: string; name: string; bodyMd: string; docKind?: string; styleJson?: Record<string, unknown> });
  }

  /**
   * Themed document render — the PDF view of one issued document. Staff only;
   * carries the frozen theme options + school identity so the download always
   * matches what the office issued.
   */
  @Get("admin/documents/:id/render")
  async docRender(@Req() req: Request, @Param("id") id: string) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.renderDocument(tenant.dbName, principal, id);
  }

  @Get("admin/pocket")
  async pocket(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.getPocketWallets(tenant.dbName, principal);
  }

  @Post("admin/pocket/txn")
  @HttpCode(200)
  async pocketTxn(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ learnerId: z.string().min(1), direction: z.enum(["topup", "spend"]), amountCents: z.number().int().min(1), note: z.string().optional().nullable() }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.recordPocketTxn(tenant.dbName, principal, input);
  }

  @Get("admin/alumni")
  async alumni(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listAlumni(tenant.dbName, principal);
  }

  @Post("admin/alumni/mark")
  @HttpCode(200)
  async alumniMark(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ learnerId: z.string().min(1), graduatedOn: z.string().min(4), finalClass: z.string().optional().nullable(), mentorAvailable: z.boolean().optional(), notes: z.string().optional().nullable() }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.markAlumni(tenant.dbName, principal, input);
  }

  @Get("admin/media-consent")
  async mediaConsent(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.getMediaConsent(tenant.dbName, principal);
  }

  @Post("admin/media-consent/set")
  @HttpCode(200)
  async mediaConsentSet(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ guardianId: z.string().min(1), learnerId: z.string().uuid().optional().nullable(), choice: z.enum(["granted", "declined", "revoked"]) }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.setMediaConsent(tenant.dbName, principal, input);
  }

  @Get("admin/switching")
  async switching(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.listSwitchingImports(tenant.dbName, principal);
  }

  @Post("admin/switching/create")
  @HttpCode(200)
  async switchingCreate(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ provider: z.string().min(1), filename: z.string().optional().nullable(), rows: z.array(z.record(z.unknown())) }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.createSwitchingImport(tenant.dbName, principal, input);
  }

  @Post("admin/switching/commit")
  @HttpCode(200)
  async switchingCommit(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ id: z.string().min(1) }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.commitSwitchingImport(tenant.dbName, principal, input);
  }

  // -- payroll depth -----------------------------------------------------------

  @Post("admin/payroll/payslip/confirm")
  @HttpCode(200)
  async payslipConfirm(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ payslipId: z.string().min(1), note: z.string().optional().nullable() }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.confirmPayslip(tenant.dbName, principal, input);
  }

  @Post("admin/payroll/run/reconcile")
  @HttpCode(200)
  async payrollReconcile(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ runId: z.string().min(1), note: z.string().optional().nullable() }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.reconcilePayrollRun(tenant.dbName, principal, input);
  }

  @Get("admin/payroll/vs-collections")
  async payrollVsCollections(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.getPayrollVsCollections(tenant.dbName, principal);
  }

  @Post("admin/leave/prorate")
  @HttpCode(200)
  async leaveProrate(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ period: z.string().min(4) }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.applyLeaveProration(tenant.dbName, principal, input);
  }

  // -- OTP login (dev codes surface in response; production emails them) -------

  @Post("auth/request-code")
  @HttpCode(200)
  async requestCode(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ identifier: z.string().min(3), purpose: z.enum(["staff", "guardian"]) }), body);
    const identifier = input.purpose === "guardian" ? normalizeKenyanPhone(input.identifier) : input.identifier.trim().toLowerCase();
    if (!identifier) return { ok: false as const, error: "Enter a valid Kenyan phone number." };
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    const staffPrincipal = principal && principal.kind === "staff" ? principal : null;
    return web.requestLoginCode(tenant.dbName, staffPrincipal, { ...input, identifier });
  }

  @Post("auth/verify-code")
  @HttpCode(200)
  async verifyCode(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ identifier: z.string().min(3), purpose: z.enum(["staff", "guardian"]), code: z.string().min(4) }), body);
    const identifier = input.purpose === "guardian" ? normalizeKenyanPhone(input.identifier) : input.identifier.trim().toLowerCase();
    if (!identifier) return { ok: false as const, error: "Enter a valid Kenyan phone number." };
    const tenant = await tenantFromReq(req);
    const result = await web.verifyLoginCode(tenant.dbName, tenant.slug, { ...input, identifier });
    if (!result) return { ok: false as const, error: "That code did not match. Request a new code." };
    req.res!.cookie(SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.NODE_ENV === "production",
      maxAge: web.SESSION_TTL_SECONDS * 1000,
      path: "/",
    });
    return { ok: true as const };
  }

  // -- self-service payslips + onboarding + remarks ----------------------------

  @Get("me/payslips")
  async myPayslips(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.getMyPayslips(tenant.dbName, principal);
  }

  @Post("me/payslips/confirm")
  @HttpCode(200)
  async myPayslipConfirm(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ payslipId: z.string().min(1) }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.confirmMyPayslip(tenant.dbName, principal, input);
  }

  @Post("admin/remarks/draft")
  @HttpCode(200)
  async remarkDraft(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ learnerName: z.string().min(1), className: z.string().min(1), termName: z.string().min(1), meanScore: z.number(), attendancePct: z.number(), strongest: z.string(), weakest: z.string() }), body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.draftReportRemark(tenant.dbName, principal, input);
  }

  @Get("admin/onboarding")
  async onboarding(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.getOnboardingState(tenant.dbName, principal);
  }

  // ===========================================================================
  // Phase 1 — join platform (docs/DEV-PHASES.md): public registration.
  // Codes choose the tenant; rate limits per IP+code; secrets never hit the
  // control plane. In-memory limiter is per-process: swap for Redis at scale
  // (PLATFORM-PLAN §10.2) — the interface stays identical.
  // ===========================================================================

  private registerAttempts = new Map<string, { count: number; resetAt: number }>();

  private registerBlocked(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = this.registerAttempts.get(key);
    if (!entry || entry.resetAt < now) {
      this.registerAttempts.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }
    entry.count += 1;
    return entry.count > limit;
  }

  private clientIp(req: Request): string {
    return (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress || "?";
  }

  /** Resolve a join code to a school name (code-entry UX). Generic on miss. */
  @Post("auth/school-by-code")
  @HttpCode(200)
  async schoolByCode(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(z.object({ code: z.string().min(6).max(24) }), body);
    if (this.registerBlocked(`code|${this.clientIp(req)}`, 30, 15 * 60_000)) {
      return { ok: false as const, error: "Too many attempts — wait 15 minutes." };
    }
    const tenant = await web.schoolByJoinCode(input.code);
    // Same answer for "bad format" and "unknown code": no enumeration.
    if (!tenant) return { ok: false as const, error: "Unknown school code" };
    return { ok: true as const, name: tenant.name, slug: tenant.slug };
  }

  /** Admin claims a freshly-provisioned school and gets its join code. */
  @Post("auth/register-school")
  @HttpCode(200)
  async registerSchool(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(
      z.object({
        fullName: z.string().min(3).max(120),
        schoolName: z.string().min(3).max(120),
        email: z.string().email().max(200),
        phone: z.string().max(20).nullish(),
        password: z.string().min(8).max(128),
        alsoPrincipal: z.boolean().optional(),
        provisionToken: z.string().min(10).max(200),
      }),
      body,
    );
    if (this.registerBlocked(`regschool|${this.clientIp(req)}`, 10, 60 * 60_000)) {
      return { ok: false as const, error: "Too many attempts — wait an hour." };
    }
    // The provisioning token gates who may claim an empty school DB — it is
    // issued by the provisioner flow, not guessable by the public.
    if (!config.PROVISION_TOKEN || input.provisionToken !== config.PROVISION_TOKEN) {
      return { ok: false as const, error: "Invalid setup token. Use the link from your setup screen." };
    }
    const policyError = passwordPolicyError(input.password);
    if (policyError) return { ok: false as const, error: policyError };
    const tenant = await tenantFromReq(req);
    const phone = input.phone ? normalizeKenyanPhone(input.phone) ?? input.phone : null;
    const result = await web.registerSchoolAdmin(tenant.dbName, tenant.slug, {
      fullName: input.fullName,
      schoolName: input.schoolName,
      email: input.email,
      phone,
      password: input.password,
      alsoPrincipal: input.alsoPrincipal ?? false,
    });
    if (!result.ok) return result;
    const res = req.res!;
    res.cookie(SESSION_COOKIE, result.token, {
      httpOnly: true, sameSite: "lax", secure: config.NODE_ENV === "production",
      maxAge: web.SESSION_TTL_SECONDS * 1000, path: "/",
    });
    return { ok: true as const, joinCode: result.joinCode, role: "admin" };
  }

  /** Admin rotates the join code (old code dies). */
  @Post("auth/join-code/regenerate")
  @HttpCode(200)
  async regenerateJoinCode(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (this.registerBlocked(`regen|${principal.userId}`, 10, 60 * 60_000)) {
      return { ok: false as const, error: "Too many regenerations — wait an hour." };
    }
    return web.regenerateJoinCode(tenant.dbName, principal);
  }

  /** Staff self-serve: role + join code → staff row + session. */
  @Post("auth/register-staff")
  @HttpCode(200)
  async registerStaff(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(
      z.object({
        fullName: z.string().min(3).max(120),
        email: z.string().email().max(200),
        phone: z.string().max(20).nullish(),
        role: z.string().min(2).max(20),
        code: z.string().min(6).max(24),
        password: z.string().min(8).max(128),
      }),
      body,
    );
    const ip = this.clientIp(req);
    if (this.registerBlocked(`regstaff|${ip}`, 10, 60 * 60_000) ||
        this.registerBlocked(`regstaffcode|${input.code.toUpperCase()}`, 20, 60 * 60_000)) {
      return { ok: false as const, error: "Too many attempts — wait an hour." };
    }
    const policyError = passwordPolicyError(input.password);
    if (policyError) return { ok: false as const, error: policyError };
    const result = await web.registerStaffByCode(input.code, {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone ? normalizeKenyanPhone(input.phone) ?? input.phone : null,
      role: input.role,
      password: input.password,
    });
    if (!result.ok) return result;
    const res = req.res!;
    res.cookie(SESSION_COOKIE, result.token, {
      httpOnly: true, sameSite: "lax", secure: config.NODE_ENV === "production",
      maxAge: web.SESSION_TTL_SECONDS * 1000, path: "/",
    });
    return { ok: true as const, role: result.role };
  }

  // -- hardening: passwords, Daraja, report data ------------------------------

  @Post("me/password")
  @HttpCode(200)
  async mePassword(@Req() req: Request, @Body() body: unknown) {
    const input = parseInput(
      z.object({
        email: z.string().email().optional(),
        password: z.string().min(8).max(128),
      }),
      body,
    );
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.setStaffPassword(tenant.dbName, principal, input);
  }

  /**
   * Daraja C2B callback. PUBLIC by design (Safaricom calls it without a
   * session) - guarded by DARAJA_VALIDATION_TOKEN when configured, deduped
   * by mpesa_txn's UNIQUE checkout id, throttled per caller IP, and it
   * always answers 200 {ResultCode:0} so Daraja never retry-storms.
   */
  @Post("auth/daraja/c2b")
  @HttpCode(200)
  async darajaC2B(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const tenant = await tenantFromReq(req);
    const expected = config.DARAJA_VALIDATION_TOKEN;
    if (expected && req.query.validationtoken !== expected && body?.validationtoken !== expected) {
      return { ResultCode: "1", ResultDesc: "Rejected" };
    }
    const b = (body ?? {}) as Record<string, string>;
    const ip =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "?";
    const key = `daraja:${ip}`;
    if (await web.loginThrottleBlocked(tenant.dbName, key)) {
      return { ResultCode: "0", ResultDesc: "Accepted (throttled)" };
    }
    if (!b?.transID || !b?.transAmount) {
      await web.loginThrottleFail(tenant.dbName, key);
      return { ResultCode: "0", ResultDesc: "Accepted" };
    }
    try {
      await web.darajaC2BCallback(tenant.dbName, {
        transID: String(b.transID),
        transTime: String(b.transTime ?? "").padStart(8, "0"),
        transAmount: String(b.transAmount),
        businessShortCode: String(b.businessShortCode ?? ""),
        billRefNumber: String(b.billRefNumber ?? ""),
        msisdn: String(b.msisdn ?? ""),
        firstName: String(b.firstName ?? ""),
        middleName: b.middleName ? String(b.middleName) : undefined,
        lastName: b.lastName ? String(b.lastName) : undefined,
      });
      return { ResultCode: "0", ResultDesc: "Accepted" };
    } catch (err) {
      // Daraja must always get its 200 - but the failure is NOT silent:
      // it lands in the API log for the on-call.
      console.error("[daraja] c2b callback failed:", (err as Error).message);
      return { ResultCode: "0", ResultDesc: "Accepted" };
    }
  }

  /** Report Builder datasets - the Phase 3 builder's data floor. */
  @Get("admin/reports/:dataset")
  async reportDataset(@Req() req: Request, @Param("dataset") dataset: string) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.reportData(tenant.dbName, principal, dataset);
  }

  // ===========================================================================
  // Daily loop & channels (docs/ECOSYSTEM-STRATEGY.md Loop 2) — admin enters
  // the school's WhatsApp/SMTP creds in Settings; worker + digest do the rest.
  // ===========================================================================

  /** Status for the Settings UI — secrets never leave the server. */
  @Get("admin/channels")
  async channelStatus(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal"].includes(principal.role ?? "")) return { error: "admin/principal only" };
    return channels.toStatus(await channels.getChannelConfig(tenant.dbName));
  }

  @Post("admin/channels")
  @HttpCode(200)
  async updateChannels(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        waPhoneNumberId: z.string().max(64).nullable().optional(),
        waToken: z.string().max(512).nullable().optional(),
        smtpHost: z.string().max(200).nullable().optional(),
        smtpPort: z.coerce.number().int().min(1).max(65535).nullable().optional(),
        smtpUser: z.string().max(200).nullable().optional(),
        smtpFrom: z.string().max(200).nullable().optional(),
        smtpPass: z.string().max(512).nullable().optional(),
        digestEnabled: z.boolean().optional(),
        digestTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal"].includes(principal.role ?? "")) return { error: "admin/principal only" };
    try {
      const status = await channels.updateChannelConfig(tenant.dbName, principal.userId, input);
      return { ok: true, status };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  /** One-tap test sends so the admin *knows* it works before day one. */
  @Post("admin/channels/test")
  @HttpCode(200)
  async testChannel(@Req() req: Request, @Body() body: unknown) {
    const input = z
      .object({
        channel: z.enum(["whatsapp", "email"]),
        to: z.string().min(5).max(120),
      })
      .parse(body);
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal"].includes(principal.role ?? "")) return { error: "admin/principal only" };
    try {
      const to =
        input.channel === "whatsapp"
          ? normalizeKenyanPhone(input.to) ?? input.to
          : input.to;
      const result =
        input.channel === "whatsapp"
          ? await talkWorker.sendTestWhatsApp(tenant.dbName, to)
          : await talkWorker.sendTestEmail(tenant.dbName, to);
      return result;
    } catch (err) {
      return { ok: false, note: (err as Error).message };
    }
  }

  // ===========================================================================
  // Portable records (docs/RECORD-FORMAT.md) — signed, parent-owned, offline
  // verifiable. Staff can issue for any learner they may read; guardians only
  // for their own (RLS holds inside records.buildRecord).
  // ===========================================================================

  @Get("records/:learnerId/:kind")
  async issueRecord(
    @Req() req: Request,
    @Param("learnerId") learnerId: string,
    @Param("kind") kind: string,
    @Query("termId") termIdRaw: string | undefined,
  ) {
    const parsed = z
      .enum(["fee_statement", "report_card", "attendance_summary"])
      .safeParse(kind);
    if (!parsed.success) return { error: "unknown record kind" };
    const termId = termIdRaw ? Number(termIdRaw) : null;
    if (termIdRaw && (!Number.isInteger(termId) || (termId ?? 0) <= 0)) {
      return { error: "termId must be a positive integer" };
    }
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal) return { error: "session required" };
    try {
      const result = await records.buildRecord(tenant.dbName, principal, {
        learnerId,
        kind: parsed.data,
        termId,
      });
      return result.ok ? result.record : { error: result.error };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  // ===========================================================================
  // Money-lifecycle integrity (the "consequences" layer). Admin/principal;
  // the module harness fails on any violation.
  // ===========================================================================

  @Get("admin/integrity")
  async integrity(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (!["admin", "principal", "bursar"].includes(principal.role ?? "")) {
      return { error: "admin/principal/bursar only" };
    }
    try {
      return await integrity.integrityReport(tenant.dbName, principal);
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  // ===========================================================================
  // Phase 3 — onboarding: start state, landing, guardian link codes, admission
  // with welcome WhatsApp, Principal hat (docs/DEV-PHASES.md Phase 3).
  // ===========================================================================

  /** Post-login state: landed (→ landing route) or interstitial payload. */
  @Get("me/start")
  async meStart(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal) return { error: "session required" };
    return web.getStartState(tenant.dbName, principal);
  }

  /** Confirm your role and land (flips staff.joined, audited). */
  @Post("me/land")
  @HttpCode(200)
  async meLand(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.confirmRoleAndLand(tenant.dbName, principal);
  }

  /** Admin flips a not-yet-landed joiner's role (the "wrong? undo" path). */
  @Post("staff/joiner-role")
  @HttpCode(200)
  async joinerRole(@Req() req: Request, @Body() body: unknown) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    const input = parseInput(z.object({ staffId: z.string().uuid().optional(), role: z.string().min(3).max(20) }), body);
    return web.changeJoinerRole(tenant.dbName, principal, input);
  }

  /** Guardian redeems the one-time family link code from the admission slip. */
  @Post("guardian/link-code")
  @HttpCode(200)
  async guardianLinkCode(@Req() req: Request, @Body() body: unknown) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "guardian") return { error: "guardian session required" };
    const input = parseInput(z.object({ code: z.string().min(4).max(24) }), body);
    return web.redeemLinkCode(tenant.dbName, principal, input.code);
  }

  /** Leaders: admit learner + guardian + link code + welcome WhatsApp, one call. */
  @Post("people/admit-with-link")
  @HttpCode(200)
  async admitWithLink(@Req() req: Request, @Body() body: unknown) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    const input = parseInput(
      z.object({
        firstName: z.string().min(2).max(60),
        middleName: z.string().max(60).nullish(),
        lastName: z.string().min(2).max(60),
        dob: z.string().max(10).nullish(),
        gender: z.enum(["M", "F"]).nullish(),
        classId: z.number().int().nullish(),
        boarding: z.boolean().optional(),
        guardianName: z.string().min(3).max(120),
        guardianPhone: z.string().min(9).max(20),
        guardianEmail: z.string().email().nullish(),
      }),
      body,
    );
    return web.admitLearnerWithLink(tenant.dbName, principal, input);
  }

  /** Profile/Pulse: does the signed-in account hold the Principal hat? */
  @Get("me/principal-hat")
  async mePrincipalHat(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return { hasHat: await web.getMyPrincipalHat(tenant.dbName, principal) };
  }

  /** Admin toggles their own Principal hat (§5 — one person, both hats). */
  @Post("me/principal-hat")
  @HttpCode(200)
  async togglePrincipalHat(@Req() req: Request, @Body() body: unknown) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    const input = parseInput(z.object({ on: z.boolean() }), body);
    return web.setPrincipalHat(tenant.dbName, principal, input);
  }

  // ===========================================================================
  // Phase 5 — role dashboards (docs/DEV-PHASES.md; PLATFORM-PLAN §6.2–6.6).
  // One "Today" per wave-1 role; every read runs inside the session's RLS
  // context and every list is LIMIT-capped (rolePulse.ts header).
  // ===========================================================================

  /** Settings → Team (§7.7): join code + who has/hasn't started (staff.joined). */
  @Get("admin/team")
  async adminTeam(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.teamOverview(tenant.dbName, principal);
  }

  @Get("pulse/teacher")
  async teacherPulse(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "teacher") return { error: "teacher only" };
    return rolePulse.teacherPulse(tenant.dbName, principal);
  }

  @Get("pulse/bursar")
  async bursarPulse(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "bursar") return { error: "bursar only" };
    const rollup = await freshRollup(tenant.dbName, "bursar");
    if (rollup) return rollup as never; // fresh rollup (D4) — identical payload shape
    return rolePulse.bursarPulse(tenant.dbName, principal);
  }

  @Get("pulse/principal")
  async principalPulse(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "principal") return { error: "principal only" };
    const rollup = await freshRollup(tenant.dbName, "principal");
    if (rollup) return rollup as never; // fresh rollup (D4) — identical payload shape
    return rolePulse.principalPulse(tenant.dbName, principal);
  }

  @Get("pulse/counter")
  async counterPulse(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "counter") return { error: "counter only" };
    const rollup = await freshRollup(tenant.dbName, "counter");
    if (rollup) return rollup as never; // fresh rollup (D4) — identical payload shape
    return rolePulse.counterPulse(tenant.dbName, principal);
  }

  /** Pulse inline action queue (§7 #2, System completion C11): 3 oldest approvals + 3 nearest tasks. */
  @Get("admin/pulse/actions")
  async pulseActions(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    return web.pulseActions(tenant.dbName, principal);
  }

  /** School health (§7.7 #11): activation per staff member — admin-only. */
  @Get("admin/health")
  async schoolHealth(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "admin") return { error: "admin only" };
    return web.schoolHealth(tenant.dbName, principal);
  }

  /** Timetable auto-layout (§7 #4): greedy gap-fill, teacher-conflict aware. */
  @Post("admin/timetable/autolayout")
  @HttpCode(200)
  async timetableAutolayout(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { ok: false, error: "staff session required" };
    return web.autolayoutTimetable(tenant.dbName, principal);
  }

  @Get("pulse/driver")
  async driverPulse(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "driver") return { error: "driver only" };
    const rollup = await freshRollup(tenant.dbName, "driver");
    if (rollup) return rollup as never; // fresh rollup (D4) — identical payload shape
    return rolePulse.driverPulse(tenant.dbName, principal);
  }

  // ===========================================================================
  // Phase 6 — wave 2 (§6.7–6.11): dorm_parent, janitor, librarian, patron, hod.
  // Same discipline as wave 1: staff-only, exact-role gate, RLS-scoped reads.
  // ===========================================================================

  @Get("pulse/dorm_parent")
  async dormParentPulse(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "dorm_parent") return { error: "dorm_parent only" };
    const rollup = await freshRollup(tenant.dbName, "dorm_parent");
    if (rollup) return rollup as never; // fresh rollup (D4) — identical payload shape
    return rolePulse.dormParentPulse(tenant.dbName, principal);
  }

  @Get("pulse/janitor")
  async janitorPulse(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "janitor") return { error: "janitor only" };
    const rollup = await freshRollup(tenant.dbName, "janitor");
    if (rollup) return rollup as never; // fresh rollup (D4) — identical payload shape
    return rolePulse.janitorPulse(tenant.dbName, principal);
  }

  @Get("pulse/librarian")
  async librarianPulse(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "librarian") return { error: "librarian only" };
    const rollup = await freshRollup(tenant.dbName, "librarian");
    if (rollup) return rollup as never; // fresh rollup (D4) — identical payload shape
    return rolePulse.librarianPulse(tenant.dbName, principal);
  }

  @Get("pulse/patron")
  async patronPulse(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "patron") return { error: "patron only" };
    const rollup = await freshRollup(tenant.dbName, "patron");
    if (rollup) return rollup as never; // fresh rollup (D4) — identical payload shape
    return rolePulse.patronPulse(tenant.dbName, principal);
  }

  @Get("pulse/hod")
  async hodPulse(@Req() req: Request) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") return { error: "staff session required" };
    if (principal.role !== "hod") return { error: "hod only" };
    return rolePulse.hodPulse(tenant.dbName, principal);
  }

  // ===========================================================================
  // System completion C13 — server-side PDFs (§7 #5). Same session law as the
  // print screens; the bytes stream inline so the office can email/archive.
  // ===========================================================================

  @Get("print/pdf/report-card/:learnerId")
  async reportCardPdf(@Req() req: Request, @Res() res: Response) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") {
      res.status(401).json({ error: "staff session required" });
      return;
    }
    const learnerId = z.string().uuid().parse(req.params.learnerId);
    const termParam = req.query.term ? Number(req.query.term) : null;
    await pdf.reportCardPdf(tenant.dbName, principal, learnerId, Number.isFinite(termParam) ? termParam : null, res);
  }

  @Get("print/pdf/statement/:learnerId")
  async statementPdf(@Req() req: Request, @Res() res: Response) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") {
      res.status(401).json({ error: "staff session required" });
      return;
    }
    const learnerId = z.string().uuid().parse(req.params.learnerId);
    await pdf.statementPdf(tenant.dbName, principal, learnerId, res);
  }

  // ===========================================================================
  // Final mile (2026-09-27) — board pack PDF + one-click full data export.
  // ===========================================================================

  /** Board pack — one A4 term position for the governors. Leaders only. */
  @Get("print/pdf/board-pack")
  async boardPackPdf(@Req() req: Request, @Res() res: Response) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") {
      res.status(401).json({ error: "staff session required" });
      return;
    }
    if (principal.role !== "admin" && principal.role !== "principal") {
      res.status(403).json({ error: "leaders only" });
      return;
    }
    await pdf.boardPackPdf(tenant.dbName, principal, res);
  }

  /**
   * One-click full data export — "your data leaves with you" as a real
   * button. Admin-only, audited, streams the ENTIRE school database (every
   * public table, deterministic order) as one JSON document. Rows carry
   * DPA-grade data by design: the export is the data, gated at admin like
   * the rest of the DPA surfaces.
   */
  @Get("admin/export")
  async fullExport(@Req() req: Request, @Res() res: Response) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal || principal.kind !== "staff") {
      res.status(401).json({ error: "staff session required" });
      return;
    }
    if (principal.role !== "admin") {
      res.status(403).json({ error: "admin only" });
      return;
    }
    const db = getSchoolPool(tenant.dbName);
    const tables = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         AND table_name NOT LIKE '\\_%'
       ORDER BY table_name`,
    );
    res.setHeader("content-type", "application/json");
    res.setHeader("content-disposition", `attachment; filename="${tenant.slug ?? tenant.dbName}-full-export.json"`);
    res.write(`{
  "school": ${JSON.stringify(tenant.dbName)},
  "exported_at": ${JSON.stringify(new Date().toISOString())},
  "tables": {`);
    let first = true;
    for (const t of tables.rows) {
      const name = t.table_name;
      const cols = await db.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name = $1 ORDER BY ordinal_position`,
        [name],
      );
      const colList = cols.rows.map((c) => `"${c.column_name}"`).join(", ");
      const rows = await db.query(`SELECT ${colList} FROM "${name}" ORDER BY 1`);
      res.write(`${first ? "" : ","}
    ${JSON.stringify(name)}: ${JSON.stringify(rows.rows)}`);
      first = false;
    }
    await db.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       VALUES ($1, 'staff', 'school.data.exported', 'school', $2, $3)`,
      [principal.userId, tenant.dbName, JSON.stringify({ tables: tables.rows.length })],
    ).catch(() => undefined); // export must succeed even if the audit row races a partition boundary
    res.end(`
  }
}`);
  }

  /**
   * GET /web/search?q=…
   * School-wide live search: learners, staff, guardians, receipts.
   * Min 2 chars. Returns at most 20 hits. Requires any session.
   */
  @Get("search")
  async schoolSearch(@Req() req: Request, @Res() res: Response, @Query("q") q: string) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal) { res.status(401).json({ error: "session required" }); return; }
    const term = (q ?? "").trim();
    if (term.length < 2) { res.json({ hits: [] }); return; }
    const db = getSchoolPool(tenant.dbName);
    const like = `%${term.toLowerCase()}%`;

    const canSeeMoney = principal.kind === "staff" && ["admin", "principal", "bursar", "counter"].includes(principal.role ?? "");

    const [lRows, sRows, gRows, rRows] = await Promise.all([
      principal.kind === "guardian"
        ? db.query<{ id: string; name: string; admission_no: string; class: string | null }>(
            `SELECT l.id, l.name, l.admission_no, l.class
             FROM learner l
             JOIN guardian_learner gl ON gl.learner_id = l.id
             WHERE gl.guardian_id = $2 AND l.status = 'active' AND (lower(l.name) LIKE $1 OR lower(l.admission_no) LIKE $1) LIMIT 8`,
            [like, principal.guardianId],
          ).catch(() =>
            db.query<{ id: string; name: string; admission_no: string; class: string | null }>(
              `SELECT id, name, admission_no, class FROM learner WHERE status = 'active' AND (lower(name) LIKE $1 OR lower(admission_no) LIKE $1) LIMIT 8`,
              [like],
            ),
          )
        : db.query<{ id: string; name: string; admission_no: string; class: string | null }>(
            `SELECT id, name, admission_no, class FROM learner WHERE status = 'active' AND (lower(name) LIKE $1 OR lower(admission_no) LIKE $1) LIMIT 8`,
            [like],
          ),
      principal.kind === "staff"
        ? db.query<{ id: string; name: string; role: string; email: string }>(
            `SELECT id, name, role, email FROM staff WHERE active = true AND (lower(name) LIKE $1 OR lower(email) LIKE $1) LIMIT 5`,
            [like],
          )
        : Promise.resolve({ rows: [] as { id: string; name: string; role: string; email: string }[] }),
      principal.kind === "staff"
        ? db.query<{ id: string; name: string; phone: string }>(
            `SELECT id, name, phone FROM guardian WHERE lower(name) LIKE $1 OR lower(phone) LIKE $1 LIMIT 4`,
            [like],
          )
        : Promise.resolve({ rows: [] as { id: string; name: string; phone: string }[] }),
      canSeeMoney
        ? db.query<{ id: string; reference: string; amount_cents: string; learner_name: string }>(
            `SELECT r.id, r.reference, r.amount_cents, l.name AS learner_name
             FROM payment_receipt r JOIN learner l ON l.id = r.learner_id
             WHERE lower(r.reference) LIKE $1 LIMIT 4`,
            [like],
          )
        : Promise.resolve({ rows: [] as { id: string; reference: string; amount_cents: string; learner_name: string }[] }),
    ]);

    const hits = [
      ...lRows.rows.map((r) => ({ kind: "learner", label: r.name, meta: `Adm ${r.admission_no}${r.class ? ` · ${r.class}` : ""}`, href: `/app/people/learners/${r.id}` })),
      ...sRows.rows.map((r) => ({ kind: "staff", label: r.name, meta: `${r.role} · ${r.email}`, href: `/app/directory` })),
      ...gRows.rows.map((r) => ({ kind: "guardian", label: r.name, meta: r.phone, href: `/app/people/guardians` })),
      ...rRows.rows.map((r) => ({ kind: "receipt", label: r.reference, meta: `Ksh ${Number(r.amount_cents).toLocaleString("en-KE")} · ${r.learner_name}`, href: `/app/reconcile` })),
    ];
    res.json({ hits });
  }

  /**
   * GET /web/bell
   * Live counts for the topbar bell. Scoped by role:
   * pending_payments (bursar/admin/counter), announcements_7d, audit_7d (admin/principal).
   */
  @Get("bell")
  async bellState(@Req() req: Request, @Res() res: Response) {
    const tenant = await tenantFromReq(req);
    const principal = principalFromReq(req);
    if (!principal) { res.status(401).json({ error: "session required" }); return; }
    const db = getSchoolPool(tenant.dbName);
    const role = principal.kind === "staff" ? (principal.role ?? "") : "";
    const canSeeMoney = ["admin", "principal", "bursar", "counter"].includes(role);
    const canSeeAudit = ["admin", "principal"].includes(role);

    const [pRes, aRes, auRes] = await Promise.all([
      canSeeMoney
        ? db.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM payment_receipt WHERE confirmed_at IS NULL`)
        : Promise.resolve({ rows: [{ c: "0" }] }),
      db.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM announcement WHERE created_at >= now() - interval '7 days'`)
        .catch(() => ({ rows: [{ c: "0" }] })),
      canSeeAudit
        ? db.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM audit_log WHERE created_at >= now() - interval '7 days'`)
            .catch(() => ({ rows: [{ c: "0" }] }))
        : Promise.resolve({ rows: [{ c: "0" }] }),
    ]);

    res.json({
      pending_payments: Number(pRes.rows[0]?.c ?? 0),
      announcements_7d: Number(aRes.rows[0]?.c ?? 0),
      audit_7d: Number(auRes.rows[0]?.c ?? 0),
    });
  }

}
