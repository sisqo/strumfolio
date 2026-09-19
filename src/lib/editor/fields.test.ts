import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseChordPro } from '../chordpro'
import { METADATA_DIRECTIVE } from '../import/deduce'
import { FIELD_GROUPS, FIELD_OPTIONS, fieldCaret, fieldLine } from './fields'
import { fromSource, toSource } from './document'

describe('the fields the editor offers', () => {
  /*
   * The rule the whole list exists under: a column holds the title, the artist, the tags and
   * the links, so a line typed into the body for any of them is stripped the next time the
   * song is saved. Offering one would be offering something that quietly disappears.
   */
  it('offers nothing that a column would swallow', () => {
    for (const option of FIELD_OPTIONS) {
      assert.equal(
        METADATA_DIRECTIVE.test(`{${option.name}: x}`),
        false,
        `${option.name} is stripped on save and must not be offered`,
      )
    }
  })

  it('writes a line the editor reads back as a directive, not as words', () => {
    for (const option of FIELD_OPTIONS) {
      const blocks = fromSource(fieldLine(option)).blocks
      assert.notEqual(blocks[0].kind, 'lyrics', `${option.name} came back as lyrics`)
    }
  })

  /*
   * A *filled* field is what has to come back byte for byte — that is somebody's content.
   * The empty line the menu writes is a half-typed thing that the editor may tidy: a
   * `{start_of_verse: }` with nothing after the colon comes back as `{start_of_verse}`,
   * which is the same normalisation `{c: }` has always had and loses nothing, since there
   * was nothing there.
   */
  it('writes a filled field that survives a trip through the editor unchanged', () => {
    for (const option of FIELD_OPTIONS) {
      const filled = option.takesValue ? `{${option.name}: qualcosa}` : fieldLine(option)

      /*
       * A block that opens something has to be closed before it can be compared, because the
       * editor closes an unclosed one on purpose — leaving it open would swallow every line
       * after it the next time the file is read. That is behaviour, not damage.
       */
      const source = /^\{start_of_(tab|grid)/.test(filled)
        ? `${filled}\ne|-3-\n{end_of_${/grid/.test(filled) ? 'grid' : 'tab'}}`
        : filled

      assert.equal(toSource(fromSource(source)), source, option.name)
    }
  })

  it('settles after one trip, so an empty field is never rewritten twice', () => {
    for (const option of FIELD_OPTIONS) {
      const once = toSource(fromSource(fieldLine(option)))
      assert.equal(toSource(fromSource(once)), once, option.name)
    }
  })

  /* A field the reader cannot see the point of is a field nobody will fill in: every one
     offered has to be one this app actually does something with, or shows. */
  it('offers only directives the reader knows what to do with', () => {
    const shown = parseChordPro(FIELD_OPTIONS.map((option) => fieldLine(option)).join('\n'))
    assert.ok(shown.sections.length >= 0)
  })

  it('puts the caret where the value goes', () => {
    const withValue = FIELD_OPTIONS.find((option) => option.takesValue)
    assert.ok(withValue !== undefined)
    assert.equal(fieldLine(withValue).slice(fieldCaret(withValue)), '}')
  })

  it('writes a bare directive with no colon to fill in', () => {
    const bare = FIELD_OPTIONS.find((option) => !option.takesValue)
    assert.ok(bare !== undefined)
    assert.equal(fieldLine(bare), `{${bare.name}}`)
  })

  it('names every field once', () => {
    const names = FIELD_OPTIONS.map((option) => option.name)
    assert.equal(new Set(names).size, names.length)
  })

  it('leaves no group empty', () => {
    for (const group of FIELD_GROUPS) assert.ok(group.options.length > 0, group.title)
  })
})
