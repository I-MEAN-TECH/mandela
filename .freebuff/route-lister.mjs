import fs from "node:fs";
const src = fs.readFileSync("backend/apps/api/src/web/web.controller.ts", "utf8");
for (const m of src.matchAll(/@(Get|Post)\("([^"]*pulse[^"]*)"\)/g)) console.log(m[1].padEnd(5), m[2]);
