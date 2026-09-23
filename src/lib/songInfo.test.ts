import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseChordPro } from './chordpro'
import { readableDuration, songInfoRows } from './songInfo'

const rowsFor = (body: string, artist: string | null = null) =>
  songInfoRows(parseChordPro(body), artist)

describe('songInfoRows', () => {
  it('says nothing about a song that declares nothing', () => {
    assert.deepEqual(rowsFor('{title: T}\nword', 'Chi suona'), [])
  })

  it('prints each field the file declares, in a fixed order', () => {
    const rows = rowsFor(
      [
        '{title: T}',
        '{copyright: (c) 1979}',
        '{composer: Chi ha scritto}',
        '{year: 1979}',
        '{key: Sol}',
        'word',
      ].join('\n'),
    )

    assert.deepEqual(rows, [
      { label: 'Key', value: 'Sol' },
      { label: 'Composer', value: 'Chi ha scritto' },
      { label: 'Year', value: '1979' },
      { label: 'Copyright', value: '(c) 1979' },
    ])
  })

  /*
   * The rule that keeps the panel off one song in six: 37 of the 223 stored songs carry a
   * `{subtitle:}` holding exactly what their artist column holds.
   */
  it('does not print a subtitle that only repeats the artist', () => {
    assert.deepEqual(rowsFor('{title: T}\n{subtitle: Chi suona}\nword', 'Chi suona'), [])
  })

  it('ignores capitals when deciding that, because the archive does', () => {
    assert.deepEqual(rowsFor('{title: T}\n{subtitle: chi SUONA}\nword', 'Chi Suona'), [])
  })

  it('prints a subtitle that says something else', () => {
    assert.deepEqual(rowsFor('{title: T}\n{subtitle: Dal vivo}\nword', 'Chi suona'), [
      { label: 'Subtitle', value: 'Dal vivo' },
    ])
  })

  it('prints a subtitle when there is no artist to repeat', () => {
    assert.deepEqual(rowsFor('{title: T}\n{subtitle: Dal vivo}\nword', null), [
      { label: 'Subtitle', value: 'Dal vivo' },
    ])
  })

  it('leaves out a field the file wrote empty', () => {
    assert.deepEqual(rowsFor('{title: T}\n{album: }\n{year:   }\nword'), [])
  })

  it('spells the key exactly as the file does', () => {
    assert.deepEqual(rowsFor('{title: T}\n{key: Sib}\nword'), [{ label: 'Key', value: 'Sib' }])
  })
})

describe('the info panel and the specification (2026-09-23)', () => {
  it('shows a duration in seconds in readable form, as the specification asks', () => {
    assert.equal(readableDuration('268'), '4:28')
    assert.equal(readableDuration('3725'), '1:02:05')
    assert.equal(readableDuration('4:28'), '4:28')
    assert.equal(readableDuration('about four minutes'), 'about four minutes')
  })

  it('prints the arranger', () => {
    const rows = songInfoRows(parseChordPro('{arranger: Rogier van Otterloo}\nx'), null)
    assert.deepEqual(rows.find((row) => row.label === 'Arranger')?.value, 'Rogier van Otterloo')
  })
})
