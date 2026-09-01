'use client'

import { type ReactNode, useState } from 'react'

import { useRole } from '@/components/RoleProvider'
import { switchAccount } from '@/lib/accounts/actions'
import { useOnline } from '@/lib/useOnline'

/**
 * Switches which account is on screen, in either direction — entering another account
 * (`EnterAccountForm`'s replacement on `/accounts/[email]`) and exiting back to one's own
 * (`ViewingAsPill`) are the same three steps with a different `targetEmail`: write the
 * cookie, refresh `RoleProvider`'s identity, then go home.
 *
 * Deliberately not a `<form action={switchAccount.bind(null, targetEmail)}>` the way this
 * used to be written, even though `switchAccount` itself still runs on the server: a form
 * action's own redirect (which is where this used to send `/` from) leaves no point for
 * this component to run anything once it settles, refreshing identity included — the same
 * reason `switchAccount`'s own comment gives for not calling `redirect()` itself any more.
 * Calling it as a plain awaited function and doing the navigation here instead is what
 * makes `refresh()` (below) reachable at all.
 *
 * `window.location.assign('/')`, not `next/navigation`'s `router.push`/`router.refresh` —
 * tried first and found wanting: the account cookie changes, but `/` reads it inside a
 * Server Component, and the client Router Cache can still hand back whatever `/` last
 * rendered under the *previous* cookie regardless of which order `push`/`refresh` run in
 * (both orders were tried against a real switch and both still showed the account being
 * left, not the one being entered). Nothing in this app's public API invalidates another
 * route's cache entry from outside it. A real navigation sidesteps the question entirely
 * — the browser makes a fresh request, past the client-side cache altogether, the same
 * as the "close the app, reopen it" workaround this exists to remove.
 */
export function SwitchAccountButton({
  targetEmail,
  className,
  title,
  ariaLabel,
  confirmMessage,
  children,
}: {
  targetEmail: string
  className?: string
  title?: string
  ariaLabel?: string
  /** Asked via `window.confirm()` before switching, when set. Omit for no confirmation. */
  confirmMessage?: string
  children: ReactNode
}) {
  const online = useOnline()
  const { refresh } = useRole()
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (confirmMessage !== undefined && !window.confirm(confirmMessage)) return

    setBusy(true)
    try {
      await switchAccount(targetEmail)
      // Doubles as an ordering barrier, not only a badge update: it is a second
      // server round-trip, so awaiting it before navigating also guarantees the new
      // cookie has actually landed before the hard reload below reads it — the
      // navigation would reload this provider from scratch either way, but not
      // necessarily *after* the cookie write without this in between.
      await refresh()
      window.location.assign('/')
      // No `finally` resetting `busy`: the assignment above tears this page down:
      // only a failed request before it ever leaves needs the button clickable again.
    } catch {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className={className}
      disabled={!online || busy}
      title={title}
      aria-label={ariaLabel}
      onClick={() => void run()}
    >
      {children}
    </button>
  )
}
