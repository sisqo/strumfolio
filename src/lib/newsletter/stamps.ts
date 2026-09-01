/**
 * When to stamp `subscribedAt`/`unsubscribedAt` on a newsletter preference write.
 * Pulled out of `actions.ts` for the same reason `testCard.ts` sits beside
 * `checkout.ts` (`CLAUDE.md`): a `'use server'` module can only export async
 * functions, so the synchronous decision worth a unit test lives in a plain sibling
 * instead.
 *
 * Only stamped on an actual transition, in either direction — flipping the frequency
 * while already subscribed, or writing the same state twice, touches neither.
 * `wasSubscribed` is `null` for a row that does not exist yet (a first-ever write):
 * going straight to subscribed still counts as a transition into it.
 */
export function nextStamps(
  wasSubscribed: boolean | null,
  subscribed: boolean,
  now: Date,
): { subscribedAt?: Date; unsubscribedAt?: Date } {
  const subscribedAt = subscribed && wasSubscribed !== true ? now : undefined
  const unsubscribedAt = !subscribed && wasSubscribed === true ? now : undefined
  return { subscribedAt, unsubscribedAt }
}
