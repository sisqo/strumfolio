'use client'

import { useRole } from '@/components/RoleProvider'
import { switchAccount } from '@/lib/accounts/actions'
import { avatarInitials } from '@/lib/avatar'
import { useOnline } from '@/lib/useOnline'

/**
 * The impersonated account's monogram, shown in `TopBar` right next to the reader's own
 * `.avatar-button` — only for a global owner switched into another account's view
 * (`AdminPanel`'s own Switch control) — the one case `RoleProvider`'s `accountOwnerEmail`
 * and `email` can differ at all (`mayAccess`, `accounts/current.ts` grants that to nobody
 * else). Without this, an owner testing inside a customer's account sees their own email
 * in `UserMenu` sitting right beside that customer's plan badge and repertoire, with
 * nothing on screen saying whose it actually is — and, before this component doubled as
 * an exit control (PLAN-viewing-as-exit.md), no faster way back than navigating to
 * `/accounts/<own email>` and clicking "Enter as this account" there again.
 *
 * A `<form>` bound to `switchAccount` rather than a plain `onClick` calling it directly:
 * `switchAccount` ends in `redirect('/')`, and `redirect()` thrown across the client/server
 * boundary from a server action invoked as a bare function is not something to lean on
 * (`forgotPassword/actions.ts`'s own comment on that exact pitfall) — a `<form action>` is
 * the path Next actually supports a redirecting action over, the same one
 * `EnterAccountForm` (`accounts/[email]/page.tsx`) already uses for the mirror action,
 * entering an account. `switchAccount.bind(null, email)` is that same form-action shape,
 * just bound to the signed-in reader's own address instead of a route param — the form
 * still calls it with an implicit `FormData` argument on submit, which it already ignores
 * the same way `EnterAccountForm`'s own bound action does.
 *
 * The confirm step is deliberate, not the app's usual "reversible things need no dialog"
 * default (`SuspendAccountButton`'s own comment argues that side): this sits in a crowded
 * corner of a bar rendered on every screen, and an accidental tap would drop the
 * impersonated view with no warning. `onSubmit`, not the click itself, is what a native
 * `window.confirm()` can actually gate — cancelling it calls `preventDefault` before the
 * action ever runs.
 *
 * `'use client'`, reading `useRole()` the same way `AdminPanel`/`UserMenu` already do —
 * deliberately not something `TopBar` itself resolves server-side: see that component's own
 * comment on why calling `auth()`/`cookies()` there would opt every page that renders it out
 * of static generation.
 */
export function ViewingAsPill() {
  const { known, email, accountOwnerEmail } = useRole()
  const online = useOnline()
  if (!known || email === null || accountOwnerEmail === null || email === accountOwnerEmail) return null

  const exit = switchAccount.bind(null, email)

  return (
    <form
      action={exit}
      onSubmit={(event) => {
        if (!window.confirm(`Exit ${accountOwnerEmail}'s account and return to your own?`)) {
          event.preventDefault()
        }
      }}
    >
      <button
        type="submit"
        className="viewing-as-avatar"
        disabled={!online}
        title={`Viewing ${accountOwnerEmail} — click to exit to admin`}
        aria-label={`Exit ${accountOwnerEmail}'s account and return to your own`}
      >
        {avatarInitials(accountOwnerEmail)}
      </button>
    </form>
  )
}
