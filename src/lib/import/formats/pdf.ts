/**
 * A PDF, read back into the text it draws.
 *
 * A PDF does not hold lines. It holds runs of glyphs, each with a position on the page,
 * in whatever order the producer happened to emit them — and a chord sheet is *entirely*
 * about position: a chord means the syllable it sits over, and nothing else. So the work
 * here is not «extract the text», which `pdfjs` already does, but «put it back into rows
 * and columns», which is the whole of `layoutPages` below and the only part with any
 * judgement in it.
 *
 * ## Two halves, one of them testable
 *
 * `layoutPages` takes plain objects — a string, a position, a size — and returns text. It
 * knows nothing about `pdfjs` and runs anywhere, which is what lets `pdf.test.ts` feed it
 * pages built by hand and assert on the columns that come out, under the same
 * `node:test`-over-pure-functions rule the rest of this repo works by. `readPdf` is the
 * other half and is deliberately thin: open the document, ask each page for its text
 * items, hand them over.
 *
 * ## The engine, and where it runs
 *
 * `pdfjs-dist` arrives by `await import()` at the moment a `.pdf` is dropped, so nobody
 * pasting ChordPro downloads it — the promise `read.ts` makes for every format here, and
 * the reason a PDF engine was named in it before one existed.
 *
 * **It runs on the main thread, deliberately.** `pdfjs` normally parses in a Worker, and
 * skipping that is a real cost paid for two real gains. Importing the worker module in
 * the main thread is `pdfjs`' own supported path — it sets `globalThis.pdfjsWorker`,
 * which the engine looks for before it tries to spawn anything — and it means the whole
 * engine is two ordinary `import()`s the bundler splits like any other chunk, with no
 * `new Worker(new URL(…))` for a bundler to get wrong and no second asset for
 * `next.config.ts` to have to recognise on its way out of the precache manifest. That
 * exclusion is worth 1.67 MB of the 4.81 MB every install of this app downloads, for a
 * format most people will never drop.
 *
 * What it costs is that the page cannot repaint while a document is being read.
 * Measured here on an 80-page songbook: **68–129 ms**, and 5–24 ms for the one- to
 * four-page charts that are the ordinary case. That is an affordable freeze for a
 * button somebody presses once, and it is why the trade is worth taking rather than
 * merely defensible.
 *
 * Nothing is uploaded. Like every other format in this directory, the file is opened in
 * the browser and the server never sees it until a song is saved.
 *
 * ## What this cannot do
 *
 * A scan has no text in it — a photograph of a page is a picture whichever container it
 * arrives in — and there is no OCR here. That case is recognised and refused in words
 * that say so, rather than presented as a song with nothing in it.
 */

export interface PdfTextItem {
  str: string
  /**
   * `pdfjs`' text matrix. Only two of the six numbers are read here: `[4]` is the x of
   * the run's left edge and `[5]` the y of its baseline, both in PDF user space, where
   * y grows *upward* — hence the descending sort in `linesOf`.
   */
  transform: number[]
  /** The run's width in the same space, which is what makes a character advance. */
  width: number
  /** The glyph height, which stands in for the font size when telling a title apart. */
  height: number
}

export interface PdfPage {
  items: PdfTextItem[]
}

export type PdfResult = { ok: true; text: string } | { ok: false; message: string }

/** One reconstructed row of a page. */
interface Line {
  /** The baseline it was gathered at, for measuring the gap to the next one. */
  y: number
  /** The tallest glyph on it — a title is recognised by this and nothing else. */
  size: number
  text: string
}

/**
 * The value at the middle of a weighted distribution.
 *
 * Weighted, because the samples are per *run* and the question is per *character*: a
 * page whose body is one long paragraph and whose title is three big words in one run
 * would otherwise weigh the title as heavily as the body, and the title is precisely
 * what has to lose. Sorting and walking the weights is the whole of it.
 */
function weightedMedian(samples: { value: number; weight: number }[]): number {
  if (samples.length === 0) return 0

  const sorted = [...samples].sort((a, b) => a.value - b.value)
  const half = sorted.reduce((total, sample) => total + sample.weight, 0) / 2

  let seen = 0
  for (const sample of sorted) {
    seen += sample.weight
    if (seen >= half) return sample.value
  }
  return sorted[sorted.length - 1].value
}

/** Runs with actual words in them; whitespace-only runs are spacing, and columns say it better. */
function inkOf(page: PdfPage): PdfTextItem[] {
  return page.items.filter((item) => item.str.trim() !== '')
}

/**
 * How wide one character is on this page, in the same units as the positions.
 *
 * This is the ruler the columns are measured with, and it is taken once per page rather
 * than once per line on purpose: chords-above-lyrics alignment is a relationship
 * *between* two adjacent lines, and a ruler that changed between them would destroy the
 * one fact being reconstructed. A page of a chord sheet is one font at one size in the
 * overwhelming majority of real files, so one number is not an approximation there — it
 * is the right answer, and elsewhere it is at least a consistent wrong one.
 */
function characterWidthOf(items: PdfTextItem[]): number {
  const advances = items
    .filter((item) => item.width > 0 && item.str.length > 0)
    .map((item) => ({ value: item.width / item.str.length, weight: item.str.length }))

  const width = weightedMedian(advances)
  // Never zero: it divides.
  return width > 0 ? width : 1
}

/**
 * The runs of a page, gathered into rows by their baselines.
 *
 * Two runs belong to the same row when their baselines are within a fraction of the
 * glyph height of each other. Not the same number: a producer that draws a line in three
 * pieces can leave a fraction of a point between them, and a chord line drawn a hair
 * above its lyrics — which happens, since the two are separate text objects — must not
 * become a row of its own with the lyric row beneath it, because that is what it already
 * is and the merge in `convert.ts` needs exactly that shape, not one row twice.
 */
function linesOf(items: PdfTextItem[], characterWidth: number): Line[] {
  const sorted = [...items].sort((a, b) => {
    const dy = b.transform[5] - a.transform[5]
    return dy !== 0 ? dy : a.transform[4] - b.transform[4]
  })

  const rows: PdfTextItem[][] = []
  let current: PdfTextItem[] = []
  let baseline = 0

  for (const item of sorted) {
    const y = item.transform[5]
    const tolerance = Math.max(0.5, (item.height > 0 ? item.height : characterWidth) * 0.3)

    if (current.length === 0 || Math.abs(y - baseline) <= tolerance) {
      if (current.length === 0) baseline = y
      current.push(item)
      continue
    }

    rows.push(current)
    current = [item]
    baseline = y
  }
  if (current.length > 0) rows.push(current)

  const left = Math.min(...items.map((item) => item.transform[4]))

  return rows.map((row) => {
    const ordered = [...row].sort((a, b) => a.transform[4] - b.transform[4])

    let text = ''
    for (const item of ordered) {
      const column = Math.max(0, Math.round((item.transform[4] - left) / characterWidth))

      if (column > text.length) {
        text = text.padEnd(column, ' ')
      } else if (text !== '' && !text.endsWith(' ') && !item.str.startsWith(' ')) {
        // Two runs that would land in the same column are still two words. A single
        // space is the least it can cost, and it keeps `tokens()` from reading them
        // as one — which for two chords would invent a chord name that does not exist.
        text += ' '
      }
      text += item.str
    }

    return {
      y: ordered[0].transform[5],
      size: Math.max(...ordered.map((item) => item.height)),
      text: text.replace(/\s+$/, ''),
    }
  })
}

/**
 * The blank lines a page draws by leaving room, rather than by any character.
 *
 * A blank line is what separates a verse from the next in every source this app reads,
 * so losing them would run a whole song into one block. There is no character to find:
 * the evidence is that the step down to the next baseline is bigger than this page's own
 * normal step, which is the median of every step on it.
 */
function withBlankLines(lines: Line[]): string[] {
  if (lines.length === 0) return []

  const steps: { value: number; weight: number }[] = []
  for (let i = 1; i < lines.length; i++) {
    const step = lines[i - 1].y - lines[i].y
    if (step > 0) steps.push({ value: step, weight: 1 })
  }

  const normal = weightedMedian(steps)
  const out: string[] = [lines[0].text]

  for (let i = 1; i < lines.length; i++) {
    // 1.6 rather than 2: a blank line is drawn as one extra step, and real files pad it
    // by a little less than a full one often enough that 2 misses half of them.
    if (normal > 0 && lines[i - 1].y - lines[i].y > normal * 1.6) out.push('')
    out.push(lines[i].text)
  }

  return out
}

/**
 * How much bigger than the body a line has to be set to read as a title.
 *
 * Loose enough for the 12pt-body/14pt-title of a plain export, tight enough that the
 * ordinary variation inside one paragraph — a capital drawn from a slightly taller face,
 * a superscript — never reaches it.
 */
const TITLE_RATIO = 1.15

/**
 * Where one song ends and the next begins, which a PDF never says outright.
 *
 * The rule is: **a title if there is one, a page otherwise.** When any page in the file
 * opens with a line set larger than the body text, that is what a new song looks like in
 * this document, and only those pages start one — which is what keeps a song running
 * over two pages whole, since its second page opens in body text like any continuation.
 * When no page opens that way — a plain monospace dump, where every line is the same
 * size — there is no such evidence, and the page break is the only mark left; `split.ts`
 * already reads a form feed as a song boundary for exactly this material.
 *
 * Both halves are guesses, and both are wrong on some file. That is affordable only
 * because the import screen shows every song it found, with its words, before writing
 * any of them — the same bargain every heuristic in this directory is made under.
 */
function startsSong(pages: string[][], sizes: number[], bodySize: number): boolean[] {
  const titled = sizes.some((size) => size > bodySize * TITLE_RATIO)

  return pages.map((_, index) => {
    if (index === 0) return false
    return titled ? sizes[index] > bodySize * TITLE_RATIO : true
  })
}

/**
 * Every page of a document, as one text with form feeds where the songs divide.
 *
 * The form feed is not decoration: `splitSongs` turns it into a cut, and it is the only
 * thing this function says about song boundaries — the decision itself is `startsSong`'s.
 */
export function layoutPages(pages: PdfPage[]): string {
  const laid: string[][] = []
  const firstLineSizes: number[] = []
  const sizeSamples: { value: number; weight: number }[] = []

  for (const page of pages) {
    const items = inkOf(page)
    if (items.length === 0) {
      laid.push([])
      firstLineSizes.push(0)
      continue
    }

    for (const item of items) {
      if (item.height > 0) sizeSamples.push({ value: item.height, weight: item.str.length })
    }

    const lines = linesOf(items, characterWidthOf(items))
    laid.push(withBlankLines(lines))
    firstLineSizes.push(lines.length === 0 ? 0 : lines[0].size)
  }

  const bodySize = weightedMedian(sizeSamples)
  const cuts = startsSong(laid, firstLineSizes, bodySize)

  const out: string[] = []
  for (let index = 0; index < laid.length; index++) {
    if (laid[index].length === 0) continue
    // Never before the first page with anything on it: a cut there would open the
    // import with an empty song, the same trap `splitSongs` guards its `{title:}` with.
    if (cuts[index] && out.length > 0) out.push('\f')
    out.push(...laid[index])
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Enough characters that the document is words rather than the stray label on a scan. */
const ENOUGH_TEXT = 40

/**
 * The engine and its worker module, both lazily, as one chunk.
 *
 * The worker module is imported rather than spawned: it assigns `globalThis.pdfjsWorker`,
 * and `pdfjs` reads that before it reaches for a `Worker`, so the parsing happens here
 * on the main thread. See this file's header for what that costs and why it is taken.
 * The shared `webpackChunkName` only makes the chunk recognisable in a build listing —
 * what actually keeps this engine out of the precache manifest is a content match in
 * `next.config.ts`, since the bulk of pdfjs lands in chunks the bundler names after a
 * hash whatever it is asked.
 *
 * `isEvalSupported: false` because this app has no reason to let a document bring code
 * with it, and `useWorkerFetch: false` because no font or CMap data is hosted here for
 * it to fetch — Latin chord sheets need neither.
 */
async function openDocument(bytes: Uint8Array) {
  const [pdfjs] = await Promise.all([
    import(/* webpackChunkName: "pdfjs" */ 'pdfjs-dist/legacy/build/pdf.mjs'),
    import(/* webpackChunkName: "pdfjs" */ 'pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ])

  const task = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    useWorkerFetch: false,
  })

  return await task.promise
}

export async function readPdf(bytes: Uint8Array): Promise<PdfResult> {
  let pdf: Awaited<ReturnType<typeof openDocument>>

  try {
    pdf = await openDocument(bytes)
  } catch (error) {
    if (error !== null && typeof error === 'object' && (error as { name?: string }).name === 'PasswordException') {
      return {
        ok: false,
        message:
          'That PDF is locked with a password. Open it in a PDF reader, save an unlocked copy, ' +
          'and drop that here.',
      }
    }
    return { ok: false, message: 'That PDF could not be opened — it may be damaged.' }
  }

  try {
    const pages: PdfPage[] = []

    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number)
      const content = await page.getTextContent()

      // Marked-content markers carry no `str`, and are only reported when an option
      // this does not pass asks for them — the guard is here because the type is the
      // union either way, and narrowing on `str` keeps it a check rather than a cast.
      const items: PdfTextItem[] = []
      for (const item of content.items) {
        if ('str' in item) items.push(item)
      }
      pages.push({ items })
      page.cleanup()
    }

    const text = layoutPages(pages)

    if (text.replace(/\s/g, '').length < ENOUGH_TEXT) {
      return {
        ok: false,
        message:
          'That PDF is a picture of a page rather than text — a scan or a photo — so there are ' +
          'no words in it to read. Type or paste the song in instead.',
      }
    }

    return { ok: true, text }
  } catch {
    return { ok: false, message: 'That PDF could not be read past its first pages.' }
  } finally {
    void pdf.destroy()
  }
}
