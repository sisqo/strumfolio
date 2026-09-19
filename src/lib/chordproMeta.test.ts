import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseChordPro } from './chordpro'
import { metadataValues, placeholderAt, substituteMetadata } from './chordproMeta'

const VALUES = { title: 'Un titolo', artist: 'Chi suona', year: '1979' }
const sub = (text: string) => substituteMetadata(text, VALUES)

describe('placeholderAt', () => {
  it('finds the end of a simple placeholder', () => {
    assert.equal(placeholderAt('%{artist}', 0), 9)
  })

  /* The whole reason this is brace-aware: the first `}` closes the inner `%{}`. */
  it('matches the outer brace of a nested one', () => {
    const text = '%{artist|di %{}}'
    assert.equal(placeholderAt(text, 0), text.length)
  })

  it('says nothing for an unclosed placeholder', () => {
    assert.equal(placeholderAt('%{artist', 0), null)
  })

  it('says nothing where no placeholder starts', () => {
    assert.equal(placeholderAt('word %{a}', 0), null)
    assert.equal(placeholderAt('100% sure', 0), null)
  })
})

describe('substituteMetadata', () => {
  it('replaces a name with its value', () => {
    assert.equal(sub('Scritta da %{artist}'), 'Scritta da Chi suona')
  })

  it('replaces several on one line', () => {
    assert.equal(sub('%{title} — %{artist}, %{year}'), 'Un titolo — Chi suona, 1979')
  })

  it('leaves text with no placeholder exactly as it was', () => {
    assert.equal(sub('nothing to do here'), 'nothing to do here')
  })

  /* A field this app does not hold is a field that is absent, and absent is empty — never
     the text of the placeholder, which is the defect this replaced. */
  it('resolves an unknown name to nothing', () => {
    assert.equal(sub('a %{nonesuch} b'), 'a  b')
  })

  it('prints an unclosed placeholder as the text it is', () => {
    assert.equal(sub('%{artist'), '%{artist')
  })

  describe('the conditional form', () => {
    it('prints the branch when the field is set, with %{} standing for the value', () => {
      assert.equal(sub('%{artist|di %{}}'), 'di Chi suona')
    })

    it('prints nothing when it is not set and there is no else', () => {
      assert.equal(sub('%{composer|di %{}}'), '')
    })

    it('prints the else when there is one', () => {
      assert.equal(sub('%{composer|di %{}|tradizionale}'), 'tradizionale')
    })

    it('handles a branch with no %{} in it at all', () => {
      assert.equal(sub('%{artist|noto}'), 'noto')
    })

    /* A bare `%{}` outside any branch names nothing, so it is empty — the only reading
       that does not invent a value nobody asked for. */
    it('resolves a bare %{} outside a branch to nothing', () => {
      assert.equal(sub('a %{} b'), 'a  b')
    })

    it('nests a whole placeholder inside a branch', () => {
      assert.equal(sub('%{artist|%{} (%{year})}'), 'Chi suona (1979)')
    })
  })
})

describe('metadataValues', () => {
  const song = parseChordPro(
    '{title: Dal corpo}\n{artist: Dal corpo}\n{year: 1979}\n{album: }\n{capo: 3}\nword',
  )

  /*
   * The row wins over the body, and that is not a preference: the importer consumes
   * `{title:}` and `{artist:}` into columns and strips the lines, so the body a reader is
   * looking at usually carries neither.
   */
  it('takes the title and the artist from the row when it has them', () => {
    const values = metadataValues(song, 'Dalla riga', 'Anche dalla riga')
    assert.equal(values.title, 'Dalla riga')
    assert.equal(values.artist, 'Anche dalla riga')
  })

  it('falls back to the body when the row says nothing', () => {
    const values = metadataValues(song, null, null)
    assert.equal(values.title, 'Dal corpo')
    assert.equal(values.artist, 'Dal corpo')
  })

  it('turns a number into the text a placeholder can print', () => {
    assert.equal(metadataValues(song, null, null).capo, '3')
  })

  /* «Set» and «set to nothing» have to be one state, because the conditional form turns on
     exactly that distinction. */
  it('treats a field written empty as unset', () => {
    const values = metadataValues(song, null, null)
    assert.ok(!('album' in values))
    assert.equal(substituteMetadata('%{album|c’è|non c’è}', values), 'non c’è')
  })
})
