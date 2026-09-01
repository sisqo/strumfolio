import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AddSongScreen } from '@/components/AddSongScreen'
import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { SongbookProvider } from '@/components/SongbookProvider'
import { TopBar } from '@/components/TopBar'
import { accessTo } from '@/lib/auth/session'
import { songbookAccountOf } from '@/lib/data/access'
import { listSectionsForAccount, listSongbooksForAccount, listSongsForAccount } from '@/lib/data/db'
import { repository } from '@/lib/data'
import { hasDatabase } from '@/lib/db/client'
import { snapshot } from '@/lib/songbooks/snapshot'

interface Props {
  params: Promise<{ slug: string }>
}

/** Same reasoning as the songbook page it is one level below: an account-scoped
 *  page, rendered per request rather than baked at build time. */
export const dynamic = 'force-dynamic'

/** Copied from `/songbooks/[slug]`, whose own comment explains the `null` cases. */
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

  return { title: songbook === undefined ? 'Songbook not found' : `Add song · ${songbook.name}` }
}

export default async function AddSongPage({ params }: Props) {
  const { slug } = await params

  const resolved = await resolveSongbook(slug)
  if (resolved === null) notFound()

  const [songs, songbooks, sections] =
    resolved.accountOwnerEmail === null
      ? await Promise.all([repository.listSongs(), repository.listSongbooks(), repository.listSections()])
      : await Promise.all([
          listSongsForAccount(resolved.accountOwnerEmail),
          listSongbooksForAccount(resolved.accountOwnerEmail),
          listSectionsForAccount(resolved.accountOwnerEmail),
        ])

  const songbook = songbooks.find((entry) => entry.slug === slug)
  if (songbook === undefined) notFound()

  const initial = snapshot(songs, songbooks, sections)

  return (
    <PrefsProvider songSlug={null}>
      <SongbookProvider initial={initial}>
        <TopBar current="songbooks" back={{ href: `/songbooks/${slug}`, label: songbook.name }} />

        <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
          <AddSongScreen songbookSlug={slug} songbookName={songbook.name} />

          <Footer />
        </main>
      </SongbookProvider>
    </PrefsProvider>
  )
}
