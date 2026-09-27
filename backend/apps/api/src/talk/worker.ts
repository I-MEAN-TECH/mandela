import { getControlPool, getSchoolPool } from "../db/pool.js";
import { sendMessage, sendEmail, providerName } from "./providers.js";
import { getChannelConfig } from "./channels.js";

/**
 * Talk delivery worker (docs/MASTER-CHECKLIST.md flank 11; daily loop per
 * docs/ECOSYSTEM-STRATEGY.md §Loop 2). Every 10s, per school database:
 *
 *   1. FANOUT  — announcements from the last 7 days with no message rows yet
 *                get one queued message per guardian in their audience.
 *   2. DIGEST  — at the school's configured time (Africa/Nairobi), build one
 *                message per guardian: fee balance, homework due, attendance
 *                yesterday. Deduped by `digest:<date>:<guardian>` so it fires
 *                exactly once per day no matter how often we tick or retry.
 *   3. SEND    — queued messages move to sent/failed via the resolved
 *                channel: WhatsApp (per-school creds → platform → simulate)
 *                or email (per-school SMTP). Both record the outcome + audit.
 *
 * The worker owns no business decisions — it moves rows the app queued.
 */

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Digests are compared against Africa/Nairobi local time. */
function nairobiNow(): { hhmm: string; date: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    hhmm: `${get("hour")}:${get("minute")}`,
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const control = await getControlPool();
    const schools = await control.query<{ db_name: string; slug: string }>(
      `SELECT db_name, slug FROM school WHERE state = 'active'`,
    );
    for (const s of schools.rows) {
      try {
        await processSchool(s.db_name);
      } catch (err) {
        console.error(`[talk:${s.slug}]`, (err as Error).message);
      }
    }
  } catch (err) {
    // Control DB briefly unavailable at boot — quiet retry next tick.
    console.error("[talk] tick skipped:", (err as Error).message);
  } finally {
    running = false;
  }
}

async function processSchool(dbName: string): Promise<void> {
  await fanoutAnnouncements(dbName);
  await buildDigests(dbName);
  await sendQueued(dbName);
}

// ---------------------------------------------------------------------------
// 1) FANOUT — announcements → one queued message per guardian in audience
// ---------------------------------------------------------------------------

async function fanoutAnnouncements(dbName: string): Promise<void> {
  const db = getSchoolPool(dbName);
  const pending = await db.query<{ id: string; audience: Record<string, unknown>; channel: string }>(
    `SELECT a.id::text, a.audience, a.channel::text AS channel
     FROM announcement a
     WHERE a.created_at > now() - interval '7 days'
       AND NOT EXISTS (SELECT 1 FROM message m WHERE m.announcement_id = a.id)
     ORDER BY a.created_at
     LIMIT 20`,
  );
  for (const a of pending.rows) {
    const aud = a.audience ?? {};
    let guardians: { guardian_id: string; learner_id: string | null }[] = [];
    if (Array.isArray(aud.learners) && aud.learners.length) {
      const r = await db.query<{ guardian_id: string; learner_id: string | null }>(
        `SELECT DISTINCT lg.guardian_id::text, lg.learner_id::text
         FROM learner_guardian lg
         WHERE lg.learner_id = ANY($1::uuid[])`,
        [aud.learners as string[]],
      );
      guardians = r.rows;
    } else if (typeof aud.class === "string" && aud.class) {
      const r = await db.query<{ guardian_id: string; learner_id: string | null }>(
        `SELECT DISTINCT lg.guardian_id::text, lg.learner_id::text
         FROM learner_guardian lg JOIN learner l ON l.id = lg.learner_id
         JOIN class c ON c.id = l.class_id
         WHERE c.code = $1 AND l.status = 'active'`,
        [aud.class],
      );
      guardians = r.rows;
    } else if (aud.all === true) {
      const r = await db.query<{ guardian_id: string; learner_id: string | null }>(
        `SELECT DISTINCT lg.guardian_id::text, lg.learner_id::text
         FROM learner_guardian lg JOIN learner l ON l.id = lg.learner_id
         WHERE l.status = 'active'`,
      );
      guardians = r.rows;
    }
    for (const g of guardians) {
      await db.query(
        `INSERT INTO message (announcement_id, guardian_id, learner_id, channel, kind)
         SELECT $1, $2, $3, $4::message_channel, 'announcement'
         WHERE NOT EXISTS (
           SELECT 1 FROM message WHERE announcement_id = $1 AND guardian_id = $2
         )`,
        [a.id, g.guardian_id, g.learner_id, a.channel],
      );
    }
    // Staff broadcast (System completion B1): {staff:true} → one message per
    // active staff member. Dedupe keyed on (announcement, staff_recipient).
    if (aud.staff === true) {
      const staff = await db.query<{ id: string }>(
        `SELECT s.id::text FROM staff s WHERE s.active`,
      );
      for (const st of staff.rows) {
        await db.query(
          `INSERT INTO message (announcement_id, staff_recipient, channel, kind)
           SELECT $1, $2, $3::message_channel, 'announcement'
           WHERE NOT EXISTS (
             SELECT 1 FROM message WHERE announcement_id = $1 AND staff_recipient = $2
           )`,
          [a.id, st.id, a.channel],
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2) DIGEST — one message per guardian per day (fees · homework · attendance)
// ---------------------------------------------------------------------------

interface DigestGuardian {
  guardian_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  pref_channel: "whatsapp" | "email" | "none";
}

async function buildDigests(dbName: string): Promise<void> {
  const cfg = await getChannelConfig(dbName);
  if (!cfg?.digest_enabled) return;
  const { hhmm, date } = nairobiNow();
  // Fire within the configured minute; worker ticks every 10s so the window
  // is 4 ticks wide. A school that was down at its time gets it next tick.
  const [h, m] = cfg.digest_time.split(":").map(Number) as [number, number];
  const target = h! * 60 + m!;
  const now = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  if (now < target || now > target + 1) return;

  const db = getSchoolPool(dbName);

  // Current term = the term containing today.
  const term = await db.query<{ id: number; label: string; starts_on: string; ends_on: string }>(
    `SELECT id, label, starts_on::text, ends_on::text FROM term
     WHERE current_date BETWEEN starts_on AND ends_on
     ORDER BY starts_on DESC LIMIT 1`,
  );
  if (!term.rowCount) return;
  const termId = term.rows[0]!.id;

  const guardians = await db.query<DigestGuardian>(
    `SELECT g.id::text AS guardian_id, g.full_name, g.phone, g.email, g.pref_channel::text AS pref_channel
     FROM guardian g
     WHERE g.pref_channel = 'whatsapp' AND g.phone IS NOT NULL
        OR g.pref_channel = 'email' AND g.email IS NOT NULL`,
  );
  if (!guardians.rowCount) return;
  const guardianIds = guardians.rows.map((g) => g.guardian_id);

  // Their children + classes
  const children = await db.query<{ guardian_id: string; learner_id: string; first_name: string; class_name: string; class_id: number }>(
    `SELECT lg.guardian_id::text, l.id::text AS learner_id, l.first_name,
            c.name AS class_name, c.id AS class_id
     FROM learner_guardian lg
     JOIN learner l ON l.id = lg.learner_id AND l.status = 'active'
     LEFT JOIN class c ON c.id = l.class_id
     WHERE lg.guardian_id = ANY($1::uuid[])`,
    [guardianIds],
  );
  const byGuardian = new Map<string, typeof children.rows>();
  for (const row of children.rows) {
    const list = byGuardian.get(row.guardian_id) ?? [];
    list.push(row);
    byGuardian.set(row.guardian_id, list);
  }
  const learnerIds = [...new Set(children.rows.map((c) => c.learner_id))];
  if (learnerIds.length === 0) return;
  console.log(`[talk:${dbName}] daily digest queued for ${guardians.rows.length} guardians`);

  // Fee due (current term, consent-aware — v_fee_balance semantics) and paid
  const due = await db.query<{ learner_id: string; due_cents: string }>(
    `SELECT fi.learner_id::text, COALESCE(SUM(CASE WHEN fi.is_optional = false OR c.choice = 'granted'
              THEN fi.amount ELSE 0 END), 0) AS due_cents
     FROM fee_item fi
     LEFT JOIN consent c ON c.id = fi.consent_id AND c.choice IN ('granted','revoked')
     WHERE fi.term_id = $1 AND fi.learner_id::text = ANY($2::text[])
     GROUP BY fi.learner_id`,
    [termId, learnerIds],
  );
  const dueMap = new Map(due.rows.map((r) => [r.learner_id, Number(r.due_cents)]));
  const paid = await db.query<{ learner_id: string; paid_cents: string }>(
    `SELECT p.learner_id::text, COALESCE(SUM(p.amount), 0) AS paid_cents
     FROM payments p
     JOIN term t ON t.id = $1
     WHERE p.state = 'confirmed' AND p.learner_id::text = ANY($2::text[])
       AND p.paid_at::date BETWEEN t.starts_on AND t.ends_on
     GROUP BY p.learner_id`,
    [termId, learnerIds],
  );
  const paidMap = new Map(paid.rows.map((r) => [r.learner_id, Number(r.paid_cents)]));

  // Homework due in the next 7 days, per class
  const hw = await db.query<{ class_id: number; subject: string; title: string; due_on: string }>(
    `SELECT h.class_id, h.subject, h.title, h.due_on::text
     FROM homework h
     WHERE h.due_on BETWEEN current_date AND current_date + 7
     ORDER BY h.due_on`,
  );
  const hwByClass = new Map<number, string[]>();
  for (const row of hw.rows) {
    const list = hwByClass.get(row.class_id) ?? [];
    const label = row.due_on === nairobiDateOnly() ? "today" : row.due_on;
    list.push(`${row.subject}: ${row.title} (due ${label})`);
    hwByClass.set(row.class_id, list);
  }

  // Attendance yesterday
  const att = await db.query<{ learner_id: string; mark: string }>(
    `SELECT a.learner_id::text, a.mark::text
     FROM attendance a
     WHERE a.day = current_date - 1 AND a.learner_id::text = ANY($1::text[])`,
    [learnerIds],
  );
  const attMap = new Map(att.rows.map((r) => [r.learner_id, r.mark]));

  const sh = (cents: number) => `Ksh ${(cents / 100).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

  for (const g of guardians.rows) {
    const kids = byGuardian.get(g.guardian_id) ?? [];
    if (kids.length === 0) continue;
    const lines: string[] = [];
    for (const kid of kids) {
      const dueCents = dueMap.get(kid.learner_id) ?? 0;
      const paidCents = paidMap.get(kid.learner_id) ?? 0;
      const balance = dueCents - paidCents;
      const kidLines = [`${kid.first_name} (${kid.class_name ?? "class"})`];
      kidLines.push(`• Fees: balance ${balance > 0 ? sh(balance) : "cleared — thank you"}`);
      const kidHw = kid.class_id != null ? (hwByClass.get(kid.class_id) ?? []) : [];
      kidLines.push(kidHw.length ? `• Homework: ${kidHw.join("; ")}` : "• Homework: none due this week");
      const mark = attMap.get(kid.learner_id);
      kidLines.push(`• Yesterday: ${mark ? mark : "no record"}`);
      lines.push(kidLines.join("\n"));
    }
    const body =
      `Good morning. Today at school — ${date}:\n\n${lines.join("\n\n")}\n\n` +
      `Reply to the school office for anything about this message.`;
    const channel: "whatsapp" | "email" = g.pref_channel === "email" && g.email ? "email" : "whatsapp";
    if (channel === "whatsapp" && !g.phone) continue;
    if (channel === "email" && !g.email) continue;
    const dedupeKey = `digest:${date}:${g.guardian_id}`;
    const inserted = await db.query(
      `INSERT INTO message (guardian_id, learner_id, channel, kind, dedupe_key, body)
       SELECT $1::uuid, NULL::uuid, $2::message_channel, 'digest', $3::text, $4::text
       WHERE NOT EXISTS (SELECT 1 FROM message WHERE dedupe_key = $3::text)
       RETURNING id`,
      [g.guardian_id, channel, dedupeKey, body],
    );
    if (inserted.rowCount) {
      // One digest per child link so the message ledger stays per-learner
      // traceable (guardian home shows their children's messages).
      for (const kid of kids) {
        await db.query(`UPDATE message SET learner_id = COALESCE(learner_id, $2) WHERE id = $1`, [
          inserted.rows[0]!.id,
          kid.learner_id,
        ]);
      }
    }
  }
}

function nairobiDateOnly(): string {
  return nairobiNow().date;
}

// ---------------------------------------------------------------------------
// 3) SEND — queued messages move through the real channel
// ---------------------------------------------------------------------------

async function sendQueued(dbName: string): Promise<void> {
  const db = getSchoolPool(dbName);
  const queued = await db.query<{
    id: number;
    channel: string;
    kind: string;
    body: string | null;
    guardian_phone: string | null;
    guardian_email: string | null;
    staff_email: string | null;
    staff_phone: string | null;
  }>(
    `SELECT m.id, m.channel::text AS channel, m.kind::text AS kind,
            COALESCE(m.body, a.body) AS body,
            g.phone AS guardian_phone, g.email AS guardian_email,
            s.email AS staff_email, s.phone AS staff_phone
     FROM message m
     LEFT JOIN announcement a ON a.id = m.announcement_id
     LEFT JOIN guardian g ON g.id = m.guardian_id
     LEFT JOIN staff s ON s.id = m.staff_recipient
     WHERE m.state = 'queued'
     ORDER BY m.created_at
     LIMIT 100`,
  );
  if (!queued.rowCount) return;
  let sent = 0;
  let failed = 0;
  for (const m of queued.rows) {
    let delivery: { ok: boolean; providerId?: string | null; note?: string | null };
    const email = m.guardian_email ?? m.staff_email;
    const phone = m.guardian_phone ?? m.staff_phone;
    if (m.channel === "email") {
      if (!email) {
        delivery = { ok: false, note: "recipient has no email on file" };
      } else {
        delivery = await sendEmail({
          to: email,
          subject: "Your school update",
          body: m.body ?? "",
          dbName,
        });
      }
    } else {
      if (!phone) {
        delivery = { ok: false, note: "recipient has no phone on file" };
      } else {
        delivery = await sendMessage({ to: phone, body: m.body ?? "", dbName });
      }
    }
    if (delivery.ok) {
      await db.query(
        `UPDATE message SET state = 'sent', sent_at = now(),
           body_hash = md5(coalesce($2, 'receipt')),
           provider_id = $3, provider_note = $4
         WHERE id = $1 AND state = 'queued'`,
        [m.id, m.body, delivery.providerId ?? null, `${m.channel}/${providerName()}${delivery.note ? `: ${delivery.note}` : ""}`],
      );
      sent++;
    } else {
      await db.query(
        `UPDATE message SET state = 'failed', error = $2, provider_note = $3 WHERE id = $1 AND state = 'queued'`,
        [m.id, delivery.note ?? "provider send failed", `${m.channel}: error`],
      );
      failed++;
    }
  }
  if (sent > 0 || failed > 0) {
    await db.query(
      `INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
       SELECT NULL, 'system', 'talk.send', 'message', NULL,
              jsonb_build_object('sent', $1, 'failed', $2, 'provider', $3)
       WHERE $1 > 0 OR $2 > 0`,
      [sent, failed, providerName()],
    );
    console.log(`[talk:${dbName}] sent ${sent}, failed ${failed}`);
  }
}

// ---------------------------------------------------------------------------
// Test sends (Settings → Daily loop "Send test" buttons) — no message row
// ---------------------------------------------------------------------------

export async function sendTestWhatsApp(dbName: string, to: string): Promise<{ ok: boolean; note?: string | null }> {
  const d = await sendMessage({ to, body: "Test message from your school's MANDELA daily loop. If you can read this, WhatsApp is connected.", dbName });
  return { ok: d.ok, note: d.note ?? null };
}

export async function sendTestEmail(dbName: string, to: string): Promise<{ ok: boolean; note?: string | null }> {
  const d = await sendEmail({
    to,
    subject: "Test — MANDELA daily loop",
    body: "Test email from your school's MANDELA daily loop. If you can read this, email is connected.",
    dbName,
  });
  return { ok: d.ok, note: d.note ?? null };
}

export function startTalkWorker(): void {
  if (timer) return;
  timer = setInterval(() => void tick(), 10_000);
  // Kick once shortly after boot so the first fanout lands fast.
  setTimeout(() => void tick(), 3_000);
  console.log("[talk] delivery worker started (10s tick)");
}

export function stopTalkWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
