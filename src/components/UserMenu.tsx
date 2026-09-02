'use client'

import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import { useEffect, useState } from 'react'

import { NewsletterPrefs } from '@/components/NewsletterPrefs'
import { NotationPicker } from '@/components/NotationPicker'
import { useRole } from '@/components/RoleProvider'
import { ThemePicker } from '@/components/ThemePicker'
import {
  IconChevronLeft,
  IconChevronRight,
  IconKey,
  IconReceipt,
  IconSettings,
  IconTrash,
  IconUser,
} from '@/components/icons'
import { deleteMyAccount } from '@/lib/accounts/actions'
import { SELF_DELETE_MESSAGE } from '@/lib/accounts/types'
import { avatarColorIndex, avatarInitials } from '@/lib/avatar'
import { PLAN_LABEL } from '@/lib/plans/types'

/**
 * The reader's own identity, next to the hamburger (v3.3) — who is signed in, and
 * everything that is about *being this particular reader* rather than about
 * navigating the app: change password, sign out, and — since Settings moved here
 * too — the reading and app preferences that used to sit behind the hamburger's own
 * Settings screen. The hamburger (`NavMenu`) is left holding only navigation between
 * sections of the app; this holds identity (email, plan), signing in/out, and now the
 * reader's own preferences, with nothing duplicated between the two.
 *
 * **Identical for every reader, a global owner included.** This panel used to carry an
 * "Owner" badge beside the plan, which made it the one place the user menu was a different
 * shape for one person; running the installation is not a fact about being this reader, and
 * it lives behind the hamburger's own Admin entry instead (`AdminPanel`). That an owner is
 * an owner is still visible — they are the only one who sees that entry at all. Delete
 * account nests one level under Settings rather than sitting beside the preference
 * pickers: it is a consequence of the account — leaving altogether — not a preference to
 * set.
 *
 * **Billing sits on the main panel, beside Change password**, and used to nest under Settings
 * with Delete account for the reasoning above. Moved deliberately: that placement was decided
 * while billing was a marginal test screen, and it stopped being true once purchases became a
 * real flow with a thank-you page and a confirmation email that links straight to `/billing`.
 * A destination a customer is *sent to by email* cannot be two taps deep behind a submenu
 * shared with the reading preferences — and the plan badge a few lines below, which says which
 * plan they are on, now has the way to act on it in the same panel rather than one level away.
 * It stays a link out rather than becoming an inline picker for the same reason Change password
 * is one: what it opens is a screen's worth of content.
 *
 * The avatar reads the email, not the Google profile, even though a Google sign-in
 * carries a name and a picture this app could ask for: a credentials account
 * (v3.2) has neither, and an avatar that looks like a photo for some readers and a
 * monogram for others would read as two different features rather than one. The
 * email is the one identity fact every reader has, whichever way they signed in.
 *
 * Hidden entirely until the identity is known, the same rule the hamburger's Admin entry
 * follows: a control that flashes in a moment late is a control that was simply not
 * there yet, not one that has already been reached for.
 *
 * Sign-out arrives as `children`, not an import: it is a server component
 * wrapping an inline server action, and this is a client component — Next.js
 * refuses to bundle the two directly together, the same reason `NavMenu` used to
 * take it this way before sign-out moved here (see its own history).
 */
export function UserMenu({ children }: { children: React.ReactNode }) {
  const { email, known, plan, firstName } = useRole()
  const [open, setOpen] = useState(false)
  /**
   * A second screen inside this same panel, the same pattern this file already used
   * for "delete" and now also holds Settings — and Settings itself nests one further
   * screen inside it (delete), since leaving is reached through preferences rather
   * than sitting next to them.
   */
  const [view, setView] = useState<'main' | 'settings' | 'delete'>('main')

  const close = () => {
    setOpen(false)
    setView('main')
  }

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // One level at a time — main → settings → delete is two steps deep now, and
      // Escape should retrace it the same way the back-row buttons do, not jump
      // straight to main from delete.
      if (view === 'delete') setView('settings')
      else if (view === 'settings') setView('main')
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, view])

  /*
   * A same-sized placeholder rather than nothing: `NavMenu` beside this renders on
   * first paint, so an outright `null` here means the hamburger sits alone and then
   * jumps left the moment identity resolves — one more piece of the "loads in
   * pieces" feeling this bar should not have. The control itself still waits for
   * `known` (this file's own top comment on why), only its footprint appears early.
   */
  if (!known || email === null) {
    return <span className="skeleton avatar-button rounded-[var(--r-pill)]" aria-hidden />
  }

  const initials = avatarInitials(email)
  const colorIndex = avatarColorIndex(email)

  return (
    <div className="menu">
      <button
        type="button"
        className="avatar-button"
        style={{ background: `var(--avatar-${colorIndex})` }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? 'Close your account menu' : 'Open your account menu'}
        onClick={() => setOpen((value) => !value)}
      >
        {initials}
      </button>

      {open && (
        <>
          {/* Catches the tap that means "never mind". */}
          <div className="menu-overlay" onClick={close} aria-hidden />

          <div className="menu-panel" role="menu">
            {view === 'main' && (
              <>
                <div className="user-menu-header">
                  <span className="avatar avatar-lg" style={{ background: `var(--avatar-${colorIndex})` }}>
                    {initials}
                  </span>
                  <div className="user-menu-identity">
                    {/*
                     * Only when known and non-empty — nothing shown at all otherwise, the
                     * same "no change until it's there" rule `PLAN-account-name.md` settled
                     * on: an account with no name yet must look exactly as it does today.
                     */}
                    {firstName !== null && firstName !== '' && (
                      <span className="user-menu-greeting">Hi, {firstName}</span>
                    )}
                    <span className="user-menu-email">{email}</span>
                    {/*
                      * `plan` is null while unknown and null forever with the plans switched
                      * off (see `RoleContextValue`'s own comment) — both read the same as
                      * "nothing to say here", which is the whole of what this line says now
                      * that the Owner badge that used to sit beside it has gone.
                      */}
                    {plan !== null && <span className="badge mt-1">{PLAN_LABEL[plan]}</span>}
                  </div>
                </div>

                <div className="menu-divider" />

                <button
                  type="button"
                  className="menu-item w-full"
                  role="menuitem"
                  aria-label="Settings, opens the settings list"
                  onClick={() => setView('settings')}
                >
                  <IconSettings size={17} />
                  Settings
                  <IconChevronRight size={15} className="ms-auto" />
                </button>

                {/*
                 * Same reasoning as Change password/Billing beside it: an account question
                 * with a screen of its own, reached from this panel and leaving it — never
                 * annexed into Settings, which is preferences, not identity.
                 */}
                <Link href="/profile" className="menu-item" role="menuitem" onClick={close}>
                  <IconUser size={17} />
                  Edit profile
                </Link>

                <Link href="/password" className="menu-item" role="menuitem" onClick={close}>
                  <IconKey size={17} />
                  Change password
                </Link>

                {/*
                 * Here rather than under Settings — see this file's own header on why it moved.
                 * Beside Change password because the two are the same kind of thing: an account
                 * question with a screen of its own, reached from this panel and leaving it.
                 */}
                <Link href="/billing" className="menu-item" role="menuitem" onClick={close}>
                  <IconReceipt size={17} />
                  Billing
                </Link>

                <div className="menu-divider" />

                {children}
              </>
            )}

            {view === 'settings' && (
              <>
                <button
                  type="button"
                  className="menu-item w-full"
                  role="menuitem"
                  aria-label="Back to the menu"
                  onClick={() => setView('main')}
                >
                  <IconChevronLeft size={17} />
                  Settings
                </button>

                <div className="menu-divider" />

                {/*
                 * Grouped together because each of these is answered once for the whole
                 * account rather than per song — notation and theme both read the same way
                 * on every sheet until the reader changes them again.
                 *
                 * The instrument used to be the third of them, and on that same reasoning:
                 * a reader owns one instrument and answers for it once. It has moved into
                 * the reading panel, beside «Chords as» (`ReadingPanel`), and the reasoning
                 * that put it here is not what was wrong — it still writes one account-wide
                 * preference, not a per-song one. What was wrong is that the one place its
                 * effect is visible is the chord diagram on the sheet, and this panel is two
                 * taps away from that in the other direction. Notation stays: it reletters
                 * every chord name on the sheet whether or not a diagram is ever opened, so
                 * it is not a companion to «Shape» the way the instrument is.
                 *
                 * Theme is here rather than behind a cycling icon in the header: signed
                 * in, that icon was a third opener in a bar that already has two, and a
                 * glyph that cycles auto → light → dark makes the reader tap through
                 * states to find the one they want instead of naming all three. It is
                 * still an icon in `PublicHeader`, where there is no account menu to put
                 * it in — the same `ThemePicker`/`ThemeToggle` pair the guest side
                 * already splits this way (`GuestSettingsMenu`).
                 */}
                <ThemePicker />
                <NotationPicker />
                {/*
                 * Newsletter consent (`PLAN-newsletter.md`) — grouped here on the same
                 * reasoning as theme/notation above: answered once for the whole account,
                 * not per song. Renders nothing until its own read resolves, so it never
                 * shifts the menu's height while ThemePicker/NotationPicker (synchronous,
                 * local state) have already painted.
                 */}
                <NewsletterPrefs />

                <div className="menu-divider" />

                {/*
                 * Past the divider that now separates it from the preference pickers
                 * above rather than from Sign out: every reader has this over their own
                 * account, own-owner or not — see `deleteMyAccount`'s own comment on why
                 * it is a different power from the one `/accounts` gives a global owner
                 * over every account.
                 */}
                <button
                  type="button"
                  className="menu-item w-full"
                  role="menuitem"
                  onClick={() => setView('delete')}
                >
                  <IconTrash size={17} />
                  Delete account
                </button>
              </>
            )}

            {view === 'delete' && <DeleteMyAccountView email={email} onBack={() => setView('settings')} />}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * The retype-to-confirm safety net, same shape as `DeleteAccountButton`'s own — the
 * one difference being what happens on success: that button refreshes a list still on
 * screen, this one has nothing left to show, since `deleteMyAccount` ends by signing
 * the reader out and redirecting to `/login` on its own.
 */
function DeleteMyAccountView({ email, onBack }: { email: string; onBack: () => void }) {
  const [confirmEmail, setConfirmEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matches = confirmEmail.trim().toLowerCase() === email.toLowerCase()

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await deleteMyAccount(confirmEmail)
      // A failure comes back as a normal result; success never does — deleteMyAccount
      // ends in a redirect instead, which unwinds through this same call as a thrown
      // signal rather than a return, so there is nothing to do here on that path.
      if (!result.ok) setError(SELF_DELETE_MESSAGE[result.reason])
    } catch (thrown) {
      // `deleteMyAccount`'s own redirect unwinds through this same call as a thrown
      // signal, same as `signIn`'s in `login/page.tsx` — it has to pass through
      // untouched, so only a real failure ever reaches `setError` below.
      unstable_rethrow(thrown)
      setError(SELF_DELETE_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="menu-item w-full" role="menuitem" aria-label="Back to settings" onClick={onBack}>
        <IconChevronLeft size={17} />
        Delete account
      </button>

      <div className="menu-divider" />

      <div className="px-1.5 pb-1 pt-1">
        <p className="text-sm text-muted">
          This permanently deletes your account and everything in it — every songbook,
          section and song — and signs you out. Type <strong>{email}</strong> to confirm.
        </p>

        <input
          autoFocus
          value={confirmEmail}
          onChange={(event) => setConfirmEmail(event.target.value)}
          placeholder={email}
          aria-label={`Retype ${email} to confirm deletion`}
          className="form-field mt-3"
        />

        {error !== null && (
          <p className="notice notice-error mt-2.5" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          className="btn btn-danger btn-sm mt-3 w-full"
          disabled={!matches || busy}
          onClick={() => void confirm()}
        >
          Delete my account
        </button>

        {/* `--muted`, not `--faint`: this is a sentence meant to be read, and `--faint`
            measures under 4.5:1 against every surface — see its own note in globals.css. */}
        <p className="mt-2.5 px-0.5 text-[0.78125rem] leading-[1.45] text-muted">
          Stays disabled until the address matches.
        </p>
      </div>
    </>
  )
}
