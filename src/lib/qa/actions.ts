'use server'

/**
 * Creating a verified account and signing in as it, with no password typed and no email sent —
 * the whole of what `/qa` does.
 *
 * **Both guards are on this file's own first lines, not only on the page.** A Server Action is
 * addressable by its action id over `POST` whatever the page that declares it renders, so a
 * `notFound()` in `app/qa/page.tsx` would hide the form in production and leave a live
 * passwordless sign-in behind it. The page's check is for the reader; these two are the
 * security boundary, and they are the ones `qa/entry.test.ts` covers.
 *
 * **What «already verified» means here**, and why one insert is the whole of it: a `credentials`
 * row only ever exists for an address that has been through `/verify` (`auth.ts`'s own comment
 * on the credentials provider), so there is no separate verified flag to set — writing the row
 * *is* the verification, and it is what lets the ordinary sign-in form be exercised by hand
 * afterwards with `QA_PASSWORD`.
 *
 * **Nothing is emailed and nothing is announced.** This path never runs through `auth.ts`'s
 * `signIn` callback — like `/verify`, it mints the cookie itself — so no welcome email and no
 * Telegram «New registration» notice fire, which is the behaviour a test account wants. A later
 * manual sign-in through `/login` will not fire them either: `provisionAccount` finds the row
 * and answers false, and both are gated on that boolean.
 */

import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { ACCOUNT_COOKIE, SCOPE_COOKIE } from '@/lib/accounts/scope'
import { markTestAccount } from '@/lib/accounts/markTest'
import { provisionAccount } from '@/lib/accounts/provision'
import { normalizeEmail } from '@/lib/allowlist'
import { writePasswordHash } from '@/lib/auth/credentials'
import { splitName } from '@/lib/auth/nameSplit'
import { hashPassword } from '@/lib/auth/password'
import { issueSessionCookie } from '@/lib/auth/session'
import { hasDatabase } from '@/lib/db/client'
import { QA_PASSWORD, isQaEmail, qaEmailFrom, qaEntryEnabled } from './entry'

/** The name a QA account gets when nobody typed one. */
const DEFAULT_NAME = 'QA Tester'

/**
 * The single way in: provision, verify, sign in. Every exported action below funnels through it
 * so the two guards are written once.
 *
 * Idempotent on an address that already exists, which is what makes «sign in as» and «create»
 * the same function: `provisionAccount` answers false and changes nothing, and the password is
 * rewritten to the documented one — so a QA account whose password somebody changed while
 * testing `/profile` is still enterable from here.
 */
async function enter(email: string, name: string): Promise<void> {
  if (!qaEntryEnabled()) {
    console.warn('QA entry refused: not a development or preview deployment')
    return
  }

  const normalized = normalizeEmail(email)
  if (!isQaEmail(normalized)) {
    console.warn('QA entry refused: address outside the QA namespace')
    return
  }

  if (!hasDatabase) return

  try {
    /* `splitName` answers `{firstName: '', lastName: ''}` for a single word as much as for
       nothing at all, and empty strings written into the row would block `provisionAccount`'s
       own opportunistic fill for ever — so anything that does not split into two parts falls
       back to the default rather than being half-written. */
    const typed = name.trim()
    const split = splitName(typed === '' ? DEFAULT_NAME : typed)
    const named = split.firstName !== '' && split.lastName !== '' ? split : splitName(DEFAULT_NAME)

    await provisionAccount(normalized, named)
    /* Always a test account: `isQaEmail` has just said the address belongs to nobody. */
    await markTestAccount(normalized)
    await writePasswordHash(normalized, await hashPassword(QA_PASSWORD))
  } catch (error) {
    console.error('QA entry failed', error)
    return
  }

  /*
   * The account cookie has to go, and this is not tidiness. `currentAccountFor` falls back to
   * the reader's own account when the cookie names one they may not open — which self-heals for
   * an ordinary QA account, and does **not** for one whose address somebody has put in
   * `ALLOWED_EMAILS`: a global owner may open anybody's account, so a cookie left over from the
   * previous QA session would land the new one inside the old account with everything looking
   * perfectly normal. `songbook-scope` goes with it so the browser's caches are re-tagged;
   * `middleware.ts` writes it again on the next signed-in request.
   */
  const jar = await cookies()
  jar.delete(ACCOUNT_COOKIE)
  jar.delete(SCOPE_COOKIE)

  await issueSessionCookie(normalized)
}

/**
 * A brand-new tester: a random address in the QA namespace, an account, the example songbook
 * `provisionAccount` seeds, and a session.
 *
 * Random rather than sequential because there is no counter to trust — the preview, the dev
 * database and a local run are three different sets of accounts — and six hex characters is
 * plenty for a namespace nobody is racing to fill.
 *
 * `redirect` after the try, never inside one: it reports success by throwing.
 */
export async function createQaUser(formData: FormData): Promise<void> {
  const email = qaEmailFrom(randomBytes(3).toString('hex'))
  if (email === null) return

  await enter(email, String(formData.get('name') ?? ''))
  redirect('/')
}

/**
 * Back into a QA account that already exists — after a purchase, to look at what the webhook
 * wrote, or simply to stop making new ones.
 *
 * Bound in the page (`enterAsQaUser.bind(null, account.email)`), the shape `/verify` uses. The
 * address is still put through `isQaEmail` inside `enter`: a bound argument is signed by Next
 * but it is not a permission, and this file's guards do not depend on where the value came from.
 */
export async function enterAsQaUser(email: string, formData: FormData): Promise<void> {
  await enter(email, String(formData.get('name') ?? ''))
  redirect('/')
}
