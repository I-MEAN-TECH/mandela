// E2E for the import endpoint through the real API (admin session server-side).
const API = "http://localhost:4000/web";
const login = await fetch(`${API}/login/staff`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "admin@demo.mandela.school" }),
});
const lj = await login.json() as { ok: boolean; token?: string };
const auth = { cookie: `mandela_session=${lj.token}`, "content-type": "application/json" };

const csv = [
  "admission_no,first_name,middle_name,last_name,gender,dob,class,guardian_name,guardian_phone,boarding",
  "ADM-021,Zawadi,,Mumo,F,2013-02-11,G7B,Rhoda Mumo,254700111222,false",
  ",Kip,,Choge,M,2012-06-01,G8A,Hellen Choge,0722555666,true",
  "ADM-001,Amina,Wanjiku,Otieno,F,2012-04-12,G7B,Grace Otieno,254733000001,false",
].join("\n");

const r = await fetch(`${API}/admin/learners/import-csv`, {
  method: "POST", headers: auth, body: JSON.stringify({ csv }),
});
console.log("import:", await r.json());

const check = await fetch(`${API}/learners`, { headers: { cookie: auth.cookie } });
const cj = await check.json() as { learners: { admission_no: string; name: string; class: string | null }[] };
console.log("Zawadi:", cj.learners.find(l => l.admission_no === "ADM-021"));
console.log("Kip:", cj.learners.find(l => l.name.includes("Kip")));
console.log("Amina (updated middle name):", cj.learners.find(l => l.admission_no === "ADM-001"));
