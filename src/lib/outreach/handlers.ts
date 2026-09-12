/**
 * Where a declared action becomes a built one — the seam this whole feature exists to provide.
 *
 * Everything around it is written and none of these is: claiming an occurrence, refusing a
 * second one, recording what happened, retrying what failed and reading it all back are the
 * engine, and a handler is the one part that differs between a birthday greeting and an
 * upgrade offer. Adding an action is therefore a function here plus a definition in
 * `types.ts`, and no change to the engine at all.
 *
 * **A `Record` over `OutreachKind`, so `null` is a decision and not an omission.** Declaring a
 * kind without deciding whether it has a handler does not compile. That is the whole reason
 * this map is not a lookup that returns `undefined` for anything it has not heard of.
 *
 * **A handler is called after the claim, and only once.** By the time one runs, the row is
 * already in the table and the unique index has already refused every competing attempt, so a
 * handler never has to be idempotent and never has to ask whether it has run before —
 * `run.ts` has answered both. What it must do is answer truthfully: `ok` means the reader has
 * been reached, and there is no code path anywhere that undoes a `done` row.
 */

import type { OutreachKind } from './types'
import type { Plan } from '@/lib/plans/types'

/** Everything a handler is given about the account it is writing to. */
export interface OutreachTarget {
  ownerEmail: string
  /** Both nullable forever, for every account predating the name columns — a greeting has to read without them. */
  firstName: string | null
  lastName: string | null
  /** Whose limits actually apply now, gift included: what an upgrade offer would have to be worth. */
  effectivePlan: Plan
  /** Which occurrence this is (`'2026'`, `'once'`) — a handler may name it in what it sends. */
  occurrenceKey: string
}

/**
 * What a handler answers.
 *
 * `detail` is stored on the row as-is and is the operator's record of what was actually done —
 * the subject that went out, the code that was minted. `reason` is stored the same way on a
 * failure and is what the retry decision is made from, so it should say what went wrong rather
 * than that something did.
 */
export type OutreachDelivery = { ok: true; detail: string } | { ok: false; reason: string }

export type OutreachHandler = (target: OutreachTarget) => Promise<OutreachDelivery>

/**
 * The built actions. Both are `null` today: they are declared (`OUTREACH`), the screen shows
 * them, their eligibility is computed, an operator can skip one — and there is nothing to run,
 * which the account screen says on the row itself rather than leaving a dead button.
 *
 * `runOutreach` refuses a `null` handler **before** claiming anything, so a kind that is not
 * built never leaves a row behind to be cleaned up later.
 */
export const HANDLERS: Record<OutreachKind, OutreachHandler | null> = {
  birthday_greeting: null,
  upgrade_voucher: null,
  /*
   * Null for a different reason than the two above, and the distinction matters because
   * `isBuilt` cannot tell them apart: those are unwritten, this one is written and simply not
   * run from here. `sendGiftNotice` (`accounts/actions.ts`) claims and settles its row itself,
   * because the message it sends is composed with two fields an operator typed a moment
   * earlier — and a handler is called with an `OutreachTarget` and nothing else, by design.
   * Widening that signature so one caller could pass a subject through would put an optional
   * payload on every action this engine will ever have.
   *
   * Leaving it null is therefore also a fence: `runOutreach` refuses a null handler before
   * claiming anything, so the button on the Outreach tab — already hidden for this kind, which
   * draws no line at all (`trigger: 'elsewhere'`) — could not send a gift notice with an empty
   * subject even if some future screen offered it.
   */
  gift_notice: null,
  /*
   * Null for the same reason as `gift_notice`, and for the same reason it stays null:
   * `sendCourtesyThanks`/`sendCourtesyCheckin` (`lib/courtesy/actions.ts`) claim and settle
   * their own rows, because each has a refusal `runOutreach` cannot express — an opted-out
   * address, and (for the check-in alone) a thank-you that has not gone out yet. Widening this
   * engine's handler signature to carry that would put a courtesy-specific check on every
   * action it will ever have. Leaving it null is also the same fence `gift_notice` uses: there
   * is no line for either kind on the Outreach tab (`trigger: 'elsewhere'`), so nothing could
   * reach `runOutreach` with one of these even if it tried.
   */
  courtesy_thanks: null,
  courtesy_checkin: null,
}

/** Whether this kind can actually be run today. What the screen draws its button from. */
export function isBuilt(kind: OutreachKind): boolean {
  return HANDLERS[kind] !== null
}
