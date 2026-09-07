import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { type PdfPage, type PdfTextItem, layoutPages } from './pdf'

/**
 * One run of glyphs as `pdfjs` reports it.
 *
 * The width is the one relationship that matters: at `size` 10 a character is 6 units
 * wide, so an x of 48 is column 8 and the columns in these tests can be read off the
 * numbers. Real files vary, and `characterWidthOf` measures rather than assumes — this
 * only fixes a ruler the assertions can be written against.
 */
function run(str: string, x: number, y: number, size = 10): PdfTextItem {
  return { str, transform: [size, 0, 0, size, x, y], width: str.length * size * 0.6, height: size }
}

function page(...items: PdfTextItem[]): PdfPage {
  return { items }
}

describe('laying a PDF back out', () => {
  it('puts a chord in the column it was drawn in', () => {
    const text = layoutPages([
      page(run('C', 0, 100), run('G', 48, 100), run('Words under the chords', 0, 88)),
    ])

    assert.equal(text, 'C       G\nWords under the chords')
  })

  it('gathers a row from runs the producer emitted out of order', () => {
    const text = layoutPages([page(run('third', 120, 100), run('first', 0, 100), run('second', 60, 100))])

    assert.equal(text, 'first     second    third')
  })

  it('keeps two runs apart even when they would land in one column', () => {
    // Two chords crammed together would read as one chord name that does not exist.
    const text = layoutPages([page(run('Am', 0, 100), run('D', 11, 100))])

    assert.equal(text, 'Am D')
  })

  it('reads a wider gap between baselines as the blank line it draws', () => {
    const text = layoutPages([
      page(run('one', 0, 100), run('two', 0, 88), run('far below', 0, 52)),
    ])

    assert.equal(text, 'one\ntwo\n\nfar below')
  })

  it('does not invent a blank line at the document’s own line spacing', () => {
    const text = layoutPages([page(run('one', 0, 100), run('two', 0, 88), run('three', 0, 76))])

    assert.equal(text, 'one\ntwo\nthree')
  })

  it('measures the ruler from the page rather than assuming one', () => {
    // The same layout at half the scale must come out as the same columns.
    const text = layoutPages([
      page(run('C', 0, 50, 5), run('G', 24, 50, 5), run('Words under the chords', 0, 44, 5)),
    ])

    assert.equal(text, 'C       G\nWords under the chords')
  })

  it('starts the leftmost run at column zero, whatever the page margin', () => {
    const text = layoutPages([page(run('C', 72, 100), run('G', 120, 100), run('Words', 72, 88))])

    assert.equal(text, 'C       G\nWords')
  })

  it('keeps a chord line drawn a hair above its lyrics as its own line', () => {
    // Chords and words are separate text objects, and a producer can leave a fraction
    // of a point between them. Merging the two would be one line where there are two.
    const text = layoutPages([page(run('C', 0, 100.4), run('G', 48, 99.7), run('Words', 0, 88))])

    assert.equal(text, 'C       G\nWords')
  })
})

describe('where a PDF’s songs divide', () => {
  const body = (y: number) => [run('A line of the song', 0, y), run('Another line', 0, y - 12)]

  it('cuts where a page opens with a title set larger than the body', () => {
    const text = layoutPages([
      page(run('First Song', 0, 200, 16), ...body(180)),
      page(run('Second Song', 0, 200, 16), ...body(180)),
    ])

    const songs = text.split('\f')
    assert.equal(songs.length, 2)
    assert.match(songs[0], /^First Song\n/)
    assert.match(songs[1], /^\nSecond Song\n/)
  })

  it('keeps a song that runs over two pages whole', () => {
    // The second page opens in body text, which is what a continuation looks like.
    const text = layoutPages([page(run('One Song', 0, 200, 16), ...body(180)), page(...body(200))])

    assert.ok(!text.includes('\f'))
  })

  it('cuts at every page when nothing in the file is set larger than anything else', () => {
    // A plain monospace dump has no title to find, and a page break is the only mark
    // left — the one `split.ts` already reads as a song boundary for this material.
    const text = layoutPages([page(...body(200)), page(...body(200)), page(...body(200))])

    assert.equal(text.split('\f').length, 3)
  })

  it('never opens with a cut, which would be an empty song before the first', () => {
    const text = layoutPages([page(...body(200)), page(...body(200))])

    assert.ok(!text.startsWith('\f'))
  })

  it('skips a page with nothing on it rather than cutting on it', () => {
    const text = layoutPages([page(...body(200)), page(), page(...body(200))])

    assert.equal(text.split('\f').length, 2)
  })

  it('reads a slightly taller capital as body text, not as a title', () => {
    const text = layoutPages([
      page(run('T', 0, 200, 11), run('he first line', 6, 200), ...body(188)),
      page(run('C', 0, 200, 11), run('ontinuing here', 6, 200), ...body(188)),
    ])

    // No title anywhere, so the fallback applies and the page break is the cut —
    // what must not happen is the 11pt capital being taken for a title.
    assert.equal(text.split('\f').length, 2)
  })

  it('holds an empty document to nothing rather than to a page of form feeds', () => {
    assert.equal(layoutPages([page(), page()]), '')
  })
})
