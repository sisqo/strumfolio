'use server'

import { cookies } from 'next/headers'

import { ATTRIBUTION_COOKIE, decodeAttribution } from '@/lib/attribution/touch'

import { consentDecisionForRequest } from './server'
import { gclidOf } from './state'

/**
 * The gclid this browser arrived with, for the tag to pick up after a «yes» given on a later
 * page than the landing one — or null.
 *
 * **Answers only when the tag may already run for this request**, read from the request's own
 * consent cookie rather than from anything the caller says: `songbook-attribution` is
 * `httpOnly` and on legitimate interest, and this is the one door through which its content
 * reaches Google, so the door opens only on the consent the Cookie Policy promises it waits for.
 * Nothing else in that cookie ever leaves: no campaign labels, no referrer, no landing page.
 */
export async function acceptedClickId(): Promise<string | null> {
  if (!(await consentDecisionForRequest()).load) return null
  const jar = await cookies()
  return gclidOf(decodeAttribution(jar.get(ATTRIBUTION_COOKIE)?.value))
}
