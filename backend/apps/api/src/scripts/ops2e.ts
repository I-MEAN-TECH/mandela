// Phase 2 completion E2E: transport, library, hostel, board, infirmary gate.
const API = "http://localhost:4000/web";
const login = await fetch(`${API}/login/staff`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "admin@demo.mandela.school" }),
});
const lj = await login.json() as { ok: boolean; token?: string };
const auth = { cookie: `mandela_session=${lj.token}`, "content-type": "application/json" };
const j = (r: Response) => r.json();

// Transport: route + bus + trip
console.log("route:", await j(await fetch(`${API}/admin/transport/route`, { method: "POST", headers: auth, body: JSON.stringify({ name: "Kilimani AM", feeTermCents: 650000 }) })));
const t = await j(await fetch(`${API}/admin/transport`, { headers: { cookie: auth.cookie } })) as { routes: { id: string; name: string }[] };
const routeId = t.routes.find(r => r.name === "Kilimani AM")!.id;
console.log("bus:", await j(await fetch(`${API}/admin/transport/bus`, { method: "POST", headers: auth, body: JSON.stringify({ regNo: "KDA 001X", capacity: 32, routeId }) })));
const t2 = await j(await fetch(`${API}/admin/transport`, { headers: { cookie: auth.cookie } })) as { buses: { id: string }[] };
console.log("trip:", await j(await fetch(`${API}/admin/transport/trip`, { method: "POST", headers: auth, body: JSON.stringify({ busId: t2.buses[0]!.id, routeId, direction: "am", done: true }) })));

// Library: title + issue + return
console.log("title:", await j(await fetch(`${API}/admin/library/title`, { method: "POST", headers: auth, body: JSON.stringify({ title: "The River Between", author: "Ngugi wa Thiong'o", copies: 2 }) })));
const learners = await j(await fetch(`${API}/learners`, { headers: { cookie: auth.cookie } })) as { learners: { id: string }[] };
const lid = learners.learners[0]!.id;
const libBefore = await j(await fetch(`${API}/admin/library`, { headers: { cookie: auth.cookie } })) as { titles: number; on_shelf: number };
console.log("lib before:", libBefore);
// find a barcode via overview is not exposed; issue by querying copy through API is not available, so use a barcode from the pattern: we cannot list. Use DB-free skip: report counts only.
console.log("hostel dorm:", await j(await fetch(`${API}/admin/hostel/dorm`, { method: "POST", headers: auth, body: JSON.stringify({ name: "Dorm A (Girls)", kind: "girls", capacity: 16 }) })));
const h = await j(await fetch(`${API}/admin/hostel`, { headers: { cookie: auth.cookie } })) as { dorms: { id: string }[] };
console.log("allocate:", await j(await fetch(`${API}/admin/hostel/allocate`, { method: "POST", headers: auth, body: JSON.stringify({ dormId: h.dorms[0]!.id, learnerId: lid, bedLabel: "A-01" }) })));
console.log("exeat req:", await j(await fetch(`${API}/admin/hostel/exeat/request`, { method: "POST", headers: auth, body: JSON.stringify({ learnerId: lid, reason: "Hospital follow-up" }) })));
const h2 = await j(await fetch(`${API}/admin/hostel`, { headers: { cookie: auth.cookie } })) as { exeat: { id: string; state: string }[]; boarders: number };
const ex = h2.exeat.find(e => e.state === "requested");
if (ex) console.log("exeat approve:", await j(await fetch(`${API}/admin/hostel/exeat/decide`, { method: "POST", headers: auth, body: JSON.stringify({ id: ex.id, decision: "approved", out: true }) })));
console.log("rollcall:", await j(await fetch(`${API}/admin/hostel/rollcall`, { method: "POST", headers: auth, body: JSON.stringify({ dormId: h.dorms[0]!.id, present: [lid], absent: [] }) })));
console.log("boarders now:", h2.boarders);

// Board & BOM
console.log("member:", await j(await fetch(`${API}/admin/board/member`, { method: "POST", headers: auth, body: JSON.stringify({ fullName: "Mary Wanjiru", office: "treasurer", termEnd: "2027-03-31" }) })));
console.log("meeting:", await j(await fetch(`${API}/admin/board/meeting`, { method: "POST", headers: auth, body: JSON.stringify({ title: "Term 3 BOM", heldOn: "2026-09-20", minutes: "Quorum met.", decisions: [{ decision: "Approve lab kit purchase", owner: "Bursar", dueOn: "2026-10-15" }] }) })));

// Flags
console.log("flag on:", await j(await fetch(`${API}/admin/flags/set`, { method: "POST", headers: auth, body: JSON.stringify({ key: "transport", enabled: true }) })));
const f = await j(await fetch(`${API}/admin/flags`, { headers: { cookie: auth.cookie } })) as { rows: { key: string; enabled: boolean }[] };
console.log("flags:", f.rows.map(r => `${r.key}:${r.enabled}`).join(", "));

// Infirmary DPA gate (admin => counts only)
const inf = await j(await fetch(`${API}/admin/infirmary`, { headers: { cookie: auth.cookie } })) as { canOpen: boolean; stats: unknown };
console.log("infirmary as admin: canOpen =", inf.canOpen, "stats =", JSON.stringify(inf.stats));
