import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { SongReader } from '@/components/SongReader'
import { repository } from '@/lib/data'
import { accessTo } from '@/lib/auth/session'
import { songAccountOf } from '@/lib/data/access'
import { hasDatabase } from '@/lib/db/client'
import { requirePlanChoice } from '@/lib/plans/gate'

interface Props {
  params: Promise<{ slug: string }>
}

/**
 * Rendered per request (v3.0), not generated at build time. A song's account is only
 * known once a reader is asking — `generateStaticParams` would have to bake every
 * account's songs into one build with nothing to tell them apart by, which is exactly
 * the leak this route used to have before accounts existed to leak between.
 */
export const dynamic = 'force-dynamic'

/**
 * Whether this reader may see this slug at all, with a database to ask. Without one
 * there is a single local repertoire for one developer (`lib/data/index.ts`) and
 * `middleware.ts`'s own session check is already the whole of it, same as before v3.0.
 */
async function permitted(slug: string): Promise<boolean> {
  if (!hasDatabase) return true

  const owner = await songAccountOf(slug)
  if (owner === null) return false
  return (await accessTo(owner)) !== null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  if (!(await permitted(slug))) return { title: 'Song not found' }

  const song = await repository.getSong(slug)
  if (!song) return { title: 'Song not found' }

  return {
    title: song.artist === null ? song.title : `${song.title} · ${song.artist}`,
  }
}

export default async function SongPage({ params }: Props) {
  const { slug } = await params

  /* A bookmarked song is one of the two real ways into the app that used to skip the
   * plan-choice gate — see `requirePlanChoice`'s own comment. Before `permitted`, so an
   * account with the choice still outstanding is sent to make it rather than paying for a
   * lookup it is about to be redirected away from. */
  await requirePlanChoice()

  if (!(await permitted(slug))) notFound()

  const song = await repository.getSong(slug)
  if (!song) notFound()

  return <SongReader song={song} />
}
