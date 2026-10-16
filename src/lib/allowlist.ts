/**
 * Who may sign in.
 *
 * Having a valid Google account is not enough: the gate exists because the
 * repertoire is copyrighted material, so membership is an explicit list.
 *
 * `ALLOWED_EMAILS` holds the **global owners**: set in the environment, readable only
 * by the server, and not removable from inside the app — which is what makes locking
 * yourself out impossible, and what keeps a database the app cannot reach from
 * shutting an owner out of it. Nobody else can be admitted from here any more (v3.1):
 * an address that is not a global owner gets in by already having a row in `accounts`
 * — created for it by a global owner, or by its own first sign-in as one — which is
 * `isAdmitted` in `lib/roles.ts`'s question to answer, not this file's. There is no
 * second table of admitted outsiders any more; an account is an address and an
 * address is an account.
 *
 * `isOwner` here answers only the first half. It is called from both places that ask
 * the full question — the sign-in callback and the guard in front of every write —
 * alongside `isAdmitted`'s own second half, so that neither ever drifts from the
 * other and ends up with two different answers to "may this person be here".
 */

/** One address as it is compared: trimmed and lowercased, since nobody types it twice the same. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function parseAllowlist(raw: string | undefined | null): string[] {
  return (raw ?? '')
    .split(',')
    .map(normalizeEmail)
    .filter((email) => email !== '')
}

/**
 * Enough of an address to be worth storing.
 *
 * Deliberately loose: the real check is Google's, which will not hand us a profile
 * for an address that does not exist. This only catches the slip — a name, a missing
 * domain, a pasted line of text — before it becomes a row that silently admits nobody.
 */
export function isEmailShape(email: string): boolean {
  const address = normalizeEmail(email)
  /* 254 is the longest address SMTP carries, and the length is checked before the pattern: its
     backtracking is quadratic on `a@` followed by dots, and `/login?…&email=` reaches it from a
     plain GET (28k characters cost half a second, measured 2026-10-16). */
  if (address.length > EMAIL_MAX) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)
}

const EMAIL_MAX = 254

/** Whether this address is one of the owners, who cannot be removed from inside the app. */
export function isOwner(email: string | null | undefined, raw: string | undefined | null): boolean {
  if (!email) return false
  return parseAllowlist(raw).includes(normalizeEmail(email))
}
