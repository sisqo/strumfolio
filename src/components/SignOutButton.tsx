import { cookies } from 'next/headers'

import { signOut } from '@/auth'

import { SCOPE_COOKIE } from '@/lib/accounts/scope'
import { IconExit } from '@/components/icons'

/**
 * The control that actually signs the reader out — now the confirming button *inside*
 * `UserMenu`'s sign-out dialog rather than a row in the menu itself. The row that opens the
 * dialog is a plain client button in that file; this is what the reader presses once they
 * have said yes.
 *
 * **It stays a `<form>` posting to a Server Action, and `redirectTo` stays `/login`.** Both
 * are load-bearing rather than stylistic: see `middleware.ts` on why signing out is a real
 * POST whose response has to reach the browser with the session cookie deleted and nothing
 * re-signing it. Turning this into an `onClick` that calls a client-side `signOut()` — or
 * moving the button out of the form to style it — would reopen a bug that took three wrong
 * diagnoses to find.
 *
 * A server component wrapping an inline server action, which is why it reaches the menu as
 * `children` instead of being imported there; `UserMenu`'s own header has the rest of that.
 */
export function SignOutButton() {
  return (
    <form
      action={async () => {
        'use server'
        /*
         * Drop the account-scope cookie first, so the `/login` page this lands on can tell a
         * reader who has just signed out from one who is signed in and merely looking at it —
         * `StorageCleanup` empties this device's caches on exactly that signal. A server
         * action may write cookies, so this costs the form nothing: it is still a real POST
         * whose response deletes the session cookie, which is the part `middleware.ts` took
         * three wrong diagnoses to get right and which nothing here touches.
         */
        ;(await cookies()).delete(SCOPE_COOKIE)
        await signOut({ redirectTo: '/login' })
      }}
    >
      <button type="submit" className="btn btn-primary btn-sm">
        <IconExit size={16} />
        Sign out
      </button>
    </form>
  )
}
