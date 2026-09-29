import { filterInquiries } from "./AdmissionsClient";

const rows = [
  { id: "1", child_first: "Asha", child_last: "Hassan", parent_name: "Fatma Hassan", phone: "2547001", level_interest: "Grade 7", curriculum_code: "cbc", source: "walk-in", stage: "visit", next_followup_on: "2026-10-02" },
  { id: "2", child_first: "Tom", child_last: "Njoroge", parent_name: "Susan Njoroge", phone: "2547002", level_interest: "Grade 8", curriculum_code: "8-4-4", source: "referral", stage: "assessment", next_followup_on: null },
];

function assert(value: boolean, message: string) {
  if (value) console.log(`✓ ${message}`);
  else { console.error(`✗ ${message}`); process.exitCode = 1; }
}

assert(filterInquiries(rows, { query: "asha", stage: "visit" }).length === 1, "filters a family by search and stage");
assert(filterInquiries(rows, { level: "Grade 8", curriculum: "8-4-4", source: "referral", followup: "none" }).length === 1, "filters by existing inquiry metadata");
