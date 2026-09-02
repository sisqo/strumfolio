/**
 * The text of a "new registration" Telegram notice — and, since 2026-09-03, nothing in it
 * that names the person. It used to print the full name and the email address, and the
 * Privacy Policy then had to list Telegram (Telegram FZ-LLC, established outside the EEA,
 * with none of the Chapter V safeguards on offer) as a processor of exactly those two
 * fields, for a message whose only job is to say that *something* happened. The identity
 * was never what the ping was for: `/accounts`, sorted newest first, is the link below and
 * shows it behind a sign-in. The same rule now holds for every other `notifyTelegram` call
 * (`plans/checkout.ts`, `feedback/actions.ts`): the event and, where it helps, the plan or
 * the amount — never an address, a name, or a reader's own words.
 *
 * Still a function in its own file, with a test, rather than a string at the call sites:
 * three places send this notice (`auth.ts`, `verify/actions.ts`, `accounts/actions.ts`),
 * and the guarantee worth pinning is that none of them can put personal data back in by
 * accident — a function with no parameters cannot be handed an email.
 */

import { SITE_URL } from '@/lib/brand'

export function registrationNotice(): string {
  return `🆕 Nuova registrazione — https://${SITE_URL}/accounts?sort=createdAt&dir=desc`
}
