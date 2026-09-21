import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { describe, it } from 'node:test'

import { fromSource, toSource } from './document'
import {
  DATA_GROUPS,
  addSongField,
  fieldNameOf,
  headEnd,
  isFieldName,
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

  /* It used to answer a row with `block: null`, drawn empty. See «a field is drawn because
     a line exists» below for why there is no row at all now. */
  it('has no row for a field the song does not carry', () => {
    assert.equal(row(SONG, 'Identity', 'album'), undefined)
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
 * The rule the whole form hangs off, and the one sentence it has to be possible to say
 * about it: **a field is on screen because its line is in the file.**
 *
 * Not because it has a value. The two come apart exactly where it matters — clearing a
 * value to retype it — and the value reading would take the field away under the caret.
 * With `DraftInput` holding the typed draft the rule would have had to become «has a value,
 * or has the focus», an «or» in the sentence that most needs not to have one.
 */
describe('a field is drawn because a line exists', () => {
  const named = (source: string) =>
    readSongData(fromSource(source)).groups.flatMap((group) =>
      group.rows.map((one) => one.name),
    )

  it('leaves out every field the song does not carry', () => {
    const shown = named(SONG)

    assert.ok(shown.includes('key'), 'the song declares a key')
    assert.ok(!shown.includes('album'), 'album is nowhere in the file')
    assert.ok(!shown.includes('ccli'))
    assert.ok(!shown.includes('sorttitle'))
  })

  /* The half that makes clearing a value safe: the line is still there, so the row is too. */
  it('keeps a field whose line is there and whose value is empty', () => {
    assert.ok(named('{album}\nparole').includes('album'))
    assert.ok(named('{album: }\nparole').includes('album'))
  })

  it('draws no group at all when nothing in it is carried', () => {
    const titles = readSongData(fromSource(SONG)).groups.map((one) => one.title)

    assert.ok(titles.includes('Music'), 'the song has a key and a capo')
    assert.ok(!titles.includes('Rights'), 'no copyright, no CCLI, no heading')
    assert.ok(!titles.includes('Sorting'))
  })

  it('draws a repeat group only once the song has one of them', () => {
    assert.ok(readSongData(fromSource(SONG)).groups.some((one) => one.title === 'Finding it'))
    assert.ok(!readSongData(fromSource('{title: T}\nparole')).groups.some((one) => one.title === 'Finding it'))
  })
})

/** What «Add a field» may offer: the exact complement of what is on screen. */
describe('the fields that are missing', () => {
  const missing = (source: string) => readSongData(fromSource(source)).missing.map((one) => one.name)

  it('offers what the song does not carry and nothing it does', () => {
    const offered = missing(SONG)

    assert.ok(offered.includes('album'))
    assert.ok(offered.includes('ccli'))
    assert.ok(!offered.includes('key'), 'the key is already on screen')
    assert.ok(!offered.includes('capo'))
  })

  /*
   * A repeat group is offered while it is empty and not after: once the song has one tag
   * the group is drawn with an «add» of its own, and the menu offering «Tag» beside it
   * would be two buttons for one act.
   */
  it('stops offering a repeat group once it has a row', () => {
    assert.ok(!missing(SONG).includes('tag'), 'this song has two tags')
    assert.ok(missing('{title: T}\nparole').includes('tag'))
    assert.ok(missing('{title: T}\nparole').includes('define'))
  })

  it('carries the group each field belongs to, so the menu can head them', () => {
    const data = readSongData(fromSource(SONG))
    const album = data.missing.find((one) => one.name === 'album')

    assert.equal(album?.group, 'Identity')
    assert.equal(album?.label, 'Album')
  })

  /* Every field is either drawn or offered, never both and never neither. */
  it('is the exact complement of what is on screen', () => {
    for (const source of [SONG, '{title: T}\nparole', '{album}\n{tag: uno}\nparole']) {
      const data = readSongData(fromSource(source))
      const shown = new Set(data.groups.flatMap((group) => group.rows.map((one) => one.name)))
      const offered = new Set(data.missing.map((one) => one.name))
      const all = DATA_GROUPS.flatMap((group) => group.fields.map((field) => field.name))

      for (const name of all) {
        assert.equal(shown.has(name) !== offered.has(name), true, `${name} in ${source}`)
      }
    }
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
  it('writes the new field at the end of the head, empty, and says which block', () => {
    const added = addSongField(fromSource(SONG), 'album')
    const lines = toSource(added.document).split('\n')
    const block = added.document.blocks[added.block]

    // After `{x_qualcosa}`, the last directive of the head — not under the blank line that
    // closes it, which is where «the end of the head» literally taken had put it.
    assert.equal(lines[7], '{album}')
    assert.equal(block?.kind === 'directive' && block.raw, '{album}')
    // The words are untouched and still in order.
    assert.ok(toSource(added.document).includes('{start_of_chorus: Finale}\n[G]parole'))
  })

  /* One field, one line, on the way in as well as on the way through. */
  it('adds exactly one line and moves nothing else', () => {
    const after = toSource(addSongField(fromSource(SONG), 'album').document)
    const one = SONG.split('\n')
    const other = after.split('\n')

    assert.equal(other.length, one.length + 1)
    assert.deepEqual(other.slice(0, 7), one.slice(0, 7))
    assert.deepEqual(other.slice(8), one.slice(7))
  })

  it('opens an empty row for a repeat group too', () => {
    const added = addSongField(fromSource(SONG), 'tag')
    const block = added.document.blocks[added.block]

    assert.equal(block?.kind, 'directive')
    assert.equal(block?.kind === 'directive' && block.raw, '{tag}')
  })

  /* A name nothing here knows is written as it was typed — that is the whole of «Anything
     else», and the reason `addSongField` checks no list. */
  it('takes a name the app has never heard of', () => {
    const added = addSongField(fromSource(SONG), 'x_inventato')
    const data = readSongData(added.document)

    assert.ok(data.others.some((one) => one.name === 'x_inventato'))
  })

  it('takes the whole line away rather than leaving an empty directive', () => {
    const tags = readSongData(fromSource(SONG)).groups.find((one) => one.title === 'Finding it')!
    const after = toSource(removeSongField(fromSource(SONG), tags.rows[0]!.block))

    assert.ok(!after.includes('{tag: rock}'))
    assert.ok(after.includes('{tag: live}'))
    assert.equal(after.split('\n').length, SONG.split('\n').length - 1)
  })

  it('writes into a song with no head at all, at the very top', () => {
    const after = toSource(addSongField(fromSource('parole\naltre'), 'title').document)
    assert.equal(after, '{title}\nparole\naltre')
  })
})

describe('isFieldName', () => {
  it('takes an ordinary directive name', () => {
    for (const name of ['album', 'x_inventato', 'Capo', 'a1']) {
      assert.equal(isFieldName(name), true, name)
    }
  })

  /*
   * A conditional is refused rather than corrected. `{album-guitar}` is a legal directive
   * and an impossible *field*: the form shows one row for the whole song and could not say
   * which reader that row was for. Guessing what somebody meant is how `{albm}` becomes a
   * permanent row in «Anything else».
   */
  it('refuses a conditional, a blank, and anything that is not a name', () => {
    for (const name of ['album-guitar', 'comment-!guitar', '', '   ', '1album', 'a b', '{album}']) {
      assert.equal(isFieldName(name), false, JSON.stringify(name))
    }
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
  const album = (source: string) =>
    readSongData(fromSource(source)).groups
      .find((one) => one.title === 'Identity')
      ?.rows.find((one) => one.name === 'album')

  it('loses a trailing space, which is what stopped anybody typing one', () => {
    const written = toSource(setSongField(fromSource('{album}\nparole'), 0, 'album', 'Disco '))

    // Written with the space, read back without it — so a controlled input fed from the
    // document dropped every space the moment it was typed, and «Disco di prova» arrived
    // as «Discodiprova». The input keeps its own draft while it has the focus.
    assert.ok(written.includes('{album: Disco }'))
    assert.equal(album(written)?.value, 'Disco')
  })

  /* The other half: once the value is a word again the two agree, which is the condition
     the draft is kept under — disagree and the document wins, so Undo is not fought. */
  it('is unchanged for a value with nothing hanging off the end', () => {
    const written = toSource(setSongField(fromSource('{album}\nparole'), 0, 'album', 'Disco di prova'))
    assert.equal(album(written)?.value, 'Disco di prova')
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
