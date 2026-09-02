/**
 * How long an article takes to read, worked out from the article rather than typed into it.
 *
 * A field somebody has to fill in is a field somebody forgets, and worse, one that stays at
 * "4 min" after the piece has doubled in length. The source file is already being read to be
 * compiled, so the honest number is free.
 *
 * Pure and string-in/number-out so `npm test` can hold it — see `meta.ts`' header on why that
 * decides where logic lives in this repo.
 */

/**
 * Words per minute for silent reading of ordinary prose.
 *
 * Two hundred is the low end of the usual range, chosen on purpose: the estimate exists to
 * let somebody decide whether they have time to read this now, and a reader who finishes
 * early is better served than one who is still going at twice the promised time.
 */
const WORDS_PER_MINUTE = 200

/**
 * Removes the `export const meta = { … }` block from the top of an article.
 *
 * By counting braces rather than by matching a closing line, because the block contains
 * strings that may contain braces, and a description ending in `}` would truncate the whole
 * article to nothing with the naive version — silently, since the result is still a number.
 */
function stripMetaExport(source: string): string {
  const start = source.search(/export\s+const\s+meta\s*=\s*\{/)
  if (start === -1) return source

  const open = source.indexOf('{', start)
  let depth = 0

  for (let index = open; index < source.length; index += 1) {
    const character = source[index]
    if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) return source.slice(0, start) + source.slice(index + 1)
    }
  }

  /* Unbalanced braces: the file will not compile anyway, and this is not the error worth
   * reporting. Count what is there rather than throwing over it. */
  return source.slice(0, start)
}

/**
 * The reading time of one article's `.mdx` source, in whole minutes, never less than one.
 *
 * What is deliberately *not* counted: the meta block, fenced code, JSX tags and the markdown
 * punctuation around words. A chord grid and a heading's own `##` are not reading, and
 * counting them would inflate exactly the articles that are quickest to read.
 *
 * A word here is any run of non-space characters holding at least one letter or digit, which
 * is what keeps a line of `---` or a lone `*` from counting as three words.
 */
export function readingTimeMinutes(source: string): number {
  const prose = stripMetaExport(source)
    /* Fenced code first: everything inside is excluded, backticks and all. */
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    /* JSX and HTML tags, but not what sits between them — the words in a `<Note>…</Note>`
     * are read like any others. */
    .replace(/<[^>]+>/g, ' ')
    /* Link and image syntax: keep the visible text, drop the URL nobody reads. */
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    /* The markdown that decorates words rather than being them. */
    .replace(/[#>*_~|-]/g, ' ')

  const words = prose.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word))

  return Math.max(1, Math.round(words.length / WORDS_PER_MINUTE))
}
