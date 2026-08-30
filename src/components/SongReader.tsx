import { CommentsProvider } from '@/components/CommentsProvider'
import { LiveComments } from '@/components/LiveComments'
import { EditSongLink } from '@/components/EditSongLink'
import { Footer } from '@/components/Footer'
import { LiveControlBar, LiveSheet, SongHeading } from '@/components/LiveSong'
import { PrefsProvider } from '@/components/PrefsProvider'
import { SongProvider } from '@/components/SongProvider'
import { SongReaderSearch } from '@/components/SongReaderSearch'
import { TopBar } from '@/components/TopBar'
import { parseChordPro } from '@/lib/chordpro'
import { type Song, repository } from '@/lib/data'
import { songAccountOf } from '@/lib/data/access'
import { listSectionsForAccount, listSongbooksForAccount, listSongsForAccount } from '@/lib/data/db'
import { hasDatabase } from '@/lib/db/client'
import { type SongIndexRow, toIndexRow } from '@/lib/search-index'
import { type Series, seriesOf } from '@/lib/songbooks/series'

/** The songbook this song is in: where the header's way back leads. */
interface Home {
  slug: string
  name: string
}

/**
 * The songbook, the section, and the song's place in the sequence. Three answers, not
 * one.
 *
 * The first two used to be computed together and returned as a single null-or-not, which
 * was a bug waiting for its first victim: a songbook holding one song has no sequence to
 * step through, and returning null for both would have taken away the way back as well.
 * The sequence needs two songs; the way back needs only a songbook; the section needs
 * only the song.
 *
 * All three are built from build-time data, unlike the song's own words, which are
 * refreshed from the database as soon as the page opens. The difference is deliberate:
 * these arrows lead to other static pages, and each of those was generated from the same
 * list this one was. Reading the live arrangement here would point the arrows at songs
 * whose own pages still think they sit somewhere else.
 *
 * So the neighbours are as stale as the pages they lead to — which is the only way for
 * them to agree — while what you are reading is not.
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

  return { home, section, series: seriesOf(song, songs), library }
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
  const { home, section, series, library } = await placeOf(song)

  return (
    <PrefsProvider songSlug={song.slug}>
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
          * the way to the next song, and the way into the editor.
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
            * The section, and the place in the songbook: «Prima parte · 3 of 12». The
            * name says which division you are reading; the numbers count what the arrows
            * count, which is the whole songbook — a number that counted the section
            * while the arrow led out of it would be two different stories on one line.
            */}
          <SongHeading
            place={
              series === null
                ? null
                : { position: series.position, total: series.total, within: section }
            }
          />

          <LiveSheet />

          {/*
            * A link, not a form: the editor is a page of its own, and two ways to
            * change a song would be two things to keep in step. It needs a network
            * to save, so it needs one to open — and a role that may change songs,
            * which is why it is a component of its own.
            */}
          <EditSongLink slug={song.slug} />

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

        <LiveControlBar
          steps={
            series === null
              ? null
              : {
                  previous: series.previous,
                  next: series.next,
                  position: series.position,
                  total: series.total,
                }
          }
        />
        </CommentsProvider>
      </SongProvider>
    </PrefsProvider>
  )
}
