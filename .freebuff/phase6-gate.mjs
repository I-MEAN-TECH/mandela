// Phase 6 gate — all 12 roles live + admin team tools (DEV-PHASES Phase 6).
// Runs against the LIVE API on the demo tenant. API must be on :4000.
const BASE = "http://localhost:4000";
const HOST = "demo.mandela.school";
const PW = "demo";
let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ok  ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; fails.push(name); console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`); }
}
async function j(method, path, { token, body } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      "content-type": "application/json",
      "x-mandela-host": HOST,
      ...(token ? { cookie: `mandela_session=${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch { /* empty */ }
  return { status: r.status, data, setCookie: r.headers.get("set-cookie") };
}
function staffTokenFromCookie(sc) {
  const m = sc?.match(/mandela_session=([^;]+)/);
  return m ? m[1] : null;
}

async function staffLogin(email) {
  const r = await j("POST", "/web/login/staff", { body: { email, password: PW } });
  const sc = r.setCookie ?? "";
  return staffTokenFromCookie(sc);
}

console.log("== Setup: seed logins + fresh joiner through the REAL join flow ==");
const adminTok = await staffLogin("admin@demo.mandela.school");
ok("admin login", !!adminTok);
const teacherTok = await staffLogin("teacher@demo.mandela.school");
ok("teacher login", !!teacherTok);
const bursarTok = await staffLogin("bursar@demo.mandela.school");
ok("bursar login", !!bursarTok);

// Plant the five wave-2 staff rows (joined, with passwords) directly — their
// dashboards were already browser-verified through /register in phase 3/5
// flows; the gate re-proves shape + gating, not the join screen again.
let dormParentId = null;
{
  const { createRequire } = await import("node:module");
  const req = createRequire(process.cwd() + "/backend/apps/api/package.json");
  const { Client } = req("pg");
  const c = new Client({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_demo" });
  await c.connect();
  const crypto = await import("node:crypto");
  const salt = crypto.randomBytes(16).toString("hex");
  const scryptHash = crypto.scryptSync("demo", Buffer.from(salt, "hex"), 64, { N: 16384, r: 8, p: 1 });
  const stored = `scrypt$${salt}$${scryptHash.toString("hex")}`;
  const wave2 = [
    ["dormparent@demo.mandela.school", "Dora Parent", "dorm_parent"],
    ["janitor@demo.mandela.school", "Jane Tor", "janitor"],
    ["librarian@demo.mandela.school", "Libby Ary", "librarian"],
    ["patron@demo.mandela.school", "Pat Ron", "patron"],
    ["hod@demo.mandela.school", "Hal Od", "hod"],
  ];
  for (const [email, name, role] of wave2) {
    const authId = crypto.randomUUID();
    const r = await c.query(
      `INSERT INTO staff (full_name, email, role, login_hash, joined, auth_user_id)
       VALUES ($1,$2,$3::user_role,$4,true,$5)
       ON CONFLICT (email) DO UPDATE SET login_hash = EXCLUDED.login_hash, joined = true, active = true
       RETURNING id::text`,
      [name, email, role, stored, authId],
    );
    if (role === "dorm_parent") dormParentId = r.rows[0].id;
  }
  // Give the dorm parent a dorm to run (idempotent).
  await c.query(
    `INSERT INTO dorm (name, kind, capacity, dorm_parent)
     VALUES ('Dorm P6', 'mixed', 12, $1)
     ON CONFLICT (name) DO UPDATE SET dorm_parent = EXCLUDED.dorm_parent`,
    [dormParentId],
  );
  await c.end();
}

// The CURRENT join code: read it from the team endpoint (works before regen).
const team0 = await j("GET", "/web/admin/team", { token: adminTok });
const teamCode = team0.data?.joinCode ?? "MANDELA-A3XKG48N";
ok("team overview readable", !!team0.data?.joinCode, `code ${teamCode}`);

console.log("== Phase 6 gate: wave-2 role pulses (§6.7–6.11) ==");
const dormParent = await staffLogin("dormparent@demo.mandela.school");
ok("dorm_parent login", !!dormParent);
const janitor = await staffLogin("janitor@demo.mandela.school");
ok("janitor login", !!janitor);
const librarian = await staffLogin("librarian@demo.mandela.school");
ok("librarian login", !!librarian);
const patron = await staffLogin("patron@demo.mandela.school");
ok("patron login", !!patron);
const hod = await staffLogin("hod@demo.mandela.school");
ok("hod login", !!hod);

console.log("== Landing resolution: each new role lands on their own Today ==");
for (const [name, tok] of [["dorm_parent", dormParent], ["janitor", janitor], ["librarian", librarian], ["patron", patron], ["hod", hod]]) {
  if (!tok) continue;
  const s = await j("GET", "/web/me/start", { token: tok });
  const d = s.data ?? {};
  ok(`${name} /me/start landed`, d.landed === true && d.landing === "/app", JSON.stringify({ landed: d.landed, landing: d.landing }));
}

console.log("== Pulse shape checks (query each role's own pulse) ==");
{
  const r = await j("GET", "/web/pulse/dorm_parent", { token: dormParent });
  const d = r.data ?? {};
  ok("dorm_parent pulse shape", d.role === "dorm_parent" && Array.isArray(d.rollcall) && Array.isArray(d.dorms) && typeof d.rollcall_taken === "boolean",
    `beds ${d.beds}, occupied ${d.occupied}, rollcall rows ${Array.isArray(d.rollcall) ? d.rollcall.length : "?"}`);
  const x = await j("GET", "/web/pulse/dorm_parent", { token: teacherTok });
  ok("dorm_parent pulse role-gated", !!x.data?.error, x.data?.error ?? "no error");
}
{
  const r = await j("GET", "/web/pulse/janitor", { token: janitor });
  const d = r.data ?? {};
  ok("janitor pulse shape", d.role === "janitor" && Array.isArray(d.queue) && Array.isArray(d.supplies) && typeof d.open_repairs === "number",
    `open ${d.open_repairs}, queue ${Array.isArray(d.queue) ? d.queue.length : "?"}`);
  const x = await j("GET", "/web/pulse/janitor", { token: teacherTok });
  ok("janitor pulse role-gated", !!x.data?.error);
}
{
  const r = await j("GET", "/web/pulse/librarian", { token: librarian });
  const d = r.data ?? {};
  ok("librarian pulse shape", d.role === "librarian" && Array.isArray(d.due_feed) && Array.isArray(d.by_class_30d),
    `out ${d.copies_out}, due ${d.due_today}, overdue ${d.overdue}`);
  const x = await j("GET", "/web/pulse/librarian", { token: teacherTok });
  ok("librarian pulse role-gated", !!x.data?.error);
}
{
  const r = await j("GET", "/web/pulse/patron", { token: patron });
  const d = r.data ?? {};
  ok("patron pulse shape", d.role === "patron" && Array.isArray(d.standings) && Array.isArray(d.my_sections),
    `leader ${d.leader_house} (${d.leader_points}), standings ${Array.isArray(d.standings) ? d.standings.length : "?"}`);
  const x = await j("GET", "/web/pulse/patron", { token: teacherTok });
  ok("patron pulse role-gated", !!x.data?.error);
}
{
  const r = await j("GET", "/web/pulse/hod", { token: hod });
  const d = r.data ?? {};
  ok("hod pulse shape (teacher base + overlay)", d.role === "hod" && !!d.teacher && d.teacher.role === "teacher" && Array.isArray(d.subject_means),
    `dept ${d.dept_area}, coverage ${d.coverage_pct}, unmarked ${d.unmarked_dept}`);
  const x = await j("GET", "/web/pulse/hod", { token: bursarTok });
  ok("hod pulse role-gated", !!x.data?.error);
}

console.log("== Primary actions per role (the §6.7–6.10 one-tap) ==");
{
  // Dorm parent: take rollcall on their dorm (uses data planted by the seed step).
  const t = await j("GET", "/web/admin/hostel", { token: adminTok });
  const dorm = (t.data?.dorms ?? []).find((d) => d.dorm_parent_id || d.dorm_parent === dormParentId);
  const alloc = await fetch(BASE + "/web/admin/hostel", { headers: { "x-mandela-host": HOST, cookie: `mandela_session=${adminTok}` } }).then((r) => r.json());
  const d0 = (alloc.dorms ?? [])[0];
  if (d0) {
    const learners = (alloc.allocations?.filter((a) => a.dorm_id === d0.id) ?? []).map((a) => a.learner_id);
    const r = await j("POST", "/web/admin/hostel/rollcall", {
      token: dormParent,
      body: { dormId: d0.id, present: learners, absent: [] },
    });
    ok("dorm_parent takes rollcall", r.data?.ok === true, `absent ${r.data?.absentCount ?? r.data?.error ?? "?"}`);
  } else {
    ok("dorm_parent takes rollcall", false, "no dorm in admin/hostel payload");
  }
}
{
  const r = await j("POST", "/web/admin/facilities/report", {
    token: janitor,
    body: { room: "Gate store", item: "padlock", qty: 1, condition: "broken", estCostCents: 35000 },
  });
  ok("janitor reports a repair", r.data?.ok === true, r.data?.verdict ?? r.data?.error ?? JSON.stringify(r.data));
}
{
  // Librarian: add a title as admin, then issue + return through the librarian's hands.
  const add = await j("POST", "/web/admin/library/title", { token: adminTok, body: { title: "Phase 6 Gate Reader", author: "Mandela Press", copies: 2 } });
  ok("library title seeded", add.data?.ok === true, add.data?.error ?? "");
  const learners = await j("GET", "/web/learners", { token: adminTok });
  const lid = learners.data?.learners?.[0]?.id;
  if (!lid) { ok("librarian issues a copy", false, "no learner"); }
  else {
    // admin/library returns counts only — fetch shelf copies directly from the DB.
    const { createRequire: cr } = await import("node:module");
    const req2 = cr(process.cwd() + "/backend/apps/api/package.json");
    const { Client: C2 } = req2("pg");
    const dbc = new C2({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_demo" });
    await dbc.connect();
    const shelf = await dbc.query(`SELECT lc.barcode FROM library_copy lc WHERE lc.with_learner IS NULL ORDER BY lc.barcode LIMIT 1`);
    await dbc.end();
    const copy = shelf.rows[0] ? { barcode: shelf.rows[0].barcode } : null;
    if (!copy) { ok("librarian issues a copy", false, "no shelf copy"); }
    else {
      const iss = await j("POST", "/web/admin/library/issue", { token: librarian, body: { barcode: copy.barcode, learnerId: lid, days: 7 } });
      ok("librarian issues a copy", iss.data?.ok === true, iss.data?.dueOn ?? iss.data?.error ?? "");
      const ret = await j("POST", "/web/admin/library/return", { token: librarian, body: { barcode: copy.barcode } });
      ok("librarian returns the copy", ret.data?.ok === true, ret.data?.error ?? "");
    }
  }
}
{
  const houses = await j("GET", "/web/admin/houses", { token: adminTok });
  const house = (houses.data?.houses ?? houses.data?.standings ?? [])[0];
  if (!house) { ok("patron awards house points", false, "no houses"); }
  else {
    const r = await j("POST", "/web/admin/houses/award", {
      token: patron,
      body: { houseId: house.id ?? house.house_id, points: 5, reason: "Gate: tidied the compound" },
    });
    ok("patron awards house points", r.data?.ok === true, r.data?.error ?? JSON.stringify(r.data));
  }
}

console.log("== Admin team tools (§7.7) ==");
{
  const t = await j("GET", "/web/admin/team", { token: adminTok });
  const d = t.data ?? {};
  ok("admin/team shape", !!d.joinCode && Array.isArray(d.joined) && Array.isArray(d.pending),
    `code ${d.joinCode}, joined ${d.joined?.length}, pending ${d.pending?.length}`);
  const teacherView = await j("GET", "/web/admin/team", { token: teacherTok });
  ok("admin/team admin-gated", !!teacherView.data?.error, teacherView.data?.error ?? "");
}
{
  // Role change: register a fresh joiner, promote them, verify /me/start agrees.
  const uniq = Date.now();
  const joinerEmail = `p6joiner${uniq}@demo.mandela.school`;
  const reg = await j("POST", "/web/auth/register-staff", {
    body: {
      fullName: "Phase Six Joiner", email: joinerEmail,
      role: "janitor", code: teamCode, password: "phase-six-pw-1",
    },
  });
  const tok = staffTokenFromCookie(reg.setCookie);
  ok("joiner registers (janitor)", !!tok, reg.data?.error ?? "");
  // register-staff returns the session cookie only — resolve the staff row
  // through the admin roster (the same path the Team screen uses).
  const roster = await j("GET", "/web/admin/users-roles", { token: adminTok });
  const joiner = (roster.data?.users ?? []).find((u) => u.email === joinerEmail);
  ok("joiner visible on roster", !!joiner, joiner ? `${joiner.name} / ${joiner.role}` : "not found");
  const ch = await j("POST", "/web/admin/users-roles/change", { token: adminTok, body: { staffId: joiner?.staff_id, role: "librarian" } });
  ok("admin changes role janitor→librarian", ch.data?.ok === true, ch.data?.error ?? JSON.stringify(ch.data));
  // The role rides the session token — a FRESH login must resolve the new one.
  const relog = await j("POST", "/web/login/staff", { body: { email: joinerEmail, password: "phase-six-pw-1" } });
  const newTok = staffTokenFromCookie(relog.setCookie);
  const who = await fetch(BASE + "/web/whoami", { headers: { "x-mandela-host": HOST, cookie: `mandela_session=${newTok}` } }).then((r) => r.json());
  ok("next login resolves new role", who?.principal?.role === "librarian", `role ${who?.principal?.role}`);
  const start = await j("GET", "/web/me/start", { token: newTok });
  ok("joiner lands as librarian", (start.data?.landing ?? "") === "/app", JSON.stringify(start.data));
}

console.log("== Join code regen kills the old code ==");
{
  const regen = await j("POST", "/web/auth/join-code/regenerate", { token: adminTok });
  ok("regen returns a code", !!regen.data?.joinCode, regen.data?.error ?? "");
  if (regen.data?.joinCode) {
    const lookup = await j("POST", "/web/auth/school-by-code", { body: { code: regen.data.joinCode } });
    ok("new code resolves", !!lookup.data?.name || lookup.data?.ok === true, JSON.stringify(lookup.data).slice(0, 80));
  }
  const oldLookup = await j("POST", "/web/auth/school-by-code", { body: { code: teamCode } });
  const dead = !oldLookup.data?.name && oldLookup.data?.ok !== true;
  ok("old code dead after regen", dead, JSON.stringify(oldLookup.data).slice(0, 80));
}

console.log("");
console.log(`PHASE6-GATE: ${pass} pass, ${fail} fail`);
if (fail > 0) { console.log("failed:", fails.join(" | ")); process.exit(1); }
