/**
 * noun — the one plural helper: `noun(1, "learner")` → "learner",
 * `noun(3, "learner")` → "learners". Zero takes the plural ("0 learners"),
 * matching English convention. Pass an irregular plural when -s lies
 * ("class" → "classes", "day" → "days" is regular but "entry" → "entries").
 */
export function noun(n: number, singular: string, plural = `${singular}s`): string {
  return n === 1 ? singular : plural;
}
