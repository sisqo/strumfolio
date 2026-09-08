import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { strToU8, zipSync } from 'fflate'

import { documentToText, readDocx } from './docx'

/** One `<w:p>` holding one run, the shape Word writes for an ordinary line. */
function p(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
}

function document(...paragraphs: string[]): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${paragraphs.join('')}<w:sectPr/></w:body></w:document>`
  )
}

function docx(xml: string, name = 'word/document.xml'): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    [name]: strToU8(xml),
  })
}

describe('a Word document', () => {
  it('reads one paragraph as one line', () => {
    assert.equal(documentToText(document(p('Verse one'), p('Verse two'))), 'Verse one\nVerse two')
  })

  it('keeps the leading spaces that hold the chords over the syllables', () => {
    const text = documentToText(document(p('  C       G'), p('Words under the chords')))

    assert.equal(text, '  C       G\nWords under the chords')
  })

  it('keeps the spaces even when the run does not say xml:space', () => {
    const xml = document('<w:p><w:r><w:t>   Am</w:t></w:r></w:p>')

    assert.equal(documentToText(xml), '   Am')
  })

  it('joins the runs Word split a line into', () => {
    const xml = document(
      '<w:p><w:r><w:t xml:space="preserve">A line </w:t></w:r>' +
        '<w:r><w:rPr><w:b/></w:rPr><w:t>in two runs</w:t></w:r></w:p>',
    )

    assert.equal(documentToText(xml), 'A line in two runs')
  })

  it('reads an empty paragraph as the blank line it draws', () => {
    assert.equal(documentToText(document(p('One'), '<w:p/>', p('Two'))), 'One\n\nTwo')
  })

  it('decodes the entities Word writes for punctuation', () => {
    assert.equal(documentToText(document(p('Rock &amp; roll &#x2014; it&#8217;s here'))), 'Rock & roll — it’s here')
  })

  it('turns a tab into a tab, which convert.ts widens to spaces', () => {
    const xml = document('<w:p><w:r><w:tab/><w:t>C</w:t></w:r></w:p>')

    assert.equal(documentToText(xml), '\tC')
  })

  it('breaks a line on a plain <w:br/>, without starting a song', () => {
    const xml = document('<w:p><w:r><w:t>One</w:t><w:br/><w:t>Two</w:t></w:r></w:p>')

    assert.equal(documentToText(xml), 'One\nTwo')
  })

  it('reads an explicit page break as a form feed, which split.ts cuts on', () => {
    const xml = document(p('Last line'), '<w:p><w:r><w:br w:type="page"/></w:r></w:p>', p('Next song'))

    assert.ok(documentToText(xml).includes('\f'))
  })

  it('does not fuse text typed after a page break in the same paragraph', () => {
    // A break inserted without a preceding Enter — a real pattern from producers other
    // than Word itself — leaves text on both sides of it inside one <w:p>.
    const xml = document(
      '<w:p><w:r><w:t>Last line of song one</w:t></w:r>' +
        '<w:r><w:br w:type="page"/></w:r>' +
        '<w:r><w:t>Song two</w:t></w:r></w:p>',
    )

    assert.equal(documentToText(xml), 'Last line of song one\n\f\nSong two')
  })

  it('reads a paragraph that starts a page as a form feed too', () => {
    const xml = document(p('Last line'), '<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>Next song</w:t></w:r></w:p>')

    // The form feed stands on its own line, as it does for a <w:br w:type="page"/>.
    assert.equal(documentToText(xml), 'Last line\n\f\nNext song')
  })

  it('does not cut on a page break Word only rendered', () => {
    // `lastRenderedPageBreak` records where the text overflowed last time it was laid
    // out — it lands mid-sentence, and reading it as a song boundary cuts at random.
    const xml = document(p('One'), '<w:p><w:r><w:lastRenderedPageBreak/><w:t>Two</w:t></w:r></w:p>')

    assert.equal(documentToText(xml), 'One\nTwo')
  })

  it('does not cut on a page break the style switched off', () => {
    const xml = document(
      p('One'),
      '<w:p><w:pPr><w:pageBreakBefore w:val="0"/></w:pPr><w:r><w:t>Two</w:t></w:r></w:p>',
    )

    assert.equal(documentToText(xml), 'One\nTwo')
  })

  it('never opens a page with a form feed, which would be an empty song before it', () => {
    const xml = document('<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>First song</w:t></w:r></w:p>')

    assert.equal(documentToText(xml), 'First song')
  })

  it('reads a table cell as a line, in reading order', () => {
    const xml = document(
      `<w:tbl><w:tr><w:tc>${p('C')}</w:tc><w:tc>${p('Words')}</w:tc></w:tr></w:tbl>`,
    )

    assert.equal(documentToText(xml), 'C\nWords')
  })

  it('leaves out deleted text, and keeps inserted text', () => {
    const xml = document(
      '<w:p><w:ins><w:r><w:t>kept</w:t></w:r></w:ins>' +
        '<w:del><w:r><w:delText> gone</w:delText></w:r></w:del></w:p>',
    )

    assert.equal(documentToText(xml), 'kept')
  })

  it('leaves out a field code, which is markup rather than words', () => {
    const xml = document('<w:p><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:t>One</w:t></w:r></w:p>')

    assert.equal(documentToText(xml), 'One')
  })

  it('reads nothing outside the body', () => {
    const xml =
      '<w:document><w:background w:color="FFFFFF"/><w:body>' +
      `${p('Only this')}</w:body></w:document>`

    assert.equal(documentToText(xml), 'Only this')
  })
})

describe('reading a .docx file', () => {
  it('finds the document part inside the zip', () => {
    const result = readDocx(docx(document(p('  C       G'), p('Words under the chords'))))

    assert.ok(result.ok)
    assert.equal(result.text, '  C       G\nWords under the chords')
  })

  it('finds a document part a repair renamed', () => {
    const result = readDocx(docx(document(p('Still here')), 'word/document2.xml'))

    assert.ok(result.ok)
    assert.equal(result.text, 'Still here')
  })

  it('says what to do when the zip is not a Word document at all', () => {
    const result = readDocx(zipSync({ 'index.html': strToU8('<p>hi</p>') }))

    assert.ok(!result.ok)
    assert.match(result.message, /\.docx/)
  })

  it('refuses bytes that are not a zip', () => {
    const result = readDocx(strToU8('This is a plain text file, not a .docx'))

    assert.ok(!result.ok)
    assert.match(result.message, /could not be opened/)
  })

  it('says a document with no text is a picture, rather than finding no songs in it', () => {
    const result = readDocx(docx(document('<w:p><w:r><w:drawing/></w:r></w:p>')))

    assert.ok(!result.ok)
    assert.match(result.message, /no text/)
  })
})
