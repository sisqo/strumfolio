/**
 * Sending real email, or not — same shape as `hasDatabase` in `db/client.ts`: a thin
 * wrapper that does nothing when the service behind it is not configured, rather than a
 * mock or a second code path. `RESEND_API_KEY` absent means local development, where
 * registration, verification and password reset all still have to be provable end to
 * end — so the fallback logs the whole message, link included, not just who it was for.
 *
 * The SDK is stateless over `fetch` (no pool, no connection to keep open), so unlike
 * `db()` there is nothing worth caching — a new `Resend` instance per call costs nothing.
 */

import { Resend } from 'resend'

/**
 * An env var, not a bare constant, so the verified sending domain can move without a
 * deploy (see CLAUDE.md's domain-move checklist) — but the default is the real address,
 * since there is exactly one of these per installation and it costs nothing for local dev
 * or the current deployment to leave unset.
 */
const FROM_ADDRESS = process.env.RESEND_FROM ?? 'Strumfolio <no-reply@strumfolio.com>'

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
  /**
   * Who a reply should go to, when that is not `FROM_ADDRESS`.
   *
   * Unset for the four emails that go *to* a customer: `no-reply@` is the honest sender for
   * a verification link, and pointing a reply somewhere else would invite an answer nobody
   * reads. It exists for the one email that travels the other way — a feature request
   * arriving in the support inbox — where the address worth answering is the reader's own
   * and cannot be the `from`, since that has to stay the verified sending domain.
   */
  replyTo?: string
}

/**
 * Never throws: a registration or a password reset has already written what it needed to
 * the database by the time this is called, and a failed or skipped email must not undo
 * that or fail the action it was a side effect of.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log(`[email] ${message.subject} → ${message.to}\n${message.text}`)
    return
  }

  try {
    const { error } = await new Resend(apiKey).emails.send({ from: FROM_ADDRESS, ...message })
    if (error) console.error('sendEmail failed', error)
  } catch (error) {
    console.error('sendEmail failed', error)
  }
}
