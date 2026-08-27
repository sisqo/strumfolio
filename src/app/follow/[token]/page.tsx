import type { Metadata } from 'next'

import { FollowSession } from '@/components/FollowSession'

export const metadata: Metadata = { title: 'Strum Together' }

interface Props {
  params: Promise<{ token: string }>
}

/**
 * A Strum Together link: the one page in this app a browser with no account may open.
 *
 * The shell here is deliberately thin — no `SongbookProvider`, no `RoleProvider`, no
 * `TopBar`. Every one of those exists to serve a *signed-in* reader: `RoleProvider` asks
 * who is allowed to edit, `SongbookProvider` keeps a mutable copy of a repertoire this
 * visitor has full read access to anyway through the guest actions, and `TopBar`'s menu
 * opens onto sign-out and settings that belong to an account this visitor does not have.
 * Reaching for any of them would mean teaching each one about a guest, for a screen that
 * needs none of what they provide. `FollowSession` brings its own — a narrow settings
 * menu of its own, theme and instrument only, and the one `PrefsProvider` those two
 * controls need — rather than this page reaching for the real ones on its behalf; see
 * `FollowSession`'s own top-level return for why that lives there and not here.
 *
 * Nor does this page ask whether `token` is actually live — that would be a second place
 * checking the one thing `FollowSession` already has to check on its own first poll, and
 * the two could disagree about what a guest sees between the moment this renders and the
 * moment the client mounts. So the token is handed over unread, and "is this broadcast
 * still there" stays a question with exactly one asker.
 */
export default async function FollowPage({ params }: Props) {
  const { token } = await params

  return <FollowSession token={token} />
}
