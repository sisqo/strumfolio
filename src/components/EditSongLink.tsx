'use client'

import Link from 'next/link'

import { useRole } from '@/components/RoleProvider'
import { IconPencil } from '@/components/icons'
import { useOnline } from '@/lib/useOnline'

/**
 * The way into the editor, for the people who have one.
 *
 * A client component for one link, because the page around it is generated at build time
 * and cannot know who is reading. It takes two rules at its foot with it, in its `bottom`
 * placement (below the sheet, its original and still its default) — but not in `top` (beside
 * the title, level with it): that one has no rule to separate it from, sitting in the
 * header rather than after the song.
 *
 * **A role that may edit.** Nothing at all for a reader with no account of their own on
 * this one, rather than a button that would refuse, and nothing until the role is known.
 *
 * **A network.** This was the app's only write control without that condition, and it took
 * an adversarial read to see why it needed one: the editor route is deliberately
 * `NetworkOnly` in the service worker with no fallback, so offline the tap does not reach an
 * editor that cannot save — it fails the navigation outright and lands on the browser's own
 * error page, outside the installed shell, with the back gesture as the only way home. Every
 * other control that writes already disables itself without a network, and this is what
 * `useOnline` exists for: controls that would otherwise look available and quietly do
 * nothing. So the link comes back when the signal does.
 *
 * The rule above the `bottom` placement goes too. It exists to separate the song from what
 * you do to it, and with nothing to do there is nothing to separate.
 */
export function EditSongLink({
  slug,
  placement = 'bottom',
}: {
  slug: string
  /** `top` sits beside the title, level with it; `bottom` is the original, below the sheet. */
  placement?: 'top' | 'bottom'
}) {
  const { mayEdit } = useRole()
  const online = useOnline()

  if (!mayEdit || !online) return null

  /*
   * Beside the title the label goes and only the pencil stays, which is what the phone
   * board draws — and what makes this fit on a line it now shares with the notes track.
   * The word survives in `aria-label`/`title`, the same trade `TopBar` already made for
   * its own controls.
   *
   * Below the sheet it keeps the word: there is a whole line for it there, and that
   * placement is the one a reader arrives at having scrolled the entire song, where an
   * unlabelled icon would be a guess.
   */
  const link =
    placement === 'top' ? (
      <Link
        href={`/songs/${slug}/edit`}
        className="btn is-inset song-heading-edit"
        aria-label="Edit this song"
        title="Edit"
      >
        <IconPencil size={17} />
      </Link>
    ) : (
      <Link href={`/songs/${slug}/edit`} className="btn is-inset">
        <IconPencil size={16} />
        Edit
      </Link>
    )

  if (placement === 'top') return link

  return (
    <div className="mt-10 border-t pt-4" style={{ borderColor: 'var(--surface-2)' }}>
      {link}
    </div>
  )
}
