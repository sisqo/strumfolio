import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { markupRuns, markupTagAt, stripMarkup } from './markup'

describe('ChordPro markup', () => {
  it('reads the tags the format defines, nested, into styled runs', () => {
    assert.deepEqual(markupRuns('a <b>bold <i>both</i></b> z'), [
      { text: 'a ', style: {} },
      { text: 'bold ', style: { bold: true } },
      { text: 'both', style: { bold: true, italic: true } },
      { text: ' z', style: {} },
    ])
  })

  it('reads a span for the attributes this app can draw, and keeps its words', () => {
    assert.deepEqual(markupRuns('<span weight="bold" foreground="red">x</span>'), [{ text: 'x', style: { bold: true } }])
    assert.deepEqual(markupRuns("<span style='italic'>y</span>"), [{ text: 'y', style: { italic: true } }])
  })

  /* Anything that is not one of the format's tags is text — «a < b», «<3», a made-up tag. */
  it('leaves an angle bracket that is not markup exactly as written', () => {
    for (const text of ['a < b', 'I <3 it', '<foo>bar</foo>', '<b', 'x > y']) {
      assert.equal(stripMarkup(text), text, text)
      assert.equal(markupTagAt(text, text.indexOf('<')), null, text)
    }
  })

  it('draws a named symbol and drops an unknown one', () => {
    assert.equal(stripMarkup('C<sym name="sharp"/>'), 'C♯')
    assert.equal(stripMarkup('x<sym name="nonsense"/>y'), 'xy')
    assert.equal(stripMarkup('x<strut/>y'), 'xy')
  })

  it('ignores a closing tag with nothing open, and ends what was left open', () => {
    assert.deepEqual(markupRuns('</b>plain <i>open'), [
      { text: 'plain ', style: {} },
      { text: 'open', style: { italic: true } },
    ])
  })
})
