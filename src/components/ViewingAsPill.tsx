'use client'

import { useRole } from '@/components/RoleProvider'

/**
 * "Viewing: ‹owner email›", shown in `TopBar` only for a global owner switched into another
 * account's view (`AdminPanel`'s own Switch control) — the one case `RoleProvider`'s
 * `accountOwnerEmail` and `email` can differ at all (`mayAccess`, `accounts/current.ts`
 * grants that to nobody else). Without this, an owner testing inside a customer's account
 * sees their own email in `UserMenu` sitting right beside that customer's plan badge and
 * repertoire, with nothing on screen saying whose it actually is.
 *
 * `'use client'`, reading `useRole()` the same way `AdminPanel`/`UserMenu` already do —
 * deliberately not something `TopBar` itself resolves server-side: see that component's own
 * comment on why calling `auth()`/`cookies()` there would opt every page that renders it out
 * of static generation.
 */
export function ViewingAsPill() {
  const { known, email, accountOwnerEmail } = useRole()
  if (!known || email === null || accountOwnerEmail === null || email === accountOwnerEmail) return null

  return (
    <span className="viewing-as-pill" title={`Viewing ${accountOwnerEmail}'s account`}>
      Viewing: {accountOwnerEmail}
    </span>
  )
}
