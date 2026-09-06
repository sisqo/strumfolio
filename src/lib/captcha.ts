/**
 * Cloudflare Turnstile, verified with one HTTP request — no SDK, the same reasoning as
 * the rest of this app's dependency choices (v3.2): a POST and a JSON
 * reply is the entire client this needs.
 *
 * `TURNSTILE_SECRET_KEY` absent means local development, where registration and
 * password recovery still have to work end to end without a Cloudflare account —
 * same dev-friendly fallback as `sendEmail` with no Resend key configured
 * (`lib/email/send.ts`): nothing configured, nothing blocks.
 *
 * That fallback only holds while the key is missing entirely. Once it *is* configured,
 * a failed verification or a network error must never read as "fine" — the opposite of
 * the missing-key case, so the two failure modes return opposite defaults on purpose.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

interface SiteverifyResponse {
  success: boolean
  'error-codes'?: string[]
}

export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp: string | null | undefined,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true

  if (!token) return false

  const body = new URLSearchParams({ secret, response: token })
  if (remoteIp) body.set('remoteip', remoteIp)

  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    const result = (await response.json()) as Partial<SiteverifyResponse>
    // Cloudflare's own reason for a `false` that is not an exception — a client-side
    // "Success" only means the challenge was solved, not that this call will accept it
    // (a reused or expired token fails here even though the widget already showed its
    // checkmark), so this is what tells the two apart when someone reports one.
    if (result.success !== true) console.error('verifyTurnstile rejected', result['error-codes'])
    return result.success === true
  } catch (error) {
    console.error('verifyTurnstile failed', error)
    return false
  }
}
