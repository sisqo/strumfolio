/**
 * Whether a session has been revoked — the pure half of «a password change closes every other
 * session». The cookie is a ninety-day JWT that carries the address and, since 2026-09-25, the
 * moment of its sign-in (`signedInAt`, milliseconds); the account row carries
 * `sessions_valid_after`. A session older than that moment is not believed.
 *
 * **A token with no `signedInAt` counts as older than anything**, which is what a token issued
 * before the claim existed is: it survives until the first revocation on its account and not
 * past it. `null` on the row revokes nothing, so the migration disconnected nobody.
 */
export function sessionRevoked(signedInAt: unknown, validAfter: Date | null): boolean {
  if (validAfter === null) return false
  const issued = typeof signedInAt === 'number' && Number.isFinite(signedInAt) ? signedInAt : 0
  return issued < validAfter.getTime()
}
