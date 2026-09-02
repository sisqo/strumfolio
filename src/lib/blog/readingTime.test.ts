import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readingTimeMinutes } from './readingTime'

const words = (count: number) => Array.from({ length: count }, () => 'word').join(' ')

describe('readingTimeMinutes', () => {
  it('counts prose at two hundred words a minute', () => {
    assert.equal(readingTimeMinutes(words(400)), 2)
    assert.equal(readingTimeMinutes(words(1000)), 5)
  })

  it('never says less than a minute, however short the article', () => {
    assert.equal(readingTimeMinutes(''), 1)
    assert.equal(readingTimeMinutes('Three little words'), 1)
  })

  it('does not count the meta block as reading', () => {
    const source = `export const meta = {
  title: '${words(50)}',
  description: '${words(50)}',
}

${words(200)}`

    assert.equal(readingTimeMinutes(source), 1, 'only the 200 words of prose should count')
  })

  /*
   * The case the naive "cut at the first closing brace on its own line" version got wrong,
   * silently: a brace inside a string ended the block early, and the rest of the meta was
   * counted as prose. It returns a number either way, so nothing but this test would notice.
   */
  it('handles a brace inside the meta block', () => {
    const source = `export const meta = {
  title: 'A title with { a brace } in it',
  description: '${words(100)}',
}

${words(600)}`

    assert.equal(readingTimeMinutes(source), 3)
  })

  it('does not count fenced code', () => {
    const source = `${words(200)}

\`\`\`
${words(2000)}
\`\`\`
`

    assert.equal(readingTimeMinutes(source), 1)
  })

  it('does not count JSX tags, but does count the words inside them', () => {
    const source = `<Chord name="Am" /> ${words(400)}`

    assert.equal(readingTimeMinutes(source), 2)
  })

  it('does not count markdown punctuation as words', () => {
    const source = `## A heading

---

* * *

> ${words(400)}`

    assert.equal(readingTimeMinutes(source), 2)
  })

  it('counts a link by its text, not by its URL', () => {
    const source = `[${words(400)}](https://strumfolio.com/a/very/long/path/nobody/reads)`

    assert.equal(readingTimeMinutes(source), 2)
  })
})
