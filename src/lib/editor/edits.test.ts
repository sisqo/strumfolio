import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseChordPro } from '../chordpro'
import { fromSource, toSource } from './document'
import {
  addChord,
  chordIndexAt,
  insertChordAmong,
  insertTab,
  joinLines,
  moveChord,
  moveChordTo,
  removeChord,
  removeLine,
  setChord,
  setLineText,
  setTabRows,
  splitLine,
  toggleComment,
  toggleSection,
} from './edits'

/** Runs an edit on a source and gives the source back, which is what the UI does. */
const edit = (source: string, change: (doc: ReturnType<typeof fromSource>) => ReturnType<typeof fromSource>) =>
  toSource(change(fromSource(source)))

describe('editing the words', () => {
  it('carries the chords along', () => {
    const after = edit("[la]C'è un gran [mi]castello", (doc) =>
      setLineText(doc, 0, "Oh, c'è un gran castello"),
    )

    // "C'è un gran castello" → "Oh, c'è un gran castello": the second chord moved.
    assert.equal(after, "[la]Oh, c'è un gran [mi]castello")
  })

  it('keeps the chords of a line whose words are all deleted', () => {
    // How an intro gets written: type the chords, then clear the words.
    assert.equal(edit('[re]uno [la]due', (doc) => setLineText(doc, 0, '')), '[re][la]')
  })

  it('edits the text of a comment', () => {
    assert.equal(edit('{c: assolo}', (doc) => setLineText(doc, 0, 'assolo di guitar')), '{c: assolo di guitar}')
  })

  it('spreads the chords of a chord-only line over the words written under it', () => {
    const after = edit('[re] [la] [re] [sol]', (doc) =>
      setLineText(doc, 0, 'Quando sono solo scrivo'),
    )

    assert.equal(after, '[re]Quando [la]sono [re]solo [sol]scrivo')
  })

  it('sends the chords left over past the last word, in their order', () => {
    assert.equal(edit('[re] [la]', (doc) => setLineText(doc, 0, 'ciao')), '[re]ciao[la]')
  })

  it('turns a blank line into a real one the moment it holds text', () => {
    // A freshly split or appended line is, byte for byte, the same empty string a
    // genuine blank line already is — `fromSource` reads both back as `blank` — so
    // this is the only place that gap can be closed: the edit itself has to promote
    // the row, or nothing typed into it would ever survive being read back.
    assert.equal(edit('uno\n', (doc) => setLineText(doc, 1, 'due')), 'uno\ndue')
  })
})

describe('the chords themselves', () => {
  it('adds one where the cursor is', () => {
    assert.equal(edit('castello', (doc) => addChord(doc, 0, 4, 'mi')), 'cast[mi]ello')
  })

  it('keeps them in the order they appear', () => {
    const after = edit('castello', (doc) => addChord(addChord(doc, 0, 4, 'mi'), 0, 0, 'la'))
    assert.equal(after, '[la]cast[mi]ello')
  })

  it('renames one', () => {
    assert.equal(edit('[la]x', (doc) => setChord(doc, 0, 0, 'la7')), '[la7]x')
  })

  it('treats emptying one as removing it', () => {
    assert.equal(edit('[la]x[mi]y', (doc) => setChord(doc, 0, 0, '  ')), 'x[mi]y')
  })

  it('removes one by hand', () => {
    assert.equal(edit('[la]x[mi]y', (doc) => removeChord(doc, 0, 1)), '[la]xy')
  })
})

describe('moving a chord along its line', () => {
  const move = (source: string, chord: number, delta: number) => {
    const result = moveChord(fromSource(source), 0, chord, delta)
    return { source: toSource(result.document), chord: result.chord }
  }

  it('goes one letter forward', () => {
    assert.equal(move('[la]castello', 0, 1).source, 'c[la]astello')
  })

  it('and one letter back', () => {
    assert.equal(move('c[la]astello', 0, -1).source, '[la]castello')
  })

  it('stops at the start of the line', () => {
    const result = move('[la]castello', 0, -5)
    assert.equal(result.source, '[la]castello')
  })

  it('keeps writing the same source once it clears the end, since ChordPro cannot say how far past it a chord sits', () => {
    assert.equal(move('castell[la]o', 0, 5).source, 'castello[la]')
  })

  it('reorders two chords tied at the end, since a nudge past it is the only way to tell them apart', () => {
    const result = move('castello[la][mi]', 0, 1)
    assert.equal(result.source, 'castello[mi][la]')
    assert.equal(result.chord, 1)
  })

  it('sends a chord past every other one still tied at the end in a single press', () => {
    const result = move('castello[la][mi][re]', 0, 1)
    assert.equal(result.source, 'castello[mi][re][la]')
    assert.equal(result.chord, 2)
  })

  it('says where the chord went when it overtakes another', () => {
    // `la` starts first and ends up second, so the index the caller holds must move.
    const result = move('[la]ca[mi]stello', 0, 4)
    assert.equal(result.source, 'ca[mi]st[la]ello')
    assert.equal(result.chord, 1)
  })

  it('keeps its place when it overtakes nothing', () => {
    const result = move('[la]ca[mi]stello', 0, 1)
    assert.equal(result.chord, 0)
  })
})

describe('dropping a chord straight onto a letter', () => {
  const drop = (source: string, chord: number, at: number) => {
    const result = moveChordTo(fromSource(source), 0, chord, at)
    return { source: toSource(result.document), chord: result.chord }
  }

  it('lands where the finger let go', () => {
    assert.equal(drop('[la]castello', 0, 4).source, 'cast[la]ello')
  })

  it('says where the chord went when the drop overtakes another', () => {
    const result = drop('[la]ca[mi]stello', 0, 4)
    assert.equal(result.source, 'ca[mi]st[la]ello')
    assert.equal(result.chord, 1)
  })

  it('lands past the last word as a trailing chord', () => {
    assert.equal(drop('ca[la]stello', 0, 12).source, 'castello[la]')
  })

  it('never lands before the first letter', () => {
    assert.equal(drop('ca[la]stello', 0, -3).source, '[la]castello')
  })

  it('agrees with the nudge about ties', () => {
    // Dropped onto the other chord's letter, the mover keeps its original order.
    const result = drop('[la]ca[mi]stello', 0, 2)
    assert.equal(result.source, 'ca[la][mi]stello')
    assert.equal(result.chord, 0)
  })
})

describe('inserting a chord between two others, by order', () => {
  it('lands between the two the order names, on a wordless line', () => {
    const after = edit('[re] [la] [re] [sol]', (doc) => insertChordAmong(doc, 0, 2, 'x'))
    assert.equal(after, '[re] [la] [x][re] [sol]')
  })

  it('goes last when the order points past every chord', () => {
    assert.equal(edit('[re] [la]', (doc) => insertChordAmong(doc, 0, 5, 'x')), '[re] [la][x]')
  })

  it('slips between two chords already past the end of the words', () => {
    const after = edit('pallon[mi7]e[la-][sol]', (doc) => insertChordAmong(doc, 0, 2, 'x'))
    assert.equal(after, 'pallon[mi7]e[la-][x][sol]')
  })
})

describe('a chord on a still-blank row', () => {
  it('promotes the row, the same way typing does', () => {
    // The toolbar's Chord pressed on a fresh line: the intro written chords-first.
    assert.equal(edit('uno\n', (doc) => addChord(doc, 1, 0, 're')), 'uno\n[re]')
  })

  it('still refuses a row that is not words at all', () => {
    assert.equal(edit('{soc}', (doc) => addChord(doc, 0, 0, 're')), '{soc}')
  })
})

describe('where a new chord lands in the list', () => {
  it('counts the ones already at or before that letter', () => {
    const chords = [
      { at: 0, name: 'la' },
      { at: 4, name: 'mi' },
    ]

    assert.equal(chordIndexAt(chords, 0), 1)
    assert.equal(chordIndexAt(chords, 2), 1)
    assert.equal(chordIndexAt(chords, 4), 2)
    assert.equal(chordIndexAt([], 0), 0)
  })
})

describe('splitting and joining lines', () => {
  it('gives each half the chords above it', () => {
    assert.equal(
      edit('[la]uno [mi]due', (doc) => splitLine(doc, 0, 4)),
      '[la]uno \n[mi]due',
    )
  })

  it('joins a line onto the one above, shifting what follows', () => {
    assert.equal(edit('[la]uno \n[mi]due', (doc) => joinLines(doc, 1)), '[la]uno [mi]due')
  })

  it('refuses to join a line onto a comment, which would swallow it', () => {
    const source = '{c: assolo}\n[la]uno'
    assert.equal(edit(source, (doc) => joinLines(doc, 1)), source)
  })

  it('joins a still-blank line into the one above, unlike a comment: it has nothing of its own to lose', () => {
    assert.equal(edit('[la]uno\n', (doc) => joinLines(doc, 1)), '[la]uno')
  })

  it('never leaves the song with no lines at all', () => {
    assert.equal(edit('[la]sola', (doc) => removeLine(doc, 0)), '')
  })

  it('opens a blank lyrics line after a break, a marker, or a directive', () => {
    // None of the three has text of its own to cut, so a new empty line simply
    // follows it — the same as pressing Enter at the end of any other line.
    assert.equal(edit('uno\n\ndue', (doc) => splitLine(doc, 1, 0)), 'uno\n\n\ndue')
  })
})

describe('comments', () => {
  it('turns a line into one and back', () => {
    const commented = edit('assolo', (doc) => toggleComment(doc, 0))
    assert.equal(commented, '{c: assolo}')
    assert.equal(edit(commented, (doc) => toggleComment(doc, 0)), 'assolo')
  })

  it('keeps the words when the chords cannot come along', () => {
    assert.equal(edit('[la]assolo', (doc) => toggleComment(doc, 0)), '{c: assolo}')
  })
})

describe('choruses and bridges', () => {
  it('wraps the lines around the cursor, up to the blank lines', () => {
    const source = ['[la]strofa', '', '[la]coro uno', '[mi]coro due', '', '[la]altro'].join('\n')
    const after = edit(source, (doc) => toggleSection(doc, 2, 'chorus'))

    assert.equal(
      after,
      ['[la]strofa', '', '{soc}', '[la]coro uno', '[mi]coro due', '{eoc}', '', '[la]altro'].join('\n'),
    )
    assert.deepEqual(
      parseChordPro(after).sections.map((section) => section.kind),
      ['verse', 'chorus', 'verse'],
    )
  })

  it('takes the marking off when pressed again', () => {
    const source = ['{soc}', '[la]coro', '{eoc}'].join('\n')
    assert.equal(edit(source, (doc) => toggleSection(doc, 1, 'chorus')), '[la]coro')
  })

  it('changes a chorus into a bridge instead of nesting one inside it', () => {
    const source = ['{soc}', '[la]coro', '{eoc}'].join('\n')
    const after = edit(source, (doc) => toggleSection(doc, 1, 'bridge'))

    assert.equal(after, ['{sob}', '[la]coro', '{eob}'].join('\n'))
    assert.deepEqual(
      parseChordPro(after).sections.map((section) => section.kind),
      ['bridge'],
    )
  })

  it('leaves a chorus the reader can close', () => {
    // Marking, unmarking and marking again must not pile up directives.
    const source = ['[la]uno', '[mi]due'].join('\n')
    let document = fromSource(source)
    for (let round = 0; round < 3; round++) {
      document = toggleSection(document, round % 2 === 0 ? 0 : 1, 'chorus')
    }

    const boundaries = document.blocks.filter((block) => block.kind === 'boundary')
    assert.equal(boundaries.length, 2)
  })
})

describe('tabs', () => {
  it('inserts a blank six-string tab after the cursor', () => {
    const after = edit('[la]uno', (doc) => insertTab(doc, 0))
    const { blocks } = fromSource(after)

    assert.equal(blocks.length, 2)
    assert.equal(blocks[1].kind, 'tab')
    if (blocks[1].kind === 'tab') {
      assert.equal(blocks[1].rows.length, 6)
      assert.deepEqual(
        blocks[1].rows.map((row) => row[0]),
        ['e', 'B', 'G', 'D', 'A', 'E'],
      )
    }
  })

  it('rewrites a tab wholesale rather than shifting anything inside it', () => {
    const source = ['{sot}', 'e|---', '{eot}'].join('\n')
    const after = edit(source, (doc) => setTabRows(doc, 0, ['e|-5-', 'B|-3-']))

    assert.equal(after, ['{sot}', 'e|-5-', 'B|-3-', '{eot}'].join('\n'))
  })

  it('leaves anything that is not a tab alone', () => {
    assert.equal(edit('[la]uno', (doc) => setTabRows(doc, 0, ['x'])), '[la]uno')
  })
})
