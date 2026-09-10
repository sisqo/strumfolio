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
   * It exists for the emails that travel the other way — feedback arriving in the support
   * inbox — where the address worth answering is the reader's own and cannot be the `from`,
   * since that has to stay the verified sending domain.
   *
   * **Unset for the emails that carry a link and nothing else**: `no-reply@` is the honest
   * sender for a verification or a password reset, and inviting a reply to one of those
   * invites an answer to a robot. The gift notice is the exception and the reason this
   * sentence is no longer "unset for everything going to a customer" — it is written to be
   * answered, a thank-you or a question about what has just been opened, and `info@` is
   * genuinely read: ImprovMX forwards it and it is replied to from Gmail (see the root
   * `CLAUDE.md`). The test of whether a reply-to belongs on a message is whether somebody
   * would read the reply, not which direction the message travels.
   */
  replyTo?: string
  /**
   * A screenshot riding along with feedback — the one caller that needs this. Added here
   * rather than built as a second send function, additive-only, so the other callers stay
   * untouched: `content` is a base64 string, the shape `feedback/actions.ts` already has one
   * in from the browser's `FileReader`, never a `Buffer` this app would have to build.
   */
  attachments?: { filename: string; content: string }[]
}

/**
 * Whether the message was handed to Resend, and what went wrong when it was not.
 *
 * `reason` is meant to be *stored*, not only logged — see `deliverEmail` — so it is a
 * sentence and never an object: the one caller that keeps it writes it into a column an
 * operator reads at a glance.
 */
export type EmailOutcome = { ok: true } | { ok: false; reason: string }

/**
 * The same send as `sendEmail`, reporting what happened.
 *
 * Added for the gift notice, which claims a row in `outreach_actions` *before* it sends and
 * has to settle that row as `done` or `failed` afterwards — a question `sendEmail` cannot
 * answer, because it deliberately swallows both the API's error and its own. Written as the
 * implementation of both rather than beside it, so the fallback log, the `from` and the error
 * handling cannot come to differ between the two.
 *
 * **No key configured is reported `ok`**, not as a failure: that is local development, where
 * the fallback log *is* the delivery (see this file's header). A caller storing the outcome
 * therefore records «sent» on a machine with no Resend account, which is the honest reading of
 * a message that reached everything this installation has to reach.
 */
export async function deliverEmail(message: EmailMessage): Promise<EmailOutcome> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log(`[email] ${message.subject} → ${message.to}\n${message.text}`)
    return { ok: true }
  }

  try {
    const { error } = await new Resend(apiKey).emails.send({ from: FROM_ADDRESS, ...message })
    if (error) {
      console.error('sendEmail failed', error)
      return { ok: false, reason: `${error.name}: ${error.message}` }
    }
    return { ok: true }
  } catch (error) {
    console.error('sendEmail failed', error)
    return { ok: false, reason: error instanceof Error ? error.message : 'The send threw.' }
  }
}

/**
 * Never throws: a registration or a password reset has already written what it needed to
 * the database by the time this is called, and a failed or skipped email must not undo
 * that or fail the action it was a side effect of.
 *
 * Which is also why this one still answers nothing at all. Its five callers have no branch to
 * take on a failure — the account exists, the token is stored, the plan is changed — and a
 * result none of them can act on is a result each of them would have to ignore explicitly.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  await deliverEmail(message)
}
