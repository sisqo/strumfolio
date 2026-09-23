import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseChordPro } from '../chordpro'
import {
  type ChordAt,
  chordVocabulary,
  fromSource,
  readLyricLine,
  sectionsOf,
  shiftChords,
  toSource,
  writeLyricLine,
} from './document'
import { setLineText } from './edits'

/**
 * Every structural feature the real repertoire uses, in one file.
 *
 * Taken from the songs actually in the database rather than invented: the long form
 * of the chorus directives, a `{new_song}` the reader ignores, `{subtitle}` rather
 * than `{artist}`, lines of bare chords, lines with none, and — in nineteen places —
 * trailing spaces. An editor that tidies those away rewrites the file behind the
 * user's back, so they are part of the contract.
 */
const REAL = [
  '{new_song}',
  '{title: La spada di king Arthur}',
  '{subtitle: I Cavalieri del Re}',
  '[mi]',
  "[la]C'è un gran castello ",
  'nella contea di [si-]Camelot',
  '',
  '{start_of_chorus}',
  '[la]Spada del [mi]re',
  '{end_of_chorus}',
  '',
  '{c: assolo}',
  '[re] [la] [re] [sol]',
  'una riga senza accordi',
].join('\n')

describe('a source survives being read and written', () => {
  it('gives back exactly what it was given', () => {
    assert.equal(toSource(fromSource(REAL)), REAL)
  })

  it('keeps a line of only spaces, and one that ends in them', () => {
    const source = 'prima riga   \n   \n[la]terza'
    assert.equal(toSource(fromSource(source)), source)
  })

  it('keeps directives it knows nothing about', () => {
    const source = '{new_song}\n{capo: 3}\n{x_custom: qualcosa}\ntesto'
    assert.equal(toSource(fromSource(source)), source)
  })

  it('keeps the spelling of the directives it does know', () => {
    for (const source of ['{soc}\n[la]x\n{eoc}', '{start_of_chorus}\n[la]x\n{end_of_chorus}']) {
      assert.equal(toSource(fromSource(source)), source)
    }
  })

  /*
   * The editor's directive regex and the reader's are two copies of one pattern, and this is
   * the cheapest way to notice them drifting: a name one of them rejects becomes a lyrics
   * line here — editable, offering its `[` as a chord — while the reader draws a directive.
   * The negated selector is the case that was actually wrong, in both, until 2026-09-20.
   */
  it('reads a conditional directive as a directive, negated or not', () => {
    const source = '{comment-guitar: a}\n{comment-!guitar: b}\n{start_of_chorus-!ukulele}\nx\n{end_of_chorus}'
    const kinds = fromSource(source).blocks.map((block) => block.kind)

    assert.equal(toSource(fromSource(source)), source)
    /*
     * Only `x` is words. A conditional lands on `directive` rather than on `comment` or
     * `boundary` — the editor keeps it whole and opaque instead of taking the selector
     * apart — and that is fine, and deliberately asserted loosely: what must never happen
     * is `lyrics`, which is an editable line offering its braces and brackets as content.
     */
    assert.deepEqual(kinds, ['directive', 'directive', 'directive', 'lyrics', 'boundary'])
    assert.equal(kinds.filter((kind) => kind === 'lyrics').length, 1)
  })

  /*
   * The separator is the file's too, which this module had been quietly overruling.
   *
   * `{c:forte}` and `{comment Repeat ad lib}` are both legal ChordPro and neither is the
   * `{name: value}` this editor writes, so opening a song that used either and pressing
   * Save rewrote those lines — untouched lines, in somebody else's file, which is the one
   * thing the round trip exists to prevent. Found on 2026-09-20 by running the invariant
   * over the whole reference corpus instead of over a fixture: one file in twelve did it,
   * on three lines.
   */
  it('keeps the spelling of a comment, colon and spaces included', () => {
    for (const source of [
      '{c:forte}',
      '{comment Repeat ad lib until the landlord objects}',
      '{c: spaziato}',
      '{comment_box:incorniciato}',
      '{start_of_chorus:Finale}',
      '{start_of_tab:Solo}\ne|--3--\n{end_of_tab}',
    ]) {
      assert.equal(toSource(fromSource(source)), source)
    }
  })

  /*
   * And the other half, or the first would be a way of making an edit do nothing: once the
   * text has been typed into, the line is written the canonical way.
   */
  it('writes the canonical spelling once the line has been edited', () => {
    const document = fromSource('{c:forte}')
    assert.equal(toSource(setLineText(document, 0, 'piano')), '{c: piano}')
  })

  it('keeps windows line endings rather than rewriting the whole file', () => {
    const source = '{title: X}\r\n\r\n[la]prima\r\n[mi]seconda'
    assert.equal(toSource(fromSource(source)), source)
  })

  it('is stable: reading its own output changes nothing', () => {
    const once = toSource(fromSource(REAL))
    assert.equal(toSource(fromSource(once)), once)
  })

  it('does not disturb what the reader makes of it', () => {
    // The real check on a round trip: the rendered song is identical.
    assert.deepEqual(parseChordPro(toSource(fromSource(REAL))), parseChordPro(REAL))
  })
})

describe('a tab', () => {
  const TAB_SOURCE = [
    '{start_of_tab}',
    'e|-5--------5-6-8-6-5-6-5---------------',
    'B|---8-6------------------8-------------',
    '{end_of_tab}',
  ].join('\n')

  it('survives being read and written, dashes and all', () => {
    assert.equal(toSource(fromSource(TAB_SOURCE)), TAB_SOURCE)
  })

  it('is one block, not one per row', () => {
    const { blocks } = fromSource(TAB_SOURCE)
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].kind, 'tab')
  })

  it('keeps a blank-looking row as a row of the tab, not a break between blocks', () => {
    const source = ['{sot}', 'e|---', '', 'B|---', '{eot}'].join('\n')
    const { blocks } = fromSource(source)

    assert.equal(blocks.length, 1)
    assert.deepEqual(blocks[0].kind === 'tab' ? blocks[0].rows : null, ['e|---', '', 'B|---'])
    assert.equal(toSource(fromSource(source)), source)
  })

  it('keeps the short alias spelling on both directives', () => {
    const source = ['{sot}', 'e|---', '{eot}'].join('\n')
    assert.equal(toSource(fromSource(source)), source)
  })

  it('closes a tab the source never did, rather than swallowing what follows it', () => {
    const source = ['{start_of_tab}', 'e|-5-', 'una riga dopo, mai raggiunta'].join('\n')
    const { blocks } = fromSource(source)

    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].kind, 'tab')
    assert.equal(
      toSource(fromSource(source)),
      ['{start_of_tab}', 'e|-5-', 'una riga dopo, mai raggiunta', '{end_of_tab}'].join('\n'),
    )
  })
})

describe('reading one line', () => {
  it('separates the words from the chords above them', () => {
    const { text, chords } = readLyricLine("[la]C'è un gran [mi]castello")

    assert.equal(text, "C'è un gran castello")
    assert.deepEqual(chords, [
      { at: 0, name: 'la' },
      { at: 12, name: 'mi' },
    ])
  })

  it('takes a bracket with no closing one as text, like the reader does', () => {
    const { text, chords } = readLyricLine('una [nota a margine')

    assert.equal(text, 'una [nota a margine')
    assert.deepEqual(chords, [])
  })

  it('handles two chords in the same place, and one at the very end', () => {
    const line = '[la][mi]corri[re]'
    const { text, chords } = readLyricLine(line)

    assert.equal(text, 'corri')
    assert.deepEqual(chords, [
      { at: 0, name: 'la' },
      { at: 0, name: 'mi' },
      { at: 5, name: 're' },
    ])
    assert.equal(writeLyricLine(text, chords), line)
  })

  it('writes a chord past the end of the text at the end instead of losing it', () => {
    assert.equal(writeLyricLine('corri', [{ at: 99, name: 'la' }]), 'corri[la]')
  })
})

describe('chords follow the words they sit above', () => {
  const chords: ChordAt[] = [
    { at: 0, name: 'la' },
    { at: 4, name: 'mi' },
    { at: 9, name: 're' },
  ]

  it('stay put when the change is after them', () => {
    assert.deepEqual(shiftChords(chords, 'roma capitale', 'roma capitale!'), chords)
  })

  it('move along when text is inserted before them', () => {
    // "roma" → "la roma": everything shifts by three.
    assert.deepEqual(shiftChords(chords, 'roma capitale', 'la roma capitale'), [
      { at: 3, name: 'la' },
      { at: 7, name: 'mi' },
      { at: 12, name: 're' },
    ])
  })

  it('move when the insertion is exactly where one sits', () => {
    // A chord belongs to the syllable after it, and that syllable moved.
    assert.deepEqual(shiftChords([{ at: 0, name: 'la' }], 'roma', 'Xroma'), [
      { at: 1, name: 'la' },
    ])
  })

  it('survive a deletion that swallows one, landing where the gap opened', () => {
    // "roma capitale" → "roma tale": the chord at 9 was inside what went.
    assert.deepEqual(shiftChords(chords, 'roma capitale', 'roma tale'), [
      { at: 0, name: 'la' },
      { at: 4, name: 'mi' },
      { at: 5, name: 're' },
    ])
  })

  it('survive a selection being replaced by something longer', () => {
    const replaced = shiftChords(chords, 'roma capitale', 'roma bellissima capitale')

    assert.equal(replaced.length, chords.length)
    assert.ok(replaced.every((chord) => chord.at >= 0 && chord.at <= 'roma bellissima capitale'.length))
    assert.deepEqual(replaced[0], { at: 0, name: 'la' })
  })

  it('never leave the text they belong to', () => {
    const wiped = shiftChords(chords, 'roma capitale', '')
    assert.deepEqual(wiped, [
      { at: 0, name: 'la' },
      { at: 0, name: 'mi' },
      { at: 0, name: 're' },
    ])
  })

  it('keep every chord, whatever the edit', () => {
    const edits: [string, string][] = [
      ['roma capitale', 'roma'],
      ['roma capitale', 'ROMA CAPITALE'],
      ['roma capitale', 'r'],
      ['roma capitale', 'roma capitale roma capitale'],
    ]

    for (const [before, after] of edits) {
      assert.equal(shiftChords(chords, before, after).length, 3, `${before} → ${after}`)
    }
  })
})

describe('which section a line is in', () => {
  it('follows the explicit boundaries, and the blank line otherwise', () => {
    const { blocks } = fromSource(
      ['[la]strofa', '', '{soc}', '[la]coro', '{eoc}', '[la]dopo'].join('\n'),
    )

    assert.deepEqual(sectionsOf(blocks), ['verse', 'verse', 'chorus', 'chorus', 'chorus', 'verse'])
  })

  it('marks a bridge as a bridge', () => {
    const { blocks } = fromSource(['{sob}', '[la]ponte', '{eob}'].join('\n'))
    assert.deepEqual(sectionsOf(blocks), ['bridge', 'bridge', 'bridge'])
  })

  it('agrees with the reader about an unclosed chorus', () => {
    const source = ['{soc}', '[la]coro', '', '[la]ancora coro'].join('\n')
    const { blocks } = fromSource(source)

    // A blank line does not close an explicit section, in either place.
    assert.deepEqual(sectionsOf(blocks), ['chorus', 'chorus', 'chorus', 'chorus'])
    assert.deepEqual(
      parseChordPro(source).sections.map((section) => section.kind),
      ['chorus'],
    )
  })
})

describe('the chords a song already uses', () => {
  it('comes back most frequent first, ties in order of first appearance', () => {
    const { blocks } = fromSource(['[la]uno [mi]due', '[mi]tre [re]quattro', '{c: [sol]ignorato}'].join('\n'))

    assert.deepEqual(chordVocabulary(blocks), ['mi', 'la', 're'])
  })

  it('skips the chord still being named', () => {
    const { blocks } = fromSource('[la]uno [] due')
    assert.deepEqual(chordVocabulary(blocks), ['la'])
  })
})

/*
 * The format's other verbatim constructs, held to the same byte-for-byte contract as
 * everything above. A `#` comment and a grid both used to arrive here as `lyrics`
 * blocks, which round-tripped by luck rather than by design: a `[` anywhere in either
 * one was read as a chord and offered for editing as one.
 */
describe('the constructs the editor learned with the format', () => {
  it('keeps a # comment as itself rather than as words', () => {
    const source = '{title: T}\n# a note [with] a bracket in it\nfirst line'
    const blocks = fromSource(source).blocks

    assert.equal(blocks[1].kind, 'source-comment')
    assert.equal(toSource(fromSource(source)), source)
  })

  it('leaves an indented hash as the lyric it is', () => {
    const source = '  # indented'
    assert.equal(fromSource(source).blocks[0].kind, 'lyrics')
    assert.equal(toSource(fromSource(source)), source)
  })

  it('keeps a grid in one block, columns untouched', () => {
    const source = '{start_of_grid}\n| Am . . . | F . . . |\n{end_of_grid}'
    const block = fromSource(source).blocks[0]

    assert.equal(block.kind, 'tab')
    assert.equal(block.kind === 'tab' && block.variant, 'grid')
    assert.equal(toSource(fromSource(source)), source)
  })

  it('closes an unclosed grid as a grid, not as a tab', () => {
    const document = fromSource('{sog}\n| Am |')
    assert.equal(toSource(document), '{sog}\n| Am |\n{end_of_grid}')
  })

  it('does not invent a colon for a comment that has no value', () => {
    const source = '{c}\nword'
    assert.equal(toSource(fromSource(source)), source)
  })

  it('reads a verse marker as a marker rather than as an opaque directive', () => {
    const blocks = fromSource('{sov}\nword\n{eov}').blocks

    assert.deepEqual(
      blocks.map((block) => block.kind),
      ['boundary', 'lyrics', 'boundary'],
    )
    assert.deepEqual(sectionsOf(blocks), ['verse', 'verse', 'verse'])
  })

  it('keeps a column break as the layout directive it is, not as a comment', () => {
    const source = 'word\n{cb}\nmore'
    assert.equal(fromSource(source).blocks[1].kind, 'directive')
    assert.equal(toSource(fromSource(source)), source)
  })

  it('reads every spelling of a comment as one', () => {
    const source = '{ci: quietly}\n{comment_box: loud}\n{highlight: watch}'
    const blocks = fromSource(source).blocks

    assert.deepEqual(
      blocks.map((block) => block.kind),
      ['comment', 'comment', 'comment'],
    )
    assert.equal(toSource(fromSource(source)), source)
  })

  /* The invariant that matters most here: whatever the editor does to these, the reader
     must see the same song afterwards as before. */
  it('renders the same song after a trip through the editor', () => {
    const source = [
      '{title: T}',
      '# a note',
      '{sov}',
      '[C]word here',
      '{eov}',
      '{start_of_grid}',
      '| C . . . |',
      '{end_of_grid}',
      '[*Solo] [Am]after',
    ].join('\n')

    assert.deepEqual(parseChordPro(toSource(fromSource(source))), parseChordPro(source))
    assert.equal(toSource(fromSource(source)), source)
  })
})

/* The closing line of a tab was the one line of the block rewritten on the first save. */
describe('a tab block, byte for byte', () => {
  it('writes the closing line back as the file wrote it', () => {
    for (const source of ['{sot}\ne|--0--\n{ eot }', '{sot}\ne|--0--\n{eot:}\n', '{sot}\ne|\n  {end_of_tab}']) {
      assert.equal(toSource(fromSource(source)), source)
    }
  })

  /* Closing an unclosed block is deliberate; eating the file's final newline into a blank row
     of tablature was not. */
  it('closes an unclosed block without a phantom row, and keeps the final newline', () => {
    assert.equal(toSource(fromSource('{sot}\n--0--\n')), '{sot}\n--0--\n{end_of_tab}\n')
  })
})

describe('ChordPro conformance in the editor (2026-09-23)', () => {
  /* The reader's cut, made the same way: with words `cb` is a boxed comment. */
  it('reads {cb: …} as a comment and a bare {cb} as a directive', () => {
    assert.equal(fromSource('{cb: Palm mute}').blocks[0].kind, 'comment')
    assert.equal(fromSource('{cb}').blocks[0].kind, 'directive')
  })

  it('keeps a delegated environment verbatim, closed only by its own end', () => {
    const source = '{start_of_abc}\nX:1\n[CDE]\n{end_of_tab}\n{end_of_abc}'
    const { blocks } = fromSource(source)
    assert.deepEqual(blocks.map((block) => block.kind), ['tab'])
    assert.equal(toSource(fromSource(source)), source)
  })

  it('closes an unclosed delegated environment with its own name', () => {
    assert.equal(toSource(fromSource('{start_of_ly}\n\\relative c')), '{start_of_ly}\n\\relative c\n{end_of_ly}')
  })

  it('reads grille as a grid', () => {
    const source = '{start_of_grille}\n| C . |\n{end_of_grille}'
    assert.equal(fromSource(source).blocks[0].kind, 'tab')
    assert.equal(toSource(fromSource(source)), source)
  })
})
