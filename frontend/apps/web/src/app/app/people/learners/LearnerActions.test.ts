import { filterLearners, paginateRows } from "./LearnerActions";

const rows = [
  { id: "1", name: "Amina Otieno", admission_no: "ADM-001", class: "Grade 7 Blue", gender: "F", status: "active" },
  { id: "2", name: "Brian Kamau", admission_no: "ADM-002", class: "Grade 7 Green", gender: "M", status: "active" },
  { id: "3", name: "Cynthia Njeri", admission_no: "ADM-003", class: "Grade 7 Blue", gender: "F", status: "transferred" },
];

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

assert(filterLearners(rows, { className: "Grade 7 Blue", gender: "F", status: "active" }).length === 1, "learner filters combine class, gender, and status");
assert(filterLearners(rows, { query: "ADM-002" })[0]?.name === "Brian Kamau", "learner search finds an admission number");
assert(paginateRows(Array.from({ length: 26 }, (_, id) => id), 1, 25).length === 1, "pagination bounds the rendered learner rows");
