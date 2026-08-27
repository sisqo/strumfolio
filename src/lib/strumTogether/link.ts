/**
 * The link a guest's device opens to follow a Strum Together broadcast.
 *
 * A plain function rather than a constant: `window` does not exist on the server, and a
 * function's body is not evaluated until something calls it, which every caller here only
 * does once safely on the client. Kept out of `strumTogether/session.ts` because that module is
 * `'use server'`, which only accepts async server actions — this is neither.
 */
export function followUrl(token: string): string {
  return `${window.location.origin}/follow/${token}`
}
