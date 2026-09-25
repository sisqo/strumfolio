/**
 * How often one signed-in reader may make this app call Paddle — sixty presses in ten minutes,
 * across checkout, preview, change, cancel and keep together (2026-09-25).
 *
 * Every one of those is a real Paddle request, a checkout view creates a real transaction, and
 * cancel and change each send an email. Paddle's own rate limit is per API key, so without this
 * one scripted account looping any of them could get the checkout throttled for every customer
 * at once. Sixty is far past what somebody choosing a plan does — the preview runs once per
 * option looked at — and a reader who does hit it gets the ordinary «that didn't go through».
 *
 * Not a Server Action — no `'use server'` — so the browser cannot call it: a helper the five
 * call, answering a boolean rather than a result for a screen.
 */

import { currentUser } from '@/lib/auth/session'
import { checkRateLimit } from '@/lib/rateLimit'

const LIMIT = 60
const WINDOW_MS = 10 * 60 * 1000

/** `true` with no session: each caller refuses that case in its own words. */
export async function paddleCallAllowed(): Promise<boolean> {
  const user = await currentUser()
  if (user === null) return true
  return checkRateLimit(`paddle:${user.email}`, LIMIT, WINDOW_MS)
}
