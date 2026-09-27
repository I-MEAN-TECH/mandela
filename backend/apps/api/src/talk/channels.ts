import crypto from "node:crypto";
import { getSchoolPool } from "../db/pool.js";

/**
 * Channels — per-school connectivity the ADMIN enters in Settings.
 * (docs/ECOSYSTEM-STRATEGY.md Loop 2: the daily loop is the habit surface.)
 *
 *  - Secrets (WhatsApp token, SMTP password) are encrypted at rest with
 *    AES-256-GCM keyed by VAULT_MASTER_KEY. Decryption happens only in the
 *    delivery path (worker / test send), never in list/get responses.
 *  - No creds configured => the school falls back to the platform-global
 *    provider (config.WHATSAPP_*), then to "simulate" in dev.
 *  - Every change is audit-logged by the DB trigger in migration 033.
 */

export interface ChannelConfigRow {
  wa_phone_number_id: string | null;
  wa_token_enc: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_from: string | null;
  smtp_pass_enc: string | null;
  record_secret: string | null;
  digest_enabled: boolean;
  digest_time: string;
}

// ---------------------------------------------------------------------------
// Secret box: AES-256-GCM, output "v1:<iv_b64>:<ct_b64>:<tag_b64>"
// ---------------------------------------------------------------------------

function vaultKey(): Buffer {
  const raw = process.env.VAULT_MASTER_KEY ?? "";
  if (!raw) {
    // Dev fallback: deterministic key so encrypted values survive restarts.
    // Production sets VAULT_MASTER_KEY (see backend/.env.example).
    return crypto.createHash("sha256").update("mandela-dev-vault").digest();
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", vaultKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${ct.toString("base64")}:${cipher.getAuthTag().toString("base64")}`;
}

export function decryptSecret(blob: string | null): string | null {
  if (!blob) return null;
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(parts[1]!, "base64"));
    decipher.setAuthTag(Buffer.from(parts[3]!, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(parts[2]!, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null; // wrong key / tampered — treat as not configured
  }
}

// ---------------------------------------------------------------------------
// Read / write config (admin/principal only — RLS enforces, role checked at API)
// ---------------------------------------------------------------------------

export async function getChannelConfig(dbName: string): Promise<ChannelConfigRow | null> {
  const db = getSchoolPool(dbName);
  const r = await db.query<ChannelConfigRow>(
    `SELECT wa_phone_number_id, wa_token_enc, smtp_host, smtp_port, smtp_user, smtp_from,
            smtp_pass_enc, record_secret, digest_enabled, digest_time
     FROM channel_config WHERE id = 'default'`,
  );
  return r.rows[0] ?? null;
}

/** Public shape for the Settings UI — secrets never leave the server. */
export interface ChannelStatus {
  whatsapp: { connected: boolean; phoneNumberId: string | null };
  email: { connected: boolean; host: string | null; port: number | null; from: string | null };
  digest: { enabled: boolean; time: string };
}

export function toStatus(row: ChannelConfigRow | null): ChannelStatus {
  return {
    whatsapp: {
      connected: Boolean(row?.wa_phone_number_id && row?.wa_token_enc),
      phoneNumberId: row?.wa_phone_number_id ?? null,
    },
    email: {
      connected: Boolean(row?.smtp_host && row?.smtp_user && row?.smtp_pass_enc),
      host: row?.smtp_host ?? null,
      port: row?.smtp_port ?? null,
      from: row?.smtp_from ?? null,
    },
    digest: { enabled: row?.digest_enabled ?? false, time: row?.digest_time ?? "07:00" },
  };
}

export interface ChannelUpdate {
  waPhoneNumberId?: string | null;
  waToken?: string | null; // plaintext in; encrypted at rest
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpFrom?: string | null;
  smtpPass?: string | null; // plaintext in; encrypted at rest
  digestEnabled?: boolean;
  digestTime?: string;
}

export async function updateChannelConfig(
  dbName: string,
  actorId: string | null,
  input: ChannelUpdate,
): Promise<ChannelStatus> {
  const db = getSchoolPool(dbName);
  // Column-by-column dynamic SET — only fields the caller sent. Secrets are
  // encrypted here; empty string means "clear the field".
  const sets: string[] = [];
  const args: unknown[] = [];
  const push = (col: string, val: unknown) => {
    args.push(val);
    sets.push(`${col} = $${args.length}`);
  };
  if (input.waPhoneNumberId !== undefined) push("wa_phone_number_id", input.waPhoneNumberId || null);
  if (input.waToken !== undefined) push("wa_token_enc", input.waToken ? encryptSecret(input.waToken) : null);
  if (input.smtpHost !== undefined) push("smtp_host", input.smtpHost || null);
  if (input.smtpPort !== undefined) push("smtp_port", input.smtpPort || null);
  if (input.smtpUser !== undefined) push("smtp_user", input.smtpUser || null);
  if (input.smtpFrom !== undefined) push("smtp_from", input.smtpFrom || null);
  if (input.smtpPass !== undefined) push("smtp_pass_enc", input.smtpPass ? encryptSecret(input.smtpPass) : null);
  if (input.digestEnabled !== undefined) push("digest_enabled", input.digestEnabled);
  if (input.digestTime !== undefined) push("digest_time", input.digestTime);
  args.push(actorId);
  sets.push(`updated_by = $${args.length}`);
  sets.push("updated_at = now()");
  await db.query(`UPDATE channel_config SET ${sets.join(", ")} WHERE id = 'default'`, args);
  return toStatus(await getChannelConfig(dbName));
}

/**
 * Resolve the effective WhatsApp send path for a school:
 * per-school creds → platform env → simulate (dev). Returns null when a
 * per-school config is selected but incomplete (worker marks config error).
 */
export async function resolveWhatsApp(dbName: string): Promise<
  | { provider: "school"; phoneNumberId: string; token: string }
  | { provider: "platform" | "simulate" }
  | { provider: "error"; note: string }
> {
  const row = await getChannelConfig(dbName);
  if (row?.wa_phone_number_id || row?.wa_token_enc) {
    const token = decryptSecret(row.wa_token_enc);
    if (!row.wa_phone_number_id || !token) {
      return { provider: "error", note: "WhatsApp is half-configured: phone number ID or token missing/undecryptable" };
    }
    return { provider: "school", phoneNumberId: row.wa_phone_number_id, token };
  }
  // Platform fallback preserves the pre-033 behavior.
  const globalProvider = (process.env.WHATSAPP_PROVIDER ?? "simulate") as "simulate" | "meta";
  if (globalProvider === "meta" && process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return { provider: "platform" };
  }
  return { provider: "simulate" };
}

export async function resolveSmtp(dbName: string): Promise<{
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
} | null> {
  const row = await getChannelConfig(dbName);
  if (!row?.smtp_host || !row.smtp_user) return null;
  const pass = decryptSecret(row.smtp_pass_enc);
  if (!pass) return null;
  return {
    host: row.smtp_host,
    port: row.smtp_port ?? 587,
    user: row.smtp_user,
    pass,
    from: row.smtp_from ?? row.smtp_user,
  };
}

/** Record signing secret for portable records — generated on first use. */
export async function recordSecret(dbName: string): Promise<string> {
  const db = getSchoolPool(dbName);
  const row = await getChannelConfig(dbName);
  if (row?.record_secret) return row.record_secret;
  const secret = crypto.randomBytes(32).toString("hex");
  await db.query(`UPDATE channel_config SET record_secret = $1 WHERE id = 'default'`, [secret]);
  return secret;
}
