/**
 * `%{…}` — the format's way of putting a metadata value inside text.
 *
 * `%{artist}` becomes the artist. `%{artist|by %{}}` becomes «by <artist>» when there is one
 * and nothing at all when there is not, the inner `%{}` standing for the value just named.
 * A third part is the else: `%{artist|by %{}|traditional}`.
 *
 * ## Two decisions that shape the whole module
 *
 * **Substitution happens at render, never at parse.** Every comment in a song is anchored by
 * a character offset into the source line; replacing `%{artist}` with a name of a different
 * length at parse time would slide every note on that line. So the parse keeps the
 * placeholder exactly as written — `parseChordPro` even keeps it whole through word
 * splitting, see `placeholderAt` — and the renderer substitutes on the way to the screen.
 * The file is never rewritten, which is also what an export needs: `%{artist}` is what the
 * writer typed and what they get back.
 *
 * **A placeholder that names nothing resolves to nothing.** Not to the text of the
 * placeholder, which is the bug this replaced, and not to a marker: a file that asks for a
 * field this app does not hold is asking for something absent, and absent is empty.
 */

import type { ParsedSong } from './chordpro'

/**
 * The longest `%{…}` this app reads as one, braces included. Anything longer is text.
 *
 * Without it the scan below ran to the end of the song for every `%{` that never closes, so a
 * line of them was quadratic — `'%{'` written 16,000 times took 0.8 s to parse and 300 KB of
 * them 78 s, on the server that parses every song to draw the home screen — and a placeholder
 * nested five thousand deep sent `substituteMetadata` through the stack. A real one is a name
 * and two short branches; 256 characters bounds the scan, and with it the nesting, which needs
 * three characters a level.
 */
export const PLACEHOLDER_MAX = 256

/**
 * Where a `%{…}` starting at `index` ends, or null when it never closes within
 * `PLACEHOLDER_MAX`.
 *
 * Brace-aware, because the conditional form nests: in `%{artist|by %{}}` the first `}` closes
 * the inner placeholder and not the outer one. Returns the index just past the closing brace,
 * so a caller can slice `[index, end)` and get the placeholder whole.
 */
export function placeholderAt(text: string, index: number): number | null {
  if (text[index] !== '%' || text[index + 1] !== '{') return null

  let depth = 0
  const limit = Math.min(text.length, index + PLACEHOLDER_MAX)

  for (let i = index + 1; i < limit; i += 1) {
    if (text[i] === '{') depth += 1
    else if (text[i] === '}') {
      depth -= 1
      if (depth === 0) return i + 1
    }
  }

  return null
}

/** Every name a `%{…}` may use here, and what the song says it is. */
export type MetadataValues = Record<string, string>

/**
 * The values a placeholder may name, from the song and from the row beside it.
 *
 * `title` and `artist` come in separately rather than off the parse: the importer consumes
 * both into columns and strips their lines, so the body a reader is looking at usually
 * carries neither — and `%{title}` naming nothing on every imported song would make the
 * feature useless exactly where it is used.
 *
 * Empty strings are left out, so «set» and «set to nothing» are one state. The conditional
 * form turns on that distinction and a field written empty is a field the writer did not
 * fill in.
 */
export function metadataValues(
  song: ParsedSong,
  title: string | null,
  artist: string | null,
): MetadataValues {
  const values: MetadataValues = {}
  const set = (name: string, value: string | number | null) => {
    const text = value === null ? '' : String(value).trim()
    if (text !== '') values[name] = text
  }

  set('title', title ?? song.title)
  set('artist', artist ?? song.artist)
  set('subtitle', song.subtitle)
  set('key', song.key)
  set('capo', song.capo)
  set('tempo', song.tempo)
  set('album', song.metadata.album)
  set('composer', song.metadata.composer)
  set('lyricist', song.metadata.lyricist)
  set('arranger', song.metadata.arranger)
  set('year', song.metadata.year)
  set('copyright', song.metadata.copyright)
  set('duration', song.metadata.duration)
  set('ccli', song.metadata.ccli)
  set('sorttitle', song.metadata.sortTitle)
  set('sortartist', song.metadata.sortArtist)

  return values
}

/** Splits on `|` at brace depth 0, so a nested `%{}` inside a branch travels with it. */
function splitParts(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0

  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '{') depth += 1
    else if (body[i] === '}') depth -= 1
    else if (body[i] === '|' && depth === 0) {
      parts.push(body.slice(start, i))
      start = i + 1
    }
  }

  parts.push(body.slice(start))
  return parts
}

/**
 * Text with every `%{…}` resolved.
 *
 * `current` is what a bare `%{}` means — the value of the placeholder whose branch is being
 * expanded. Outside any branch there is none, so a bare `%{}` is empty, which is the only
 * reading that does not invent a value nobody named.
 */
export function substituteMetadata(
  text: string,
  values: MetadataValues,
  current: string | null = null,
): string {
  if (!text.includes('%{')) return text

  let out = ''

  for (let i = 0; i < text.length; i += 1) {
    const end = text[i] === '%' ? placeholderAt(text, i) : null
    if (end === null) {
      out += text[i]
      continue
    }

    const body = text.slice(i + 2, end - 1)
    i = end - 1

    // `%{}` — the value of the branch we are inside.
    if (body === '') {
      out += current ?? ''
      continue
    }

    const [name, whenSet, whenUnset] = splitParts(body)
    const value = values[name.trim()]

    if (whenSet === undefined) {
      out += value ?? ''
      continue
    }

    const branch = value === undefined ? (whenUnset ?? '') : whenSet
    out += substituteMetadata(branch, values, value ?? null)
  }

  return out
}
