'use client'

import { DeleteSongLink } from '@/components/DeleteSongLink'
import { EditSongLink } from '@/components/EditSongLink'
import { useRole } from '@/components/RoleProvider'
import { useOnline } from '@/lib/useOnline'

/**
 * Edit and Delete, together, at the foot of the reading page — everything a reader who
 * may change this song can do *to* it, one rule above the two of them and not one each.
 *
 * A client component of its own rather than the rule living in `SongReader` itself, which
 * is a server component and cannot know who is reading: the rule has to disappear along
 * with both buttons for the reader who may not edit, and only a client read of the role
 * knows that in time. `EditSongLink`/`DeleteSongLink` still gate themselves too — this
 * wrapper's own check exists only to keep an empty rule from being the one thing an
 * ordinary reader gets at the end of every song.
 */
export function SongActions({ slug, redirectTo }: { slug: string; redirectTo: string }) {
  const { mayEdit } = useRole()
  const online = useOnline()

  if (!mayEdit || !online) return null

  return (
    <div className="mt-10 flex flex-wrap items-center gap-3 border-t pt-4" style={{ borderColor: 'var(--surface-2)' }}>
      <EditSongLink slug={slug} />
      <DeleteSongLink slug={slug} redirectTo={redirectTo} />
    </div>
  )
}
