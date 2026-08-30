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

import { asEditor, currentUser } from '@/lib/auth/session'
import { SITE_URL } from '@/lib/brand'
import { type SongComment, commentFromRow } from '@/lib/comments/types'
import { db } from '@/lib/db/client'
import { accounts, sections, songbooks, songs, userSongComments, userSongPrefs } from '@/lib/db/schema'
import { type Entitlements, bookletBrandLine, bookletCustomFooterAllowed } from '@/lib/plans/entitlements'
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
  /**
   * The downloading reader's own anchored comments on this song, only when they asked to
   * include them (see `includeComments` below) — empty otherwise, and empty either way for
   * a song nobody has annotated. Same reasoning as `personal` on whose comments these are:
   * the signed-in address, never the songbook's own account.
   */
  comments: SongComment[]
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
 * The success branch carries `footerText`, which the caller needs anyway and must not
 * decide for itself: the document is rendered in the browser, so what it prints about
 * itself — the fixed brand line, nothing, or the account's own line — is the server's
 * answer, not the browser's. See `resolveFooterText`.
 */
export type BookletResult =
  | { ok: true; booklet: Booklet; footerText: string }
  | { ok: false; reason: 'not-found' | LimitReason }

/**
 * What the booklet's footer says, resolved once on the server from the plan tier and
 * (only when the tier actually allows it) the account's own saved line.
 *
 * Never reads `savedFooter` at all on a tier that cannot use it: a downgrade leaves the
 * column untouched (see its own comment in `db/schema.ts`), and this is the one place
 * that has to keep not reading it, the same way `allowedInstrument` keeps not trusting a
 * stored ukulele choice past the entitlement that allowed it.
 */
function resolveFooterText(entitlements: Entitlements, savedFooter: string | null): string {
  if (bookletCustomFooterAllowed(entitlements)) return savedFooter ?? ''
  if (bookletBrandLine(entitlements)) return `Printed with Strumfolio · ${SITE_URL}`
  return ''
}

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

/**
 * Every one of this reader's own comments across the given songs, grouped by song slug —
 * empty when nobody asked to print them, so the common case pays no query at all. Left
 * unsorted here, same as `loadComments`: putting them in reading order is `document.tsx`'s
 * job, the same place the reading screen does it.
 */
async function commentsFor(songSlugs: string[]): Promise<Map<string, SongComment[]>> {
  if (songSlugs.length === 0) return new Map()

  const user = await currentUser()
  if (user === null) return new Map()

  const rows = await db()
    .select({
      id: userSongComments.id,
      blockIndex: userSongComments.blockIndex,
      charOffset: userSongComments.charOffset,
      target: userSongComments.target,
      anchorLabel: userSongComments.anchorLabel,
      body: userSongComments.body,
      createdAt: userSongComments.createdAt,
      updatedAt: userSongComments.updatedAt,
      songSlug: userSongComments.songSlug,
    })
    .from(userSongComments)
    .where(and(eq(userSongComments.userEmail, user.email), inArray(userSongComments.songSlug, songSlugs)))

  const bySlug = new Map<string, SongComment[]>()
  for (const row of rows) {
    const comment = commentFromRow(row)
    const existing = bySlug.get(row.songSlug)
    if (existing === undefined) bySlug.set(row.songSlug, [comment])
    else existing.push(comment)
  }
  return bySlug
}

export async function loadBooklet(
  songbookSlug: string,
  usePersonalSettings = false,
  includeComments = false,
): Promise<BookletResult> {
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
  const commentsBySlug = includeComments
    ? await commentsFor(rows.map((row) => row.slug))
    : new Map<string, SongComment[]>()

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
      comments: commentsBySlug.get(row.slug) ?? [],
    })
  }

  let savedFooter: string | null = null
  if (bookletCustomFooterAllowed(target.entitlements)) {
    const [accountRow] = await db()
      .select({ bookletFooter: accounts.bookletFooter })
      .from(accounts)
      .where(eq(accounts.ownerEmail, target.accountOwnerEmail))
      .limit(1)
    savedFooter = accountRow?.bookletFooter ?? null
  }

  return {
    ok: true,
    booklet: { songbookName: songbookRow.name, sections: [...bySection.values()] },
    footerText: resolveFooterText(target.entitlements, savedFooter),
  }
}

/**
 * The account's own saved footer line, for the input on `/booklet` — null when it has
 * none yet, regardless of whether the current plan may still use it (see
 * `saveBookletFooter`'s own comment on why the write side is where that gate lives).
 */
export async function loadBookletFooter(): Promise<string | null> {
  const permission = await asEditor()
  if (!permission.ok) return null

  const [row] = await db()
    .select({ bookletFooter: accounts.bookletFooter })
    .from(accounts)
    .where(eq(accounts.ownerEmail, permission.accountOwnerEmail))
    .limit(1)

  return row?.bookletFooter ?? null
}

/**
 * How long a footer line may be. Measured rather than guessed: the footer strip is 469pt
 * wide, and after the page number and its gap the line has about 443pt, which at 8.25pt
 * Helvetica is 120 characters of ordinary sentence case and 91 of mixed capitals. The
 * first cap here was 140 — a third more than the page could ever show, so a footer typed
 * to the limit printed with its ending cut off.
 *
 * No character count can promise a fit, since 140 narrow letters fit where 56 capital Ws
 * do not; the guarantee that the line never wraps into the words above it lives in
 * `document.tsx`'s `Footer`, which holds it to a single line. This number's job is only
 * to keep an ordinary footer well clear of that clamp, so being cut short is the answer
 * to a deliberately extreme string rather than to a normal sentence.
 *
 * Enforced here, not in the schema: a cap this soft is UI, the same reasoning
 * `user_song_comments.body`'s own length gives for staying unbounded at the column.
 */
const MAX_FOOTER_LENGTH = 100

export type FooterSaveResult = 'saved' | 'not-in-plan' | 'no-destination' | 'failed'

/**
 * Writes the account's own booklet footer line — refused, not merely ignored, on a plan
 * that cannot use one, so a reader typing into a field they cannot actually save from
 * finds out from the same round trip rather than from a silently unsaved draft.
 *
 * `no-destination` covers both no session and no edit access to the current account, the
 * same collapsing `saveSongPrefs` already does: neither is worth telling apart from the
 * other three-way split `SaveResult` makes, and only `failed` is worth retrying.
 */
export async function saveBookletFooter(text: string): Promise<FooterSaveResult> {
  const permission = await asEditor()
  if (!permission.ok) return 'no-destination'
  if (!bookletCustomFooterAllowed(permission.entitlements)) return 'not-in-plan'

  const trimmed = text.trim().slice(0, MAX_FOOTER_LENGTH)

  try {
    await db()
      .update(accounts)
      .set({ bookletFooter: trimmed === '' ? null : trimmed })
      .where(eq(accounts.ownerEmail, permission.accountOwnerEmail))
    return 'saved'
  } catch (error) {
    console.error('saveBookletFooter failed', error)
    return 'failed'
  }
}
