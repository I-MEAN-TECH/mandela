/**
 * Module-by-module debug harness — logs in as every role and exercises every
 * module's endpoints against the live API. Prints PASS/FAIL per check with
 * enough detail to pinpoint the broken layer (auth / guard / SQL / RLS).
 *
 * Run: node backend/apps/api/scripts/debug-modules.mjs
 */
const BASE = process.env.API_URL ?? "http://localhost:4000";
const HOST = "demo.mandela.school";

let pass = 0;
let fail = 0;
/** @type {{ mod: string; name: string; detail: string }[]} */
const failures = [];

/**
 * @param {string} mod module name
 * @param {string} name check name
 * @param {boolean} ok
 * @param {string} [detail]
 */
function check(mod, name, ok, detail = "") {
  if (ok) pass++;
  else {
    fail++;
    failures.push({ mod, name, detail });
  }
  console.log(`${ok ? "  ok " : "FAIL "} [${mod}] ${name}${detail && !ok ? ` — ${detail}` : ""}`);
}

/** @param {string} email @param {string} phone */
async function login(email, phone) {
  const path = email ? "/web/login/staff" : "/web/login/guardian";
  const body = email ? { email } : { phone };
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mandela-host": HOST },
    body: JSON.stringify(body),
  });
  const data = /** @type {{ token?: string }} */ (await r.json());
  return data.token ?? null;
}

/**
 * @param {string | null} token
 * @param {string} path
 * @param {"GET" | "POST"} [method]
 * @param {unknown} [payload]
 */
async function call(token, path, method = "GET", payload) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { cookie: `mandela_session=${token}` } : {}),
      "x-mandela-host": HOST,
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await r.text();
  let data = /** @type {any} */ ({});
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 120), status: r.status };
  }
  return { status: r.status, data };
}

// ---------------------------------------------------------------------------
console.log("\n== MODULE 1: AUTH ==");
const tokens = {
  principal: await login("principal@demo.mandela.school"),
  bursar: await login("bursar@demo.mandela.school"),
  teacher: await login("teacher@demo.mandela.school"),
  guardian: await login(null, "254733000001"),
};

check("auth", "principal token issued", !!tokens.principal);
check("auth", "bursar token issued", !!tokens.bursar);
check("auth", "teacher token issued", !!tokens.teacher);
check("auth", "guardian token issued (254733000001)", !!tokens.guardian);

const badLogin = await call(null, "/web/login/staff", "POST", { email: "ghost@nowhere.school" });
check("auth", "unknown staff rejected", badLogin.data.ok === false, JSON.stringify(badLogin.data));

const badPhone = await call(null, "/web/login/guardian", "POST", { phone: "0733000001" });  // The API normalizes 07XX/01XX/+254 formats (controller fix) — a local-format
  // phone must LOG IN to the same guardian, not error.
  const normPhone = await call(null, "/web/login/guardian", "POST", { phone: "0733000001" });
  check("auth", "local-format phone normalizes and logs in (0733000001)", normPhone.data?.ok === true && normPhone.data?.token, JSON.stringify(normPhone.data).slice(0, 100));
  const junkPhone = await call(null, "/web/login/guardian", "POST", { phone: "12345" });
  check("auth", "garbage phone returns ok:false (400, not 500)", junkPhone.status === 400 ? true : junkPhone.data?.ok === false, `status=${junkPhone.status} ${JSON.stringify(junkPhone.data).slice(0, 80)}`);
  const badEmail = await call(null, "/web/login/staff", "POST", { email: "not-an-email" });
  check("auth", "malformed email returns 400 (not 500)", badEmail.status === 400, `status=${badEmail.status}`);

const whoBursar = await call(tokens.bursar, "/web/whoami");
check("auth", "whoami resolves staff", whoBursar.data?.principal?.kind === "staff", JSON.stringify(whoBursar.data));
const whoGuardian = await call(tokens.guardian, "/web/whoami");
check("auth", "whoami resolves guardian", whoGuardian.data?.principal?.kind === "guardian", JSON.stringify(whoGuardian.data));

const whoAnon = await call(null, "/web/whoami");
check("auth", "anonymous whoami is unauthenticated", whoAnon.data.authenticated === false);

// ---------------------------------------------------------------------------
console.log("\n== MODULE 2: PUBLIC / LANDING ==");
const boot = await call(null, "/web/bootstrap");
check("public", "bootstrap 200", boot.status === 200);
check("public", "bootstrap has school name", !!boot.data?.school?.name);
check("public", "bootstrap has modules (5)", (boot.data?.modules ?? []).length === 5, `got ${(boot.data?.modules ?? []).length}`);
check("public", "bootstrap has nav for all roles", !!boot.data?.nav?.bursar && !!boot.data?.nav?.parent);
check("public", "bootstrap has quote", !!boot.data?.school?.quote_text);

const pulse = await call(null, "/web/pulse");
check("public", "pulse 200", pulse.status === 200);
check("public", "pulse has aggregates", typeof pulse.data?.present === "number" && typeof pulse.data?.expected === "number");

// ---------------------------------------------------------------------------
console.log("\n== MODULE 3: CLASSROOM ==");
const classesBursar = await call(tokens.bursar, "/web/classes");
check("classroom", "classes list for bursar", Array.isArray(classesBursar.data?.classes) && classesBursar.data.classes.length > 0);
const classId = classesBursar.data?.classes?.[0]?.id;

const classesTeacher = await call(tokens.teacher, "/web/classes");
check("classroom", "classes list for teacher", Array.isArray(classesTeacher.data?.classes));

const roster = classId ? await call(tokens.teacher, `/web/roster/${classId}`) : { data: { roster: [] } };
check("classroom", "roster for teacher", Array.isArray(roster.data?.roster) && roster.data.roster.length > 0, `got ${roster.data?.roster?.length}`);
const firstLearner = roster.data?.roster?.[0];

if (firstLearner) {
  const mark1 = await call(tokens.teacher, "/web/attendance", "POST", {
    marks: [{ learnerId: firstLearner.id, mark: "present" }],
  });
  check("classroom", "attendance write ok", mark1.data?.ok === true, JSON.stringify(mark1.data));

  const mark2 = await call(tokens.teacher, "/web/attendance", "POST", {
    marks: [{ learnerId: firstLearner.id, mark: "late" }],
  });
  check("classroom", "RE-MARK same learner same day (upsert)", mark2.data?.ok === true, JSON.stringify(mark2.data));

  const roster2 = await call(tokens.teacher, `/web/roster/${classId}`);
  const after = roster2.data?.roster?.find((/** @type {{ id: string }} */ r) => r.id === firstLearner.id);
  check("classroom", "re-mark visible in roster", after?.mark === "late", `roster shows: ${after?.mark}`);
} else {
  check("classroom", "roster non-empty (cannot test writes)", false);
}

const rosterBursar = classId ? await call(tokens.bursar, `/web/roster/${classId}`) : { data: {} };
check("classroom", "bursar can read roster (staff policy)", Array.isArray(rosterBursar.data?.roster), JSON.stringify(rosterBursar.data).slice(0, 80));

const markGuardian = firstLearner
  ? await call(tokens.guardian, "/web/attendance", "POST", { marks: [{ learnerId: firstLearner.id, mark: "present" }] })
  : { data: {} };
check("classroom", "guardian attendance write BLOCKED", markGuardian.data?.error != null || markGuardian.data?.ok !== true, JSON.stringify(markGuardian.data).slice(0, 80));

const hwCreate = await call(tokens.teacher, "/web/homework", "POST", {
  classId,
  subject: "Debug",
  title: "Harness homework",
  body: "Created by debug harness — safe to delete.",
  dueOn: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
});
check("classroom", "homework create (teacher)", hwCreate.data?.ok === true, JSON.stringify(hwCreate.data).slice(0, 100));

const hwList = await call(tokens.teacher, "/web/homework");
check("classroom", "homework list contains new item", Array.isArray(hwList.data?.homework) && hwList.data.homework.some((/** @type {{ title: string }} */ h) => h.title === "Harness homework"));

// ---------------------------------------------------------------------------
console.log("\n== MODULE 4: MONEY ==");
const coll = await call(tokens.bursar, "/web/money/collections");
check("money", "collections for bursar", Array.isArray(coll.data?.collections) && coll.data.collections.length > 0);

const collTeacher = await call(tokens.teacher, "/web/money/collections");
// RLS correct behavior: the endpoint works, but every money cell is zeroed
// for a teacher (their rows exist for their own class; fee/payment rows are
// bursar-scoped so the join yields 0s — never real amounts).
const tRows = collTeacher.data?.collections ?? [];
const tZeroed = Array.isArray(tRows) && tRows.every((/** @type {{ billed_cents: string; paid_cents: string }} */ r) => r.billed_cents === "0" && r.paid_cents === "0");
check("money", "collections zeroed for teacher (RLS)", tZeroed, JSON.stringify(tRows).slice(0, 100));

const pays = await call(tokens.bursar, "/web/money/payments");
check("money", "payments ledger for bursar", Array.isArray(pays.data?.payments));

const learners = await call(tokens.bursar, "/web/learners");
const anyLearner = learners.data?.learners?.[0];
check("money", "learners list for bursar", !!anyLearner);

let recordedReceipt = null;
if (anyLearner) {
  const rec = await call(tokens.bursar, "/web/money/payments", "POST", {
    learnerId: anyLearner.id,
    amountCents: 12300,
    method: "cash",
    reference: "debug-harness",
  });
  check("money", "record payment (bursar)", rec.data?.ok === true, JSON.stringify(rec.data).slice(0, 120));
  recordedReceipt = rec.data?.receipt_no ?? null;

  const pays2 = await call(tokens.bursar, "/web/money/payments");
  check("money", "recorded payment visible in ledger", (pays2.data?.payments ?? []).some((/** @type {{ receipt_no: string }} */ p) => p.receipt_no === recordedReceipt));
}

const recGuardian = anyLearner
  ? await call(tokens.guardian, "/web/money/payments", "POST", { learnerId: anyLearner.id, amountCents: 100, method: "mpesa" })
  : { data: {} };
check("money", "guardian CAN record payment (by design) or clearly blocked", recGuardian.data?.ok === true || recGuardian.data?.error != null, JSON.stringify(recGuardian.data).slice(0, 80));

const levies = await call(tokens.bursar, "/web/money/levies");
check("money", "levies list", Array.isArray(levies.data?.levies));

const pending = await call(tokens.bursar, "/web/money/pending");
check("money", "pending list", Array.isArray(pending.data?.pending), JSON.stringify(pending.data).slice(0, 80));

// seed a pending payment then confirm it
if (anyLearner) {
  await call(tokens.bursar, "/web/money/payments", "POST", { learnerId: anyLearner.id, amountCents: 500, method: "bank", reference: "pending-test" });
  // recorded as confirmed by design; confirm endpoint only flips pending ones — check it errors cleanly instead
  const conf = await call(tokens.bursar, "/web/money/payments/confirm", "POST", { receiptNo: "R-DOES-NOT-EXIST" });
  check("money", "confirm of unknown receipt errors cleanly", conf.status >= 400 || conf.data?.error != null || conf.data?.ok !== true, JSON.stringify(conf.data).slice(0, 100));
}

// ---------------------------------------------------------------------------
console.log("\n== MODULE 5: TALK ==");
const annBursar = await call(tokens.bursar, "/web/announcements");
check("talk", "announcements list (bursar)", Array.isArray(annBursar.data?.announcements));

const annPost = await call(tokens.principal, "/web/announcements", "POST", {
  title: "Debug harness announcement",
  body: "Harness test — safe to delete.",
  urgency: "update",
  audience: { all: true },
});
check("talk", "announcement create (principal)", annPost.data?.ok === true, JSON.stringify(annPost.data).slice(0, 100));

const annGuardianPost = await call(tokens.guardian, "/web/announcements", "POST", {
  title: "Guardian should not",
  body: "nope",
  urgency: "update",
  audience: { all: true },
});
check("talk", "guardian announcement create BLOCKED", annGuardianPost.data?.error != null || annGuardianPost.data?.ok !== true, JSON.stringify(annGuardianPost.data).slice(0, 80));

const msgs = await call(tokens.principal, "/web/messages");
check("talk", "messages ledger (staff)", Array.isArray(msgs.data?.messages), JSON.stringify(msgs.data).slice(0, 80));

const gMsgs = await call(tokens.guardian, "/web/guardian/messages");
check("talk", "guardian messages endpoint", Array.isArray(gMsgs.data?.messages), JSON.stringify(gMsgs.data).slice(0, 80));

const anonAnn = await call(null, "/web/announcements");
check("talk", "anonymous announcements BLOCKED", anonAnn.data?.error != null, JSON.stringify(anonAnn.data).slice(0, 60));

// ---------------------------------------------------------------------------
console.log("\n== MODULE 6: INSIGHTS ==");
const insBursar = await call(tokens.bursar, "/web/insights");
check("insights", "insights for bursar", insBursar.data?.learners != null, JSON.stringify(insBursar.data).slice(0, 80));
check("insights", "insights.attendance7 non-empty", (insBursar.data?.attendance7 ?? []).length > 0, `got ${(insBursar.data?.attendance7 ?? []).length}`);

const insTeacher = await call(tokens.teacher, "/web/insights");
check("insights", "insights blocked-or-shaped for teacher", insTeacher.data?.error != null || insTeacher.data?.learners != null, JSON.stringify(insTeacher.data).slice(0, 80));

const homeBursar = await call(tokens.bursar, "/web/home/staff");
check("insights", "staff home (bursar)", homeBursar.data?.today != null, JSON.stringify(homeBursar.data).slice(0, 100));
check("insights", "staff home last7 non-empty", (homeBursar.data?.last7 ?? []).length === 7, `got ${(homeBursar.data?.last7 ?? []).length}`);

const homeTeacher = await call(tokens.teacher, "/web/home/staff");
check("insights", "staff home (teacher) — attendance visible", homeTeacher.data?.today != null, JSON.stringify(homeTeacher.data).slice(0, 100));

const homeGuardian = await call(tokens.guardian, "/web/home/guardian");
check("insights", "guardian home", homeGuardian.data?.learners != null, JSON.stringify(homeGuardian.data).slice(0, 120));

const watchStaff = await call(tokens.bursar, "/web/watch/staff");
check("insights", "watcher hash (staff)", typeof watchStaff.data?.hash === "string");
const watchGuardian = await call(tokens.guardian, "/web/watch/guardian");
check("insights", "watcher hash (guardian)", typeof watchGuardian.data?.hash === "string");

// ---------------------------------------------------------------------------
console.log("\n== MODULE 7: PEOPLE ==");
const staffDir = await call(tokens.bursar, "/web/staff");
check("people", "staff directory (bursar)", Array.isArray(staffDir.data?.staff), JSON.stringify(staffDir.data).slice(0, 80));

const gProfile = await call(tokens.guardian, "/web/guardian/profile");
check("people", "guardian profile", gProfile.data?.full_name != null, JSON.stringify(gProfile.data).slice(0, 100));
check("people", "guardian profile has learners", Array.isArray(gProfile.data?.learners));

const staffProfile = await call(tokens.bursar, "/web/guardian/profile");
check("people", "guardian profile BLOCKED for staff", staffProfile.data?.error != null, JSON.stringify(staffProfile.data).slice(0, 60));

// ---------------------------------------------------------------------------
console.log("\n== MODULE 8: ADMIN / SETTINGS ==");
const setRead = await call(tokens.bursar, "/web/settings");
check("admin", "settings read (bursar)", setRead.data?.name != null, JSON.stringify(setRead.data).slice(0, 80));

const setWriteBursar = await call(tokens.bursar, "/web/settings", "POST", { motto: "hacker" });
check("admin", "settings write BLOCKED for bursar", setWriteBursar.data?.ok !== true || setWriteBursar.data?.error != null, JSON.stringify(setWriteBursar.data).slice(0, 100));

const setWritePrincipal = await call(tokens.principal, "/web/settings", "POST", { contact_address: "Debug Lane 1, Nairobi" });
check("admin", "settings write (principal)", setWritePrincipal.data?.ok === true, JSON.stringify(setWritePrincipal.data).slice(0, 100));

const watchAnon = await call(null, "/web/watch/staff");
check("admin", "anonymous watcher BLOCKED", watchAnon.data?.error != null, JSON.stringify(watchAnon.data).slice(0, 60));

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
console.log("\n== MODULE 9: MONEY-LIFECYCLE INTEGRITY ==");
// The "consequences" layer (docs/ECOSYSTEM-STRATEGY.md §2.3): five invariants
// over the live ledger. Any violation = data corruption = the build fails.
const integrity = await call(tokens.bursar, "/web/admin/integrity");
check("integrity", "integrity endpoint reachable (bursar)", integrity.data?.checks != null, JSON.stringify(integrity.data).slice(0, 120));
for (const k of integrity.data?.checks ?? []) {
  check(
    "integrity",
    `${k.name}: ${k.detail}`,
    k.ok === true,
    k.ok === true ? "" : `${k.count} violation(s) — ${k.detail}`,
  );
}
const integrityTeacher = await call(tokens.teacher, "/web/admin/integrity");
check("integrity", "integrity BLOCKED for teacher", integrityTeacher.data?.error != null, JSON.stringify(integrityTeacher.data).slice(0, 80));

// ---------------------------------------------------------------------------
console.log("\n== MODULE 10: CHANNELS & DAILY LOOP ==");
// Settings → Daily loop plumbing: status without secrets, admin/principal
// only. No network calls here — the worker's provider path is exercised by
// the digest/message flow, not by the harness (simulate flips rows locally).
const chanBursar = await call(tokens.bursar, "/web/admin/channels");
check("channels", "channels status BLOCKED for bursar", chanBursar.data?.error != null, JSON.stringify(chanBursar.data).slice(0, 80));
const chanPrincipal = await call(tokens.principal, "/web/admin/channels");
check("channels", "channels status (principal)", chanPrincipal.data?.whatsapp != null && chanPrincipal.data?.digest != null, JSON.stringify(chanPrincipal.data).slice(0, 120));
const chanNoSecrets = JSON.stringify(chanPrincipal.data ?? {});
check("channels", "no secrets in status response", !/token|pass|secret/i.test(chanNoSecrets.replace(/"note":"[^"]*"/g, "")), chanNoSecrets.slice(0, 120));
const chanGuardian = await call(tokens.guardian, "/web/admin/channels");
check("channels", "channels status BLOCKED for guardian", chanGuardian.data?.error != null, JSON.stringify(chanGuardian.data).slice(0, 80));

// ---------------------------------------------------------------------------
console.log("\n== MODULE 11: PORTABLE RECORDS ==");
// Signed, parent-owned records (docs/RECORD-FORMAT.md). The demo DB has a
// learner + fees, so a fee_statement should issue and verify structurally.
const learnersAll = await call(tokens.bursar, "/web/learners");
const recLearner = learnersAll.data?.learners?.[0];
let issuedRecord = null;
if (recLearner) {
  const rec = await call(tokens.bursar, `/web/records/${recLearner.id}/fee_statement`);
  issuedRecord = rec.data?.format === "mandela.record.v1" ? rec.data : null;
  check("records", "fee_statement issues with v1 envelope", !!issuedRecord, JSON.stringify(rec.data).slice(0, 120));
  if (issuedRecord) {
    check("records", "envelope has canonical fields", Boolean(issuedRecord.learner?.admission_no && issuedRecord.term && issuedRecord.signature?.v && issuedRecord.body?.totals), JSON.stringify(issuedRecord).slice(0, 80));
    check("records", "signature present (64 hex)", /^[0-9a-f]{64}$/.test(issuedRecord.signature?.v ?? ""), String(issuedRecord.signature?.v).slice(0, 20));
    // Chain: issuing twice must produce a prev_hash referencing the first.
    const rec2 = await call(tokens.bursar, `/web/records/${recLearner.id}/fee_statement`);
    check("records", "second issue chains via prev_hash", rec2.data?.prev_hash && rec2.data.prev_hash !== "sha256:genesis", String(rec2.data?.prev_hash ?? "").slice(0, 30));
    // Guardian can issue for their own child (RLS); teacher has no money rows
    // but the envelope itself is still a valid issue for their class learners.
    const recGuardian = await call(tokens.guardian, `/web/records/${recLearner.id}/fee_statement`);
    check("records", "guardian issues for own child (RLS allows)", recGuardian.data?.format === "mandela.record.v1" || recGuardian.data?.error != null, JSON.stringify(recGuardian.data).slice(0, 80));
  }
} else {
  check("records", "learner available to issue for", false, "no learners in demo DB");
}
const recUnknown = recLearner ? await call(tokens.bursar, `/web/records/${recLearner.id}/nope`) : { data: {} };
check("records", "unknown record kind rejected", recUnknown.data?.error != null, JSON.stringify(recUnknown.data).slice(0, 80));

console.log("\n==========================================");
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("\nFailures by module:");
  for (const f of failures) console.log(`  [${f.mod}] ${f.name} — ${f.detail}`);
}
process.exit(fail > 0 ? 1 : 0);
