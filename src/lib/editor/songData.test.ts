import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { describe, it } from 'node:test'

import { fromSource, toSource } from './document'
import {
  DATA_GROUPS,
  addSongField,
  fieldNameOf,
  headEnd,
  readSongData,
  removeSongField,
  setSongField,
} from './songData'

const SONG = [
  '# una nota di chi ha scritto il file',
  '{title: Prova}',
  '{artist: Strumfolio}',
  '{tag: rock}',
  '{tag: live}',
  '{key: G}',
  '{x_qualcosa: valore}',
  '',
  '{start_of_chorus: Finale}',
  '[G]parole',
  '{end_of_chorus}',
  '{capo: 2}',
  'altre parole',
].join('\n')

const row = (source: string, group: string, name: string) => {
  const data = readSongData(fromSource(source))
  return data.groups.find((one) => one.title === group)?.rows.find((one) => one.name === name)
}

describe('headEnd', () => {
  it('stops at the first line a reader would see', () => {
    // 0 `#`, 1 title, 2 artist, 3 tag, 4 tag, 5 key, 6 x_qualcosa, 7 blank, 8 boundary…
    assert.equal(headEnd(fromSource(SONG).blocks), 8)
  })

  /*
   * Five of the twelve reference files open with a `#` banner. A rule that stopped at the
   * first block which is not a directive gave every one of them an empty head, and with it
   * an empty form — which is how this ended up including `source-comment` and `blank`.
   */
  it('reads through a `#` banner and the blank line under it', () => {
    assert.equal(headEnd(fromSource('# banner\n\n{title: T}\nparole').blocks), 3)
  })

  it('answers nought for a song that opens with its words', () => {
    assert.equal(headEnd(fromSource('parole\n{capo: 2}').blocks), 0)
  })
})

describe('fieldNameOf', () => {
  it('reads a directive under the name the form calls it', () => {
    assert.equal(fieldNameOf('{t: Prova}'), 'title')
    assert.equal(fieldNameOf('{st: Sotto}'), 'subtitle')
    assert.equal(fieldNameOf('{bpm: 96}'), 'tempo')
    assert.equal(fieldNameOf('{chord: C frets 0 3 2 0 1 0}'), 'define')
    assert.equal(fieldNameOf('{tags: rock}'), 'tag')
  })

  it('leaves a name it does not know as its own', () => {
    assert.equal(fieldNameOf('{x_qualcosa: valore}'), 'x_qualcosa')
  })

  it('answers null for something that is not a directive', () => {
    assert.equal(fieldNameOf('parole'), null)
  })
})

describe('readSongData', () => {
  it('points each field at the block it came from', () => {
    const title = row(SONG, 'Identity', 'title')
    assert.equal(title?.block, 1)
    assert.equal(title?.value, 'Prova')
  })

  it('leaves a field the song does not carry with no block and no value', () => {
    const album = row(SONG, 'Identity', 'album')
    assert.equal(album?.block, null)
    assert.equal(album?.value, '')
  })

  /*
   * The whole reason `tag` is a group of its own. `{tag:}` is singular and repeatable, and
   * a single input would have shown «rock» and destroyed «live» at the first save — which
   * is the bug this repo fixed in the reader on the same day the column was dropped.
   */
  it('gives a repeatable directive one row per line', () => {
    const tags = readSongData(fromSource(SONG)).groups.find((one) => one.title === 'Finding it')

    assert.equal(tags?.kind, 'repeat')
    assert.deepEqual(
      tags?.rows.map((one) => [one.block, one.value]),
      [
        [3, 'rock'],
        [4, 'live'],
      ],
    )
  })

  /*
   * A `{capo: 2}` after the words is still the song's capo, so the form shows it — and
   * shows it pointing at the line where its writer put it, which is what lets the edit
   * happen there instead of hoisting the line into the head.
   */
  it('finds a named field below the head and keeps its place', () => {
    const capo = row(SONG, 'Music', 'capo')
    assert.equal(capo?.block, 11)
    assert.equal(capo?.value, '2')
  })

  it('keeps an unknown head directive under its own name', () => {
    const others = readSongData(fromSource(SONG)).others
    assert.deepEqual(
      others.map((one) => [one.name, one.value]),
      [['x_qualcosa', 'valore']],
    )
  })

  /*
   * The other half of that rule, and the one that decides where the line between metadata
   * and layout falls: a `{column_break}` in the middle of a song *is* its position, so it
   * stays a row in the editor rather than becoming a field with nowhere to sit.
   */
  it('leaves an unknown directive below the head out of the form', () => {
    const data = readSongData(fromSource('{title: T}\nparole\n{column_break}\naltre'))
    assert.deepEqual(data.others, [])
  })

  it('takes the first of two lines that say the same thing, as a reader does', () => {
    assert.equal(row('{key: G}\n{key: D}\nparole', 'Music', 'key')?.block, 0)
  })
})

/**
 * The property the whole feature rests on, asserted directly rather than inferred from a
 * round trip: **editing one field rewrites one line and leaves every other byte alone.**
 *
 * A round-trip test passes just as well against a form that re-emits the whole head in its
 * own order, which would reorder a file its writer arranged and move every line a reader's
 * notes are anchored to. This is the assertion that says it does not.
 */
describe('one field, one line', () => {
  const changedLines = (before: string, after: string) => {
    const one = before.split('\n')
    const other = after.split('\n')
    const moved: number[] = []

    assert.equal(one.length, other.length, 'the line count changed')
    for (let at = 0; at < one.length; at += 1) if (one[at] !== other[at]) moved.push(at)
    return moved
  }

  it('changes only the line the field came from', () => {
    const before = fromSource(SONG)
    const title = row(SONG, 'Identity', 'title')!
    const after = toSource(setSongField(before, title.block, 'title', 'Altro titolo'))

    assert.deepEqual(changedLines(SONG, after), [1])
    assert.ok(after.includes('{title: Altro titolo}'))
  })

  it('changes only that line for a field sitting below the words', () => {
    const before = fromSource(SONG)
    const capo = row(SONG, 'Music', 'capo')!
    const after = toSource(setSongField(before, capo.block, 'capo', '5'))

    assert.deepEqual(changedLines(SONG, after), [11])
  })

  it('changes only the one tag of two', () => {
    const before = fromSource(SONG)
    const tags = readSongData(before).groups.find((one) => one.title === 'Finding it')!
    const after = toSource(setSongField(before, tags.rows[1]!.block, 'tag', 'acustico'))

    assert.deepEqual(changedLines(SONG, after), [4])
    assert.ok(after.includes('{tag: rock}'), 'the first tag was disturbed')
  })

  /* Every group, every field the song carries: none of them may touch a second line. */
  it('holds for every field in the form', () => {
    const data = readSongData(fromSource(SONG))
    const rows = [...data.groups.flatMap((group) => group.rows), ...data.others]

    for (const field of rows) {
      if (field.block === null) continue
      const after = toSource(setSongField(fromSource(SONG), field.block, field.name, 'X'))
      assert.deepEqual(changedLines(SONG, after), [field.block], `${field.name} moved another line`)
    }
  })
})

describe('adding and removing', () => {
  it('writes a field the song did not carry at the end of the head', () => {
    const after = toSource(setSongField(fromSource(SONG), null, 'album', 'Un disco'))
    const lines = after.split('\n')

    // After `{x_qualcosa}`, the last directive of the head — not under the blank line that
    // closes it, which is where «the end of the head» literally taken had put it.
    assert.equal(lines[7], '{album: Un disco}')
    // The words are untouched and still in order.
    assert.ok(after.includes('{start_of_chorus: Finale}\n[G]parole'))
  })

  it('writes nothing for an empty value, so tabbing through the form leaves no trail', () => {
    assert.equal(toSource(setSongField(fromSource(SONG), null, 'album', '   ')), SONG)
  })

  it('opens an empty row for a repeat group and says which block it is', () => {
    const added = addSongField(fromSource(SONG), 'tag')
    const block = added.document.blocks[added.block]

    assert.equal(block?.kind, 'directive')
    assert.equal(block?.kind === 'directive' && block.raw, '{tag}')
  })

  it('takes the whole line away rather than leaving an empty directive', () => {
    const tags = readSongData(fromSource(SONG)).groups.find((one) => one.title === 'Finding it')!
    const after = toSource(removeSongField(fromSource(SONG), tags.rows[0]!.block!))

    assert.ok(!after.includes('{tag: rock}'))
    assert.ok(after.includes('{tag: live}'))
    assert.equal(after.split('\n').length, SONG.split('\n').length - 1)
  })

  it('writes into a song with no head at all, at the very top', () => {
    const after = toSource(setSongField(fromSource('parole\naltre'), null, 'title', 'T'))
    assert.equal(after, '{title: T}\nparole\naltre')
  })
})

/*
 * The form is a view over the blocks, so a document nobody touched must come back byte for
 * byte — read against the real corpus rather than a fixture, because what breaks an
 * invariant like this is the file nobody thought of.
 */
describe('the corpus survives being read as a form', () => {
  const files: string[] = []
  for (const dir of ['content/songs', '/media/psf/Download/songs']) {
    try {
      for (const name of readdirSync(dir)) {
        if (/\.(cho|chopro|pro|crd)$/.test(name)) files.push(`${dir}/${name}`)
      }
    } catch {
      /* The shared folder is not mounted everywhere; `content/` always is. */
    }
  }

  it('found something to read', () => {
    assert.ok(files.length > 0, 'no corpus')
  })

  for (const path of files) {
    const name = path.split('/').pop()

    it(`reads ${name} without disturbing a byte`, () => {
      const source = readFileSync(path, 'utf8')
      const document = fromSource(source)

      readSongData(document)
      assert.equal(toSource(document), source)
    })

    it(`edits one field of ${name} and moves nothing else`, () => {
      const source = readFileSync(path, 'utf8')
      const data = readSongData(fromSource(source))
      const field = [...data.groups.flatMap((group) => group.rows), ...data.others].find(
        (one) => one.block !== null,
      )
      if (field === undefined) return

      const after = toSource(setSongField(fromSource(source), field.block, field.name, 'X'))
      const one = source.split('\n')
      const other = after.split('\n')

      assert.equal(one.length, other.length)
      for (let at = 0; at < one.length; at += 1) {
        if (at !== field.block) assert.equal(other[at], one[at], `line ${at} moved`)
      }
    })
  }
})

/*
 * Why `DraftInput` exists, pinned here because `npm test` reaches a module and not a React
 * tree — so the component itself cannot be tested, but the fact that forced it can.
 */
describe('a value does not survive the round trip byte for byte', () => {
  it('loses a trailing space, which is what stopped anybody typing one', () => {
    const written = setSongField(fromSource('{title: T}\nparole'), null, 'album', 'Disco ')
    const back = readSongData(written).groups
      .find((one) => one.title === 'Identity')
      ?.rows.find((one) => one.name === 'album')

    // Written with the space, read back without it — so a controlled input fed from the
    // document dropped every space the moment it was typed, and «Disco di prova» arrived
    // as «Discodiprova». The input keeps its own draft while it has the focus.
    assert.ok(toSource(written).includes('{album: Disco }'))
    assert.equal(back?.value, 'Disco')
  })

  /* The other half: once the value is a word again the two agree, which is the condition
     the draft is kept under — disagree and the document wins, so Undo is not fought. */
  it('is unchanged for a value with nothing hanging off the end', () => {
    const written = setSongField(fromSource('{title: T}\nparole'), null, 'album', 'Disco di prova')
    const back = readSongData(written).groups
      .find((one) => one.title === 'Identity')
      ?.rows.find((one) => one.name === 'album')

    assert.equal(back?.value, 'Disco di prova')
  })
})

describe('the fieldset table', () => {
  it('names every field once across the groups', () => {
    const names = DATA_GROUPS.flatMap((group) => group.fields.map((field) => field.name))
    assert.deepEqual(names, [...new Set(names)], 'a field is in two groups')
  })

  /* A repeat group holds exactly one directive: the N rows are N lines of *that* name. */
  it('gives every repeat group a single directive', () => {
    for (const group of DATA_GROUPS) {
      if (group.kind === 'repeat') assert.equal(group.fields.length, 1, group.title)
    }
  })

  /*
   * Nothing in the form may be a name the importer strips, which is the rule `fields.test.ts`
   * already holds for the «add a field» menu: a value typed into a field that disappears at
   * the next save is worse than a field that was never offered.
   */
  it('offers nothing the importer would strip from the body', async () => {
    const { METADATA_DIRECTIVE } = await import('../import/deduce')

    for (const group of DATA_GROUPS) {
      for (const field of group.fields) {
        // Title and artist are the two the form edits through their columns, not the body.
        if (field.name === 'title' || field.name === 'artist') continue
        assert.ok(
          !METADATA_DIRECTIVE.test(`{${field.name}: x}`),
          `${field.name} is stripped on import`,
        )
      }
    }
  })
})
