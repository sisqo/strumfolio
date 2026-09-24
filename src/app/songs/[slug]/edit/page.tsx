import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { SongbookProvider } from '@/components/SongbookProvider'
import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { EditorScreen } from '@/components/editor/EditorScreen'
import { IconInfo } from '@/components/icons'
import { accessTo, requireAccount } from '@/lib/auth/session'
import { songAccountOf } from '@/lib/data/access'
import { listSectionsForAccount, listSongbooksForAccount, listSongsForAccount } from '@/lib/data/db'
import { repository } from '@/lib/data'
import { hasDatabase } from '@/lib/db/client'
import { requirePlanChoice } from '@/lib/plans/gate'
import { seriesOf } from '@/lib/songbooks/series'
import { snapshot } from '@/lib/songbooks/snapshot'
import { canEdit } from '@/lib/roles'

interface Props {
  params: Promise<{ slug: string }>
}

/**
 * Rendered per request, never generated and never precached.
 *
 * Every other page here is static so it survives without a network. This one must
 * not be: it has to open the version the database holds right now, and it cannot do
 * its job — saving — offline anyway. A precached editor would be worse than none,
 * showing the words as they were at the last deploy and losing whatever was typed
 * into them.
 */
export const dynamic = 'force-dynamic'

/**
 * Asked before anything about the song is read, exactly as the reading page does: slugs are
 * unique across the whole installation and easy to guess, and a title in `<title>`, or a
 * different answer for a song that exists elsewhere, told any signed-in reader what another
 * account's repertoire holds.
 */
async function permitted(slug: string): Promise<boolean> {
  if (!hasDatabase) return true

  const owner = await songAccountOf(slug)
  if (owner === null) return false
  return (await accessTo(owner)) !== null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  if (!(await permitted(slug))) return { title: 'Edit' }

  const song = await repository.getSong(slug)

  return { title: song === null ? 'Edit' : `Edit · ${song.title}` }
}

export default async function EditSongPage({ params }: Props) {
  /* A session whose account no longer exists — see `requireAccount`. Silent for a visitor with
     no session at all, which is the middleware's case and not this one. */
  await requireAccount()

  const { slug } = await params

  /* Gated like the reading page it is reached from — see `requirePlanChoice`. An editor deep
   * link is rarer than a song one, but it is the same kind of bookmark. */
  await requirePlanChoice()

  const song = await repository.getSong(slug)
  if (song === null) notFound()

  /*
   * The role checked here is on **this song's own account** (v3.0), not on whichever
   * account the reader's switcher currently has open: this page is reached by a slug,
   * exactly like the reading page and the guest broadcast reads, and the same reasoning
   * applies — a link is not a promise that the account behind it is the one you meant.
   * Without a database there is one local repertoire and no account to resolve; the
   * session check that guarded this page before v3.0 is the whole of it there too.
   */
  const access = hasDatabase ? await accessTo((await songAccountOf(slug)) ?? '') : null
  /* A song in an account this reader cannot open does not exist for them — the reading page's
     answer, and not the owner notice below, which would confirm that it does. */
  if (hasDatabase && access === null) notFound()
  const role = hasDatabase ? (access?.role ?? null) : 'admin'

  const [songbooks, sections, songs] =
    access !== null
      ? await Promise.all([
          listSongbooksForAccount(access.accountOwnerEmail),
          listSectionsForAccount(access.accountOwnerEmail),
          listSongsForAccount(access.accountOwnerEmail),
        ])
      : await Promise.all([repository.listSongbooks(), repository.listSections(), repository.listSongs()])

  /*
   * The one page in the app that can refuse on the server, and it does.
   *
   * Everywhere else the role is checked in the browser, because the pages are generated
   * at build time and are the same for everybody. This one is rendered per request, so
   * somebody with no admin access here who types the address gets an answer instead of an
   * editor full of controls that would refuse — and the words of the song are not sent to
   * them at all.
   */
  if (!canEdit(role)) {
    return (
      <PrefsProvider songSlug={null}>
        <TopBar current="songs" back={{ href: `/songs/${slug}`, label: 'Back to song' }} />

        <main className="mx-auto max-w-4xl px-4 pb-12 pt-3">
          <h1 className="screen-title mb-4">Edit</h1>
          <p className="notice notice-accent" role="status">
            <IconInfo />
            <span>
              Only this account&apos;s owner, or a global owner, can edit a song here.
            </span>
          </p>

          <Footer />
        </main>
      </PrefsProvider>
    )
  }

  /*
   * This one song's own filing, and *every* section of its own account: the form's two
   * menus offer that account's library, since moving a song is one of the things they
   * are for — and a song may only ever move within the account it already belongs to.
   */
  const initial = snapshot([song], songbooks, sections)
  const series = seriesOf(song, songs)

  return (
    // The preview renders a real sheet and the real control bar, both of which read
    // this song's zoom, notation and transposition from here.
    <PrefsProvider songSlug={song.slug}>
      <SongbookProvider initial={initial} refreshOnMount={false}>
        <TopBar
          current="songs"
          /*
            * Same arrows as the reading page, so stepping to the next song does not
            * cost a detour back out of the editor first — and it lands in the editor
            * again, not on the sheet, since that is the screen this reader was on.
            */
          steps={{
            /*
              * `.slug`, not the step itself: `SongStep` is `{slug, title}`, and a template
              * literal takes an object without complaint — `/songs/[object Object]/edit`
              * typechecks, because `${…}` is a string however it is filled. What it does at
              * runtime depends on where it runs, which is why this survived from 2026-08-15:
              * Next's dynamic-href assertion is dev-only, so production quietly drew two
              * arrows pointing at a URL that 404s, while `next dev` — the normal way to work
              * here — threw out of `<Link>` and answered the whole editor with a 500.
              */
            previous: series?.previous ? `/songs/${series.previous.slug}/edit` : null,
            next: series?.next ? `/songs/${series.next.slug}/edit` : null,
          }}
        />

        <main className="mx-auto max-w-4xl px-4 pb-12">
          <EditorScreen song={song} />

          <Footer />
        </main>
      </SongbookProvider>
    </PrefsProvider>
  )
}
