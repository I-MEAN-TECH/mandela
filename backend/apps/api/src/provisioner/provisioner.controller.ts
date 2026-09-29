import { Body, Controller, Get, HttpCode, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import crypto from "node:crypto";
import type { Request } from "express";
import { provisionSchoolSchema, provisionSchool, type ProvisionSchoolInput } from "./provisioner.service.js";
import { getControlPool } from "../db/pool.js";
import { config } from "../config.js";

/**
 * Provisioner REST surface (v0). Mirrors PROVISIONER.md section 1.
 * Production adds mTLS/JWT auth on this router before exposure.
 */
@Controller("v1")
export class ProvisionerController {
  private requireControlToken(req: Request) {
    const provided = req.headers["x-mandela-control-token"];
    const candidate = typeof provided === "string" ? Buffer.from(provided) : Buffer.alloc(0);
    const expected = Buffer.from(config.CONTROL_PLANE_TOKEN);
    if (candidate.length !== expected.length || !crypto.timingSafeEqual(candidate, expected)) throw new UnauthorizedException("control-plane authentication required");
  }

  @Get("health")
  @HttpCode(200)
  async health() {
    const pool = await getControlPool();
    const r = await pool.query<{ schools: string; ok: boolean }>(
      "SELECT COUNT(*)::text AS schools, true AS ok FROM school",
    );
    return { status: "ok", controlDb: "up", schools: Number(r.rows[0]!.schools) };
  }

  @Post("schools")
  @HttpCode(202)
  async createSchool(@Req() req: Request, @Body() body: unknown) {
    this.requireControlToken(req);
    // Validate at the edge; service stays typed.
    const input: ProvisionSchoolInput = provisionSchoolSchema.parse(body);
    const result = await provisionSchool(input);
    return {
      school_id: result.schoolId,
      db_name: result.dbName,
      state: result.state,
      steps: result.steps,
      // v0 runs the pipeline inline; the job queue (BullMQ) replaces this in v1.
      job_id: "inline",
      status_url: `/v1/schools/${result.schoolId}`,
    };
  }

  @Get("schools/:id")
  async getSchool(@Req() req: Request, @Param("id") id: string) {
    this.requireControlToken(req);
    const pool = await getControlPool();
    const r = await pool.query(
      `SELECT id, slug, name, county, tier, state, db_name, caddy_host, plan,
              learner_cap, onboarded_at, created_at
       FROM school WHERE id = $1`,
      [id],
    );
    if (!r.rowCount) return { error: "school not found" };
    return r.rows[0];
  }

  @Get("schools")
  async listSchools(@Req() req: Request) {
    this.requireControlToken(req);
    const pool = await getControlPool();
    const r = await pool.query(
      `SELECT id, slug, name, state, plan, learner_cap, onboarded_at
       FROM school ORDER BY created_at DESC`,
    );
    return { schools: r.rows };
  }
}
