import { CommentsProvider } from '@/components/CommentsProvider'
import { FavoritesProvider } from '@/components/FavoritesProvider'
import { LiveComments } from '@/components/LiveComments'
import { Footer } from '@/components/Footer'
import { LiveControlBar, LiveSheet, SongHeading } from '@/components/LiveSong'
import { SongActions } from '@/components/SongActions'
import { PrefsProvider } from '@/components/PrefsProvider'
import { SongProvider } from '@/components/SongProvider'
import { SongReaderSearch } from '@/components/SongReaderSearch'
import { TopBar } from '@/components/TopBar'
import { parseChordPro } from '@/lib/chordpro'
import { currentUser } from '@/lib/auth/session'
import { type Song, repository } from '@/lib/data'
import { songAccountOf } from '@/lib/data/access'
import {
  listFavoriteSlugs,
  listSectionsForAccount,
  listSongbooksForAccount,
  listSongsForAccount,
} from '@/lib/data/db'
import { hasDatabase } from '@/lib/db/client'
import { type SongIndexRow, toIndexRow } from '@/lib/search-index'
import { type Series, seriesOf, siblingsOf } from '@/lib/songbooks/series'

/** The songbook this song is in: where the header's way back leads. */
interface Home {
  slug: string
  name: string
}

/**
 * The songbook, the section, and the song's place in the sequence — plus what the browser
 * needs to work out a different sequence of its own. Several answers, not one.
 *
 * The first two used to be computed together and returned as a single null-or-not, which
 * was a bug waiting for its first victim: a songbook holding one song has no sequence to
 * step through, and returning null for both would have taken away the way back as well.
 * The sequence needs two songs; the way back needs only a songbook; the section needs
 * only the song.
 *
 * They are all built from one read of the account's arrangement, taken once here, while
 * the song's own words are refreshed from the database again after the page opens. The
 * difference is deliberate: the arrows lead to other pages, and each of those resolves
 * its own place from a read of its own. What matters is that everything on *this* screen
 * agrees with itself, which one read is what guarantees.
 *
 * (This paragraph used to say the arrows were built from build-time data. That stopped
 * being true at v3.0, when the route became `force-dynamic`; the reason for reading them
 * together, once, did not change with it.)
 *
 * `siblings` and `favorites` ride along for the browser's own narrowing of that same
 * order — see `useSequence` in `LiveSong.tsx`. Slugs and a set rather than a second
 * sequence: which songs are starred is the reader's answer and can change while the page
 * is open, so the server hands over the raw materials and not a conclusion.
 *
 * Scoped to the song's own account (v3.0), not read globally: the siblings a reader
 * steps through must be this account's songs, never another one's read alongside them
 * by coincidence of a shared songbook slug — impossible today since slugs are unique
 * per account's songbook already, but the scoped read is also just less to fetch.
 *
 * `library` rides along on the same fetch, for `SongReaderSearch`: every other song in
 * the account, minus this one, with the songbook it lives in resolved the same way
 * `home` is. Same staleness as the neighbours above and for the same reason — a search
 * result that opened a page still filed under a songbook it just moved out of is a
 * smaller wrong than one row disagreeing with a `home` computed from a different read a
 * moment apart. No lyrics: `toIndexRow`, not `toIndexEntry`, keeps this page from
 * parsing and shipping the words of every song in the account just to fill a search box
 * most loads of this page never open.
 */
async function placeOf(
  song: Song,
): Promise<{
  home: Home | null
  section: string | null
  series: Series | null
  /** The songbook's slugs in reading order, for the browser's own filtered sequence. */
  siblings: string[]
  favorites: string[]
  library: { song: SongIndexRow; under: string | null }[]
}> {
  const owner = hasDatabase ? await songAccountOf(song.slug) : null

  const [songs, songbooks, sections] =
    owner !== null
      ? await Promise.all([
          listSongsForAccount(owner),
          listSongbooksForAccount(owner),
          listSectionsForAccount(owner),
        ])
      : await Promise.all([
          repository.listSongs(),
          repository.listSongbooks(),
          repository.listSections(),
        ])

  const found = songbooks.find((entry) => entry.slug === song.songbookSlug)
  const home = found === undefined ? null : { slug: found.slug, name: found.name }
  const section = sections.find((entry) => entry.id === song.sectionId)?.name ?? null

  const songbookOf = new Map(sections.map((entry) => [entry.id, entry.songbookSlug]))
  const nameOf = new Map(songbooks.map((entry) => [entry.slug, entry.name]))
  const library = songs
    .filter((entry) => entry.slug !== song.slug)
    .map((entry) => ({
      song: toIndexRow(entry),
      under: nameOf.get(songbookOf.get(entry.sectionId) ?? '') ?? null,
    }))

  /*
   * This reader's own stars — `currentUser` rather than `owner` for the half that says
   * whose they are: `owner` is the account the *song* belongs to, which for a global owner
   * looking at a customer's songbook is not the person whose stars these are. Nothing to
   * check here: `SongPage` has already refused anyone without access to this song.
   */
  const user = owner === null ? null : await currentUser()
  const favorites =
    user === null ? [] : await listFavoriteSlugs(user.accountOwnerEmail, user.email)

  return {
    home,
    section,
    series: seriesOf(song, songs),
    siblings: siblingsOf(song, songs),
    favorites,
    library,
  }
}

/**
 * The reading shell.
 *
 * The ChordPro is parsed here, on the server, so the parse happens once at build
 * time and the client only ever formats an already-structured song.
 *
 * Stepping to the next song happens in the reading bar's own capsule (`LiveControlBar`)
 * and nowhere else — moved down from the header it used to live in, to sit with
 * the rest of what a hand reaches for mid-song rather than at the top of the page, out
 * of reach on a stand. There used to be two cards for it at the foot of the sheet as
 * well, before that, which meant the same destination twice on one screen — and the
 * copy at the bottom was the one you had to scroll a whole song to reach, while the
 * bar is in reach the entire time.
 */
export async function SongReader({ song }: { song: Song }) {
  const parsed = parseChordPro(song.body)
  const { home, section, series, siblings, favorites, library } = await placeOf(song)

  /* Handed whole to the two places that draw it — the title's count and the bar's arrows —
     which then resolve it through one shared hook rather than each deciding for itself. */
  const sequence = { series, siblings }

  return (
    <PrefsProvider songSlug={song.slug}>
      <FavoritesProvider initial={favorites}>
      {/*
        * Keyed by slug: stepping to the next song lands on the same component in
        * the same place, and without a key React would keep the previous song's
        * state and show its words under the new title.
        */}
      <SongProvider key={song.slug} baked={song} bakedParsed={parsed}>
        <CommentsProvider songSlug={song.slug}>
        <TopBar
          current="songs"
          /*
            * The way back to the songbook, which is not where the brand leads: the
            * brand goes to the list of songbooks, one level above the one you came
            * from. A song with no songbook has nowhere in between, so it gets no
            * second link.
            *
            * It carries this song in a **fragment**, and that is what opens the section
            * holding it on arrival — the songbook's sections are closed otherwise. A
            * fragment rather than a query parameter because it never reaches the service
            * worker, so the page it leads to is still the precached one: a query string
            * would make the way back from a song stop working offline, which is exactly
            * when it is needed. It is also why the phone's own back gesture lands on the
            * songbook as you left it — that gesture carries no fragment, and restoring
            * the previous screen is what it is for.
            */
          back={
            home === null
              ? undefined
              : { href: `/songbooks/${home.slug}#song-${song.slug}`, label: home.name }
          }
          search={<SongReaderSearch library={library} />}
        />

        {/*
          * The sheet is a card that runs off the bottom of the screen, so
          * everything that belongs to the song is inside it: the title, the words,
          * the way to the next song, and what you can do to the song itself — edit it
          * or delete it.
          *
          * One thing does now sit on the page beside it, against the rule this comment
          * used to state absolutely: the notes rail, on a wide screen only. It earns the
          * exception by being *this reader's own writing about this song* rather than a
          * second thing to read — and it takes the gutter the sheet was already leaving
          * empty, so the words themselves are exactly as wide as before.
          */}
        <div className="reading-layout">
        <main className="song-card">
          {/*
            * The section, and the place in the sequence: «Prima parte · 3 of 12». The
            * name says which division you are reading; the numbers count exactly what the
            * arrows step through — the whole songbook, or this reader's favorites in it
            * while the filter is on. Both come from `useSequence`, which is the whole
            * reason it exists: a number counting one thing while the arrow led through
            * another would be two stories on one line.
            */}
          <SongHeading within={section} sequence={sequence} />

          <LiveSheet />

          {/*
            * Edit is a link, not a form: the editor is a page of its own, and two ways
            * to change a song would be two things to keep in step. Delete sits beside
            * it — the only other place a song could go, and this is the page a reader
            * is already on. `redirectTo` is the songbook this song came from, the same
            * one the header's own way back leads to; a song with none goes to `/`,
            * since there is no page left that still lists it.
            */}
          <SongActions slug={song.slug} redirectTo={home === null ? '/' : `/songbooks/${home.slug}`} />

          {/*
            * Above the spacer, not after it: the spacer's whole job is to keep the
            * floating control dock from covering whatever is last on the page, and
            * that job now falls to this instead of to the edit link above it.
            */}
          <Footer />

          <div className="bar-spacer" />
        </main>

          <LiveComments />
        </div>

        <LiveControlBar sequence={sequence} />
        </CommentsProvider>
      </SongProvider>
      </FavoritesProvider>
    </PrefsProvider>
  )
}
