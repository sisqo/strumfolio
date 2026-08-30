/**
 * OpenSong and OpenLyrics XML, turned into ChordPro text.
 *
 * Neither becomes a song directly: both produce ChordPro that `prepareSongs` then
 * reads exactly as it reads a pasted file. Every format parser in this directory works
 * that way, and it is what keeps the guesses in `convert.ts` and `deduce.ts` in one
 * place rather than re-implemented, slightly differently, per format.
 *
 * ## No DOMParser
 *
 * The obvious implementation reaches for `DOMParser`, which every browser has and
 * `node:test` does not — and `npm test` in this repo is plain `node:test` over pure
 * modules. Rather than take a DOM dependency, or inject a parser and leave the real
 * browser path untested, the reading below is done by hand over the string. That is
 * also the house idiom: the ChordPro parser and the key estimator are both hand-rolled
 * for the same reason. The subset needed here is small and closed — these two schemas,
 * both shallow — so a general XML parser would be answering a question nobody asked.
 *
 * ## Why these two are worth reading at all
 *
 * OpenSong XML circulates almost entirely inside the worship-projection world: it is
 * absent from the import lists of every app aimed at guitarists. On its own it would
 * not earn a parser. It earns one because OnSong exports it — a second way out for
 * anybody who has it — and because the whole cost is this file.
 *
 * ## OpenSong's layout, which is the interesting part
 *
 * Chords are positional, like a plain chords-above-lyrics file, but the two kinds of
 * line are *marked* rather than guessed at: a chord line begins with `.`, a lyric line
 * with a space. That removes the single largest source of error in this whole import
 * path — `isChordLine`'s heuristic — so the marks are honoured strictly and the
 * heuristic is never consulted for this format.
 *
 *     [V1]
 *     .A          D
 *      Amazing grace how sweet
 */

import { xmlFlavour } from '../detect'

/** The five XML entities, plus numeric ones. Nothing else appears in these files. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Last, always: an `&amp;lt;` must decode to the text `&lt;`, not to `<`.
    .replace(/&amp;/g, '&')
}

/**
 * The contents of the first `<tag>…</tag>`, decoded, or null when absent or empty.
 *
 * `[^]` rather than `.` with the `s` flag: lyrics span many lines, and this repo
 * targets a lower ES lib than `dotAll` is guaranteed in.
 */
export function elementText(source: string, tag: string): string | null {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([^]*?)</${tag}>`, 'i').exec(source)
  if (match === null) return null

  const value = decodeEntities(match[1]).trim()
  return value === '' ? null : value
}

/** An attribute off the first occurrence of an element. */
function attributeOf(source: string, tag: string, name: string): string | null {
  const element = new RegExp(`<${tag}(\\s[^>]*)?/?>`, 'i').exec(source)
  if (element === null || element[1] === undefined) return null

  const found = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(element[1])
  return found === null || found[1].trim() === '' ? null : decodeEntities(found[1].trim())
}

/** `[V1]` → `Verse 1`, `[C]` → `Chorus`. Anything unrecognised keeps its own name. */
const SECTION_NAMES: Record<string, string> = {
  v: 'Verse',
  c: 'Chorus',
  b: 'Bridge',
  p: 'Pre-chorus',
  t: 'Tag',
  e: 'Ending',
  i: 'Intro',
  o: 'Outro',
}

/**
 * Expanded to long names on purpose: `[C]` in a body is a chord everywhere else in
 * this app, and left as it stands it would be read as one by any later pass over the
 * converted text — including the one `looksLikeChordPro` makes.
 */
export function sectionName(marker: string): string {
  const match = /^([a-z]+)\s*(\d*)$/i.exec(marker.trim())
  if (match === null) return marker.trim()

  const name = SECTION_NAMES[match[1].toLowerCase()]
  if (name === undefined) return marker.trim()

  return match[2] === '' ? name : `${name} ${match[2]}`
}

/**
 * Merges one `.`-marked chord line with the lyric line beneath it.
 *
 * The column arithmetic is `convert.ts`'s own `merge`, and deliberately identical —
 * but it cannot call that one: both lines here carry a one-character marker in column
 * zero that must come off *before* the columns mean anything, and handing it
 * pre-stripped lines would leave every chord one column right of its syllable.
 */
function mergeMarked(chordLine: string, lyricLine: string): string {
  const chords = chordLine.slice(1)
  const lyrics = lyricLine.startsWith(' ') ? lyricLine.slice(1) : lyricLine

  const found: { text: string; col: number }[] = []
  const pattern = /\S+/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(chords)) !== null) {
    found.push({ text: match[0], col: match.index })
  }

  if (found.length === 0) return lyrics

  let out = lyrics.padEnd(Math.max(...found.map((token) => token.col)), ' ')
  for (const token of [...found].reverse()) {
    out = `${out.slice(0, token.col)}[${token.text}]${out.slice(token.col)}`
  }
  return out.trimEnd()
}

/** A chord line with no words under it — an intro or a turnaround. */
function chordsAlone(chordLine: string): string {
  return (chordLine.slice(1).match(/\S+/g) ?? []).map((chord) => `[${chord}]`).join(' ')
}

export function openSongLyricsToChordPro(lyrics: string): string {
  const lines = lyrics.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, '')

    const marker = /^\[([^\]]+)\]$/.exec(line.trim())
    if (marker !== null) {
      out.push(`{comment: ${sectionName(marker[1])}}`)
      continue
    }

    if (line.startsWith('.')) {
      const next = lines[i + 1] ?? ''
      if (next.startsWith(' ') && next.trim() !== '') {
        out.push(mergeMarked(line, next.replace(/\s+$/, '')))
        i++
      } else {
        out.push(chordsAlone(line))
      }
      continue
    }

    // A `;` line is OpenSong's own comment and belongs to nobody. A lyric line's
    // leading space is a marker, not indentation, so it comes off here.
    if (line.trimStart().startsWith(';')) continue
    out.push(line.startsWith(' ') ? line.slice(1) : line)
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * OpenLyrics wraps each chord around the syllable it precedes, as a real element:
 * `<chord root="D"/>Amazing`. Structurally the nicest of the lot — no columns to
 * reconstruct and no heuristic anywhere — so this is a substitution, not a guess.
 */
export function openLyricsToChordPro(source: string): string {
  const out: string[] = []

  for (const verse of source.matchAll(/<verse(\s[^>]*)?>([^]*?)<\/verse>/gi)) {
    const name = /\bname\s*=\s*"([^"]*)"/i.exec(verse[1] ?? '')
    if (name !== null) out.push(`{comment: ${sectionName(name[1])}}`)

    for (const lines of verse[2].matchAll(/<lines(?:\s[^>]*)?>([^]*?)<\/lines>/gi)) {
      const text = lines[1]
        // A chord becomes a bracket right where it sat.
        .replace(/<chord(\s[^>]*?)\/?>/gi, (_, attributes: string) => {
          const root = /\broot\s*=\s*"([^"]*)"/i.exec(attributes) ?? /\bname\s*=\s*"([^"]*)"/i.exec(attributes)
          if (root === null) return ''
          const structure = /\bstructure\s*=\s*"([^"]*)"/i.exec(attributes)
          return `[${root[1]}${structure === null ? '' : structure[1]}]`
        })
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')

      for (const line of decodeEntities(text).split('\n')) {
        if (line.trim() !== '') out.push(line.trim())
      }
    }

    out.push('')
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function directive(name: string, value: string | null): string[] {
  return value === null ? [] : [`{${name}: ${value}}`]
}

/**
 * One XML file to ChordPro text.
 *
 * Null when the document holds no song, rather than an empty string: the caller counts
 * songs, and a file that parsed into nothing is a file to report rather than a song
 * with no words.
 */
export function xmlToChordPro(source: string): string | null {
  if (xmlFlavour(source) === 'openlyrics') {
    const body = openLyricsToChordPro(source)
    if (body === '') return null

    const head = [
      ...directive('title', elementText(source, 'title')),
      ...directive('artist', elementText(source, 'author')),
      ...directive('ccli', attributeOf(source, 'song', 'ccliNo')),
      ...directive('copyright', attributeOf(source, 'song', 'copyright') ?? elementText(source, 'copyright')),
    ]
    return `${head.join('\n')}\n\n${body}\n`
  }

  const lyrics = elementText(source, 'lyrics')
  if (lyrics === null) return null

  const body = openSongLyricsToChordPro(lyrics)
  if (body === '') return null

  const head = [
    ...directive('title', elementText(source, 'title')),
    ...directive('artist', elementText(source, 'author')),
    ...directive('key', elementText(source, 'key')),
    ...directive('tempo', elementText(source, 'tempo')),
    ...directive('time', elementText(source, 'timesig')),
    ...directive('ccli', elementText(source, 'ccli')),
    ...directive('copyright', elementText(source, 'copyright')),
    ...directive('tags', elementText(source, 'theme')),
  ]

  return `${head.join('\n')}\n\n${body}\n`
}
