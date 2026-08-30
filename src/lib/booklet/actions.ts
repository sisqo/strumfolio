'use server'

/**
 * Reading one songbook whole, for the printable booklet.
 *
 * Distinct from `exportOrganized` (`lib/import/actions.ts`) on purpose: that one
 * flattens the whole account into files named for a zip, one songbook at a time
 * was never its job. This reads exactly one songbook, structured rather than
 * flattened, because the booklet is built as a PDF document in the browser, not
 * written to disk.
 */

import { and, asc, eq, inArray } from 'drizzle-orm'

import { currentUser } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { sections, songbooks, songs, userSongPrefs } from '@/lib/db/schema'
import { bookletBrandLine } from '@/lib/plans/entitlements'
import type { LimitReason } from '@/lib/plans/types'
import { clampCapo, clampSemitones } from '@/lib/prefs/types'
import { editableSongbook } from '@/lib/songbooks/access'

/** A reader's own transposition and capo for one song — see `BookletSong.personal` below. */
export interface PersonalSettings {
  semitones: number
  capo: number
}

export interface BookletSong {
  slug: string
  title: string
  artist: string | null
  link1: string | null
  link2: string | null
  link3: string | null
  body: string
  /**
   * The downloading reader's own settings for this song, only when they asked to print
   * with them (see `usePersonalSettings` below) **and** actually have a saved row — null
   * either way, and both cases render identically to the written key. Never the settings
   * of whoever the songbook belongs to: this is always the address that is actually
   * signed in, which matters the one time the two differ — a global owner printing a
   * customer's songbook gets their own (almost always empty) settings, not the
   * customer's, exactly like every other read of `user_song_prefs`.
   */
  personal: PersonalSettings | null
}

export interface BookletSection {
  name: string
  songs: BookletSong[]
}

export interface Booklet {
  songbookName: string
  sections: BookletSection[]
}

/**
 * A result union rather than `Booklet | null`, for two reasons that arrived together.
 *
 * `not-found` still collapses "not found", "not this reader's" and "no database" into one
 * answer — the reasoning `editableSongbook` gives, that a stranger's guess at a slug must
 * learn nothing from a refusal. What cannot be folded in with them is a plan refusal: the
 * export panel's one message for a null is «the server did not respond, or your role does
 * not allow it», which for a plan that has no booklet at all is false on every count and
 * invites somebody to retry something that will never work.
 *
 * The success branch carries `brandLine`, which the caller needs anyway and must not
 * decide for itself: the document is rendered in the browser, so what it prints about
 * itself is the server's answer, not the browser's.
 */
export type BookletResult =
  | { ok: true; booklet: Booklet; brandLine: boolean }
  | { ok: false; reason: 'not-found' | LimitReason }

/**
 * Every saved (semitones, capo) this reader has for the given songs, keyed by song
 * slug — empty when they asked for the written key, so the common case pays no query
 * at all.
 */
async function personalSettingsFor(
  songSlugs: string[],
): Promise<Map<string, PersonalSettings>> {
  if (songSlugs.length === 0) return new Map()

  const user = await currentUser()
  if (user === null) return new Map()

  const rows = await db()
    .select({ songSlug: userSongPrefs.songSlug, semitones: userSongPrefs.semitones, capo: userSongPrefs.capo })
    .from(userSongPrefs)
    .where(and(eq(userSongPrefs.userEmail, user.email), inArray(userSongPrefs.songSlug, songSlugs)))

  return new Map(
    rows.map((row) => [row.songSlug, { semitones: clampSemitones(row.semitones), capo: clampCapo(row.capo) }]),
  )
}

export async function loadBooklet(songbookSlug: string, usePersonalSettings = false): Promise<BookletResult> {
  const target = await editableSongbook(songbookSlug)
  if (!target.ok) return { ok: false, reason: 'not-found' }

  /*
   * `refused.booklet`, never `!limits.booklet`: that field is a tier string, so the
   * negation of it is `!'no'` — always false, and free would print a booklet with the
   * compiler none the wiser. The freeze does not reach this: printing changes nothing, so
   * an account over its caps may still print (see `entitlementsFor`).
   */
  const refused = target.entitlements.refused.booklet
  if (refused !== null) return { ok: false, reason: refused }

  const [songbookRow] = await db()
    .select({ name: songbooks.name })
    .from(songbooks)
    .where(eq(songbooks.slug, songbookSlug))
    .limit(1)
  if (songbookRow === undefined) return { ok: false, reason: 'not-found' }

  const rows = await db()
    .select({
      slug: songs.slug,
      title: songs.title,
      artist: songs.artist,
      link1: songs.link1,
      link2: songs.link2,
      link3: songs.link3,
      body: songs.body,
      sectionId: sections.id,
      sectionName: sections.name,
    })
    .from(songs)
    .innerJoin(sections, eq(songs.sectionId, sections.id))
    .where(eq(songs.songbookSlug, songbookSlug))
    .orderBy(asc(sections.position), asc(songs.position), asc(songs.title))

  const personalBySlug = usePersonalSettings
    ? await personalSettingsFor(rows.map((row) => row.slug))
    : new Map<string, PersonalSettings>()

  // Sections in the order their first song was seen, which is already the
  // position order the query asked for — a `Map` keeps that order and lets a
  // section with no songs yet simply have nothing to show, rather than an
  // empty heading nobody asked for.
  const bySection = new Map<number, BookletSection>()
  for (const row of rows) {
    let section = bySection.get(row.sectionId)
    if (section === undefined) {
      section = { name: row.sectionName, songs: [] }
      bySection.set(row.sectionId, section)
    }
    section.songs.push({
      slug: row.slug,
      title: row.title,
      artist: row.artist,
      link1: row.link1,
      link2: row.link2,
      link3: row.link3,
      body: row.body,
      personal: personalBySlug.get(row.slug) ?? null,
    })
  }

  return {
    ok: true,
    booklet: { songbookName: songbookRow.name, sections: [...bySection.values()] },
    brandLine: bookletBrandLine(target.entitlements),
  }
}
