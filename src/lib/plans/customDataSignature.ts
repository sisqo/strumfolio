/**
 * The signature that makes `custom_data` this server's word rather than the browser's.
 *
 * **Why it exists.** Paddle.js opens a checkout with any `items` and any `customData` the page
 * hands it, using the public client token, and `updateCheckout` replaces the `customData` of one
 * already open. So an `account_id` or a downgrade stamp arriving on a webhook proves nothing by
 * being there: a purchase could name somebody else's account and move their plan onto a
 * subscription they do not control, and a Standard bought carrying «Premium until 2027» could be
 * turned into a year of Premium. Both were reachable until 2026-09-24.
 *
 * **What is signed**: `account_id`, beside it as `account_sig`, and every downgrade stamp, whose
 * own `sig` also covers the account id so a stamp cannot be carried from one account's
 * subscription to another's. The coupon campaign id is not signed: `appliedDiscountOf` already
 * decides from the `dsc_…` Paddle applied, which the browser cannot attach.
 *
 * **The key is derived from `AUTH_SECRET`**, labelled so this use cannot collide with Auth.js'
 * own, which every environment already holds — no new variable to set before a push, and none to
 * forget on the preview. The cost, stated where it will be looked for: **rotating `AUTH_SECRET`
 * invalidates the signature on every live subscription's `custom_data`.** Nothing breaks
 * outright — an unsigned id is treated as absent and the event finds its account through
 * `paddle_subscription_id`, the second of `findAccount`'s ways — but a pending downgrade's stamp
 * stops being believed and the plan drops to the items at once. Re-sign those subscriptions, or
 * rotate only when none carries a stamp.
 *
 * A plain module and not part of any `'use server'` file: signing is exactly the power a browser
 * must not be able to call.
 */

import { createHmac, timingSafeEqual } from 'crypto'

const LABEL = 'strumfolio:paddle-custom-data:v1'

/** `null` without a secret, so nothing can be signed — and nothing verifies either. */
function key(secret: string | undefined): Buffer | null {
  if (!secret) return null
  return createHmac('sha256', secret).update(LABEL).digest()
}

function mac(secret: string | undefined, message: string): string | null {
  const k = key(secret)
  return k === null ? null : createHmac('sha256', k).update(message).digest('hex')
}

function matches(expected: string | null, given: unknown): boolean {
  if (expected === null || typeof given !== 'string' || given.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given))
}

const accountMessage = (accountId: number) => `account:${accountId}`

/** The `account_sig` to write beside `account_id`. */
export function signAccountId(accountId: number, secret = process.env.AUTH_SECRET): string {
  const signed = mac(secret, accountMessage(accountId))
  if (signed === null) throw new Error('AUTH_SECRET is not set: custom_data cannot be signed')
  return signed
}

export function accountIdSigned(accountId: number, sig: unknown, secret = process.env.AUTH_SECRET): boolean {
  return matches(mac(secret, accountMessage(accountId)), sig)
}

/** The stamp's canonical fields, in a fixed order — never a JSON of the object Paddle hands back. */
function stampMessage(accountId: number, fromPlan: unknown, fromCycle: unknown, at: unknown): string {
  return `downgrade:${accountId}:${String(fromPlan)}:${fromCycle === null ? '' : String(fromCycle)}:${String(at)}`
}

export function signStamp(
  accountId: number,
  stamp: { from_plan: unknown; from_cycle: unknown; at: unknown },
  secret = process.env.AUTH_SECRET,
): string {
  const signed = mac(secret, stampMessage(accountId, stamp.from_plan, stamp.from_cycle, stamp.at))
  if (signed === null) throw new Error('AUTH_SECRET is not set: custom_data cannot be signed')
  return signed
}

export function stampSigned(
  accountId: number,
  stamp: Record<string, unknown>,
  secret = process.env.AUTH_SECRET,
): boolean {
  return matches(mac(secret, stampMessage(accountId, stamp.from_plan, stamp.from_cycle, stamp.at)), stamp.sig)
}
