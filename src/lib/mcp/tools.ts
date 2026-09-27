/**
 * The tools an AI assistant sees, and what each one does to the account behind its token.
 *
 * **Reads query here, writes go through the app's own actions.** A read is scoped by the
 * token's account id in every query, and returns only what the tool promises. A write calls
 * `saveSong`, `createSongbook`, `moveSong`… exactly as the editor does, inside `runAsToken`
 * (`lib/auth/actor.ts`), so the freeze, the caps, the suspension check, the revisions and the
 * note re-anchoring are the app's and have no second copy here.
 *
 * **Nothing deletes**, by decision (2026-09-27): no tool removes a song, a section or a
 * songbook, and every AI rewrite leaves the text it replaced in `song_revisions`.
 */

import { and, asc, eq, inArray } from 'drizzle-orm'

import { parseChordPro, plainLyrics } from '@/lib/chordpro'
import { db } from '@/lib/db/client'
import { sections, songbooks, songs } from '@/lib/db/schema'
import { METADATA_DIRECTIVE } from '@/lib/import/deduce'
import { saveSong } from '@/lib/import/actions'
import { saveMessage, SONG_TEXT_MAX, SONG_TITLE_MAX } from '@/lib/import/types'
import { createSection, renameSection } from '@/lib/sections/actions'
import { createSongbook, moveSong, renameSongbook } from '@/lib/songbooks/actions'
import { writeMessage } from '@/lib/songbooks/types'

import { CHORDPRO_GUIDE, SERVER_INSTRUCTIONS } from './guide'
import type { ResourceDefinition, Server, ToolDefinition, ToolOutcome } from './protocol'

export const GUIDE_URI = 'strumfolio://guide/chordpro'

const SEARCH_LIMIT_MAX = 50

const string = (description: string) => ({ type: 'string', description })
const integer = (description: string) => ({ type: 'integer', description })

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: 'list_songbooks',
    title: 'List songbooks',
    description: 'Every songbook with its sections, in the order the app shows them.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_songs',
    title: 'List songs',
    description: 'The songs of one songbook, or of one section, in playing order. Words not included.',
    inputSchema: {
      type: 'object',
      properties: {
        songbook: string('Songbook slug, from list_songbooks.'),
        section_id: integer('Only this section.'),
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'search_songs',
    title: 'Search songs',
    description: 'Songs whose title, artist, tags or words contain the text (chords are ignored).',
    inputSchema: {
      type: 'object',
      properties: {
        query: string('Text to look for, case-insensitive.'),
        limit: integer(`At most this many results (default 20, max ${SEARCH_LIMIT_MAX}).`),
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_song',
    title: 'Read a song',
    description: 'A song in full: its fields, its ChordPro text and the version to send back to update_song.',
    inputSchema: {
      type: 'object',
      properties: { slug: string('Song slug.') },
      required: ['slug'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_song',
    title: 'Create a song',
    description:
      'Adds a song to a songbook (in its first section unless section_id is given). Refuses when a song with the same title and artist exists, unless on_duplicate is "add".',
    inputSchema: {
      type: 'object',
      properties: {
        songbook: string('Songbook slug.'),
        section_id: integer('Section of that songbook.'),
        title: string('Title.'),
        artist: string('Artist, if any.'),
        body: string('The ChordPro text, without {title:} or {artist:} lines.'),
        on_duplicate: { type: 'string', enum: ['refuse', 'add'], description: 'What to do when the song already exists.' },
      },
      required: ['songbook', 'title', 'body'],
      additionalProperties: false,
    },
    annotations: { destructiveHint: false },
  },
  {
    name: 'update_song',
    title: 'Rewrite a song',
    description:
      'Replaces a song’s text (and optionally its title or artist). Send the version from get_song: if the song changed since, nothing is written and you must read it again. The previous text is kept and the owner can restore it.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: string('Song slug.'),
        version: integer('The version you read.'),
        body: string('The whole new ChordPro text.'),
        title: string('New title; omit to keep it.'),
        artist: { type: ['string', 'null'], description: 'New artist, null to clear; omit to keep it.' },
      },
      required: ['slug', 'version', 'body'],
      additionalProperties: false,
    },
    annotations: { destructiveHint: false },
  },
  {
    name: 'move_song',
    title: 'Move a song',
    description: 'Moves a song to another section, of the same or another songbook. It goes to the end of that section.',
    inputSchema: {
      type: 'object',
      properties: { slug: string('Song slug.'), section_id: integer('Destination section.') },
      required: ['slug', 'section_id'],
      additionalProperties: false,
    },
    annotations: { destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'create_songbook',
    title: 'Create a songbook',
    description: 'A new songbook, with one empty section.',
    inputSchema: {
      type: 'object',
      properties: { name: string('Name.') },
      required: ['name'],
      additionalProperties: false,
    },
    annotations: { destructiveHint: false },
  },
  {
    name: 'rename_songbook',
    title: 'Rename a songbook',
    description: 'Renames a songbook. Its slug does not change.',
    inputSchema: {
      type: 'object',
      properties: { songbook: string('Songbook slug.'), name: string('New name.') },
      required: ['songbook', 'name'],
      additionalProperties: false,
    },
    annotations: { destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'create_section',
    title: 'Create a section',
    description: 'A new section at the end of a songbook.',
    inputSchema: {
      type: 'object',
      properties: { songbook: string('Songbook slug.'), name: string('Name.') },
      required: ['songbook', 'name'],
      additionalProperties: false,
    },
    annotations: { destructiveHint: false },
  },
  {
    name: 'rename_section',
    title: 'Rename a section',
    description: 'Renames a section.',
    inputSchema: {
      type: 'object',
      properties: { section_id: integer('Section id.'), name: string('New name.') },
      required: ['section_id', 'name'],
      additionalProperties: false,
    },
    annotations: { destructiveHint: false, idempotentHint: true },
  },
]

export const RESOURCES: readonly ResourceDefinition[] = [
  {
    uri: GUIDE_URI,
    name: 'chordpro-guide',
    title: 'ChordPro in Strumfolio',
    description: 'Which ChordPro Strumfolio reads, and how to write a song it will show correctly.',
    mimeType: 'text/markdown',
    text: CHORDPRO_GUIDE,
  },
]

class ArgumentError extends Error {}

function text(args: Record<string, unknown>, key: string, required: true): string
function text(args: Record<string, unknown>, key: string, required?: false): string | undefined
function text(args: Record<string, unknown>, key: string, required = false): string | undefined {
  const value = args[key]
  if (value === undefined && !required) return undefined
  if (typeof value !== 'string') throw new ArgumentError(`${key} must be a string`)
  return value
}

function whole(args: Record<string, unknown>, key: string, required: true): number
function whole(args: Record<string, unknown>, key: string, required?: false): number | undefined
function whole(args: Record<string, unknown>, key: string, required = false): number | undefined {
  const value = args[key]
  if (value === undefined && !required) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new ArgumentError(`${key} must be an integer`)
  return value
}

const ok = (message: string, data?: unknown): ToolOutcome => ({ text: data === undefined ? message : `${message}\n\n${JSON.stringify(data, null, 2)}`, data })
const refused = (message: string): ToolOutcome => ({ text: message, isError: true })

/** Lines of the text a column takes (`METADATA_DIRECTIVE`), which the body should not carry. */
export function columnLines(body: string): string[] {
  return body.split(/\r?\n/).filter((line) => METADATA_DIRECTIVE.test(line))
}

/** Warns about column lines the write *adds*: a song that already carried them — the sample
 *  songbook's do — is the owner's text, and the guide tells the model to keep it as it is. */
function columnWarning(body: string, before = ''): string {
  const had = new Set(columnLines(before).map((line) => line.trim()))
  const lines = columnLines(body).filter((line) => !had.has(line.trim()))
  return lines.length === 0
    ? ''
    : `\n\nNote: the text contains ${lines.length === 1 ? 'a line' : 'lines'} naming a field the song keeps on its own (${lines
        .map((line) => line.trim())
        .join(', ')}). Pass title and artist as arguments instead, and remove those lines.`
}

async function songbookOf(accountId: number, slug: string) {
  const rows = await db()
    .select({ id: songbooks.id, slug: songbooks.slug, name: songbooks.name })
    .from(songbooks)
    .where(and(eq(songbooks.slug, slug), eq(songbooks.accountId, accountId)))
    .limit(1)
  return rows[0] ?? null
}

async function songOf(accountId: number, slug: string) {
  const rows = await db()
    .select({
      slug: songs.slug,
      title: songs.title,
      artist: songs.artist,
      body: songs.body,
      version: songs.version,
      updatedAt: songs.updatedAt,
      aiWrittenAt: songs.aiWrittenAt,
      sectionId: songs.sectionId,
      sectionName: sections.name,
      songbookSlug: songbooks.slug,
      songbookName: songbooks.name,
    })
    .from(songs)
    .innerJoin(songbooks, eq(songs.songbookId, songbooks.id))
    .innerJoin(sections, eq(songs.sectionId, sections.id))
    .where(and(eq(songs.slug, slug), eq(songbooks.accountId, accountId)))
    .limit(1)
  return rows[0] ?? null
}

function songCard(song: NonNullable<Awaited<ReturnType<typeof songOf>>>) {
  return {
    slug: song.slug,
    title: song.title,
    artist: song.artist,
    songbook: song.songbookSlug,
    songbook_name: song.songbookName,
    section_id: song.sectionId,
    section_name: song.sectionName,
    version: song.version,
    updated_at: song.updatedAt.toISOString(),
    last_written_by_ai: song.aiWrittenAt !== null,
  }
}

async function listSongbooks(accountId: number): Promise<ToolOutcome> {
  const books = await db()
    .select({ id: songbooks.id, slug: songbooks.slug, name: songbooks.name })
    .from(songbooks)
    .where(eq(songbooks.accountId, accountId))
    .orderBy(asc(songbooks.position))

  const parts =
    books.length === 0
      ? []
      : await db()
          .select({ id: sections.id, songbookId: sections.songbookId, name: sections.name })
          .from(sections)
          .where(inArray(sections.songbookId, books.map((book) => book.id)))
          .orderBy(asc(sections.position))

  const data = books.map((book) => ({
    slug: book.slug,
    name: book.name,
    sections: parts.filter((part) => part.songbookId === book.id).map(({ id, name }) => ({ id, name })),
  }))
  return ok(`${data.length} songbook${data.length === 1 ? '' : 's'}.`, { songbooks: data })
}

async function listSongs(accountId: number, args: Record<string, unknown>): Promise<ToolOutcome> {
  const slug = text(args, 'songbook')
  const sectionId = whole(args, 'section_id')
  if (slug === undefined && sectionId === undefined) return refused('Name a songbook or a section_id.')

  const filters = [eq(songbooks.accountId, accountId)]
  if (slug !== undefined) filters.push(eq(songbooks.slug, slug))
  if (sectionId !== undefined) filters.push(eq(songs.sectionId, sectionId))

  const rows = await db()
    .select({
      slug: songs.slug,
      title: songs.title,
      artist: songs.artist,
      sectionId: songs.sectionId,
      version: songs.version,
      aiWrittenAt: songs.aiWrittenAt,
    })
    .from(songs)
    .innerJoin(songbooks, eq(songs.songbookId, songbooks.id))
    .innerJoin(sections, eq(songs.sectionId, sections.id))
    .where(and(...filters))
    .orderBy(asc(sections.position), asc(songs.position), asc(songs.title))

  const data = rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    artist: row.artist,
    section_id: row.sectionId,
    version: row.version,
    last_written_by_ai: row.aiWrittenAt !== null,
  }))
  return ok(`${data.length} song${data.length === 1 ? '' : 's'}.`, { songs: data })
}

async function searchSongs(accountId: number, args: Record<string, unknown>): Promise<ToolOutcome> {
  const query = text(args, 'query', true).trim().toLowerCase()
  if (query === '') return refused('query is empty.')
  const limit = Math.min(Math.max(whole(args, 'limit') ?? 20, 1), SEARCH_LIMIT_MAX)

  const rows = await db()
    .select({ slug: songs.slug, title: songs.title, artist: songs.artist, body: songs.body, songbook: songbooks.slug })
    .from(songs)
    .innerJoin(songbooks, eq(songs.songbookId, songbooks.id))
    .where(eq(songbooks.accountId, accountId))
    .orderBy(asc(songs.title))

  const hits = []
  for (const row of rows) {
    /* The haystack `search-index.ts` builds for the app's own search, without chords. */
    const parsed = parseChordPro(row.body)
    const haystack = [row.title, row.artist ?? '', parsed.tags.join(' '), plainLyrics(parsed)].join('\n').toLowerCase()
    if (!haystack.includes(query)) continue
    hits.push({ slug: row.slug, title: row.title, artist: row.artist, songbook: row.songbook })
    if (hits.length >= limit) break
  }
  return ok(`${hits.length} match${hits.length === 1 ? '' : 'es'}.`, { songs: hits })
}

async function getSong(accountId: number, args: Record<string, unknown>): Promise<ToolOutcome> {
  const song = await songOf(accountId, text(args, 'slug', true))
  if (song === null) return refused('No song with that slug.')
  return {
    text: `${JSON.stringify(songCard(song), null, 2)}\n\n--- ChordPro ---\n${song.body}`,
    data: { ...songCard(song), body: song.body },
  }
}

async function createSong(accountId: number, args: Record<string, unknown>): Promise<ToolOutcome> {
  const book = await songbookOf(accountId, text(args, 'songbook', true))
  if (book === null) return refused('No songbook with that slug.')
  const body = text(args, 'body', true)

  const result = await saveSong(
    {
      title: text(args, 'title', true),
      artist: text(args, 'artist') ?? null,
      songbookSlug: book.slug,
      sectionId: whole(args, 'section_id') ?? null,
      body,
    },
    args.on_duplicate === 'add' ? 'add' : undefined,
  )

  if (!result.ok) {
    if (result.reason === 'duplicate') {
      return refused(
        `A song with this title and artist already exists (slug ${result.existing.slug}). Use update_song on it, or send on_duplicate "add" to keep both.`,
      )
    }
    return refused(saveMessage(result))
  }

  const song = await songOf(accountId, result.song.slug)
  return ok(`Created.${columnWarning(body)}`, song === null ? undefined : songCard(song))
}

async function updateSong(accountId: number, args: Record<string, unknown>): Promise<ToolOutcome> {
  const current = await songOf(accountId, text(args, 'slug', true))
  if (current === null) return refused('No song with that slug.')

  const version = whole(args, 'version', true)
  const body = text(args, 'body', true)
  const title = text(args, 'title') ?? current.title
  const artist = args.artist === undefined ? current.artist : args.artist === null ? null : text(args, 'artist')

  if (body.length > SONG_TEXT_MAX || title.length > SONG_TITLE_MAX) return refused(saveMessage({ reason: 'too-long' }))

  const result = await saveSong({
    slug: current.slug,
    title,
    artist: artist ?? null,
    songbookSlug: current.songbookSlug,
    sectionId: current.sectionId,
    body,
    expectedVersion: version,
  })

  if (!result.ok) {
    if (result.reason === 'conflict') {
      return refused('The song changed since you read it. Nothing was written: call get_song again and redo the edit on the new text.')
    }
    return refused(result.reason === 'duplicate' ? saveMessage({ reason: 'failed' }) : saveMessage(result))
  }

  const song = await songOf(accountId, current.slug)
  return ok(
    `Saved. The previous text is kept and can be restored from the app.${columnWarning(body, current.body)}`,
    song === null ? undefined : songCard(song),
  )
}

async function moveSongTool(accountId: number, args: Record<string, unknown>): Promise<ToolOutcome> {
  const song = await songOf(accountId, text(args, 'slug', true))
  if (song === null) return refused('No song with that slug.')
  const result = await moveSong(song.slug, whole(args, 'section_id', true))
  return result.ok ? ok('Moved.') : refused(result.reason === 'not-found' ? 'No such section.' : writeMessage(result))
}

async function createSongbookTool(args: Record<string, unknown>): Promise<ToolOutcome> {
  const result = await createSongbook(text(args, 'name', true))
  return result.ok ? ok('Created.', { slug: result.slug }) : refused(writeMessage(result))
}

async function renameSongbookTool(accountId: number, args: Record<string, unknown>): Promise<ToolOutcome> {
  const book = await songbookOf(accountId, text(args, 'songbook', true))
  if (book === null) return refused('No songbook with that slug.')
  const result = await renameSongbook(book.slug, text(args, 'name', true))
  return result.ok ? ok('Renamed.') : refused(writeMessage(result))
}

async function createSectionTool(accountId: number, args: Record<string, unknown>): Promise<ToolOutcome> {
  const book = await songbookOf(accountId, text(args, 'songbook', true))
  if (book === null) return refused('No songbook with that slug.')
  const result = await createSection(book.slug, text(args, 'name', true))
  return result.ok ? ok('Created.', { id: result.id }) : refused(writeMessage(result))
}

async function renameSectionTool(args: Record<string, unknown>): Promise<ToolOutcome> {
  const result = await renameSection(whole(args, 'section_id', true), text(args, 'name', true))
  return result.ok ? ok('Renamed.') : refused(result.reason === 'not-found' ? 'No such section.' : writeMessage(result))
}

type Handler = (accountId: number, args: Record<string, unknown>) => Promise<ToolOutcome>

/** One entry per tool in `TOOLS`, and no other — `tools.test.ts` holds the two lists equal. */
export const HANDLERS: Record<string, Handler> = {
  list_songbooks: (accountId) => listSongbooks(accountId),
  list_songs: listSongs,
  search_songs: searchSongs,
  get_song: getSong,
  create_song: createSong,
  update_song: updateSong,
  move_song: moveSongTool,
  create_songbook: (_accountId, args) => createSongbookTool(args),
  rename_songbook: renameSongbookTool,
  create_section: createSectionTool,
  rename_section: (_accountId, args) => renameSectionTool(args),
}

/**
 * The server for one token's account. Must be called — and its tools run — inside
 * `runAsToken` for that same account: the reads use `accountId` directly, the writes rely on the
 * actor to be scoped at all.
 */
export function serverFor(accountId: number): Server {
  return {
    instructions: SERVER_INSTRUCTIONS,
    tools: TOOLS,
    resources: RESOURCES,
    async callTool(name, args) {
      const handler = Object.hasOwn(HANDLERS, name) ? HANDLERS[name] : undefined
      if (handler === undefined) return refused(`Unknown tool: ${name}`)
      try {
        return await handler(accountId, args)
      } catch (error) {
        if (error instanceof ArgumentError) return refused(error.message)
        throw error
      }
    },
  }
}
