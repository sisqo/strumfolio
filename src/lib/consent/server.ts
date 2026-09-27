/**
 * The consent decision as the server sees it, from the request's own cookies — for the two
 * places that act on it without a browser in the loop: the gclid handed back after a late
 * «yes», and the signup conversion cookie written on the request that creates an account.
 *
 * Not a `'use server'` module: `markSignupConversion` is called from inside other server code,
 * and must never be an endpoint a browser can call to set the cookie for itself.
 */

import { cookies } from 'next/headers'

import { parseRegion } from './region'
import { adsConfig, decideConsent, parseConsent, type ConsentDecision } from './state'
import {
  CONSENT_COOKIE,
  REGION_COOKIE,
  SIGNUP_CONVERSION_COOKIE,
  SIGNUP_CONVERSION_MAX_AGE_SECONDS,
} from './types'

export async function consentDecisionForRequest(): Promise<ConsentDecision> {
  const jar = await cookies()
  return decideConsent({
    configured: adsConfig() !== null,
    choice: parseConsent(jar.get(CONSENT_COOKIE)?.value, Date.now()),
    region: parseRegion(jar.get(REGION_COOKIE)?.value),
  })
}

/**
 * Leave the one-shot cookie `ConsentManager` turns into a signup conversion on the next page —
 * **only when the tag may run for this browser**, since the cookie exists for Google Ads alone
 * and writing it before a «yes» would be the very thing the banner asks permission for.
 *
 * Swallows its own failures, the standing rule for bookkeeping on a sign-up path: an account is
 * created whether or not this can be written. A verification link opened on another device
 * carries no consent cookie, so that conversion is lost — knowingly.
 */
export async function markSignupConversion(): Promise<void> {
  try {
    if (!(await consentDecisionForRequest()).load) return
    const jar = await cookies()
    jar.set(SIGNUP_CONVERSION_COOKIE, '1', {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SIGNUP_CONVERSION_MAX_AGE_SECONDS,
    })
  } catch (error) {
    console.error('[consent] could not mark the signup conversion', error)
  }
}
