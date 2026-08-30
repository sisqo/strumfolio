import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  formatChord,
  normalizeSuffix,
  parseChord,
  readChord,
  renderChord,
  transposeChord,
} from './chord'
import { keyFor, transposeKey } from './notes'

const C = keyFor(0, 'major')

describe('normalizeSuffix', () => {
  const cases: [string, string][] = [
    ['', ''],
    ['m', 'm'],
    ['min', 'm'],
    ['mi', 'm'],
    ['-', 'm'],
    ['m7', 'm7'],
    ['min7', 'm7'],
    ['-7', 'm7'],
    ['maj7', 'maj7'],
    ['M7', 'maj7'],
    ['Δ7', 'maj7'],
    ['△7', 'maj7'],
    ['ma7', 'maj7'],
    ['maj9', 'maj9'],
    ['maj', ''],
    ['dim', 'dim'],
    ['°', 'dim'],
    ['dim7', 'dim7'],
    ['°7', 'dim7'],
    ['aug', 'aug'],
    ['+', 'aug'],
    ['m7b5', 'm7b5'],
    ['-7b5', 'm7b5'],
    ['ø', 'm7b5'],
    ['ø7', 'm7b5'],
    ['sus4', 'sus4'],
    ['7', '7'],
    ['add9', 'add9'],
    ['6', '6'],
  ]

  for (const [raw, expected] of cases) {
    it(`maps ${raw || '(empty)'} to ${expected || '(empty)'}`, () => {
      assert.equal(normalizeSuffix(raw), expected)
    })
  }
})

describe('parseChord', () => {
  it('reads root, suffix and slash bass', () => {
    assert.deepEqual(parseChord('C'), {
      root: 0,
      rootName: 'C',
      suffix: '',
      bass: null,
      bassName: null,
    })
    assert.deepEqual(parseChord('Bb'), {
      root: 10,
      rootName: 'Bb',
      suffix: '',
      bass: null,
      bassName: null,
    })
    assert.deepEqual(parseChord('Am7/G'), {
      root: 9,
      rootName: 'A',
      suffix: 'm7',
      bass: 7,
      bassName: 'G',
    })
  })

  it('normalises the suffix while parsing', () => {
    assert.equal(parseChord('Cmin7')?.suffix, 'm7')
    assert.equal(parseChord('CM7')?.suffix, 'maj7')
  })

  it('reads a slash only as a bass note, so C6/9 stays one suffix', () => {
    const sixNine = parseChord('C6/9')
    assert.equal(sixNine?.suffix, '6/9')
    assert.equal(sixNine?.bass, null)
    assert.equal(parseChord('C/E')?.bass, 4)
  })

  it('rejects tokens that are not chords, so annotations survive as text', () => {
    assert.equal(parseChord('x2'), null)
    assert.equal(parseChord('assolo'), null)
    assert.equal(parseChord('Assolo'), null)
    assert.equal(parseChord('Ritornello'), null)
    assert.equal(parseChord('am'), null)
    assert.equal(parseChord(''), null)
  })

  it('still accepts the suffixes that real chord charts use', () => {
    for (const token of [
      'C',
      'Cm',
      'Cm7',
      'Cmaj7',
      'C7',
      'Csus4',
      'Cadd9',
      'C7b5',
      'C13',
      'Cdim7',
      'Cm7b5',
      'C6/9',
      'C(9)',
      'Caug',
      'C#m7/G#',
    ]) {
      assert.notEqual(parseChord(token), null, `${token} should parse`)
    }
  })
})

describe('chords written in Italian', () => {
  it('reads the note names the sources actually use', () => {
    assert.equal(parseChord('do')?.root, 0)
    assert.equal(parseChord('re')?.root, 2)
    assert.equal(parseChord('mi')?.root, 4)
    assert.equal(parseChord('fa')?.root, 5)
    assert.equal(parseChord('sol')?.root, 7)
    assert.equal(parseChord('la')?.root, 9)
    assert.equal(parseChord('si')?.root, 11)
  })

  it('reads them capitalised too', () => {
    assert.equal(parseChord('Re')?.root, 2)
    assert.equal(parseChord('Sol')?.root, 7)
  })

  it('keeps the accidental the source wrote', () => {
    assert.equal(parseChord('sib')?.rootName, 'Bb')
    assert.equal(parseChord('mib')?.rootName, 'Eb')
    assert.equal(parseChord('do#')?.rootName, 'C#')
    assert.equal(parseChord('fa#')?.rootName, 'F#')
  })

  it('reads the suffixes alongside them', () => {
    assert.equal(parseChord('la7')?.suffix, '7')
    assert.equal(parseChord('mi7')?.suffix, '7')
    assert.equal(parseChord('si-')?.suffix, 'm')
    assert.equal(parseChord('lam')?.suffix, 'm')
    assert.equal(parseChord('re-7')?.suffix, 'm7')
    assert.equal(parseChord('sol△7')?.suffix, 'maj7')
  })

  it('reads a slash bass in either notation', () => {
    assert.deepEqual(parseChord('re/fa#'), {
      root: 2,
      rootName: 'D',
      suffix: '',
      bass: 6,
      bassName: 'F#',
    })
    assert.equal(parseChord('la-7/sol')?.bassName, 'G')
    assert.equal(parseChord('la/G')?.bassName, 'G')
  })

  it('reads Do as C rather than as a D diminished', () => {
    // The `o` alias for diminished is real, but Italian charts write `°` or `dim`,
    // and `Do` is overwhelmingly the note.
    assert.equal(parseChord('Do')?.root, 0)
    assert.equal(parseChord('Do')?.suffix, '')
    assert.equal(parseChord('Do7')?.suffix, '7')
    // Written unambiguously, a diminished still parses as one.
    assert.equal(parseChord('sol°')?.suffix, 'dim')
    assert.equal(parseChord('D°')?.suffix, 'dim')
  })

  it('refuses the Italian words that a bare o would turn into chords', () => {
    for (const word of ['solo', 'mio', 'fallo', 'lodo', 'Solo']) {
      assert.equal(parseChord(word), null, `${word} should not be a chord`)
    }
  })

  it('still refuses the annotations it refused before', () => {
    assert.equal(parseChord('assolo'), null)
    assert.equal(parseChord('Ritornello'), null)
    assert.equal(parseChord('strumentale'), null)
    assert.equal(parseChord('finale'), null)
    assert.equal(parseChord('x2'), null)
  })

  it('falls back to the international reading when the Italian one does not hold', () => {
    // `Fadd9` starts with `fa`, but `dd9` is not a suffix.
    assert.equal(parseChord('Fadd9')?.root, 5)
    assert.equal(parseChord('Fadd9')?.suffix, 'add9')
    // `Fm` starts with `fa`? No — but `F` does, and this must stay F minor.
    assert.equal(parseChord('Fm')?.suffix, 'm')
  })

  it('displays an Italian source in whichever notation is asked for', () => {
    const key = keyFor(2, 'major')
    assert.equal(renderChord('re', 0, 'it', key), 'Re')
    assert.equal(renderChord('re', 0, 'int', key), 'D')
    assert.equal(renderChord('mi7', 0, 'it', key), 'Mi7')
    assert.equal(renderChord('mi7', 0, 'int', key), 'E7')
    assert.equal(renderChord('si-', 0, 'int', key), 'Bm')
  })

  it('transposes a chord the source wrote in Italian', () => {
    // Up two semitones from D lands in E, which writes sharps.
    assert.equal(renderChord('re', 2, 'int', keyFor(4, 'major')), 'E')
    assert.equal(renderChord('la', 2, 'int', keyFor(4, 'major')), 'B')
    assert.equal(renderChord('sol', 2, 'it', keyFor(4, 'major')), 'La')
  })
})

describe('transposeChord', () => {
  it('moves root and bass together', () => {
    const chord = transposeChord(parseChord('C/E')!, 2, transposeKey(C, 2))
    assert.equal(chord.root, 2)
    assert.equal(chord.bass, 6)
    assert.equal(formatChord(chord, 'int'), 'D/F#')
  })

  it('wraps around the octave', () => {
    assert.equal(transposeChord(parseChord('B')!, 1, transposeKey(C, 1)).root, 0)
    assert.equal(transposeChord(parseChord('C')!, -1, transposeKey(C, -1)).root, 11)
  })

  it('leaves the suffix untouched', () => {
    assert.equal(transposeChord(parseChord('Cmaj7')!, 5, transposeKey(C, 5)).suffix, 'maj7')
  })

  it('keeps the source spelling when nothing is transposed', () => {
    // A borrowed Bb in a song in C is written Bb, never A#.
    assert.equal(renderChord('Bb', 0, 'int', C), 'Bb')
    assert.equal(renderChord('A#', 0, 'int', C), 'A#')
    assert.equal(renderChord('Gb', 0, 'int', C), 'Gb')
  })
})

describe('enharmonic spelling follows the target key', () => {
  it('writes flats in flat keys', () => {
    const target = transposeKey(C, 10)
    assert.equal(target.name, 'Bb')
    assert.equal(renderChord('C', 10, 'int', target), 'Bb')
    assert.equal(renderChord('D', 10, 'int', target), 'C')
    assert.equal(renderChord('F', 10, 'int', target), 'Eb')
    // The same pitch class a sharp key would spell F#.
    assert.equal(renderChord('G#', 10, 'int', target), 'Gb')
  })

  it('writes sharps in sharp keys', () => {
    const target = transposeKey(C, 2)
    assert.equal(target.name, 'D')
    assert.equal(renderChord('C', 2, 'int', target), 'D')
    assert.equal(renderChord('A', 2, 'int', target), 'B')
    assert.equal(renderChord('C#', 2, 'int', target), 'D#')
  })

  it('picks the key spelling with fewest accidentals', () => {
    assert.equal(transposeKey(C, 1).name, 'Db')
    assert.equal(transposeKey(C, 3).name, 'Eb')
    assert.equal(transposeKey(C, 6).name, 'F#')
    assert.equal(transposeKey(C, 8).name, 'Ab')
  })

  it('treats minor keys by their own signatures', () => {
    const am = keyFor(9, 'minor')
    assert.equal(am.name, 'Am')
    assert.equal(transposeKey(am, 1).name, 'Bbm')
    assert.equal(transposeKey(am, 2).name, 'Bm')
    assert.equal(transposeKey(am, 3).name, 'Cm')
  })
})

describe('Italian notation', () => {
  const cases: [string, string][] = [
    ['C', 'Do'],
    ['Cm', 'Do-'],
    ['Cm7', 'Do-7'],
    ['Cmaj7', 'Do△7'],
    ['Cdim', 'Do°'],
    ['Caug', 'Do+'],
    ['Cm7b5', 'Do-7b5'],
    ['Csus4', 'Dosus4'],
    ['C7', 'Do7'],
    ['Bb', 'Sib'],
    ['F#m', 'Fa#-'],
    ['C/E', 'Do/Mi'],
    ['G', 'Sol'],
    ['A', 'La'],
    ['B', 'Si'],
    ['Cmin7', 'Do-7'],
    ['CM7', 'Do△7'],
  ]

  for (const [source, expected] of cases) {
    it(`renders ${source} as ${expected}`, () => {
      assert.equal(renderChord(source, 0, 'it', C), expected)
    })
  }
})

describe('international notation', () => {
  it('matches the source once the suffix is canonical', () => {
    for (const source of ['C', 'Cm', 'Cm7', 'Cmaj7', 'Cdim', 'Caug', 'Csus4', 'C7', 'C/E']) {
      assert.equal(renderChord(source, 0, 'int', C), source)
    }
  })

  it('normalises inconsistent sources to the canonical form', () => {
    assert.equal(renderChord('Cmin7', 0, 'int', C), 'Cm7')
    assert.equal(renderChord('C-7', 0, 'int', C), 'Cm7')
    assert.equal(renderChord('CΔ7', 0, 'int', C), 'Cmaj7')
  })
})

describe('renderChord', () => {
  it('passes non-chord tokens through unchanged', () => {
    assert.equal(renderChord('x2', 2, 'it', C), 'x2')
  })
})

describe('readChord', () => {
  /** Parse, move, spell — exactly what the sheet does to every chord on it. */
  const read = (raw: string, semitones: number, accidentals: 'sharp' | 'flat') =>
    formatChord(readChord(parseChord(raw)!, semitones, accidentals), 'int')

  it('overrides the source spelling with nothing transposed', () => {
    // The whole reason this exists: rule 1 would have kept both as written.
    assert.equal(read('Bb', 0, 'sharp'), 'A#')
    assert.equal(read('A#', 0, 'flat'), 'Bb')
  })

  it('overrides what the key it lands in would have spelled', () => {
    // Ten semitones up from C lands in Bb, where rule 2 spells this Bb.
    assert.equal(read('C', 10, 'flat'), 'Bb')
    assert.equal(read('C', 10, 'sharp'), 'A#')
  })

  it('moves the pitch classes the same way transposeChord does', () => {
    assert.equal(readChord(parseChord('B')!, 1, 'sharp').root, 0)
    assert.equal(readChord(parseChord('C')!, -1, 'flat').root, 11)
  })

  it('leaves naturals alone, and resolves a spelled-out one either way', () => {
    assert.equal(read('G', 0, 'flat'), 'G')
    assert.equal(read('G', 0, 'sharp'), 'G')
    // Pitch class 11 is B in both tables, so Cb comes out B whichever was asked for.
    assert.equal(read('Cb', 0, 'sharp'), 'B')
    assert.equal(read('Cb', 0, 'flat'), 'B')
  })

  it('moves and respells the slash bass too', () => {
    assert.equal(read('Bb/Db', 0, 'sharp'), 'A#/C#')
    assert.equal(read('C/E', 2, 'flat'), 'D/Gb')
  })

  it('leaves the suffix untouched', () => {
    assert.equal(readChord(parseChord('Bbm7')!, 3, 'sharp').suffix, 'm7')
  })

  it('speaks Italian through formatChord like any other chord', () => {
    assert.equal(formatChord(readChord(parseChord('A#')!, 0, 'flat'), 'it'), 'Sib')
  })
})
