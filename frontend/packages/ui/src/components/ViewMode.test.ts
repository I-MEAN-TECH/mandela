import { defaultViewForScope } from "./ViewMode";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

assert(defaultViewForScope("/app") === "cards", "dashboard keeps cards by default");
assert(defaultViewForScope("/app/people") === "list", "operational People section defaults to list");
assert(defaultViewForScope("/app/money") === "list", "operational Money section defaults to list");
