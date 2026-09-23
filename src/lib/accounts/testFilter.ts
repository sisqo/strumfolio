/**
 * Which rows `/accounts` lists while test accounts are hidden — pure, so `npm test` covers the
 * one rule on that screen that decides whether a row exists at all.
 *
 * **A read that failed hides nothing.** `tests` is null when the `is_test` column cannot be
 * read (an unapplied migration, a blip), and «could not tell who is a test account» must never
 * become «accounts missing from the list» — the rule `accounts/CLAUDE.md` states for every
 * other cell on that screen, where not knowing is never drawn as an answer.
 */

/** `?test=1` shows test accounts; anything else, or nothing, hides them. */
export function readShowTest(raw: string | undefined): boolean {
  return raw === '1'
}

export interface TestSplit<T> {
  /** The rows the list draws. */
  shown: T[]
  /** How many test accounts were left out — what the toggle and the search notice count. */
  hidden: number
}

export function splitTestAccounts<T>(
  rows: readonly T[],
  emailOf: (row: T) => string,
  tests: ReadonlySet<string> | null,
  showTest: boolean,
): TestSplit<T> {
  if (tests === null || showTest) return { shown: [...rows], hidden: 0 }
  const shown = rows.filter((row) => !tests.has(emailOf(row)))
  return { shown, hidden: rows.length - shown.length }
}

/** How many of `rows` are test accounts — the toggle's count while they are shown. */
export function countTestAccounts<T>(rows: readonly T[], emailOf: (row: T) => string, tests: ReadonlySet<string> | null): number {
  if (tests === null) return 0
  return rows.filter((row) => tests.has(emailOf(row))).length
}
