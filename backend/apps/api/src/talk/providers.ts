import crypto from "node:crypto";
import net from "node:net";
import tls from "node:tls";
import { config } from "../config.js";
import { resolveWhatsApp, resolveSmtp } from "./channels.js";

/**
 * Talk delivery providers. The worker owns the state machine; a provider
 * owns one job: hand a message to a real channel and report back.
 *  - simulate: dev default — flips queued to sent locally, no network.
 *  - meta:     WhatsApp Cloud API text send. Per-school creds (admin-entered
 *              in Settings → Daily loop) take precedence; then platform env;
 *              then simulate. dbName is required to resolve per-school creds.
 *  - email:    raw-socket SMTP client (zero deps) for the daily loop.
 */

export interface DeliveryResult {
  ok: boolean;
  providerId?: string | null;
  note?: string | null;
}

export interface ProviderMessage {
  to: string; // E.164 phone, e.g. 254733000001
  body: string;
  /** School DB name — required so per-school creds are used when present. */
  dbName?: string;
}

export function providerName(): "simulate" | "meta" {
  return config.WHATSAPP_PROVIDER;
}

export async function sendMessage(m: ProviderMessage): Promise<DeliveryResult> {
  // 1) Per-school (admin-entered) creds win.
  if (m.dbName) {
    const resolved = await resolveWhatsApp(m.dbName);
    if (resolved.provider === "school") {
      return sendWhatsApp(resolved.phoneNumberId, resolved.token, m.to, m.body);
    }
    if (resolved.provider === "error") {
      return { ok: false, note: resolved.note };
    }
    if (resolved.provider === "simulate") {
      return { ok: true, providerId: `sim_${Date.now()}`, note: "simulate" };
    }
    // "platform": fall through to the platform creds below.
  }
  // 2) Platform-global creds (pre-033 behavior).
  if (config.WHATSAPP_PROVIDER === "meta") {
    if (!config.WHATSAPP_TOKEN || !config.WHATSAPP_PHONE_NUMBER_ID) {
      return { ok: false, note: "meta provider selected but WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID are unset" };
    }
    return sendWhatsApp(config.WHATSAPP_PHONE_NUMBER_ID, config.WHATSAPP_TOKEN, m.to, m.body);
  }
  return { ok: true, providerId: `sim_${Date.now()}`, note: "simulate" };
}

async function sendWhatsApp(
  phoneNumberId: string,
  token: string,
  to: string,
  body: string,
): Promise<DeliveryResult> {
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body },
      }),
    });
    const data = (await parseJsonSafe(res)) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      return { ok: false, note: data.error?.message ?? `meta send failed (${res.status})` };
    }
    return { ok: true, providerId: data.messages?.[0]?.id ?? null };
  } catch (err) {
    return { ok: false, note: (err as Error).message };
  }
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Email — minimal SMTP client (zero deps)
// Port 465 = implicit TLS; any other port = STARTTLS upgrade.
// v1 tradeoff (documented in docs/RECORD-FORMAT.md §4 note): TLS certs are
// NOT strictly validated — school relays often carry self-signed certs, and
// an undeliverable digest is a worse failure than a theoretical MITM on a
// school LAN. Revisit when a real relay demands strictness.
// ---------------------------------------------------------------------------

export interface EmailMessage {
  to: string;
  subject: string;
  body: string; // text/plain
  dbName: string;
}

/** RFC 5322 header lines cannot contain raw newlines. */
function hdr(s: string): string {
  return s.replace(/[\r\n]+/g, " ").slice(0, 200);
}

/** Dot-stuffing per RFC 5321 §4.5.2 + normalize line endings. */
function stuffed(body: string): string {
  return body.replace(/\r?\n/g, "\r\n").replace(/(^|\r\n)\./g, "$1..");
}

function extractAddress(s: string): string {
  const m = /<([^>]+)>/.exec(s);
  return m ? m[1]! : s.trim();
}

export async function sendEmail(m: EmailMessage): Promise<DeliveryResult> {
  const smtp = await resolveSmtp(m.dbName);
  if (!smtp) return { ok: false, note: "email not configured for this school" };

  const messageId = `<${crypto.randomBytes(12).toString("hex")}@mandela.school>`;
  const fromAddr = extractAddress(smtp.from || smtp.user);
  const content = [
    `From: ${hdr(smtp.from || smtp.user)}`,
    `To: ${hdr(m.to)}`,
    `Subject: ${hdr(m.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    m.body,
    "",
  ].join("\r\n");

  return new Promise<DeliveryResult>((resolve) => {
    let settled = false;
    const done = (r: DeliveryResult) => {
      if (settled) return;
      settled = true;
      try {
        conn.end();
      } catch {
        /* already gone */
      }
      resolve(r);
    };

    let buffer = "";
    let state:
      | "greeting"
      | "ehlo1"
      | "starttls"
      | "ehlo2"
      | "auth_user"
      | "auth_pass"
      | "mail"
      | "rcpt"
      | "data"
      | "dot"
      | "quit" = "greeting";

    const plain: net.Socket =
      smtp.port === 465
        ? (tls.connect({ host: smtp.host, port: smtp.port, timeout: 60_000 }) as unknown as net.Socket)
        : net.connect({ host: smtp.host, port: smtp.port, timeout: 60_000 });
    let conn: net.Socket = plain;

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      // A complete reply ends in "NNN<space>" on the final line.
      if (!/^\d{3} /m.test(buffer.split("\r\n").pop() ?? "")) return;
      const lines = buffer.split("\r\n").filter((l) => /^\d{3}[- ]/.test(l));
      const last = lines[lines.length - 1] ?? "";
      const code = Number(last.slice(0, 3));
      buffer = "";
      switch (state) {
        case "greeting": {
          if (code !== 220) return done({ ok: false, note: `smtp greeting refused: ${last}` });
          state = "ehlo1";
          conn.write("EHLO mandela.school\r\n");
          break;
        }
        case "ehlo1": {
          if (code !== 250) return done({ ok: false, note: `EHLO refused: ${last}` });
          if (smtp.port !== 465 && /STARTTLS/i.test(lines.join("\n"))) {
            state = "starttls";
            conn.write("STARTTLS\r\n");
          } else {
            state = "auth_user";
            conn.write("AUTH LOGIN\r\n");
          }
          break;
        }
        case "starttls": {
          if (code !== 220) return done({ ok: false, note: `STARTTLS refused: ${last}` });
          // Swap the raw socket for a TLS socket over the same connection.
          conn.removeListener("data", onData);
          const tlsSock = tls.connect({ socket: plain, servername: smtp.host, rejectUnauthorized: false, timeout: 60_000 });
          conn = tlsSock;
          conn.on("data", onData);
          conn.on("error", (err) => done({ ok: false, note: err.message }));
          conn.on("timeout", () => done({ ok: false, note: "smtp timeout" }));
          buffer = "";
          state = "ehlo2"; // EHLO again inside TLS (capabilities may change)
          conn.write("EHLO mandela.school\r\n");
          break;
        }
        case "ehlo2": {
          if (code !== 250) return done({ ok: false, note: `EHLO after TLS refused: ${last}` });
          state = "auth_user";
          conn.write("AUTH LOGIN\r\n");
          break;
        }
        case "auth_user": {
          if (code !== 334) return done({ ok: false, note: `auth refused: ${last}` });
          state = "auth_pass";
          conn.write(Buffer.from(smtp.user).toString("base64") + "\r\n");
          break;
        }
        case "auth_pass": {
          if (code !== 235) return done({ ok: false, note: `auth failed (check user/app password): ${last}` });
          state = "mail";
          conn.write(`MAIL FROM:<${fromAddr}>\r\n`);
          break;
        }
        case "mail": {
          if (code !== 250) return done({ ok: false, note: `MAIL FROM refused: ${last}` });
          state = "rcpt";
          conn.write(`RCPT TO:<${m.to}>\r\n`);
          break;
        }
        case "rcpt": {
          if (code !== 250) return done({ ok: false, note: `recipient refused: ${last}` });
          state = "data";
          conn.write("DATA\r\n");
          break;
        }
        case "data": {
          if (code !== 354) return done({ ok: false, note: `DATA refused: ${last}` });
          state = "dot";
          conn.write(content + "\r\n.\r\n");
          break;
        }
        case "dot": {
          if (code !== 250) return done({ ok: false, note: `message refused: ${last}` });
          state = "quit";
          conn.write("QUIT\r\n");
          done({ ok: true, providerId: messageId });
          break;
        }
        case "quit":
          break;
      }
    };

    conn.on("data", onData);
    conn.on("error", (err) => done({ ok: false, note: err.message }));
    conn.on("timeout", () => done({ ok: false, note: "smtp timeout" }));
    conn.on("close", () => done({ ok: false, note: "smtp connection closed before completion" }));
    // No client write needed here — the server speaks first (220 greeting).
  });
}
