import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { type Landing, copyRange, pasteAt, pasteOver, removeRange } from './clipboard'
import { fromSource, toSource } from './document'
import { setLineText } from './edits'

/** What the clipboard would carry away from a run of lines. */
const copy = (source: string, from: number, to: number) =>
  copyRange(fromSource(source), { from, to })

/** A run of lines gone, source in and source out — which is what the editor does. */
const without = (source: string, from: number, to: number) =>
  toSource(removeRange(fromSource(source), { from, to }))

/** Text pasted at a caret, with the caret it leaves behind. */
function pasted(source: string, caret: Landing, text: string) {
  const landed = pasteAt(fromSource(source), caret, text)
  assert.ok(landed !== null, 'the paste was refused')
  return { source: toSource(landed.document), caret: landed.caret }
}

/** Text pasted over a run of lines, with the caret it leaves behind. */
function replaced(source: string, from: number, to: number, text: string) {
  const landed = pasteOver(fromSource(source), { from, to }, text)
  assert.ok(landed !== null, 'the paste was refused')
  return { source: toSource(landed.document), caret: landed.caret }
}

const SONG = ['uno', '', '{soc}', '[re]due', 'tre', '{eoc}', 'quattro'].join('\n')

describe('copying a run of lines', () => {
  it('takes exactly the lines asked for, when no section is open', () => {
    assert.equal(copy(SONG, 0, 1), 'uno\n')
  })

  it('closes a section the run inherited but never closes', () => {
    // Lines 3 and 4 are inside the chorus; neither directive is among them.
    assert.equal(copy(SONG, 3, 4), '{soc}\n[re]due\ntre\n{eoc}')
  })

  it('closes a section the run opens itself', () => {
    assert.equal(copy(SONG, 2, 4), '{soc}\n[re]due\ntre\n{eoc}')
  })

  it('adds nothing when the run already holds a whole section', () => {
    assert.equal(copy(SONG, 2, 5), '{soc}\n[re]due\ntre\n{eoc}')
  })

  it('mirrors the spelling the song opened the section with', () => {
    const long = ['{start_of_bridge}', 'dentro', '{end_of_bridge}'].join('\n')
    assert.equal(copy(long, 1, 1), '{start_of_bridge}\ndentro\n{end_of_bridge}')
  })

  /*
   * The asymmetry the balancing rests on: an unclosed `{soc}` paints every line after
   * it as chorus, in `sectionsOf` and in the reading parser alike, while an `{eoc}`
   * that never opened is inert in both. So this run keeps its orphan instead of
   * gaining an empty section in front of it.
   */
  it('leaves an orphan end directive alone rather than opening a section for it', () => {
    assert.equal(copy(SONG, 5, 6), '{eoc}\nquattro')
  })

  /*
   * A tab is *one* block, rows and both directives together (see `Block`), so it
   * counts as a single line in a range and can never be cut in half by one — which is
   * why nothing above balances a `{sot}` the way it balances a `{soc}`.
   */
  it('carries comments, directives, tabs and blank lines through verbatim', () => {
    const mixed = ['{c: assolo}', '{new_song}', '{sot}', 'e|--0--2--', '{eot}', '', 'uno'].join('\n')

    assert.equal(fromSource(mixed).blocks.length, 5)
    assert.equal(copy(mixed, 0, 3), '{c: assolo}\n{new_song}\n{sot}\ne|--0--2--\n{eot}\n')
  })

  it('reads a run given back to front', () => {
    assert.equal(copy(SONG, 1, 0), copy(SONG, 0, 1))
  })
})

describe('taking a run of lines out', () => {
  it('takes them from the head', () => {
    assert.equal(without(SONG, 0, 1), '{soc}\n[re]due\ntre\n{eoc}\nquattro')
  })

  it('takes them from the middle', () => {
    assert.equal(without(SONG, 3, 4), 'uno\n\n{soc}\n{eoc}\nquattro')
  })

  it('takes them from the tail', () => {
    assert.equal(without(SONG, 5, 6), 'uno\n\n{soc}\n[re]due\ntre')
  })

  /*
   * The `{soc}` on line 2 is left behind with nothing to close it, and every line
   * after it reads as chorus until something does. Deliberate: the rows taken are the
   * rows asked for, and Undo is one step away.
   */
  it('leaves a start directive whose end was in the run', () => {
    assert.equal(without(SONG, 5, 5), 'uno\n\n{soc}\n[re]due\ntre\nquattro')
  })

  it('keeps a line for the song to stand on', () => {
    assert.equal(without(SONG, 0, 6), '')
    assert.equal(removeRange(fromSource(SONG), { from: 0, to: 6 }).blocks.length, 1)
  })
})

describe('pasting at a caret', () => {
  it('splits the line and hands the tail to the last pasted line', () => {
    // At the space after "Sotto le", where the second chord begins.
    const { source, caret } = pasted('[re]Sotto le [la]luci', { line: 0, at: 9 }, 'uno\ndue')

    assert.equal(source, '[re]Sotto le uno\ndue[la]luci')
    assert.deepEqual(caret, { line: 1, at: 3 })
  })

  it('is the same as typing, for one line with no chords in it', () => {
    const song = "[la]C'è un gran [mi]castello"
    const { source } = pasted(song, { line: 0, at: 12 }, 'bel ')

    assert.equal(
      source,
      toSource(setLineText(fromSource(song), 0, "C'è un gran bel castello")),
    )
  })

  it('reads the brackets in one pasted line as chords', () => {
    const { source, caret } = pasted(
      "[la]C'è un gran [mi]castello",
      { line: 0, at: 12 },
      '[sol]bel ',
    )

    assert.equal(source, "[la]C'è un gran [sol]bel [mi]castello")
    assert.deepEqual(caret, { line: 0, at: 16 })
  })

  /*
   * A single word that happens to name a chord: `isChordLine('Am')` is true, so
   * `convert()` would take the letters out of the song and leave a chord. One line
   * never goes near that heuristic.
   */
  it('pastes a word that names a chord as the word', () => {
    assert.equal(pasted('non lo so', { line: 0, at: 0 }, 'Am ').source, 'Am non lo so')
  })

  it('replaces a still-blank row instead of keeping it above the run', () => {
    const { source, caret } = pasted('uno\n\ndue', { line: 1, at: 0 }, 'tre\nquattro')

    assert.equal(source, 'uno\ntre\nquattro\ndue')
    assert.deepEqual(caret, { line: 2, at: 7 })
  })

  /*
   * `splitLine` would cut a comment into the comment and a *lyrics* block, which
   * would turn the rest of the comment into words to be sung. A run lands after it.
   */
  it('leaves a comment whole and lands the run after it', () => {
    const { source, caret } = pasted('{c: assolo}\nuno', { line: 0, at: 3 }, 'tre\nquattro')

    assert.equal(source, '{c: assolo}\ntre\nquattro\nuno')
    assert.deepEqual(caret, { line: 2, at: 7 })
  })

  it('leaves a tab whole and lands the run after it', () => {
    const song = ['{sot}', 'e|--0--2--', '{eot}', 'uno'].join('\n')
    const { source } = pasted(song, { line: 0, at: 0 }, 'tre\nquattro')

    assert.equal(source, '{sot}\ne|--0--2--\n{eot}\ntre\nquattro\nuno')
  })

  it('leaves a marker whole and lands the run after it', () => {
    const { source } = pasted(SONG, { line: 2, at: 0 }, 'tre\nquattro')
    assert.equal(source, 'uno\n\n{soc}\ntre\nquattro\n[re]due\ntre\n{eoc}\nquattro')
  })

  it('merges a line of chords onto the words beneath it', () => {
    const { source } = pasted('', { line: 0, at: 0 }, 're       la\nSotto le luci')
    assert.equal(source, '[re]Sotto le [la]luci')
  })

  it('turns a bracketed section label into a comment', () => {
    const { source } = pasted('', { line: 0, at: 0 }, '[Verse 1]\nuno')
    assert.equal(source, '{comment: Verse 1}\nuno')
  })

  it('refuses text with nothing in it', () => {
    assert.equal(pasteAt(fromSource('uno'), { line: 0, at: 0 }, '   '), null)
  })
})

describe('pasting over a run of lines', () => {
  it('replaces the run and lands the caret at the end of what arrived', () => {
    const { source, caret } = replaced(SONG, 3, 4, 'x\ny')

    assert.equal(source, 'uno\n\n{soc}\nx\ny\n{eoc}\nquattro')
    assert.deepEqual(caret, { line: 4, at: 1 })
  })

  it('is the way back for a copy that carried a chord', () => {
    const taken = copy(SONG, 3, 4)
    const { source } = replaced('uno\ndue', 0, 1, taken)

    // Verbatim: `looksLikeChordPro` finds a real chord in the brackets and
    // `convert()` hands the text straight back, untouched by any heuristic.
    assert.equal(source, taken)
  })
})

/*
 * What a chordless run does *not* promise, fixed here so a change to the import
 * heuristic shows up as a failing test instead of as a surprise while pasting.
 * With a chord anywhere in it, a copy comes back byte for byte (above); without one,
 * `looksLikeChordPro` is false and the text goes down the chords-above branch.
 */
describe('a chordless copy, which travels through the heuristic', () => {
  it('comes back unchanged when no line reads as chords', () => {
    const taken = copy('uno\n\ndue', 0, 2)
    assert.equal(taken, 'uno\n\ndue')
    assert.equal(replaced('x', 0, 0, taken).source, 'uno\n\ndue')
  })

  it('collapses two blank lines into one', () => {
    assert.equal(replaced('x', 0, 0, 'uno\n\n\ndue').source, 'uno\n\ndue')
  })

  it('reads a first line of chord-like words as chords over the second', () => {
    // The case `looksLikeSungNotes` cannot rule out: "Am" is no Italian note name.
    assert.equal(replaced('x', 0, 0, 'Am\nnon lo so').source, '[Am]non lo so')
  })

  it('spares a first line of sung note names', () => {
    // `looksLikeSungNotes` is what keeps these as words: do, re, mi, fa, sol, la, si.
    assert.equal(replaced('x', 0, 0, 'la la la\nnon lo so').source, 'la la la\nnon lo so')
  })
})
