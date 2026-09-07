/**
 * A Word `.docx`, read as the plain text it draws.
 *
 * No new dependency: a `.docx` is a zip, and `fflate` has been one since the export
 * screen learned to build them — the same reason `archive.ts` calls reading an archive
 * the cheapest whole-library win in this directory. What comes out of that zip is one
 * XML part, `word/document.xml`, and this file walks it with a tag scanner rather than
 * an XML parser. That is a deliberate limit, not a shortcut: the whole job here is
 * «which characters, on which line, in which column», and a DOM would be a megabyte of
 * parser to answer a question a scanner answers in a hundred lines.
 *
 * ## Why a paragraph is a line, and what that costs
 *
 * `<w:p>` is Word's paragraph and it is the only unit that maps onto a line of a chord
 * sheet. A table cell holds paragraphs too, so a table comes out as one line per cell,
 * in reading order — which is right for the common case of a table used to hold a
 * whole song, and wrong for the rarer one of a two-column table with chords beside the
 * words rather than above them. That second layout is not reconstructible without
 * inventing column widths this format does not record in characters, so it is left
 * alone: it arrives as chords and lyrics on alternating lines, which the preview shows
 * before anything is saved.
 *
 * ## Spaces are the alignment, so nothing here is ever trimmed
 *
 * Chords above lyrics are held up by leading spaces, and `<w:t>` content is taken
 * exactly as it is stored. `xml:space="preserve"` is a hint to consumers about
 * whitespace, never a condition for keeping it, so it is not read at all — trimming on
 * its absence is precisely the bug that would silently unalign every chord in the file.
 *
 * A `<w:tab/>` becomes a real tab, which `convert.ts` then turns into four spaces. That
 * does *not* reconstruct Word's tab stops, which are measured in twips against a page
 * width: a chart aligned with tabs rather than spaces will come in with its chords in
 * roughly, not exactly, the right columns. Stated rather than half-fixed, because the
 * fix is a page-geometry model this file has no business owning, and the preview is
 * already the place where a wrong column gets corrected.
 *
 * ## Page breaks
 *
 * An explicit page break — `<w:br w:type="page"/>`, or a paragraph carrying
 * `<w:pageBreakBefore/>` — becomes a form feed, which `split.ts` reads as a song
 * boundary. That is safe here in a way it would not be in a PDF: in Word a page break
 * is something a person typed on purpose, while pagination is not. Which is exactly
 * why `<w:lastRenderedPageBreak/>` is ignored — it is Word's own record of where the
 * text happened to overflow last time it was laid out, it can land in the middle of a
 * sentence, and reading it as a new song would cut songs at random.
 */

import { strFromU8, unzipSync } from 'fflate'

export type DocxResult = { ok: true; text: string } | { ok: false; message: string }

/** The five named entities XML defines, plus numeric ones in either base. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return String.fromCodePoint(parseInt(body.slice(2), 16))
    }
    if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10))

    switch (body.toLowerCase()) {
      case 'amp':
        return '&'
      case 'lt':
        return '<'
      case 'gt':
        return '>'
      case 'quot':
        return '"'
      case 'apos':
        return "'"
      default:
        return whole
    }
  })
}

/** The tag name of a `<…>`, lowercased and without its prefix's case games. */
function tagNameOf(tag: string): string {
  const match = /^<\/?\s*([a-z0-9:_.-]+)/i.exec(tag)
  return match === null ? '' : match[1].toLowerCase()
}

/**
 * Word's document part to plain text.
 *
 * Exported on its own, and taking the XML rather than the zip, because this is the half
 * with every decision in it — and a `.docx` fixture that exercised it would otherwise
 * have to be a binary checked into the repo. `npm test` is `node:test` over pure
 * functions; this is one.
 */
export function documentToText(xml: string): string {
  // Everything outside the body is styles, fonts and settings — never words.
  const bodyStart = xml.search(/<w:body[\s>]/i)
  const body = bodyStart < 0 ? xml : xml.slice(bodyStart)

  const lines: string[] = []
  let current = ''
  /** A page break seen inside a paragraph applies once the paragraph is out. */
  let breakAfter = false
  let breakBefore = false

  const flush = () => {
    if (breakBefore && lines.length > 0) lines.push('\f')
    lines.push(current.replace(/\s+$/, ''))
    if (breakAfter) lines.push('\f')
    current = ''
    breakAfter = false
    breakBefore = false
  }

  const pattern = /<[^>]*>|[^<]+/g
  let inParagraph = false
  let inText = false

  for (const [piece] of body.matchAll(pattern)) {
    if (!piece.startsWith('<')) {
      if (inText) current += decodeEntities(piece)
      continue
    }

    const name = tagNameOf(piece)
    const closing = piece.startsWith('</')
    const selfClosing = piece.endsWith('/>')

    switch (name) {
      case 'w:t':
        // A self-closing `<w:t/>` holds nothing, and must not open a capture that then
        // swallows the tags after it as if they were words.
        inText = !closing && !selfClosing
        break

      case 'w:p':
        if (closing) {
          flush()
          inParagraph = false
        } else if (selfClosing) {
          // An empty paragraph is a blank line, and blank lines separate sections.
          flush()
        } else {
          inParagraph = true
        }
        break

      case 'w:tab':
        if (inParagraph) current += '\t'
        break

      case 'w:nobreakhyphen':
        if (inParagraph) current += '-'
        break

      case 'w:cr':
        if (inParagraph) {
          lines.push(current.replace(/\s+$/, ''))
          current = ''
        }
        break

      case 'w:br':
        if (!inParagraph) break
        if (/w:type\s*=\s*"page"/i.test(piece)) {
          // Held until the paragraph closes: a break is drawn between paragraphs even
          // when it is stored inside the run that ends one.
          breakAfter = true
        } else {
          lines.push(current.replace(/\s+$/, ''))
          current = ''
        }
        break

      case 'w:pagebreakbefore':
        // Absent `w:val` means true; `w:val="0"`/`"false"` is a style being switched off.
        if (!/w:val\s*=\s*"(?:0|false|off)"/i.test(piece)) breakBefore = true
        break

      default:
        break
    }
  }

  if (current !== '') flush()

  return lines.join('\n')
}

/**
 * The main document part of a `.docx`, whatever it is called.
 *
 * `word/document.xml` is what every real producer writes, but the part is named by a
 * relationship rather than by convention, and Word itself writes `word/document2.xml`
 * in files that have been through certain repairs. Looking for the convention first and
 * the shape second costs one line and covers both.
 */
function documentPartOf(unzipped: Record<string, Uint8Array>): string | undefined {
  const names = Object.keys(unzipped)
  return (
    names.find((name) => name.toLowerCase() === 'word/document.xml') ??
    names.find((name) => /^word\/document\d*\.xml$/i.test(name))
  )
}

export function readDocx(bytes: Uint8Array): DocxResult {
  let unzipped: Record<string, Uint8Array>
  try {
    unzipped = unzipSync(bytes)
  } catch {
    return { ok: false, message: 'That Word file could not be opened — it may be damaged.' }
  }

  const part = documentPartOf(unzipped)
  if (part === undefined) {
    return {
      ok: false,
      message:
        'That doesn’t look like a Word document inside. If it came from Pages, Google Docs ' +
        'or LibreOffice, export it as .docx and drop that here.',
    }
  }

  const text = documentToText(strFromU8(unzipped[part]))
  if (text.trim() === '') {
    return {
      ok: false,
      message:
        'That Word document has no text in it — if the song is in it as a picture or a ' +
        'scan, there is nothing here to read. Type or paste the words in instead.',
    }
  }

  return { ok: true, text }
}
