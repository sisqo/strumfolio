/**
 * ChordPro's text markup — the Pango-like tags the format allows in lyrics, chords and any
 * other text (`ChordPro-Markup.md` in the reference documentation).
 *
 * **Read, never printed as tags.** Until 2026-09-23 a `<b>` in a lyric reached the screen as
 * the four characters `<b>`, which is the one outcome a file written for the reference
 * implementation can never have intended. What is drawn now: bold, italic, underline,
 * strikethrough, superscript, subscript, larger and smaller text, monospace, and the named
 * `<sym/>` symbols this app has a character for. A `<span>` is read for the attributes that
 * mean one of those; its colours, fonts and the rest are a typesetter's business, like the
 * `{textfont}` directives, and are dropped — the words inside are never lost.
 *
 * **Only the tags the format defines are markup.** Anything else that happens to start with
 * `<` — «a < b», «<3», a tag this list does not know — is text and stays exactly as written.
 * That is what keeps a lyric with an angle bracket in it from losing a word.
 *
 * The file keeps every tag: the editor works on source text, and nothing here rewrites it.
 * What this module answers is how a line *looks*, and — through `markupTagAt` — where a
 * drawn character sits in the source, which `comments/anchorMap.ts` needs to keep notes on
 * the right word when tags come between them.
 */

export interface MarkStyle {
  bold?: true
  italic?: true
  underline?: true
  strike?: true
  sup?: true
  sub?: true
  big?: true
  small?: true
  mono?: true
}

/** A stretch of text in one style — or, with `symbol`, a named symbol that is not text. */
export interface Run {
  text: string
  style: MarkStyle
  /** A `<sym/>` drawn as this character. Never part of any part's `text`. */
  symbol?: string
}

export interface MarkupTag {
  /** How many characters of source the tag occupies. */
  length: number
  kind: 'open' | 'close' | 'symbol' | 'empty'
  name: string
  style: MarkStyle
  symbol?: string
}

const SPAN_TAGS = new Set(['b', 'i', 'u', 's', 'sub', 'sup', 'big', 'small', 'tt', 'span'])

const TAG_STYLE: Record<string, MarkStyle> = {
  b: { bold: true },
  i: { italic: true },
  u: { underline: true },
  s: { strike: true },
  sub: { sub: true },
  sup: { sup: true },
  big: { big: true },
  small: { small: true },
  tt: { mono: true },
  span: {},
}

/** The `<sym name="…"/>` names drawn as a character; any other name draws nothing. */
const SYMBOLS: Record<string, string> = {
  sharp: '♯',
  flat: '♭',
  natural: '♮',
  'arrow-up': '↑',
  'arrow-down': '↓',
  'arrow-left': '←',
  'arrow-right': '→',
  'repeat-start': '𝄆',
  'repeat-end': '𝄇',
  bar: '|',
  'bar-double': '‖',
}

const OPEN_OR_CLOSE = /^<(\/?)([a-zA-Z]+)((?:\s+[a-zA-Z_-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*>/
const SELF_CLOSING = /^<([a-zA-Z]+)((?:\s+[a-zA-Z_-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/>/

function attributes(source: string): Record<string, string> {
  const found: Record<string, string> = {}
  for (const match of source.matchAll(/([a-zA-Z_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    found[match[1].toLowerCase()] = (match[2] ?? match[3] ?? '').toLowerCase()
  }
  return found
}

/** The style a `<span>`'s attributes ask for, as far as this app can draw it. */
function spanStyle(attrs: Record<string, string>): MarkStyle {
  const style: MarkStyle = {}
  const weight = attrs.weight ?? attrs.font_weight
  if (weight !== undefined && /bold|heavy|black|^[6-9]00$/.test(weight)) style.bold = true
  const slant = attrs.style ?? attrs.font_style
  if (slant !== undefined && /italic|oblique/.test(slant)) style.italic = true
  if (attrs.underline !== undefined && attrs.underline !== 'none') style.underline = true
  if (attrs.strikethrough === 'true') style.strike = true
  const family = attrs.face ?? attrs.font_family ?? attrs.font
  if (family !== undefined && /mono/.test(family)) style.mono = true
  const size = attrs.size ?? attrs.font_size
  if (size !== undefined && /larger|large/.test(size)) style.big = true
  if (size !== undefined && /smaller|small/.test(size)) style.small = true
  return style
}

/** The markup tag starting at `index`, or null when what is there is just text. */
export function markupTagAt(text: string, index: number): MarkupTag | null {
  if (text[index] !== '<') return null
  const rest = text.slice(index)

  const empty = SELF_CLOSING.exec(rest)
  if (empty !== null) {
    const name = empty[1].toLowerCase()
    if (name === 'sym') {
      const symbol = SYMBOLS[attributes(empty[2]).name ?? '']
      return { length: empty[0].length, kind: symbol === undefined ? 'empty' : 'symbol', name, style: {}, symbol }
    }
    if (name === 'strut') return { length: empty[0].length, kind: 'empty', name, style: {} }
    return null
  }

  const tag = OPEN_OR_CLOSE.exec(rest)
  if (tag === null) return null
  const name = tag[2].toLowerCase()
  if (!SPAN_TAGS.has(name)) return null

  if (tag[1] === '/') return { length: tag[0].length, kind: 'close', name, style: {} }
  const style = name === 'span' ? spanStyle(attributes(tag[3])) : TAG_STYLE[name]
  return { length: tag[0].length, kind: 'open', name, style }
}

/**
 * The style in force as tags open and close, one line at a time.
 *
 * A stack rather than a set of flags, because the format nests (`<b>bold <i>both</i></b>`)
 * and a closing tag closes the innermost open one of its name. A closing tag with nothing
 * to close is ignored rather than trusted, and anything left open ends with the line.
 */
export class MarkupState {
  private open: { name: string; style: MarkStyle }[] = []

  apply(tag: MarkupTag): void {
    if (tag.kind === 'open') this.open.push({ name: tag.name, style: tag.style })
    if (tag.kind === 'close') {
      for (let at = this.open.length - 1; at >= 0; at -= 1) {
        if (this.open[at].name === tag.name) {
          this.open.splice(at, 1)
          break
        }
      }
    }
  }

  style(): MarkStyle {
    return Object.assign({}, ...this.open.map((entry) => entry.style)) as MarkStyle
  }
}

export function sameStyle(one: MarkStyle, other: MarkStyle): boolean {
  const keys = new Set([...Object.keys(one), ...Object.keys(other)])
  for (const key of keys) if (one[key as keyof MarkStyle] !== other[key as keyof MarkStyle]) return false
  return true
}

export function isStyled(runs: readonly Run[]): boolean {
  return runs.some((run) => run.symbol !== undefined || Object.keys(run.style).length > 0)
}

/** A whole string as runs, for text that is not split into words — a comment, a label. */
export function markupRuns(text: string): Run[] {
  const state = new MarkupState()
  const runs: Run[] = []

  for (let index = 0; index < text.length; index += 1) {
    const tag = markupTagAt(text, index)
    if (tag !== null) {
      if (tag.kind === 'symbol') runs.push({ text: '', style: state.style(), symbol: tag.symbol })
      state.apply(tag)
      index += tag.length - 1
      continue
    }
    const style = state.style()
    const last = runs[runs.length - 1]
    if (last !== undefined && last.symbol === undefined && sameStyle(last.style, style)) last.text += text[index]
    else runs.push({ text: text[index], style })
  }

  return runs
}

/** The text with every markup tag taken out, as a typesetter that draws no styles would print it. */
export function stripMarkup(text: string): string {
  if (!text.includes('<')) return text
  return markupRuns(text)
    .map((run) => run.symbol ?? run.text)
    .join('')
}
