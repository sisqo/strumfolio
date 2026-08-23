/**
 * The rules a hand-assigned plan has to pass, as one pure function.
 *
 * Separate from `actions.ts` so every rule below is unit-testable with no database: there is
 * no test anywhere else under `src/lib/accounts/`, because everything else in it queries, and
 * these four refusals are exactly the part of this feature that has nothing to do with the
 * world. `now` is a parameter for the same reason it is one throughout `lib/plans/` — every
 * rule here is a date comparison, and a function that reads its own clock cannot be tested at
 * a boundary without fake timers.
 *
 * What this deliberately does *not* check is who is asking, or whether the target row exists.
 * The first is `isOwner`'s answer and the second is the UPDATE's own, via `.returning(...)`;
 * folding either in here would mean a pure function that could not be called without a
 * session or a connection, which is the whole thing being avoided.
 */

import { PLAN_VALUES } from '@/lib/plans/types'
import type { Plan } from '@/lib/plans/types'

import { MAX_GRANT_NOTE } from './types'
import type { GrantFailure, GrantInput } from './types'

/** A calendar day as `<input type="date">` produces it, and as `.slice(0, 10)` gives it back. */
const DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The five column values to write, or why not to write anything.
 *
 * `input === null` is the clear, and it answers `{ ok: true }` with all three fields null —
 * there is nothing to validate about taking a gift away. Note what that means for the audit,
 * because it is a real cost of the shape and not an oversight: a withdrawal records *who* and
 * *when* (the action writes `grantedBy`/`grantedAt` on this path too) but never *why*, so the
 * question a cleared row can answer is "who took away my year", not "what were they thinking".
 * The alternative — a second note field on the clear path — is a reason column whose meaning
 * flips depending on whether the row beside it holds a plan, which is worse to read than an
 * absence.
 *
 * The plan is checked with `PLAN_VALUES.includes` and **never** with `readPlan`. `readPlan`
 * exists to make a *read* safe and does it by answering `free` for anything it cannot
 * interpret, which on this path would turn a typo into a live grant of nothing while telling
 * the operator the gift landed — and `'free'` itself is refused for the same reason it is not
 * offered in the picker: rank 0 can never win a live subscription, and against a dead one it
 * resolves to the `free` the account already had, so it is a gift that changes nothing while
 * flipping the screen's `source` to `'grant'`.
 *
 * `until` becomes **the end of that day in UTC**, `23:59:59.999Z`. Two things ride on that
 * exact instant. `liveGrant` compares with strict `>`, so a bare `new Date('2026-12-31')` —
 * which JS parses as UTC midnight — would end the gift at the *start* of the day the operator
 * typed, a day early, silently. And UTC rather than the server's zone because it round-trips:
 * `.toISOString().slice(0, 10)` returns the same `YYYY-MM-DD`, which is what refills the date
 * field the next time the panel opens; the +1-day-midnight alternative renders `2027-01-01`
 * into the field somebody typed `2026-12-31` into. In Europe/Rome this makes the gift die at
 * 01:59 local the following morning, which is the generous direction and never truncates the
 * final day.
 *
 * That round-trip is also the *validity* check, and it has to be, because `Date` is lenient
 * where the regex is not: `new Date('2026-02-31T23:59:59.999Z')` is not NaN, it is the 3rd of
 * March. Comparing the ISO day back against what was typed is the only cheap way to refuse a
 * day that does not exist instead of quietly moving the gift.
 *
 * "Until today" normalizes into the future and is therefore accepted — only genuinely past
 * days are refused, which is the behaviour wanted: a gift for the rest of today is a gift.
 */
export function validateGrant(
  input: GrantInput | null,
  now: Date,
): { ok: true; plan: Plan | null; until: Date | null; note: string | null } | { ok: false; reason: GrantFailure } {
  if (input === null) return { ok: true, plan: null, until: null, note: null }

  if (!PLAN_VALUES.includes(input.plan as Plan) || input.plan === 'free') {
    return { ok: false, reason: 'invalid-plan' }
  }
  const plan = input.plan as Plan

  /*
   * `lifetime` with an end date is refused rather than quietly honoured. The row is perfectly
   * storable and `liveGrant` would expire it exactly on time — that is the trap: the word means
   * "never ends" on every screen that renders it, so the honest reading of the stored row
   * ("Gift — Lifetime until 31 December 2026") contradicts itself. An operator who wants a plan
   * with an end date wants one of the other four, and one who wants Lifetime wants no date.
   *
   * Checked here as well as hidden in `GiftForm`, for the reason that file already gives about
   * its own `maxLength`: a form is a hint to a browser, not a promise about a server action
   * anything holding the session cookie can call.
   */
  if (plan === 'lifetime' && input.until !== null && input.until !== '') {
    return { ok: false, reason: 'lifetime-with-date' }
  }

  let until: Date | null = null
  if (input.until !== null && input.until !== '') {
    if (!DAY.test(input.until)) return { ok: false, reason: 'invalid-date' }

    const end = new Date(`${input.until}T23:59:59.999Z`)
    if (Number.isNaN(end.getTime())) return { ok: false, reason: 'invalid-date' }
    if (end.toISOString().slice(0, 10) !== input.until) return { ok: false, reason: 'invalid-date' }
    if (end.getTime() <= now.getTime()) return { ok: false, reason: 'invalid-date' }

    until = end
  }

  // Trimmed, because the trimmed string is what gets stored: a note of three spaces is an
  // empty audit trail with a length, and a length measured before trimming would refuse a
  // reason that fits.
  const note = input.note.trim()
  if (note.length === 0) return { ok: false, reason: 'note-required' }
  if (note.length > MAX_GRANT_NOTE) return { ok: false, reason: 'note-too-long' }

  return { ok: true, plan, until, note }
}
