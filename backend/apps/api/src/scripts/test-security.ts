import { hashLoginCode, issueToken, verifyLoginCodeHash, verifyToken, type Principal } from "../web/queries.js";

let failures = 0;

function assert(condition: boolean, label: string) {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.error(`  ✗ FAIL: ${label}`);
  }
}

function main() {
  console.log("\nSecurity regression tests");

  const staff: Principal = { kind: "staff", userId: "f89614fc-78d4-4c4e-8b6b-2f47723cbe20", role: "admin" };
  const token = issueToken(staff, "school-a");
  const parsed = verifyToken(token, "school-a") as (Principal & { tenant?: string; exp?: number }) | null;

  assert(Boolean(parsed), "session token is accepted by its issuing tenant");
  assert(verifyToken(token, "school-b") === null, "session token is rejected for a different tenant");
  assert(verifyToken(token, "school-a", Date.now() + 13 * 60 * 60 * 1000) === null, "session token expires after its short lifetime");
  const hashedOtp = hashLoginCode("123456");
  assert(!hashedOtp.includes("123456"), "one-time codes are never stored in plaintext");
  assert(!verifyLoginCodeHash(hashedOtp, "654321"), "an incorrect one-time code is rejected");
  assert(verifyLoginCodeHash(hashedOtp, "123456"), "a valid one-time code hash is accepted");

  if (failures) process.exitCode = 1;
  else console.log("All security regression assertions passed.");
}

main();
