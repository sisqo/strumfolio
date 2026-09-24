import { isQaEmail } from '@/lib/qa/entry'

/**
 * Whether a courtesy email may go to this address from this deployment.
 *
 * **Anywhere but production, only to a QA address.** The local database is the 2026-08-29 copy
 * of production — real people's addresses — and `.env.local` holds a real Resend key, so an
 * operator trying the dialog on `npm run dev` sent a named, personal email to a customer. Its
 * unsubscribe link was built from that request's own origin, so it pointed at `localhost` too:
 * one message wrong twice over. `VERCEL_ENV` and not `NODE_ENV`, for `qaAllowed`'s reason.
 */
export function courtesySendable(vercelEnv: string | undefined | null, email: string): boolean {
  return vercelEnv === 'production' || isQaEmail(email)
}
