import { paymentLearnerChoices, paymentLearnerWorkspaceHref } from "./PayForm";

const learners = [
  { id: "1", name: "Amina Otieno", class: "Grade 7 Blue", admission_no: "ADM-001" },
  { id: "2", name: "Brian Kamau", class: "Grade 7 Green", admission_no: "ADM-002" },
  { id: "3", name: "Cynthia Njeri", class: "Grade 7 Blue", admission_no: "ADM-003" },
  { id: "4", name: "David Wafla", class: "Grade 7 Blue", admission_no: "ADM-004" },
  { id: "5", name: "Esther Njoki", class: "Grade 7 Blue", admission_no: "ADM-005" },
  { id: "6", name: "Felix Omondi", class: "Grade 7 Blue", admission_no: "ADM-006" },
];

function assert(condition: boolean, message: string) {
  if (condition) console.log(`  ✓ ${message}`);
  else {
    console.error(`  ✗ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const initial = paymentLearnerChoices(learners, "", "");
assert(initial.length === 5, "initial payment choices show only five learners");
assert(paymentLearnerChoices(learners, "", "Grade 7 Green")[0]?.name === "Brian Kamau", "class filter narrows choices");
assert(paymentLearnerChoices(learners, "cynthia", "")[0]?.name === "Cynthia Njeri", "search finds learner by name");
assert(paymentLearnerWorkspaceHref() === "/app/people/learners", "view all opens the dedicated learner workspace");
