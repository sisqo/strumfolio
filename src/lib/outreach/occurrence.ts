/**
 * Which occurrence of an action a row is about — the pure half of the whole feature's
 * guarantee.
 *
 * `outreach_actions` is unique on `(kind, occurrence_key, account)`, so this function is
 * literally what decides whether an action repeats and how often. Everything else about
 * "never twice" is a database index; this is the string that index is given.
 */

import type { OutreachCadence } from './types'

/** The key a one-shot action always claims. A literal, so a `once` row reads as itself in the table. */
const ONCE = 'once'

/**
 * The key for the occurrence that is current at `now`.
 *
 * **The year is read in UTC**, deliberately, and it is why the key is a year rather than a
 * date. A yearly action is due once inside a calendar year, and the only day a UTC year and an
 * Italian one disagree is the few hours around New Year — where the two possible answers are
 * "this greeting counts as last year's" and "as this year's", and either is correct. A key
 * shaped like a *day* would have no such tolerance: the same run at 00:30 Rome time would
 * claim a different occurrence than at 23:30 the evening before, and the index would let the
 * action out twice within two hours. Every other date this repo prints goes through
 * `toISOString()`, so UTC is also the timezone the rest of the code already reasons in.
 */
export function occurrenceKeyFor(cadence: OutreachCadence, now: Date): string {
  return cadence === 'once' ? ONCE : String(now.getUTCFullYear())
}

/**
 * A key as a person reads it: «2026», «once ever».
 *
 * Takes the stored string rather than a cadence and a date, because it is called on rows that
 * are already in the table — including, once a third cadence exists, rows minted under a
 * cadence the definition no longer has. Anything it does not recognise is printed as itself,
 * which is the honest answer for a key this code was not compiled to know.
 */
export function occurrenceLabel(key: string): string {
  return key === ONCE ? 'once ever' : key
}

/** How the cadence itself is described on screen, beside the action's own sentence. */
export function cadenceLabel(cadence: OutreachCadence): string {
  return cadence === 'once' ? 'Once per account' : 'Once a year'
}
