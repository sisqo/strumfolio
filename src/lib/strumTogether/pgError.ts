/**
 * Reading a Postgres error code off whatever the driver actually threw.
 *
 * A plain sibling of `./session`, which carries `'use server'` and may therefore only export
 * async functions — the same reason `plans/testCard.ts` sits beside `plans/checkout.ts` rather
 * than inside it, and the reason this is testable at all. `session.ts` had this inline and
 * untested while it was a one-line property read; it stopped being one, so it moved.
 *
 * No clock, no database, no `process.env`, and deliberately no import of the driver's own error
 * class: the whole point is to answer for an error whose shape we are not certain of.
 */

/**
 * How far down a `cause` chain to look before giving up.
 *
 * **This bound is the reason the function is a loop with a counter and not a tidy recursion,
 * and it is load-bearing rather than tasteful.** `Error.cause` is an ordinary property that
 * anything may set to anything, including an error that points back at itself; a walk with no
 * bound meets a cycle and never returns, which in a server action is not a wrong answer but a
 * request that hangs until the platform kills it — strictly worse than the buried-code problem
 * the walk exists to survive. Eight is far past any real driver's nesting (postgres.js throws
 * its `PostgresError` unwrapped, so today's depth is one) and small enough to be obviously
 * finite.
 */
const MAX_CAUSE_DEPTH = 8

/** Postgres' `foreign_key_violation`. */
export const FOREIGN_KEY_VIOLATION = '23503'

/**
 * Whether `error`, or anything it names as its `cause`, carries this Postgres error code.
 *
 * Read off the driver's `code` rather than the message, which is localised and reworded between
 * server versions.
 *
 * The chain walk is insurance and not a fix, which is worth stating so nobody removes it as
 * dead or trusts it as necessary. `seatDevice`'s insert moved inside a `db().transaction()` when
 * the device cap was made a real boundary, raising the question of whether the error still
 * arrives with `code` on the top-level object. It does: drizzle's `transaction()` delegates to
 * postgres.js' `client.begin()`, whose `scope` rolls back and then rethrows the original
 * `PostgresError` unwrapped — its `25P02` branch exists precisely to surface the *first* real
 * error rather than the "current transaction is aborted" that follows it. So the top-level read
 * alone was already correct.
 *
 * It is here anyway because the asymmetry is lopsided: a few lines against a driver upgrade
 * quietly starting to wrap, whose symptom would be `seatDevice` rethrowing on an ordinary
 * "the leader pressed Stop mid-join" and handing a thrown server action to every phone polling
 * at that moment. Not licence to guard everything — licence to guard the one branch whose
 * failure stays invisible until it is loud.
 */
export function hasPostgresCode(error: unknown, code: string): boolean {
  let step: unknown = error

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof step !== 'object' || step === null) return false
    if ('code' in step && step.code === code) return true
    if (!('cause' in step)) return false
    step = step.cause
  }

  return false
}
