import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { prepareSongs } from './prepare'
import { splitSongs } from './split'

describe('splitting a paste into songs', () => {
  it('leaves one song alone', () => {
    const source = '[la]Prima riga\n\n[mi]Seconda riga'
    assert.deepEqual(splitSongs(source), [source])
  })

  it('finds nothing in an empty paste', () => {
    assert.deepEqual(splitSongs(''), [])
    assert.deepEqual(splitSongs('  \n\n \n'), [])
  })

  it('cuts on a rule and keeps neither side of it', () => {
    assert.deepEqual(splitSongs('Uno\n---\nDue'), ['Uno', 'Due'])
    assert.deepEqual(splitSongs('Uno\n=====\nDue'), ['Uno', 'Due'])
    assert.deepEqual(splitSongs('Uno\n***\nDue'), ['Uno', 'Due'])
    assert.deepEqual(splitSongs('Uno\n___\nDue'), ['Uno', 'Due'])
  })

  it('needs three characters to call something a rule', () => {
    // "--" is a dash in the lyrics, not a separator.
    assert.deepEqual(splitSongs('Uno\n--\nDue'), ['Uno\n--\nDue'])
  })

  it('cuts on ChordPro’s own separator', () => {
    assert.deepEqual(splitSongs('Uno\n{ns}\nDue'), ['Uno', 'Due'])
    assert.deepEqual(splitSongs('Uno\n{new_song}\nDue'), ['Uno', 'Due'])
    assert.deepEqual(splitSongs('Uno\n{NS}\nDue'), ['Uno', 'Due'])
  })

  it('cuts before a second title and keeps it with its own song', () => {
    const pasted = ['{title: Uno}', '[la]uno', '', '{title: Due}', '[mi]due'].join('\n')

    assert.deepEqual(splitSongs(pasted), [
      '{title: Uno}\n[la]uno',
      '{title: Due}\n[mi]due',
    ])
  })

  it('does not open with an empty song when the paste starts with a title', () => {
    assert.deepEqual(splitSongs('{t: Uno}\n[la]uno'), ['{t: Uno}\n[la]uno'])
  })

  it('treats a page break as a rule, for text pulled out of a PDF', () => {
    assert.deepEqual(splitSongs('Uno\n\fDue'), ['Uno', 'Due'])
  })

  it('drops what falls between two marks', () => {
    assert.deepEqual(splitSongs('Uno\n---\n\n---\nDue'), ['Uno', 'Due'])
  })

  it('ignores the other directives', () => {
    // Only the title says "new song"; a subtitle or a key does not.
    const pasted = '{title: Uno}\n{subtitle: Tizio}\n{key: C}\n[la]uno'
    assert.deepEqual(splitSongs(pasted), [pasted])
  })

  it('does not read a silent string inside a tab as a rule', () => {
    // A whole bar with nothing played on a string is a run of dashes and nothing
    // else — exactly what RULE looks like, and exactly what a tab is allowed to be.
    const pasted = [
      '{title: Tre passi avanti}',
      '{start_of_tab}',
      '--------------------------------------------',
      '--------------------------------------------',
      '-----------0---5---0--2---0-----------------',
      '{end_of_tab}',
      '[si]uno',
    ].join('\n')

    assert.deepEqual(splitSongs(pasted), [pasted])
  })

  it('accepts the short tab alias, {sot}/{eot}', () => {
    const pasted = ['{title: Uno}', '{sot}', '---', '{eot}', '[la]uno'].join('\n')
    assert.deepEqual(splitSongs(pasted), [pasted])
  })

  it('still cuts on a rule once a tab has closed', () => {
    const pasted = ['{sot}', '---', '{eot}', 'Uno', '---', 'Due'].join('\n')
    assert.deepEqual(splitSongs(pasted), [['{sot}', '---', '{eot}', 'Uno'].join('\n'), 'Due'])
  })

  it('does not read a rule inside a labelled tab, a selected tab or a grid', () => {
    for (const [open, close] of [
      ['{start_of_tab: Intro}', '{end_of_tab}'],
      ['{sot-guitar}', '{eot-guitar}'],
      ['{start_of_grid}', '{end_of_grid}'],
      ['{start_of_textblock}', '{end_of_textblock}'],
    ]) {
      const pasted = ['{title: Uno}', open, '---', close, '[la]uno'].join('\n')
      assert.deepEqual(splitSongs(pasted), [pasted], open)
    }
  })

  /* This app's export is a ChordPro file and its restore path: a `---` in a song's body is that
     song's, and cutting there split one restored song into two. */
  it('does not cut on a rule in a file that marks its songs itself', () => {
    const exported = ['{title: Uno}', '', '[la]uno', '---', '[mi]ancora uno'].join('\n')
    assert.deepEqual(splitSongs(exported), [exported])
    const joined = ['{title: Uno}', '[la]uno', '***', 'uno', '{new_song}', '{title: Due}', 'due'].join('\n')
    assert.deepEqual(splitSongs(joined), [['{title: Uno}', '[la]uno', '***', 'uno'].join('\n'), '{title: Due}\ndue'])
  })

  it('keeps a song that has a title and no words', () => {
    assert.deepEqual(splitSongs('{title: Vuota}\n{key: C}\n{new_song}\n{title: Due}\ndue'), [
      '{title: Vuota}\n{key: C}',
      '{title: Due}\ndue',
    ])
  })

  it('cuts before a second title that holds a brace of its own', () => {
    assert.deepEqual(splitSongs('{title: Uno}\nuno\n{title: Due {Live}}\ndue'), ['{title: Uno}\nuno', '{title: Due {Live}}\ndue'])
  })

  it('leaves the words of the songs untouched', () => {
    const first = ['Certe notti', 'Ligabue', '', 'Am        F', 'Certe notti la macchina'].join('\n')
    const second = ['Vasco', '', 'C         G', 'Albachiara'].join('\n')

    assert.deepEqual(splitSongs(`${first}\n\n---\n\n${second}`), [first, second])
  })
})

describe('preparing what was pasted', () => {
  /** Two songs in one paste, in the format a chord site gives you. */
  const pasted = [
    'Certe notti',
    'Ligabue',
    '',
    'Am        F',
    'Certe notti la macchina',
    '',
    '---',
    '',
    'Albachiara',
    'Vasco Rossi',
    '',
    'C       G',
    'Respiri piano',
  ].join('\n')

  it('reads a title, an artist and a body out of each piece', () => {
    const songs = prepareSongs(pasted)

    assert.deepEqual(
      songs.map((song) => [song.title, song.artist]),
      [
        ['Certe notti', 'Ligabue'],
        ['Albachiara', 'Vasco Rossi'],
      ],
    )

    // The heading is consumed, so the words start at the words. The `F` lands on
    // the column it was written in, which is under the last letter of "notti".
    assert.equal(songs[0].body, '[Am]Certe nott[F]i la macchina')
    assert.equal(songs[1].body, '[C]Respiri [G]piano')
  })

  it('reads each song on its own, since one paste is not one song', () => {
    const songs = prepareSongs(pasted)

    assert.deepEqual(songs.map((song) => song.id), [0, 1])
    assert.deepEqual(songs.map((song) => song.format), ['chords-above', 'chords-above'])
  })

  it('repeats what a song says about its songbook without acting on it', () => {
    const songs = prepareSongs('{title: Uno}\n{songbook: Cartoni animati}\n[la]uno\n---\n{title: Due}\n[mi]due')

    assert.deepEqual(songs.map((song) => song.declares), ['Cartoni animati', null])
  })

  it('finds nothing to prepare in an empty paste', () => {
    assert.deepEqual(prepareSongs('\n \n'), [])
  })
})

/*
 * What a real file looks like before its title, and what that used to do.
 *
 * `splitSongs` cuts at a `{title:}` only when a song is already underway, so a paste opening
 * with a title does not begin with an empty song. The check used to be «is any line
 * non-blank», and a real file rarely opens with its title on line one — six of twelve
 * generated test files came apart into a phantom song plus the real one, and in two of them
 * the leading comment went on to become the phantom's title.
 */
describe('a header is not a song', () => {
  it('keeps a leading # comment with the song it introduces', () => {
    const songs = splitSongs('# where this file came from\n\n{title: Uno}\n[C]parole')

    assert.equal(songs.length, 1)
    assert.ok(songs[0].startsWith('# where this file came from'))
  })

  it('keeps leading directives with it too', () => {
    const songs = splitSongs('{pagetype: a4}\n{titles center}\n\n{t:Uno}\n[C]parole')

    assert.equal(songs.length, 1)
    assert.ok(songs[0].includes('{pagetype: a4}'))
  })

  it('handles the two together, which is what the real files do', () => {
    const songs = splitSongs('# una nota\n{pagetype: a4}\n\n{title: Uno}\n[C]parole')
    assert.equal(songs.length, 1)
  })

  /* The guard must still let a genuine second song through. */
  it('still cuts at a title once there are words above it', () => {
    const songs = splitSongs('{title: Uno}\n[C]parole\n\n{title: Due}\n[G]altre parole')

    assert.equal(songs.length, 2)
    assert.ok(songs[0].includes('Uno'))
    assert.ok(songs[1].includes('Due'))
  })

  it('cuts a medley at each of its titles', () => {
    const songs = splitSongs(
      '# nota\n{title: Uno}\n[C]parole\n{new_song}\n{title: Due}\n[G]parole\n{ns}\n{title: Tre}\n[D]parole',
    )

    assert.equal(songs.length, 3)
  })
})
