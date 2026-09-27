import fs from "node:fs";

const p = "backend/apps/api/src/web/rolePulse.ts";
let s = fs.readFileSync(p, "utf8");

const roles = ["teacher", "bursar", "principal", "counter", "driver", "dorm_parent", "janitor", "librarian", "patron", "hod"];
let count = 0;
for (const r of roles) {
  const re = new RegExp("(return \\{\\n)(\\s*)(role: \"" + r + "\",)");
  if (re.test(s)) {
    s = s.replace(re, (m, a, b, c) => a + b + "staff_notice: notice," + "\n" + b + c);
    count++;
  }
}
console.log("returns patched:", count);

fs.writeFileSync(p, s);
