import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  type Line,
  chordTokens,
  parseChordPro,
  parseLyricLine,
  plainLyrics,
  readDefinition,
  selectorMatches,
  readLabel,
  visibleSections,
} from './chordpro'
import { buildAnchorMap as buildAnchorMapFor } from './comments/anchorMap'
import { blockStartLines, fromSource, readLyricLine, toSource, writeLyricLine } from './editor/document'
import { deduce } from './import/deduce'
import { setLineText } from './editor/edits'

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

  /*
   * `{st:}` reads as a subtitle here and not as the artist, which reverses what this reader
   * did until 2026-09-19. It can, because the ambiguity is settled at import: a file OnSong
   * wrote has `{st:}` consumed into the artist column and the line stripped, so a body still
   * carrying one is a body where it really is a subtitle. `import/dialect.ts` has the
   * measurement.
   */
  it('accepts short directive aliases', () => {
    const short = parseChordPro('{t: T}\n{st: A}\n{soc}\n[C]x\n{eoc}')
    assert.equal(short.title, 'T')
    assert.equal(short.subtitle, 'A')
    assert.equal(short.artist, null)
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

/*
 * The constructs the published format defines that this parser did not read until
 * 2026-09-19. Each is here because ignoring it had a visible cost, not for completeness:
 * a `#` line was printed as a lyric, an annotation was transposed as a chord, a grid was
 * split into words and wrapped, and a named block lost its name.
 */
describe('ChordPro format compliance', () => {
  describe('source comments', () => {
    it('ignores a line that starts with a hash', () => {
      const song = parseChordPro('{title: T}\n# a note to myself\nFirst line')
      assert.deepEqual(song.sections[0].lines.map(shape), [['First', 'line']])
    })

    it('keeps an indented hash, which is a lyric and not a comment', () => {
      const song = parseChordPro('{title: T}\n  # not a comment')
      assert.deepEqual(song.sections[0].lines.map(shape), [['#', 'not', 'a', 'comment']])
    })

    it('prints a hash the writer escaped', () => {
      const song = parseChordPro('{title: T}\nnumber \\#1')
      assert.deepEqual(song.sections[0].lines.map(shape), [['number', '#1']])
    })

    it('leaves a hash inside a tab alone', () => {
      const song = parseChordPro('{title: T}\n{sot}\n# 7 5 #\n{eot}')
      assert.deepEqual(shape(song.sections[0].lines[0]), ['|# 7 5 #'])
    })
  })

  describe('escapes and continuation', () => {
    it('treats an escaped bracket as text rather than a chord', () => {
      const line = parseLyricLine('say \\[this\\] out loud')
      assert.deepEqual(shape(line), ['say', '[this]', 'out', 'loud'])
      assert.equal(line.kind === 'lyrics' && line.hasChords, false)
    })

    it('leaves a backslash that escapes nothing where it is', () => {
      assert.deepEqual(shape(parseLyricLine('one \\ two')), ['one', '\\', 'two'])
    })

    /*
     * Joining two source lines into one drawn line is what used to make this unsafe: the
     * notes were found by counting drawn lines, so every note below a join landed on the
     * wrong row. Safe since the anchors are found by identity — and the drawn line records
     * both source lines, which is how its parts resolve into the right one.
     */
    it('joins a line that ends in a backslash to the one after it', () => {
      const song = parseChordPro('{title: T}\n[C]one \\\ntwo')
      assert.deepEqual(song.sections[0].lines.map(shape), [['[C]one', 'two']])
    })

    it('records both source lines on the line it drew', () => {
      const line = parseChordPro('{title: T}\nfirst \\\nsecond').sections[0].lines[0]
      assert.deepEqual(line.kind === 'lyrics' && line.sourceLines, [1, 2])
    })

    it('joins a run of them, not just a pair', () => {
      const song = parseChordPro('{title: T}\na \\\nb \\\nc')
      assert.deepEqual(song.sections[0].lines.map(shape), [['a', 'b', 'c']])
    })

    it('does not join on an escaped backslash', () => {
      const song = parseChordPro('{title: T}\nends with \\\\\nnext line')
      assert.deepEqual(song.sections[0].lines.map(shape), [
        ['ends', 'with', '\\'],
        ['next', 'line'],
      ])
    })

    it('leaves a backslash inside a tab alone, where it is part of the drawing', () => {
      const song = parseChordPro('{title: T}\n{sot}\ne|--3--\\\nB|--5--\n{eot}')
      assert.deepEqual(shape(song.sections[0].lines[0]), ['|e|--3--\\', '|B|--5--'])
    })
  })

  describe('annotations', () => {
    const song = parseChordPro('{title: T}\n[*Solo] [Am]word [*C]other')

    it('drops the star and marks the part as an annotation', () => {
      const line = song.sections[0].lines[0]
      assert.equal(line.kind, 'lyrics')
      if (line.kind !== 'lyrics') return

      assert.deepEqual(line.words[0].parts, [{ chord: 'Solo', text: '', annotation: true }])
      assert.deepEqual(line.words[1].parts, [{ chord: 'Am', text: 'word' }])
      assert.deepEqual(line.words[2].parts, [{ chord: 'C', text: 'other', annotation: true }])
    })

    it('keeps the chord row, since an annotation is drawn in it', () => {
      const line = song.sections[0].lines[0]
      assert.equal(line.kind === 'lyrics' && line.hasChords, true)
    })

    it('never offers an annotation as a chord, even one spelled like one', () => {
      assert.deepEqual(chordTokens(song), ['Am'])
    })

    /* The leading space is a word with no letters in it — what a chord-only slot has
       always produced, annotation or not. What matters is that «Solo» is not in there:
       searching the repertoire for it must not turn up every song with a solo marked. */
    it('leaves an annotation out of the search index', () => {
      assert.equal(plainLyrics(song).trim(), 'word other')
      assert.ok(!plainLyrics(song).includes('Solo'))
    })
  })

  describe('sections', () => {
    it('reads an explicit verse and its end', () => {
      const song = parseChordPro('{title: T}\n{sov}\nin\n\nstill in\n{eov}\nout')
      assert.deepEqual(
        song.sections.map((section) => section.kind),
        ['verse', 'verse'],
      )
      // The blank line does not close a block the file opened by hand.
      assert.equal(song.sections[0].lines.length, 2)
    })

    it('prints the label a section gives itself', () => {
      const song = parseChordPro('{title: T}\n{start_of_chorus: Chorus 2}\nword\n{end_of_chorus}')
      assert.deepEqual(song.sections[0].lines.map(shape), [['#Chorus 2'], ['word']])
    })

    it('says nothing above an unlabelled chorus, which is drawn as one already', () => {
      const song = parseChordPro('{title: T}\n{start_of_chorus}\nword\n{end_of_chorus}')
      assert.deepEqual(song.sections[0].lines.map(shape), [['word']])
    })

    it('keeps a block it has no styling for, under its own name', () => {
      const song = parseChordPro('{title: T}\n{start_of_solo}\nword\n{end_of_solo}\nafter')
      assert.deepEqual(
        song.sections.map((section) => section.kind),
        ['verse', 'verse'],
      )
      assert.deepEqual(song.sections[0].lines.map(shape), [['#Solo'], ['word']])
    })

    /*
     * `{chorus}` really repeats the chorus now. The repeat owns no notes — it is not in the
     * file — which is what `sourceLines: []` says and what `buildAnchorMap` reads it as.
     */
    it('repeats the chorus where the file asks for it', () => {
      const song = parseChordPro(
        '{title: T}\n{soc}\n[C]sung part\n{eoc}\n\nverse line\n{chorus}',
      )

      assert.deepEqual(
        song.sections.map((section) => section.kind),
        ['chorus', 'verse', 'chorus'],
      )
      assert.deepEqual(song.sections[2].lines.map(shape), [['[C]sung', 'part']])
    })

    it('gives the repeat no source, so no note can land on it', () => {
      const song = parseChordPro('{title: T}\n{soc}\nsung part\n{eoc}\n{chorus}')
      const repeat = song.sections[1].lines[0]
      assert.deepEqual(repeat.kind === 'lyrics' && repeat.sourceLines, [])
    })

    it('picks the chorus a labelled reference names', () => {
      const song = parseChordPro(
        [
          '{title: T}',
          '{start_of_chorus: One}',
          'first chorus',
          '{end_of_chorus}',
          '{start_of_chorus: Two}',
          'second chorus',
          '{end_of_chorus}',
          '{chorus: One}',
        ].join('\n'),
      )

      const repeat = song.sections[song.sections.length - 1]
      assert.deepEqual(repeat.lines.map(shape), [['#One'], ['first', 'chorus']])
    })

    /* A file that references a chorus it never wrote still marks the spot: saying nothing
       would lose the one thing the directive is for. */
    it('prints the reference when there is no chorus to repeat', () => {
      const song = parseChordPro('{title: T}\nword\n{chorus}')
      assert.deepEqual(song.sections[0].lines.map(shape), [['word'], ['#Chorus']])
    })
  })

  describe('grids', () => {
    it('keeps a grid verbatim rather than splitting it into words', () => {
      const song = parseChordPro('{title: T}\n{sog}\n| Am . . . | F . . . |\n{eog}')
      const line = song.sections[0].lines[0]
      assert.equal(line.kind, 'tab')
      if (line.kind !== 'tab') return

      assert.deepEqual(line.rows, ['| Am . . . | F . . . |'])
      assert.equal(line.variant, 'grid')
    })

    it('calls a tab a tab', () => {
      const song = parseChordPro('{title: T}\n{sot}\ne|--3--\n{eot}')
      const line = song.sections[0].lines[0]
      assert.equal(line.kind === 'tab' && line.variant, 'tab')
    })

    it('keeps an unclosed grid rather than losing its rows', () => {
      const song = parseChordPro('{title: T}\n{sog}\n| Am |')
      assert.deepEqual(shape(song.sections[0].lines[0]), ['|| Am |'])
    })
  })

  describe('comment spellings', () => {
    it('reads every shape of comment the format defines', () => {
      const song = parseChordPro('{title: T}\n{ci: quietly}\n{comment_box: loud}\n{highlight: watch}')
      assert.deepEqual(song.sections[0].lines.map(shape), [['#quietly'], ['#loud'], ['#watch']])
    })

    /*
     * Which frame each spelling asks for. `plain` and `italic` coincide on screen because
     * this app's comment style *is* muted italic — but they stay two values here, because
     * the parse records what the file asked for and the renderer decides what that looks
     * like. Conflating them in the parse would throw the request away.
     */
    it('records the frame each spelling asks for', () => {
      const song = parseChordPro(
        '{title: T}\n{c: a}\n{ci: b}\n{comment_italic: c}\n{comment_box: d}\n{highlight: e}',
      )

      assert.deepEqual(
        song.sections[0].lines.map((line) => (line.kind === 'comment' ? line.style : line.kind)),
        ['plain', 'italic', 'italic', 'box', 'highlight'],
      )
    })

    /* A comment this app invents is never framed: the file asked for no frame, because the
       file did not ask for the line at all. */
    it('leaves every comment it generates unframed', () => {
      const song = parseChordPro(
        '{title: T}\n{start_of_solo}\nword\n{end_of_solo}\n{chorus}\n{start_of_tab: Solo}\ne|-3-\n{eot}',
      )

      const styles = song.sections
        .flatMap((section) => section.lines)
        .flatMap((line) => (line.kind === 'comment' ? [line.style] : []))

      assert.deepEqual(styles, ['Solo', 'Chorus', 'Solo'].map(() => 'plain'))
    })

    /* The abbreviation that looks like it belongs above and does not: `cb` is
       `{column_break}`, and reading it as a comment put an empty line in the song. */
    it('leaves {cb} alone, since it is a column break and not a comment', () => {
      const song = parseChordPro('{title: T}\nword\n{cb}\nmore')
      assert.deepEqual(song.sections[0].lines.map(shape), [['word'], ['more']])
    })
  })

  /*
   * The colon is punctuation, not structure. Real files write both, and until twelve
   * generated ones were imported a line like `{comment Repeat ad lib…}` matched nothing and
   * was drawn as *words* — a comment printed in the middle of the song as though somebody
   * sang it.
   */
  describe('a space where the colon would be', () => {
    it('reads a comment written without one', () => {
      const song = parseChordPro('{title: T}\n{comment Repeat ad lib}\nword')
      assert.deepEqual(song.sections[0].lines.map(shape), [['#Repeat ad lib'], ['word']])
    })

    it('reads a value directive written without one', () => {
      assert.equal(parseChordPro('{title: T}\n{key G}\nword').key, 'G')
      assert.equal(parseChordPro('{title: T}\n{tempo 96}\nword').tempo, 96)
    })

    it('keeps a typesetting directive out of the words either way', () => {
      const song = parseChordPro('{title: T}\n{titles center}\nword')
      assert.deepEqual(song.sections[0].lines.map(shape), [['word']])
    })

    it('still reads the ordinary colon form', () => {
      assert.equal(parseChordPro('{title: T}\n{key: G}\nword').key, 'G')
    })
  })

  describe('{meta}', () => {
    it('reads the space-separated form', () => {
      const song = parseChordPro('{meta artist Someone}\n{meta tempo 96}\nword')
      assert.equal(song.artist, 'Someone')
      assert.equal(song.tempo, 96)
    })

    it('reads the colon form the same way', () => {
      const song = parseChordPro('{meta: artist Someone}\nword')
      assert.equal(song.artist, 'Someone')
    })

    it('ignores a meta directive naming something nothing here holds', () => {
      const song = parseChordPro('{meta album Something}\nword')
      assert.deepEqual(song.sections[0].lines.map(shape), [['word']])
    })
  })

  /*
   * A conditional runs only for a reader whose instrument the selector names. The parser
   * *records* it and the screen answers it — this module is a pure function of the text, and
   * deciding it here would make one file parse two ways for two readers while the notes
   * anchored in it are found by walking these very objects.
   */
  describe('conditional directives', () => {
    it('records the selector on a conditional section instead of guessing', () => {
      const song = parseChordPro('{title: T}\n{start_of_chorus-piano}\nword\n{end_of_chorus}')

      assert.equal(song.sections[0].kind, 'chorus')
      assert.equal(song.sections[0].selector, 'piano')
    })

    it('records the selector on a conditional comment', () => {
      const song = parseChordPro('{title: T}\n{comment-guitar: open position}\nword')
      const comment = song.sections[0].lines[0]

      assert.equal(comment.kind === 'comment' && comment.selector, 'guitar')
    })

    /*
     * The negated form, which reached `selectorMatches` for the first time on 2026-09-20.
     *
     * Both halves were correct on their own and the feature was still broken: the directive
     * name charset had no `!`, so the line matched no directive and was drawn as **lyrics** —
     * `{comment-!guitar: no capo}` printed among the words of the song — while the negation
     * branch of `selectorMatches` sat there fully tested and unreachable. That is why this
     * asserts the parse and not the predicate: a test of the predicate passed throughout.
     */
    it('reads a negated selector rather than printing the directive as words', () => {
      const song = parseChordPro('{title: T}\n{comment-!guitar: no capo}\nword')
      const comment = song.sections[0].lines[0]

      assert.equal(comment.kind, 'comment')
      assert.equal(comment.kind === 'comment' && comment.text, 'no capo')
      assert.equal(comment.kind === 'comment' && comment.selector, '!guitar')
    })

    it('takes a negated selector on a section too', () => {
      const song = parseChordPro('{title: T}\n{start_of_chorus-!ukulele}\nword\n{end_of_chorus}')

      assert.equal(song.sections[0].kind, 'chorus')
      assert.equal(song.sections[0].selector, '!ukulele')
    })

    /* `!` is allowed only after a dash, so this stays what it has always been: not a
       directive, and therefore a line of words. */
    it('does not take a bare exclamation mark as a directive name', () => {
      const song = parseChordPro('{title: T}\n{!foo}\nword')
      assert.ok(song.sections[0].lines.every((line) => line.kind !== 'comment'))
    })

    /* A conditional on something nobody draws would have to change a value before anybody
       looks, which this parser is in no position to decide. Skipped, as they all used to be. */
    it('skips a conditional on a directive that is never drawn', () => {
      assert.equal(parseChordPro('{title: T}\n{tempo-guitar: 96}\nword').tempo, null)
    })

    it('leaves a genuinely hyphenated directive alone', () => {
      assert.equal(parseChordPro('{title: T}\n{ccli-number: 12345}\nword').metadata.ccli, '12345')
    })
  })

  describe('selectorMatches', () => {
    it('answers yes to no selector at all, which is nearly every line', () => {
      assert.equal(selectorMatches(null, 'guitar'), true)
    })

    it('matches the instrument it names, ignoring capitals', () => {
      assert.equal(selectorMatches('guitar', 'guitar'), true)
      assert.equal(selectorMatches('Guitar', 'guitar'), true)
      assert.equal(selectorMatches('ukulele', 'guitar'), false)
    })

    it('reads the negated form', () => {
      assert.equal(selectorMatches('!guitar', 'guitar'), false)
      assert.equal(selectorMatches('!guitar', 'ukulele'), true)
    })

    /* An instrument this app does not have is somebody else's, which is the honest reading:
       a file that bothered to say «piano» did not mean us. */
    it('treats an instrument this app does not have as somebody else’s', () => {
      assert.equal(selectorMatches('piano', 'guitar'), false)
      assert.equal(selectorMatches('!piano', 'guitar'), true)
    })
  })

  describe('visibleSections', () => {
    const song = parseChordPro(
      [
        '{title: T}',
        '{comment-guitar: for a guitar}',
        '{comment-ukulele: for a ukulele}',
        '{c: for everybody}',
        'word',
        '{start_of_chorus-ukulele}',
        'ukulele only',
        '{end_of_chorus}',
      ].join('\n'),
    )

    it('keeps what is this reader’s and drops what is not', () => {
      const guitar = visibleSections(song.sections, 'guitar')

      assert.deepEqual(guitar.length, 1)
      assert.deepEqual(guitar[0].lines.map(shape), [['#for a guitar'], ['#for everybody'], ['word']])
    })

    it('gives the other reader the other half', () => {
      const ukulele = visibleSections(song.sections, 'ukulele')

      assert.deepEqual(ukulele.length, 2)
      assert.deepEqual(ukulele[0].lines.map(shape), [
        ['#for a ukulele'],
        ['#for everybody'],
        ['word'],
      ])
      assert.deepEqual(ukulele[1].lines.map(shape), [['ukulele', 'only']])
    })

    /* The property the anchors depend on: a song with no conditionals comes back as the very
       same objects, so every note in it still resolves. */
    it('hands back the same objects when a song guards nothing', () => {
      const plain = parseChordPro('{title: T}\n{c: note}\nword')
      const visible = visibleSections(plain.sections, 'guitar')

      assert.equal(visible[0], plain.sections[0])
      assert.equal(visible[0].lines[0], plain.sections[0].lines[0])
    })
  })

  describe('labels on a tab or a grid', () => {
    it('prints the name a tab gives itself', () => {
      const song = parseChordPro('{title: T}\n{start_of_tab: Solo}\ne|--3--\n{end_of_tab}')
      assert.deepEqual(song.sections[0].lines.map(shape), [['#Solo'], ['|e|--3--']])
    })

    it('prints the name a grid gives itself', () => {
      const song = parseChordPro('{title: T}\n{start_of_grid: Intro}\n| Am |\n{end_of_grid}')
      assert.deepEqual(song.sections[0].lines.map(shape), [['#Intro'], ['|| Am |']])
    })

    it('says nothing above an unnamed one', () => {
      const song = parseChordPro('{title: T}\n{sot}\ne|--3--\n{eot}')
      assert.deepEqual(song.sections[0].lines.map(shape), [['|e|--3--']])
    })
  })

  /*
   * The property the whole substitution feature rests on. `%{artist|di %{}}` contains a
   * space, so the ordinary word split would cut it in two and nothing downstream could ever
   * put it back together. And it stays *unresolved* here, because every note in a song is
   * anchored by a character offset into this line: swapping a placeholder for a value of a
   * different length at parse time would slide every note after it.
   */
  describe('%{…} placeholders', () => {
    it('keeps a conditional placeholder whole, space and all', () => {
      const line = parseLyricLine('%{artist|di %{}} tonight')
      assert.deepEqual(shape(line), ['%{artist|di %{}}', 'tonight'])
    })

    it('leaves the placeholder exactly as the file wrote it', () => {
      const song = parseChordPro('{title: T}\n{artist: Chi suona}\nScritta da %{artist}')
      assert.deepEqual(song.sections[0].lines.map(shape), [['Scritta', 'da', '%{artist}']])
    })

    it('keeps a chord attached to the word a placeholder opens', () => {
      const line = parseLyricLine('[C]%{title} here')
      assert.deepEqual(shape(line), ['[C]%{title}', 'here'])
    })

    it('treats an unclosed placeholder as the text it is', () => {
      assert.deepEqual(shape(parseLyricLine('a %{artist b')), ['a', '%{artist', 'b'])
    })

    it('does not mistake a per-cent sign for one', () => {
      assert.deepEqual(shape(parseLyricLine('100% sure')), ['100%', 'sure'])
    })

    /* The index resolves what the body alone allows, so a search matches the value and
       never the six characters of the placeholder. */
    it('resolves what it can for the search index', () => {
      const song = parseChordPro('{title: T}\n{artist: Chi suona}\nScritta da %{artist}')
      assert.equal(plainLyrics(song), 'Scritta da Chi suona')
    })
  })

  describe('{capo}', () => {
    it('reads the fret the song says it is played at', () => {
      assert.equal(parseChordPro('{title: T}\n{capo: 3}\nword').capo, 3)
    })

    it('reads a declared absence of one, which is a statement too', () => {
      assert.equal(parseChordPro('{title: T}\n{capo: 0}\nword').capo, 0)
    })

    it('says nothing when the song says nothing', () => {
      assert.equal(parseChordPro('{title: T}\nword').capo, null)
    })

    it('refuses a fret nobody can put a capo on', () => {
      assert.equal(parseChordPro('{title: T}\n{capo: none}\nword').capo, null)
      assert.equal(parseChordPro('{title: T}\n{capo: 2nd fret}\nword').capo, null)
      assert.equal(parseChordPro('{title: T}\n{capo: 99}\nword').capo, null)
    })

    /* Stated, never applied: the directive must not reach the reader's own capo, which
       lives in `user_song_prefs` and means «no capo» and «never chose» with one value. */
    it('does not print itself into the song', () => {
      const song = parseChordPro('{title: T}\n{capo: 3}\nword')
      assert.deepEqual(song.sections[0].lines.map(shape), [['word']])
    })
  })

  describe('{x_} extensions', () => {
    it("reads this app's own directives under their strict spelling too", () => {
      const song = parseChordPro('{x_songbook: Book}\n{x_division: Part}\nword')
      assert.equal(song.songbookName, 'Book')
      assert.equal(song.sectionName, 'Part')
    })

    it('ignores an extension nobody here claims', () => {
      const song = parseChordPro('{x_something: else}\nword')
      assert.deepEqual(song.sections[0].lines.map(shape), [['word']])
    })
  })
})

/*
 * The rule `CLAUDE.md` states in words, as something that fails the suite.
 *
 * A song has two parsers: this one, which the sheet renders, and `editor/document.ts`,
 * whose blocks every comment is anchored into. A line one of them draws as words and the other
 * keeps as something else is a note anchored to nothing, or words the editor offers that the
 * sheet never shows — and nothing is missing and nothing throws when it happens.
 */
describe('the reader and the editor agree on how many lyric lines a song has', () => {
  const cases: Record<string, string> = {
    'a hash comment': '{title: T}\n# note\nfirst\nsecond',
    'a trailing backslash': '{title: T}\nfirst \\\nsecond\nthird',
    'a grid': '{title: T}\n{sog}\n| Am . . . |\n{eog}\nword',
    'a tab': '{title: T}\n{sot}\ne|--3--\n{eot}\nword',
    'a named section': '{title: T}\n{start_of_chorus: Chorus 2}\nword\n{end_of_chorus}',
    'an unstyled section': '{title: T}\n{start_of_solo}\nword\n{end_of_solo}',
    'a chorus reference': '{title: T}\nword\n{chorus}',
    'every comment spelling': '{title: T}\n{ci: a}\n{comment_box: b}\n{highlight: c}\nword',
    'a column break': '{title: T}\nfirst\n{cb}\nsecond',
    'a joined line': '{title: T}\nfirst \\\nsecond\nthird',
    'a repeated chorus': '{title: T}\n{soc}\nsung\n{eoc}\nverse\n{chorus}',
    'a conditional section': '{title: T}\n{start_of_chorus-piano}\nword\n{end_of_chorus}',
    'a negated conditional': '{title: T}\n{comment-!guitar: no capo}\nword\nsecond',
    'a labelled tab': '{title: T}\nfirst\n{start_of_tab: Solo}\ne|--3--\n{end_of_tab}',
    'an annotation': '{title: T}\n[*Solo] [Am]word\nsecond',
    'a verse marked by hand': '{title: T}\n{sov}\none\n\ntwo\n{eov}',
    'an escaped bracket': '{title: T}\nsay \\[this\\]\nsecond',
    'a boxed comment spelt cb': '{title: T}\n{cb: Palm mute}\nword\n{cb}\nsecond',
    'markup across words': '{title: T}\na <b>bold [C]words</b> end\nsecond',
    'a unicode escape': '{title: T}\ncaf\\u00e9 [C]bar\nsecond',
    'a grille': '{title: T}\n{start_of_grille}\n| C . |\n{end_of_grille}\nword',
    'a delegated environment': '{title: T}\n{start_of_abc}\nX:1\n[CDE]\n{end_of_abc}\nword',
    'an unclosed delegated environment': '{title: T}\nword\n{start_of_ly}\n\\relative c',
    'a labelled chorus recall': '{title: T}\n{soc}\nsung\n{eoc}\n{chorus: label="Final"}',
  }

  /*
   * **Compared line by line, not by count.** This used to compare the reader's count with
   * `buildAnchorMap(...).size`, which has one entry per reader line whatever the editor did —
   * so it could not fail (`buildAnchorMap(sections, 'totally unrelated').size` was the same
   * number). Now every source line the reader drew words from must be an editor lyrics block,
   * and every editor lyrics block with words in it must be drawn by some reader line.
   */
  const disagreement = (source: string): string | null => {
    const { blocks } = fromSource(source)
    const starts = blockStartLines(blocks)
    const editorLyrics = new Set<number>()
    blocks.forEach((block, index) => {
      if (block.kind === 'lyrics' && block.text.trim() !== '') editorLyrics.add(starts[index])
    })

    const drawn = new Set<number>()
    for (const line of parseChordPro(source).sections.flatMap((section) => section.lines)) {
      if (line.kind !== 'lyrics') continue
      for (const sourceLine of line.sourceLines) {
        const block = blocks[starts.indexOf(sourceLine)]
        if (block === undefined || block.kind !== 'lyrics') return `reader drew line ${sourceLine}, editor has no lyrics there`
        drawn.add(sourceLine)
      }
    }
    for (const sourceLine of editorLyrics) {
      if (!drawn.has(sourceLine)) return `editor lyrics at line ${sourceLine} that the reader never draws`
    }
    return null
  }

  for (const [name, source] of Object.entries({
    ...cases,
    'a continuation into a blank line': '{title: T}\nverse \\\n\nnext',
    'a continuation into a directive': '{title: T}\nverse \\\n{c: hi}\nnext',
  })) {
    it(`agrees line by line with ${name}`, () => {
      assert.equal(disagreement(source), null)
    })
  }

})

/*
 * Everything the file says about the song that this app stores nowhere. None of it is
 * interpreted — it is read as written and printed back — so the test that matters is that it
 * arrives, that it survives an export, and that it never reaches the words.
 */
describe('metadata the app shows and does not act on', () => {
  const song = parseChordPro(
    [
      '{title: T}',
      '{artist: Chi suona}',
      '{subtitle: Dal vivo}',
      '{album: Un disco}',
      '{composer: Chi ha scritto}',
      '{lyricist: Chi ha messo le parole}',
      '{year: 1979}',
      '{copyright: (c) 1979 Qualcuno}',
      '{duration: 3:40}',
      '{ccli: 22025}',
      '{sorttitle: T, La}',
      '{sortartist: Suona, Chi}',
      '{key: Sol}',
      'word',
    ].join('\n'),
  )

  it('reads each one as written', () => {
    assert.equal(song.artist, 'Chi suona')
    assert.equal(song.subtitle, 'Dal vivo')
    assert.equal(song.key, 'Sol')
    assert.deepEqual(song.metadata, {
      album: 'Un disco',
      composer: 'Chi ha scritto',
      lyricist: 'Chi ha messo le parole',
      year: '1979',
      copyright: '(c) 1979 Qualcuno',
      duration: '3:40',
      ccli: '22025',
      arranger: null,
      sortTitle: 'T, La',
      sortArtist: 'Suona, Chi',
    })
  })

  it('keeps every one of them out of the words', () => {
    assert.deepEqual(song.sections[0].lines.map(shape), [['word']])
  })

  it('leaves a year written in words alone rather than making it a number', () => {
    assert.equal(parseChordPro('{title: T}\n{year: circa 1979}\nword').metadata.year, 'circa 1979')
  })

  it('reads the hyphenated CCLI spellings as the same field', () => {
    assert.equal(parseChordPro('{title: T}\n{ccli-number: 1}\nword').metadata.ccli, '1')
    assert.equal(parseChordPro('{title: T}\n{ccli_number: 2}\nword').metadata.ccli, '2')
  })

  it('says nothing for a song that says nothing', () => {
    const bare = parseChordPro('{title: T}\nword')
    assert.equal(bare.subtitle, null)
    assert.equal(bare.key, null)
    assert.ok(Object.values(bare.metadata).every((value) => value === null))
  })
})

/*
 * A fingering the file draws itself. The arithmetic below is the whole risk: with the usual
 * `base-fret 1` it cancels out and the numbers are already absolute, so getting it wrong
 * would go unnoticed on almost every file and be silently wrong on the ones that use it.
 */
describe('readDefinition', () => {
  it('reads the ordinary form, where the numbers are already absolute', () => {
    assert.deepEqual(readDefinition('C base-fret 1 frets 0 3 2 0 1 0'), {
      name: 'C',
      frets: [0, 3, 2, 0, 1, 0],
    })
  })

  it('assumes the first fret when the file does not say', () => {
    assert.deepEqual(readDefinition('C frets 0 3 2 0 1 0')?.frets, [0, 3, 2, 0, 1, 0])
  })

  /* A 1 means «the first fret the diagram shows», so with base-fret 3 it is really fret 3. */
  it('counts a higher base-fret from where the diagram starts', () => {
    assert.deepEqual(readDefinition('Bb base-fret 3 frets 1 3 3 2 1 1')?.frets, [3, 5, 5, 4, 3, 3])
  })

  /* An open string is not on the diagram at all, so the base never moves it. */
  it('leaves an open string open however high the diagram starts', () => {
    assert.deepEqual(readDefinition('X base-fret 5 frets 0 1 0')?.frets, [0, 5, 0])
  })

  it('reads both spellings of a muted string', () => {
    assert.deepEqual(readDefinition('D frets x x 0 2 3 2')?.frets, [null, null, 0, 2, 3, 2])
    assert.deepEqual(readDefinition('D frets N N 0 2 3 2')?.frets, [null, null, 0, 2, 3, 2])
  })

  it('keeps the chord name exactly as the file spelled it', () => {
    assert.equal(readDefinition('Cmaj7 frets 0 3 2 0 0 0')?.name, 'Cmaj7')
  })

  it('reads a ukulele definition, which is simply shorter', () => {
    assert.deepEqual(readDefinition('C frets 0 0 0 3')?.frets, [0, 0, 0, 3])
  })

  /* Null rather than a guess: a fingering drawn wrong is worse than one drawn from the
     table, because a reader has no way to tell. */
  it('refuses a definition it cannot read', () => {
    assert.equal(readDefinition(''), null)
    assert.equal(readDefinition('C'), null)
    assert.equal(readDefinition('C base-fret 1'), null)
  })

  it('files a definition under the chord it names', () => {
    const song = parseChordPro('{title: T}\n{define: Cmaj7 frets 0 3 2 0 0 0}\nword')
    assert.deepEqual(song.definitions.cmaj7.frets, [0, 3, 2, 0, 0, 0])
  })

  /* `{chord: …}` takes the same options and this app reads it the same way. */
  it('reads {chord: …} as a definition too', () => {
    const song = parseChordPro('{title: T}\n{chord: G frets 3 2 0 0 0 3}\nword')
    assert.deepEqual(song.definitions.g.frets, [3, 2, 0, 0, 0, 3])
  })

  it('keeps a definition out of the words', () => {
    const song = parseChordPro('{title: T}\n{define: C frets 0 3 2 0 1 0}\nword')
    assert.deepEqual(song.sections[0].lines.map(shape), [['word']])
  })
})

describe('edge cases the reader and the editor must agree on (2026-09-22)', () => {
  /* A chord dragged between a backslash and the character it escapes would turn `\#` into
     `\[D]#` — literal text to the reader, chord and escape both gone. */
  it('never writes a chord inside an escape pair', () => {
    assert.equal(writeLyricLine('\\#foo bar', [{ at: 1, name: 'D' }]), '\\#[D]foo bar')
    assert.equal(writeLyricLine('a \\', [{ at: 3, name: 'D' }]), 'a \\[D]')
  })

  /* `{meta:title Old}` is the title to the reader, colon with no space included. */
  it('strips every spelling of a column the reader takes', () => {
    const result = deduce('{title: New}\n{meta:title Old}\n{meta:artist OldA}\n[C]word')
    assert.equal(result.body, '[C]word')
  })

  /* The editor keeps a `#` note, a directive and a tab as blocks whatever precedes them. */
  it('does not continue a line into a note, a directive or a tab', () => {
    const lyrics = (source: string) =>
      parseChordPro(source).sections.flatMap((section) =>
        section.lines.map((line) => (line.kind === 'lyrics' ? line.words.map((word) => word.parts.map((part) => part.text).join('')).join(' ') : line.kind)),
      )
    assert.deepEqual(lyrics('la \\\n# note'), ['la'])
    assert.deepEqual(lyrics('verse \\\n{c: hi}'), ['verse', 'comment'])
    assert.deepEqual(lyrics('verse \\\n{start_of_tab}\ne|--0--\n{end_of_tab}'), ['verse', 'tab'])
    assert.deepEqual(lyrics('uno \\\ndue'), ['uno due'])
  })

  /* A repeat of a chorus only piano players see must not be drawn for everybody else. */
  it('repeats a conditional chorus under its own selector', () => {
    const parsed = parseChordPro('{soc-piano}\npiano chorus\n{eoc}\n{chorus}')
    assert.equal(visibleSections(parsed.sections, 'guitar').length, 0)
    assert.equal(visibleSections(parsed.sections, 'piano').length, 2)
  })

  /* `\[C]` is the text «[C]» to the reader, so the editor must not offer it as a chord. */
  it('keeps an escaped bracket literal in the editor', () => {
    const { chords, text } = readLyricLine('\\[C] not a chord')
    assert.deepEqual(chords, [])
    assert.equal(text, '\\[C] not a chord')
  })

  /* Words typed at the start of a line with a `#` would otherwise become a note nobody sees. */
  it('escapes a line of words that begins with a hash', () => {
    const source = toSource(setLineText(fromSource('la la'), 0, '# hi'))
    assert.equal(source, '\\# hi')
    assert.equal(parseChordPro(source).sections.length, 1)
  })
})

/*
 * Conformance with the ChordPro specification, checked against the reference implementation
 * (`Song.pm`) and its documentation on 2026-09-23. Each of these was wrong before that day.
 */
describe('ChordPro conformance (2026-09-23)', () => {
  const drawn = (source: string, instrument = 'guitar') =>
    visibleSections(parseChordPro(source).sections, instrument).flatMap((section) =>
      section.lines.map((line) =>
        line.kind === 'lyrics'
          ? line.words.map((word) => word.parts.map((part) => part.text).join('')).join(' ')
          : line.kind === 'comment'
            ? `(${line.style}) ${line.text}`
            : `${line.kind}:${line.variant ?? 'tab'}${line.delegate ? `:${line.delegate}` : ''}`,
      ),
    )

  /* `cb` is comment_box in the reference; bare, it can only be the column break. */
  it('reads {cb: …} as a boxed comment and a bare {cb} as nothing', () => {
    assert.deepEqual(drawn('{cb: Palm mute}\nword'), ['(box) Palm mute', 'word'])
    assert.deepEqual(drawn('{cb}\nword'), ['word'])
  })

  it('reads a label in the attribute spelling, with its line breaks', () => {
    assert.deepEqual(drawn('{start_of_verse: label="Verse 1"}\nx\n{end_of_verse}'), ['(plain) Verse 1', 'x'])
    assert.deepEqual(drawn("{start_of_solo: label='Solo'}\nx\n{end_of_solo}"), ['(plain) Solo', 'x'])
    assert.deepEqual(drawn('{start_of_verse: label="Verse 1\\nAll"}\nx\n{end_of_verse}'), ['(plain) Verse 1\nAll', 'x'])
    assert.equal(readLabel('Verse 1'), 'Verse 1')
    assert.equal(readLabel('other="x"'), '')
  })

  /* The argument of {chorus} is a label for the recall, per `Directives-chorus.md`. */
  it('repeats the last chorus under the label {chorus: …} gives it', () => {
    assert.deepEqual(drawn('{soc}\nsung\n{eoc}\n{chorus: Final}'), ['sung', '(plain) Final', 'sung'])
    assert.deepEqual(drawn('{soc}\nsung\n{eoc}\n{chorus: label="Final"}'), ['sung', '(plain) Final', 'sung'])
    // A chorus this app named itself is still picked by name.
    assert.deepEqual(drawn('{soc: A}\none\n{eoc}\n{soc}\ntwo\n{eoc}\n{chorus: A}'), ['(plain) A', 'one', 'two', '(plain) A', 'one'])
  })

  it('reads grille as a grid and the delegated environments verbatim', () => {
    assert.deepEqual(drawn('{start_of_grille}\n| C . |\n{end_of_grille}'), ['tab:grid'])
    assert.deepEqual(drawn('{start_of_abc}\nX:1\n[CDE]\n{end_of_tab}\n{end_of_abc}\nword'), ['tab:delegate:abc', 'word'])
    for (const delegate of ['ly', 'svg', 'textblock', 'strum']) {
      assert.deepEqual(drawn(`{start_of_${delegate}}\n[x] y\n{end_of_${delegate}}`), [`tab:delegate:${delegate}`], delegate)
    }
  })

  it('reads arranger, and keeps every composer, lyricist and arranger', () => {
    const song = parseChordPro('{composer: A}\n{meta: composer B}\n{arranger: C}\n{arranger: D}\n{composer: A}\nx')
    assert.equal(song.metadata.composer, 'A; B')
    assert.equal(song.metadata.arranger, 'C; D')
  })

  /* A key, time or tempo «applies from where it was specified»: the song's is the first. */
  it('takes the first key, time, tempo and capo as the song own', () => {
    const song = parseChordPro('{key: G}\n{time: 3/4}\n{tempo: 80}\n{capo: 1}\nx\n{key: A}\n{time: 4/4}\n{tempo: 120}\n{capo: 3}\ny')
    assert.equal(song.key, 'G')
    assert.equal(song.beatsPerBar, 3)
    assert.equal(song.tempo, 80)
    assert.equal(song.capo, 1)
  })

  it('draws markup rather than printing its tags, and keeps the plain words for everything else', () => {
    const line = parseChordPro('a <b>bold words</b> [<i>C</i>]end').sections[0].lines[0]
    assert.ok(line.kind === 'lyrics')
    assert.deepEqual(line.words.map((word) => word.parts.map((part) => part.text).join('')), ['a', 'bold', 'words', 'end'])
    assert.deepEqual(line.words[1].parts[0].runs, [{ text: 'bold', style: { bold: true } }])
    assert.equal(line.words[3].parts[0].chord, 'C')
  })

  it('reads \\uXXXX as the character it names, in words and in directives', () => {
    assert.deepEqual(drawn('caf\\u00e9 bar\n{c: \\u00e8 qui}'), ['café bar', '(plain) è qui'])
    assert.deepEqual(drawn('not \\u00zz'), ['not \\u00zz'])
  })

  /* Tags and escapes are source the reader does not draw: notes must still land on the word. */
  it('anchors words past markup and escapes where the editor puts them', () => {
    for (const [source, expected] of [
      ['<b>uno</b> due', [3, 11]],
      ['caf\\u00e9 [C]due', [0, 10]],
    ] as const) {
      const parsed = parseChordPro(source)
      const line = parsed.sections[0].lines[0]
      const anchors = buildAnchorMapFor(parsed.sections, source).get(line)!
      assert.deepEqual(anchors.flat().map((anchor) => anchor?.charOffset), expected, source)
    }
  })
})

/*
 * `{transpose}`, as decided with the owner on 2026-09-23: from where it appears; values add up
 * and an empty one restores the one before (the reference's stack); the one in force at the
 * first words is the song's starting transposition, which a reader's own choice replaces;
 * every later change is a modulation carried on the lines below it and announced where it
 * happens; a {chorus} repeats at the pitch in force where it stands; `s`/`f` are read and set
 * aside, since accidentals are the reader's preference.
 */
describe('{transpose}', () => {
  const shifts = (source: string) =>
    parseChordPro(source).sections.flatMap((section) =>
      section.lines.map((line) =>
        line.kind === 'lyrics' ? line.shift ?? 0 : line.kind === 'comment' && line.keyChange ? `key ${line.keyChange.by}/${line.keyChange.offset}` : line.kind,
      ),
    )

  it('sets the starting transposition when it comes before the words', () => {
    const song = parseChordPro('{transpose: 2}\n[C]a\n[G]b')
    assert.equal(song.transpose, 2)
    assert.deepEqual(shifts('{transpose: 2}\n[C]a\n[G]b'), [0, 0])
  })

  it('modulates from where it appears, adds up, and an empty one restores the one before', () => {
    const source = '[C]a\n{transpose: 2}\n[C]b\n{transpose: 1}\n[C]c\n{transpose}\n[C]d'
    assert.equal(parseChordPro(source).transpose, null)
    assert.deepEqual(shifts(source), [0, 'key 2/2', 2, 'key 1/3', 3, 'key -1/2', 2])
  })

  it('adds starting values up, and reads a trailing s or f for its number alone', () => {
    assert.equal(parseChordPro('{transpose: 2}\n{transpose: 3f}\n[C]x').transpose, 5)
    assert.deepEqual(shifts('[C]a\n{transpose: -2s}\n[C]b'), [0, 'key -2/-2', -2])
  })

  it('repeats a chorus at the pitch in force where {chorus} stands', () => {
    assert.deepEqual(shifts('{soc}\n[C]sung\n{eoc}\n{transpose: 2}\n{chorus}'), [0, 'key 2/2', 2])
  })

  /* The «Key change» line is part of the chorus and is repeated with it, so the lines after it
     have to move by the same step — they used to take the one offset in force at {chorus}. */
  it('repeats a modulation written inside the chorus, relative to where {chorus} stands', () => {
    assert.deepEqual(shifts('{soc}\n[C]a\n{transpose: 2}\n[C]b\n{eoc}\n{transpose}\n{chorus}'), [
      0,
      'key 2/2',
      2,
      'key -2/0',
      0,
      'key 2/2',
      2,
      'key -2/0',
    ])
    assert.deepEqual(shifts('[C]x\n{transpose: 1}\n{soc}\n[C]a\n{transpose: 2}\n[C]b\n{eoc}\n{chorus}').slice(-4), [
      3,
      'key 2/5',
      5,
      'key -2/3',
    ])
  })

  /* The song goes on at the pitch in force where {chorus} stood, so a key change inside the
     repeat is taken back — out loud, or the next verse drops a tone without warning. */
  it('announces the return after a repeated chorus that changed key', () => {
    assert.deepEqual(shifts('{soc}\n[C]a\n{transpose: 2}\n[C]b\n{eoc}\n\n[C]v\n\n{chorus}\n\n[C]w'), [
      0,
      'key 2/2',
      2,
      2,
      2,
      'key 2/4',
      4,
      'key -2/2',
      2,
    ])
  })

  /* +15 names the chords +3 does; clamping it to +12 while later modulations were measured
     from 15 bent every one of them by three semitones. */
  it('folds a starting total past an octave instead of clamping it', () => {
    assert.equal(parseChordPro('{transpose: 10}\n{transpose: 5}\n[C]a').transpose, 3)
    assert.equal(parseChordPro('{transpose: -10}\n{transpose: -5}\n[C]a').transpose, -3)
    assert.equal(parseChordPro('{transpose: 12}\n[C]a').transpose, 12)
  })

  it('reads a bare {transpose} with nothing to restore as saying nothing', () => {
    assert.equal(parseChordPro('{transpose}\n[C]a').transpose, null)
    assert.deepEqual(shifts('[C]a\n{transpose}\n[C]b'), [0, 0])
  })

  it('lists the chords actually played past a modulation, and the written ones for the key estimate', () => {
    const song = parseChordPro('[C]a [G]b\n{transpose: 2}\n[C]c [G]d')
    assert.deepEqual(chordTokens(song), ['C', 'G', 'D', 'A'])
    assert.deepEqual(chordTokens(song, false), ['C', 'G'])
  })
})
