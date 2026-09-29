import React from "react";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

async function main() {
  const { TEACHER_TOOLS } = await import("./RolePulses");
  const expected = ["/app/mark", "/app/homework", "/app/class", "/app/messages"];
  const actual = TEACHER_TOOLS.map((tool) => tool.href);

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Teacher dashboard tools must match the role workflow. Received: ${actual.join(", ")}`);
  }
  console.log("Teacher dashboard tool contract passed.");
}

void main();
