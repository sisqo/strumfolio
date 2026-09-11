/**
 * The text of a "new registration" Telegram notice: the address that registered, and the name
 * when one is known.
 *
 * **It carries personal data on purpose, and that is a decision with a cost attached.** From
 * 2026-09-03 to 2026-09-11 this function took no parameters and named nobody — it printed only
 * that a registration had happened, plus a link to `/accounts` where the identity sat behind a
 * sign-in. The reasoning then was that the identity was never what the ping was for, and that
 * naming it forced the Privacy Policy to list Telegram FZ-LLC — established outside the EEA,
 * with none of the Chapter V safeguards on offer — as a processor of an email address and a
 * name. That reasoning was sound and was overruled deliberately: the notice is read on a phone,
 * away from a browser that is signed in, and «something happened, go and look» is not worth a
 * notification.
 *
 * **So the Privacy Policy had to move with it, and the two must never drift apart again.** §7's
 * international-transfer paragraph said in published text that these notifications «carry no
 * personal data, so Telegram processes none of yours», which this line makes false; §3's
 * recipients table named Telegram for operational notifications with no personal data in them.
 * Both now say what this function actually sends. Change this text and those two are wrong —
 * the rule the booklet override and the install row already live under.
 *
 * **The link is gone, and that is the other half of the request.** It pointed at
 * `/accounts?sort=createdAt&dir=desc`, which is exactly the trip the address in the message
 * saves.
 *
 * Still a function in its own file with a test, for a reason that survived the reversal: three
 * places send this notice (`auth.ts`, `verify/actions.ts`, `accounts/actions.ts`), and one text
 * they all share is what stops three spellings of the same message drifting apart. The
 * parameter it takes is the very object each of them already builds for `provisionAccount`, so
 * no caller has to assemble a name of its own.
 */

/** A name is either fully known or not known at all — `provisionAccount` takes it the same way. */
export interface RegisteredName {
  firstName: string
  lastName: string
}

export function registrationNotice(email: string, name?: RegisteredName): string {
  const full = name === undefined ? '' : `${name.firstName} ${name.lastName}`.trim()

  /* An empty or blank name reads as no name rather than as a stray separator: `register()`
     trims and requires both halves, but a row pending across the deploy that added those
     columns can still carry nulls, and the operator path fills them from the same row. */
  return full === '' ? `🆕 Nuova registrazione — ${email}` : `🆕 Nuova registrazione — ${full} (${email})`
}
