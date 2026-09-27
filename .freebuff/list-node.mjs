import { execSync } from "node:child_process";
// PowerShell script as a file avoids all bash/PS quoting traps.
const ps = `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object { "$($_.ProcessId)|$($_.CommandLine)" } | Out-File -Encoding utf8 .freebuff\\node-procs.txt
`;
import fs from "node:fs";
fs.writeFileSync(".freebuff/list-procs.ps1", ps, "utf8");
execSync("powershell -NoProfile -ExecutionPolicy Bypass -File .freebuff/list-procs.ps1", { stdio: "inherit" });
const out = fs.readFileSync(".freebuff/node-procs.txt", "utf8");
for (const line of out.split(/\r?\n/)) {
  if (/perf-gate|next start|tsx|main\.ts|security-sweep/i.test(line)) console.log(line.slice(0, 150));
}
