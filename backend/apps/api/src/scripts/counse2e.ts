// E2E: principal opens a case + notes it; admin API path returns counts only.
const API = "http://localhost:4000/web";
const login = await fetch(`${API}/login/staff`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "principal@demo.mandela.school" }),
});
const lj = await login.json() as { ok: boolean; token?: string; error?: string };
if (!lj.token) { console.log("login failed:", lj); process.exit(1); }
const auth = { cookie: `mandela_session=${lj.token}`, "content-type": "application/json" };

const learners = await fetch(`${API}/learners`, { headers: { cookie: auth.cookie } });
const ljs = await learners.json() as { learners: { id: string; name: string }[] };
const target = ljs.learners[0]!;
console.log("learner:", target.name);

const opened = await fetch(`${API}/admin/counselling/open`, {
  method: "POST", headers: auth,
  body: JSON.stringify({ learnerId: target.id, summary: "Bereavement support - follow up weekly", referral: null }),
});
console.log("open:", await opened.json());

const list = await fetch(`${API}/admin/counselling`, { headers: { cookie: auth.cookie } });
const ll = await list.json() as { canOpen: boolean; stats: unknown; cases: { id: string; learner: string; summary: string }[] };
console.log("principal view: canOpen =", ll.canOpen, "| cases =", ll.cases.length, "| first:", ll.cases[0]?.learner, "-", ll.cases[0]?.summary);

const note = await fetch(`${API}/admin/counselling/note`, {
  method: "POST", headers: auth,
  body: JSON.stringify({ id: ll.cases[0]!.id, note: "Session 1 held; guardian informed by phone." }),
});
console.log("note:", await note.json());

const closed = await fetch(`${API}/admin/counselling/close`, {
  method: "POST", headers: auth,
  body: JSON.stringify({ id: ll.cases[0]!.id, status: "closed" }),
});
console.log("close:", await closed.json());

const after = await fetch(`${API}/admin/counselling`, { headers: { cookie: auth.cookie } });
const aj = await after.json() as { stats: { open_ct: number; closed_ct: number } };
console.log("stats after:", aj.stats);
