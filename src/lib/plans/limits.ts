/**
 * A plan limit, written out with its unit and the right plural.
 *
 * It exists because the same sentence is now printed in more than one place — `/login`'s
 * feature list and the promotional panel that closes every article and every tool page — and
 * the numbers in it are facts about `PLANS` rather than words. A cap that changes has to
 * change the prose with it; a cap typed into prose is a sentence that was true once.
 *
 * Pure, so `npm test` can hold the plural rule, which is the part that silently goes wrong.
 */
export function limitLabel(value: number | null, unit: string): string {
  /* `null` is genuinely unlimited in `PlanLimits`, never a large number, so it is a word here
   * rather than a digit — and taking the null case rather than asserting it away is what keeps
   * this sentence true if a cap is ever lifted rather than raised. */
  if (value === null) return `unlimited ${unit}s`
  return `${value} ${unit}${value === 1 ? '' : 's'}`
}
