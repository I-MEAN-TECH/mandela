// One-off: reset the demo bursar's password to the documented "demo".
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const req = createRequire(path.join(root, "backend/apps/api/package.json"));
const { Client } = req("pg");

const pwPath = pathToFileURL(path.join(root, "backend/apps/api/src/web/password.ts")).href;
const { hashPassword } = await import(pwPath);

const c = new Client({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_demo" });
await c.connect();
await c.query("UPDATE staff SET login_hash = $1 WHERE email = $2", [hashPassword("demo"), "bursar@demo.mandela.school"]);
console.log("bursar password reset to demo");
await c.end();
