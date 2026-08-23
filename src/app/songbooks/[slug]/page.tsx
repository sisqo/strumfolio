import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Footer } from '@/components/Footer'
import { SongbookProvider } from '@/components/SongbookProvider'
import { SongbookSongs } from '@/components/SongbookSongs'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { IconChevronLeft } from '@/components/icons'
import { accessTo } from '@/lib/auth/session'
import { songbookAccountOf } from '@/lib/data/access'
import {
  listSectionsForAccount,
  listSongbooksForAccount,
  listSongsForAccount,
} from '@/lib/data/db'
import { snapshot } from '@/lib/songbooks/snapshot'
import { repository } from '@/lib/data'
import { hasDatabase } from '@/lib/db/client'
import { requirePlanChoice } from '@/lib/plans/gate'
import { toIndexRow } from '@/lib/search-index'

interface Props {
  params: Promise<{ slug: string }>
}

/**
 * Rendered per request (v3.0), not generated at build time — same reasoning as
 * `/songs/[slug]`: a songbook's account is only known once a reader is asking, and
 * baking every account's songbooks into one build would leak them across accounts with
 * nothing left to check at request time.
 */
export const dynamic = 'force-dynamic'

/**
 * Which account's shelf this slug is on, and whether the asking reader may see it —
 * `null` for either "no such songbook" or "not this reader's", on purpose, same as
 * `songbooks/access.ts`'s own reasoning. `accountOwnerEmail` is `null` only when there
 * is no database at all, in which case there is one local repertoire and nothing to
 * check — see `lib/data/index.ts`.
 */
async function resolveSongbook(slug: string): Promise<{ accountOwnerEmail: string | null } | null> {
  if (!hasDatabase) return { accountOwnerEmail: null }

  const owner = await songbookAccountOf(slug)
  if (owner === null) return null
  if ((await accessTo(owner)) === null) return null

  return { accountOwnerEmail: owner }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const resolved = await resolveSongbook(slug)
  if (resolved === null) return { title: 'Songbook not found' }

  const songbooks =
    resolved.accountOwnerEmail === null
      ? await repository.listSongbooks()
      : await listSongbooksForAccount(resolved.accountOwnerEmail)
  const songbook = songbooks.find((entry) => entry.slug === slug)

  return { title: songbook?.name ?? 'Songbook not found' }
}

export default async function SongbookPage({ params }: Props) {
  const { slug } = await params

  /* The other real deep-link target that used to skip the plan-choice gate — see
   * `requirePlanChoice`'s own comment, and `songs/[slug]` for the same call. */
  await requirePlanChoice()

  const resolved = await resolveSongbook(slug)
  if (resolved === null) notFound()

  const [songs, songbooks, sections] =
    resolved.accountOwnerEmail === null
      ? await Promise.all([
          repository.listSongs(),
          repository.listSongbooks(),
          repository.listSections(),
        ])
      : await Promise.all([
          listSongsForAccount(resolved.accountOwnerEmail),
          listSongbooksForAccount(resolved.accountOwnerEmail),
          listSectionsForAccount(resolved.accountOwnerEmail),
        ])

  const songbook = songbooks.find((entry) => entry.slug === slug)
  if (songbook === undefined) notFound()

  const initial = snapshot(songs, songbooks, sections)

  /*
   * This songbook's songs, in the order `listSongs` reads them — position first, then
   * title. The rows carry no lyrics: there is nothing to search on this screen, and the
   * words of two dozen songs would otherwise ride along in the page for nothing.
   */
  const mine = songs.filter((song) => song.songbookSlug === slug).map(toIndexRow)

  return (
    <PrefsProvider songSlug={null}>
      <SongbookProvider initial={initial}>
        <TopBar current="songbooks" />

        <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
          <Link href="/" className="back-plain mb-3.5">
            <IconChevronLeft size={15} />
            Songbooks
          </Link>

          {/*
            * The name and its counts live inside `SongbookSongs`, not here: they come
            * from the same live layer the cards below read, so a section created a
            * minute ago is already counted there instead of waiting for the next
            * rebuild.
            */}
          <SongbookSongs slug={slug} songs={mine} />

          <Footer />
        </main>
      </SongbookProvider>
    </PrefsProvider>
  )
}
