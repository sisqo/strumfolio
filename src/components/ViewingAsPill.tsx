'use client'

import { SwitchAccountButton } from '@/components/SwitchAccountButton'
import { useRole } from '@/components/RoleProvider'
import { avatarInitials } from '@/lib/avatar'

/**
 * The impersonated account's monogram, shown in `TopBar` right next to the reader's own
 * `.avatar-button` — only for a global owner switched into another account's view
 * (`AdminPanel`'s own Switch control) — the one case `RoleProvider`'s `accountOwnerEmail`
 * and `email` can differ at all (`mayAccess`, `accounts/current.ts` grants that to nobody
 * else). Without this, an owner testing inside a customer's account sees their own email
 * in `UserMenu` sitting right beside that customer's plan badge and repertoire, with
 * nothing on screen saying whose it actually is — and, before this component doubled as
 * an exit control, no faster way back than navigating to
 * `/accounts/<own email>` and clicking "Enter as this account" there again.
 *
 * `SwitchAccountButton` does the actual switch — this only supplies the target (the
 * reader's own address, to exit back to), the monogram, and the one thing specific to
 * this direction: a confirm step, deliberate rather than the app's usual "reversible
 * things need no dialog" default (`SuspendAccountButton`'s own comment argues that side).
 * This sits in a crowded corner of a bar rendered on every screen, and an accidental tap
 * would drop the impersonated view with no warning.
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
    <SwitchAccountButton
      targetEmail={email}
      className="viewing-as-avatar"
      title={`Viewing ${accountOwnerEmail} — click to exit to admin`}
      ariaLabel={`Exit ${accountOwnerEmail}'s account and return to your own`}
      confirmMessage={`Exit ${accountOwnerEmail}'s account and return to your own?`}
    >
      {avatarInitials(accountOwnerEmail)}
    </SwitchAccountButton>
  )
}
