import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { type Line, chordTokens, parseChordPro, parseLyricLine, plainLyrics } from './chordpro'

/** Compact view of a parsed line: one string per word, chords in brackets. */
function shape(line: Line): string[] {
  if (line.kind === 'comment') return [`#${line.text}`]
  if (line.kind === 'tab') return line.rows.map((row) => `|${row}`)
  return line.words.map((word) =>
    word.parts.map((part) => (part.chord ? `[${part.chord}]` : '') + part.text).join(''),
  )
}

describe('parseLyricLine', () => {
  it('splits into words so a long line can wrap between them', () => {
    const line = parseLyricLine('[Am]Certe [F]notti la [C]macchina')
    assert.deepEqual(shape(line), ['[Am]Certe', '[F]notti', 'la', '[C]macchina'])
  })

  it('keeps a mid-word chord inside the same word', () => {
    // The word must stay one unbreakable unit, or the alignment splits mid-word.
    const line = parseLyricLine('mac[C]china')
    assert.equal(line.kind, 'lyrics')
    assert.deepEqual(shape(line), ['mac[C]china'])
    if (line.kind === 'lyrics') {
      assert.equal(line.words.length, 1)
      assert.equal(line.words[0].parts.length, 2)
    }
  })

  it('attaches a chord before a space to the following word', () => {
    const line = parseLyricLine('[Am] Certe notti')
    assert.deepEqual(shape(line), ['[Am]Certe', 'notti'])
  })

  it('keeps chords with no lyric as words of their own', () => {
    const line = parseLyricLine('[C] [F] [G]')
    assert.deepEqual(shape(line), ['[C]', '[F]', '[G]'])
  })

  it('handles text before the first chord', () => {
    const line = parseLyricLine('Certe [F]notti')
    assert.deepEqual(shape(line), ['Certe', '[F]notti'])
  })

  it('reports whether a line carries chords at all', () => {
    const withChords = parseLyricLine('[C]sì')
    const withoutChords = parseLyricLine('solo testo')
    assert.equal(withChords.kind === 'lyrics' && withChords.hasChords, true)
    assert.equal(withoutChords.kind === 'lyrics' && withoutChords.hasChords, false)
  })

  it('treats an unclosed bracket as literal text', () => {
    const line = parseLyricLine('resta [C così')
    assert.deepEqual(shape(line), ['resta', '[C', 'così'])
  })

  it('collapses runs of whitespace into word breaks', () => {
    const line = parseLyricLine('due    spazi')
    assert.deepEqual(shape(line), ['due', 'spazi'])
  })
})

describe('parseChordPro', () => {
  const source = [
    '{title: Prova}',
    '{artist: Nessuno}',
    '{key: Bb}',
    '',
    '[Bb]Prima [Eb]riga',
    'seconda riga',
    '',
    '{start_of_chorus}',
    '{comment: forte}',
    '[F]Ritornello',
    '{end_of_chorus}',
    '',
    '[Bb]Ultima',
  ].join('\n')

  const song = parseChordPro(source)

  it('reads the metadata directives', () => {
    assert.equal(song.title, 'Prova')
    assert.equal(song.artist, 'Nessuno')
  })

  /*
   * The source above still carries `{key: Bb}`, because pasted and exported files do.
   * Nothing reads it any more, and what matters is that an ignored directive stays
   * ignored rather than turning up as the first line of the words.
   */
  it('ignores a key directive without printing it', () => {
    assert.equal(song.sections[0].lines.length, 2)
    assert.deepEqual(shape(song.sections[0].lines[0]), ['[Bb]Prima', '[Eb]riga'])
  })

  it('groups lines into sections split by blank lines', () => {
    assert.deepEqual(
      song.sections.map((section) => section.kind),
      ['verse', 'chorus', 'verse'],
    )
    assert.equal(song.sections[0].lines.length, 2)
  })

  it('keeps comments inside their section', () => {
    const chorus = song.sections[1]
    assert.deepEqual(shape(chorus.lines[0]), ['#forte'])
    assert.deepEqual(shape(chorus.lines[1]), ['[F]Ritornello'])
  })

  it('accepts short directive aliases', () => {
    const short = parseChordPro('{t: T}\n{st: A}\n{soc}\n[C]x\n{eoc}')
    assert.equal(short.title, 'T')
    assert.equal(short.artist, 'A')
    assert.equal(short.sections[0].kind, 'chorus')
  })

  it('ignores unknown directives instead of printing them', () => {
    const song = parseChordPro('{album: Un album}\n[C]testo')
    assert.equal(song.sections.length, 1)
    assert.deepEqual(shape(song.sections[0].lines[0]), ['[C]testo'])
  })

  /*
   * `{tempo}` was one of those unknown directives until the metronome had a use for it,
   * and this pair is what changed: it is read now, and it is still not drawn. The song's
   * words must look exactly as they did — a directive gaining a meaning is not a licence
   * for it to appear in the lyrics.
   */
  it('reads the tempo without printing it', () => {
    const song = parseChordPro('{tempo: 120}\n[C]testo')
    assert.equal(song.tempo, 120)
    assert.equal(song.sections.length, 1)
    assert.deepEqual(shape(song.sections[0].lines[0]), ['[C]testo'])
  })

  it('reads {bpm} as the same directive, the way the importer already does', () => {
    assert.equal(parseChordPro('{bpm: 76}').tempo, 76)
  })

  /* A tempo nothing can beat leaves the song saying nothing about its tempo, rather than
     handing the metronome a NaN to divide by. Real files carry exactly this. */
  it('says nothing for a tempo written in words', () => {
    assert.equal(parseChordPro('{tempo: allegro}').tempo, null)
    assert.equal(parseChordPro('[C]niente').tempo, null)
  })

  it('counts the beats in a bar from {time}, and drops the note value', () => {
    assert.equal(parseChordPro('{time: 3/4}').beatsPerBar, 3)
    assert.equal(parseChordPro('{time: 6/8}').beatsPerBar, 6)
    assert.equal(parseChordPro('{time: common}').beatsPerBar, null)
    assert.equal(parseChordPro('[C]niente').beatsPerBar, null)
  })

  it('does not require any metadata', () => {
    const bare = parseChordPro('[C]solo accordi')
    assert.equal(bare.title, null)
    assert.deepEqual(bare.tags, [])
    assert.equal(bare.sections.length, 1)
  })

  it('reads the songbook directive', () => {
    assert.equal(parseChordPro('{songbook: Repertorio}').songbookName, 'Repertorio')
    assert.equal(parseChordPro('{songbook: }').songbookName, null)
    assert.equal(parseChordPro('[C]niente').songbookName, null)
  })

  // `{canzoniere: ...}` was the directive's own name before the rename to English —
  // still read, so an export made before the rename still restores where it belongs.
  it('reads the old canzoniere directive too', () => {
    assert.equal(parseChordPro('{canzoniere: Repertorio}').songbookName, 'Repertorio')
  })

  it('keeps the songbook name verbatim, spaces and case included', () => {
    // The name is what the reader sees; slugging happens once, elsewhere.
    assert.equal(parseChordPro('{songbook: Da imparare}').songbookName, 'Da imparare')
  })

  it('reads the division directive', () => {
    assert.equal(parseChordPro('{division: Prima parte}').sectionName, 'Prima parte')
    assert.equal(parseChordPro('{division: }').sectionName, null)
    assert.equal(parseChordPro('[C]niente').sectionName, null)
  })

  // `{sezione: ...}` was the directive's own name before the rename to English —
  // still read, so an export made before the rename still restores where it belongs.
  it('reads the old sezione directive too', () => {
    assert.equal(parseChordPro('{sezione: Prima parte}').sectionName, 'Prima parte')
  })

  it('reads the three link directives', () => {
    const parsed = parseChordPro(
      '{link1: https://example.com/video}\n{link3: https://example.com/tab}',
    )
    assert.equal(parsed.link1, 'https://example.com/video')
    assert.equal(parsed.link2, null)
    assert.equal(parsed.link3, 'https://example.com/tab')
  })

  it('reads a link directive with no value as unset, same as an empty one', () => {
    assert.equal(parseChordPro('{link1: }').link1, null)
    assert.equal(parseChordPro('[C]niente').link1, null)
  })

  /**
   * `{section: chorus}` is how other tools name a *block of the song*. Reading it as
   * filing would put the song in a section called «chorus», so the alias does not
   * exist — and an unknown directive is ignored rather than shown as lyrics.
   */
  it('does not mistake {section} for a songbook section', () => {
    const parsed = parseChordPro('{section: chorus}\n[C]parole')
    assert.equal(parsed.sectionName, null)
    assert.equal(plainLyrics(parsed), 'parole')
  })

  it('reads a tab as one line, verbatim, never split at spaces or read for chords', () => {
    const source = [
      '{start_of_tab}',
      'e|-5--------5-6-8-6-5-6-5---------------',
      'B|---8-6------------------8-------------',
      '{end_of_tab}',
      '[la]dopo',
    ].join('\n')
    const song = parseChordPro(source)

    assert.equal(song.sections.length, 1)
    assert.equal(song.sections[0].lines.length, 2)
    assert.deepEqual(shape(song.sections[0].lines[0]), [
      '|e|-5--------5-6-8-6-5-6-5---------------',
      '|B|---8-6------------------8-------------',
    ])
    assert.deepEqual(shape(song.sections[0].lines[1]), ['[la]dopo'])
  })

  it('accepts the short tab alias', () => {
    const song = parseChordPro('{sot}\ne|-0-\n{eot}')
    assert.equal(song.sections[0].lines[0].kind, 'tab')
  })

  it('does not let a blank-looking row inside a tab close the section', () => {
    const song = parseChordPro(['{sot}', 'e|---', '', 'B|---', '{eot}', '[la]dopo'].join('\n'))
    assert.equal(song.sections.length, 1)
    assert.equal(song.sections[0].lines.length, 2)
  })

  it('keeps whatever a tab never closes, rather than losing it', () => {
    const song = parseChordPro('{sot}\ne|-0-')
    assert.equal(song.sections[0].lines[0].kind, 'tab')
    assert.deepEqual(song.sections[0].lines[0].kind === 'tab' ? song.sections[0].lines[0].rows : null, [
      'e|-0-',
    ])
  })

  it('reads tags as a comma separated list', () => {
    assert.deepEqual(parseChordPro('{tags: rock, ita , da imparare}').tags, [
      'rock',
      'ita',
      'da imparare',
    ])
    assert.deepEqual(parseChordPro('{tags: }').tags, [])
  })
})

describe('plainLyrics', () => {
  it('strips chords and comments for the search index', () => {
    const song = parseChordPro('{c: nota}\n[Am]Certe [F]notti la [C]macchina')
    assert.equal(plainLyrics(song), 'Certe notti la macchina')
  })

  it('leaves a tab out of the search index — dashes are not lyrics', () => {
    const song = parseChordPro('{sot}\ne|-5-\n{eot}\n[Am]testo')
    assert.equal(plainLyrics(song), 'testo')
  })
})

describe('chordTokens', () => {
  it('lists each distinct chord once, in order', () => {
    const song = parseChordPro('[Am]a [F]b [Am]c [C]d')
    assert.deepEqual(chordTokens(song), ['Am', 'F', 'C'])
  })
})
