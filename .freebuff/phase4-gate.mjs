// Phase 4 gate — fresh-school wizard run-through against the live API.
// Scratch tenant `mandela_p4gate` (provisioned 2026-09-25). Each step calls the
// SAME endpoint the wizard deep-links to, then re-reads GET /web/admin/onboarding
// (the exact function the Pulse card renders) and asserts the number moved.
const API = "http://localhost:4000/web";
// pg via the API workspace's node_modules
const { createRequire } = await import("node:module");
const reqPg = createRequire(process.cwd() + "/backend/apps/api/package.json");
const HOST = "p4gate6.mandela.school";
let pass = 0, fail = 0;
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ` (${extra})` : ""}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
}

async function call(path, { method = "GET", token, body } = {}) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { cookie: `mandela_session=${token}` } : {}),
      "x-mandela-host": HOST,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json().catch(() => ({}));
}

// The provisioner seeds the admin password-less (dev no-password login path).
const login = await call("/login/staff", { method: "POST", body: { email: "admin@p4gate6.mandela.school" } });
ok("admin login on scratch tenant", login.ok === true, login.error ?? "");
const t = login.token;
if (!t) { console.log("FATAL: no token"); process.exit(1); }

// 0. Baseline state on the freshly provisioned school
let st = await call("/admin/onboarding", { token: t });
console.log("baseline:", JSON.stringify(st));
const base = st.steps_done ?? -1;

// Step 1 — school profile (name/county/phone) via POST settings
{
  const r = await call("/settings", { method: "POST", token: t, body: {
    name: "Phase 4 Gate School", tagline: "Gate run", motto: "Onboard without a manual",
    contact_phone: "0711000112", contact_address: "Kiambu", contact_email: "office@p4gate.mandela.school",
  } });
  ok("step 1: school profile saved", !r.error, r.error ?? "");
  st = await call("/admin/onboarding", { token: t });
  ok("profile_done flipped", st.profile_done === true, JSON.stringify(st).slice(0, 120));
}

// Step 2 — curriculum pack attach (code 'cbe' seeded by 009)
{
  const r = await call("/admin/curriculum/pack", { method: "POST", token: t, body: { code: "cbe", enabled: true, makeDefault: true } });
  ok("step 2: curriculum pack attached", !r.error, r.error ?? "");
  st = await call("/admin/onboarding", { token: t });
  ok("pack_code set", st.pack_code === "cbe", JSON.stringify(st).slice(0, 120));
}

// Step 3 — open term (today inside starts..ends)
{
  const r = await call("/admin/terms/upsert", { method: "POST", token: t, body: {
    year: 2026, label: "Term 3 2026", startsOn: "2026-09-01", endsOn: "2026-11-30",
  } });
  ok("step 3: term opened", !r.error, r.error ?? "");
  st = await call("/admin/onboarding", { token: t });
  ok("term_open flipped", st.term_open === true, JSON.stringify(st).slice(0, 120));
}

// Step 4 — fee structure created + applied
let sid;
{
  const up = await call("/admin/fees/structures/upsert", { method: "POST", token: t, body: {
    name: "Term 3 tuition — all classes", classId: null, amountCents: 1250000, isOptional: false,
  } });
  ok("step 4a: fee structure created", !up.error && up.ok !== false, up.error ?? JSON.stringify(up).slice(0, 100));
  // The upsert response doesn't echo the id — fetch the row just created.
  const list = await call("/admin/fees/structures", { token: t });
  const rows = Array.isArray(list) ? list : (list.rows ?? list.structures ?? list.items ?? []);
  const mine = rows.find?.((s) => s && typeof s === "object" && (s.id ?? "") !== "" && String(s.amount_cents ?? s.amountCents ?? "") === "1250000");
  sid = mine?.id;
  ok("structure id fetched", Boolean(sid), sid ?? JSON.stringify(list).slice(0, 140));
  if (sid) {
    const ap = await call("/admin/fees/structures/apply", { method: "POST", token: t, body: { structureId: sid } });
    // A fresh school has NO active learners yet — applied=0 is correct here.
    ok("step 4b: apply ran (0 learners to bill yet)", !ap.error && ap.ok !== false && ap.applied === 0, JSON.stringify(ap).slice(0, 100));
  }
  st = await call("/admin/onboarding", { token: t });
  ok("structures > 0", Number(st.structures) > 0, JSON.stringify(st).slice(0, 120));
}

// Step 5 — learners CSV import (the CsvFilePicker path)
{
  const csv = [
    "admission_no,first_name,middle_name,last_name,gender,dob,class,stream,guardian_name,guardian_phone,guardian_email,boarding",
    "ADM-001,Amina,,Wanjiru,F,2013-04-12,G7B,,Gace Wanjiru,254711000111,gace@example.com,false",
    ",Brian,Otis,Omondi,M,2012-09-30,G8A,,Grace Otieno,0722555666,,true",
  ].join("\n");
  const r = await call("/admin/learners/import-csv", { method: "POST", token: t, body: { csv, filename: "gate.csv" } });
  ok("step 5: learners CSV imported", !r.error, r.error ?? "");
  st = await call("/admin/onboarding", { token: t });
  ok("learners > 0", Number(st.learners) > 0, JSON.stringify(st).slice(0, 120));

  // Re-apply now that learners exist — the apply pipeline must bill them
  // (idempotent per learner/term/name; second run would add 0).
  if (sid) {
    const ap2 = await call("/admin/fees/structures/apply", { method: "POST", token: t, body: { structureId: sid } });
    ok("re-apply bills the imported learners", ap2.applied === 2, `applied=${ap2.applied}`);
  }
}

console.log("");
ok("wizard reached 5/5", st.steps_done === 5, `steps_done=${st.steps_done}`);

// DB-level verification of the numbers behind each step
const pg = reqPg("pg");
const { Client } = pg;
const c = new Client({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_p4gate6" });
await c.connect();
const checks = {
  profile: "SELECT count(*)::int AS n FROM school_settings WHERE name IS NOT NULL AND contact_address IS NOT NULL AND contact_phone IS NOT NULL",
  pack: "SELECT count(*)::int AS n FROM curriculum WHERE is_default",
  term: "SELECT count(*)::int AS n FROM term WHERE CURRENT_DATE BETWEEN starts_on AND ends_on",
  structures: "SELECT count(*)::int AS n FROM fee_structure",
  invoices: "SELECT count(*)::int AS n FROM fee_item",
  learners: "SELECT count(*)::int AS n FROM learner WHERE status='active'",
  guardians: "SELECT count(*)::int AS n FROM guardian",
};
const db = {};
for (const [k, q] of Object.entries(checks)) db[k] = (await c.query(q)).rows[0].n;
await c.end();
ok("DB: profile row complete", db.profile === 1, `profile=${db.profile}`);
ok("DB: default pack attached", db.pack >= 1, `packs=${db.pack}`);
ok("DB: term open today", db.term === 1, `term=${db.term}`);
ok("DB: fee structure row", db.structures >= 1, `structures=${db.structures}`);
ok("DB: fee items generated by apply", db.invoices >= 1, `fee_items=${db.invoices}`);
ok("DB: 2 learners imported", db.learners === 2, `learners=${db.learners}`);
ok("DB: guardians auto-created from CSV", db.guardians >= 2, `guardians=${db.guardians}`);

console.log(`\n${fail === 0 ? "PHASE 4 GATE: ALL PASS" : "PHASE 4 GATE: FAILURES"} — ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
