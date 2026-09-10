/**
 * The rules behind telling somebody a plan has been given to them, as pure functions.
 *
 * Separate from `actions.ts` for the reason `grant.ts` states about itself, and from
 * `planText.ts` because none of this is a sentence a screen prints: these four answers decide
 * *whether* an email is offered, *which* occurrence it claims, and *how long* the two fields
 * an operator may type are allowed to be. All of it is a decision about a state, so all of it
 * is testable with no database and no browser — which matters more here than usual, since the
 * artifact at the end is the one thing in this app a reload cannot correct.
 *
 * Value-imported by `GiftForm`, a client component, so it holds no `'use server'` and touches
 * nothing under `@/lib/db` — the `coupons/types.ts` arrangement.
 */

import { PLAN_RANK } from '@/lib/plans/types'
import type { Plan } from '@/lib/plans/types'

/**
 * A gift as the two questions below need it: which plan, and the day it ends.
 *
 * The day is the `YYYY-MM-DD` string every other screen already holds (`AccountPlanLine`'s
 * `grantedUntilOn`, the date field's own value) and never a `Date`. Two reasons: it is what
 * `GiftForm` has in hand at the moment it has to decide, and comparing two of them
 * lexicographically *is* comparing two days, so the later-than test below needs no clock and
 * no timezone.
 */
export interface GiftSnapshot {
  /** null means no gift at all — the state a first gift is given from, and a removal returns to. */
  plan: Plan | null
  /** null means a gift with no end: `lifetime`, or any plan given with the date left empty. */
  untilOn: string | null
}

/**
 * Whether this change to a gift is worth telling the reader about.
 *
 * **Only what the reader gains.** The question is not «did the row change» — `setGrant`
 * rewrites `granted_at` on every save, including the one that fixes a typo in the internal
 * reason — but «is there something here that this person can use, and did not have before».
 * Four cases say yes and everything else says no:
 *
 * - a gift where there was none;
 * - a plan of a higher rank than the one already given;
 * - an end date moved further out;
 * - an end date removed altogether, which is the same move with no bound.
 *
 * The three noes are worth naming, because each is a message somebody would otherwise
 * receive for nothing. **A removal** says nothing: `Remove gift` is not news that arrives by
 * email, the same judgement `planChangeEmail` makes by staying silent when a scheduled change
 * is called off. **A shortened date or a lower plan** says nothing either — there is no
 * good version of "your gift is now smaller", and an operator who needs to explain that has
 * a phone. And **the reason alone changing** says nothing because that field is audit: it is
 * written for whoever opens this account in six months, and `NOTE_CHIPS` («Refund»,
 * «Beta tester») are not sentences anybody would send to the person they are about.
 *
 * What this deliberately does not consider is whether the gift is *inert* — outranked by a
 * live subscription. That is a fact about the account and not about the change, both callers
 * check it separately, and folding it in here would make a pure function of two gifts need a
 * third argument it uses in one branch.
 */
export function worthAnnouncing(before: GiftSnapshot, after: GiftSnapshot): boolean {
  if (after.plan === null) return false
  if (before.plan === null) return true

  /* Ranks are unique per plan (`PLAN_RANK`, 0 to 4), so an equal rank is the same plan and
     the date below is the only thing left that can have moved. */
  if (PLAN_RANK[after.plan] !== PLAN_RANK[before.plan]) {
    return PLAN_RANK[after.plan] > PLAN_RANK[before.plan]
  }

  if (after.untilOn === null) return before.untilOn !== null
  if (before.untilOn === null) return false
  return after.untilOn > before.untilOn
}

/**
 * Which occurrence of the gift notice a given gift is — the string the unique index on
 * `outreach_actions` does its work against, and therefore the whole of «not twice».
 *
 * **The gift itself, not the moment it was written.** `granted_at` moves on every save, so a
 * key built from it would let a corrected reason send a second, identical email; a key built
 * from the plan and the day cannot, because neither of those changed. The same property makes
 * an *improved* gift a new occurrence, which is exactly right: it is a different gift, and it
 * has not been announced.
 *
 * The one cost, stated because nothing on screen reveals it: a gift removed and then given
 * back identically lands on the key it had before, and a second announcement of it is
 * refused. Rare, and an operator meets it as a sentence rather than as silence.
 *
 * Not `occurrenceKeyFor` (`lib/outreach/occurrence.ts`), which mints `'once'` or a year from a
 * cadence: this action has no cadence, because nothing brings it round — a person does.
 */
export function giftOccurrenceKey(gift: GiftSnapshot & { plan: Plan }): string {
  return `${gift.plan}:${gift.untilOn ?? 'none'}`
}

/**
 * The subject the dialog opens with, before the operator changes it or doesn't.
 *
 * Here and not in `templates.ts` with the other five, because it is the one subject that is an
 * *argument* to its template: the dialog that prefills it is a client component, and this
 * module already crosses that boundary while `templates.ts` crosses it only through the
 * preview page.
 */
export function defaultGiftSubject(planLabel: string): string {
  return `Your ${planLabel} plan is on us`
}

/**
 * How long the two typed fields may be, enforced on the client as `maxLength` *and* in the
 * action — the both-layers rule `MAX_GRANT_NOTE` states for itself, for the same reason: an
 * attribute is a hint to a browser, and the server action behind it is reachable by anything
 * holding the session cookie.
 *
 * The subject is short because a mail client truncates it anyway and a long one reads as
 * spam; the line is one sentence and not a letter, which is the whole point of it being a
 * line — an operator with more to say should write to the person directly, and the
 * `Reply-To` on this message is the address they would answer at.
 */
export const MAX_GIFT_SUBJECT = 120
export const MAX_GIFT_PERSONAL_LINE = 300
