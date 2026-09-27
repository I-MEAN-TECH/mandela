import { execSync } from "node:child_process";
import fs from "node:fs";
const ps = `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object { "$($_.ProcessId)|$($_.CreationDate)|$($_.CommandLine)" } | Out-File -Encoding utf8 .freebuff\\node-procs.txt
`;
fs.writeFileSync(".freebuff/orphan.ps1", ps, "utf8");
execSync("powershell -NoProfile -ExecutionPolicy Bypass -File .freebuff/orphan.ps1", { stdio: "ignore" });
const out = fs.readFileSync(".freebuff/node-procs.txt", "utf8");
const now = Date.now();
for (const line of out.split(/\r?\n/)) {
  if (!line.trim()) continue;
  const [pid, created, cmd] = line.split("|");
  const short = (cmd || "").slice(0, 110);
  console.log(pid.padEnd(7), (created || "").slice(0, 19), short);
}
