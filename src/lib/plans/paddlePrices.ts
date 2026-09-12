/**
 * Which Paddle price a plan and a cycle are sold at, in whichever environment is running.
 *
 * `PlanPrice.paddleId` holds the **live** id and only that — one string cannot carry two
 * environments, and the catalogue that takes real money is the one whose agreement with the
 * listino is worth asserting. `prices.ts` states that decision; this is the other half of it,
 * the place a sandbox or preview deployment gets its own ids from without a second table of
 * amounts to keep in step.
 *
 * **`PADDLE_PRICE_IDS` is read only where `paddleId` is empty**, never instead of it. So the
 * day the live catalogue is wired in, production stops consulting the environment for that row
 * without anybody having to remember to unset anything — and a stray variable left behind in
 * some environment cannot quietly redirect a real purchase at a sandbox price that would never
 * charge anyone.
 *
 * The variable is one JSON object rather than seven flat names, because seven names is seven
 * chances to set six of them:
 *
 *     PADDLE_PRICE_IDS={"standard":{"year":"pri_…","month":"pri_…"},…,"lifetime":"pri_…"}
 *
 * Malformed JSON answers "no ids" rather than throwing. A checkout that cannot name its price
 * has to refuse anyway, and refusing with "this plan is not on sale here" is a better failure
 * than a 500 on a page somebody reached with a card in their hand.
 */

import { LIFETIME, PRICES, type BillingPeriod, type CheckoutPlan } from './prices'

/** The shape `PADDLE_PRICE_IDS` is parsed into. Every branch is optional: none of it is trusted. */
interface PriceIdMap {
  standard?: Partial<Record<BillingPeriod, string>>
  plus?: Partial<Record<BillingPeriod, string>>
  premium?: Partial<Record<BillingPeriod, string>>
  lifetime?: string
}

export function parsePriceIds(raw: string | undefined): PriceIdMap {
  if (!raw) return {}

  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' ? (parsed as PriceIdMap) : {}
  } catch {
    return {}
  }
}

/** The id written in the code — live only, and `''` until a live catalogue exists. */
function committedId(plan: CheckoutPlan, cycle: BillingPeriod | null): string {
  if (plan === 'lifetime') return LIFETIME.paddleId
  return cycle === null ? '' : PRICES[plan][cycle].paddleId
}

function environmentId(map: PriceIdMap, plan: CheckoutPlan, cycle: BillingPeriod | null): string {
  if (plan === 'lifetime') return map.lifetime ?? ''
  return cycle === null ? '' : (map[plan]?.[cycle] ?? '')
}

/**
 * The Paddle price to charge, or `null` when this deployment cannot name one.
 *
 * `null` is a refusal and never a guess: charging the wrong plan's price is worse in every
 * direction than telling somebody the plan is unavailable here.
 */
export function paddlePriceId(
  plan: CheckoutPlan,
  cycle: BillingPeriod | null,
  raw: string | undefined = process.env.PADDLE_PRICE_IDS,
): string | null {
  /* Lifetime is bought once and has no cycle; every other plan must name one. Reading a
     cycle for Lifetime, or none for the rest, is a caller bug rather than a missing id. */
  if ((plan === 'lifetime') !== (cycle === null)) return null

  const committed = committedId(plan, cycle)
  if (committed !== '') return committed

  const fromEnv = environmentId(parsePriceIds(raw), plan, cycle)
  return fromEnv.startsWith('pri_') ? fromEnv : null
}
