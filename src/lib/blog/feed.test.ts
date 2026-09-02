import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { escapeXml, renderFeed, rfc822 } from './feed'
import type { PostSummary } from './posts'

const post = (overrides: Partial<PostSummary['meta']> = {}): PostSummary => ({
  meta: {
    slug: 'chordpro-explained',
    title: 'What ChordPro is',
    description: 'A plain-text format for lyrics and chords.',
    date: '2026-09-02',
    tags: [],
    cover: null,
    draft: false,
    ...overrides,
  },
  readingTime: 4,
})

describe('escapeXml', () => {
  it('escapes the five characters XML cannot carry raw', () => {
    assert.equal(escapeXml(`Tom & Jerry <"'>`), 'Tom &amp; Jerry &lt;&quot;&apos;&gt;')
  })

  /* The ordering bug this function is written to avoid: escaping `&` last turns every entity
   * the earlier passes produced into `&amp;lt;` and friends. */
  it('does not double-escape the entities it just produced', () => {
    assert.equal(escapeXml('a < b'), 'a &lt; b')
    assert.equal(escapeXml('&amp;'), '&amp;amp;')
  })
})

describe('rfc822', () => {
  it('renders the weekday and month RSS expects, in GMT', () => {
    assert.equal(rfc822('2026-09-02'), 'Wed, 02 Sep 2026 00:00:00 GMT')
    assert.equal(rfc822('2026-01-01'), 'Thu, 01 Jan 2026 00:00:00 GMT')
  })

  /* Same trap `postDate` documents from the other side: read with local getters, a date built
   * at UTC midnight is the previous day for anybody west of Greenwich. */
  it('does not shift the day', () => {
    assert.match(rfc822('2026-03-01'), /01 Mar 2026/)
    assert.match(rfc822('2026-12-31'), /31 Dec 2026/)
  })

  it('hands back anything it cannot read', () => {
    assert.equal(rfc822('soon'), 'soon')
  })
})

describe('renderFeed', () => {
  it('is a well-formed RSS document with one item per article', () => {
    const xml = renderFeed([post(), post({ slug: 'capo', title: 'Capos', date: '2026-08-01' })])

    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/)
    assert.equal(xml.match(/<item>/g)?.length, 2)
    assert.match(xml, /<guid isPermaLink="true">https:\/\/strumfolio\.com\/blog\/capo<\/guid>/)
  })

  it('uses absolute URLs, since a feed is read away from the site', () => {
    const xml = renderFeed([post()])

    assert.match(xml, /<link>https:\/\/strumfolio\.com\/blog\/chordpro-explained<\/link>/)
    assert.doesNotMatch(xml, /<link>\/blog/)
  })

  it('escapes a title that would otherwise break the document', () => {
    const xml = renderFeed([post({ title: 'Chords & lyrics <together>' })])

    assert.match(xml, /<title>Chords &amp; lyrics &lt;together&gt;<\/title>/)
  })

  it('stamps the newest article rather than the moment of the build', () => {
    const xml = renderFeed([post({ date: '2026-09-02' }), post({ slug: 'older', date: '2026-01-01' })])

    assert.match(xml, /<lastBuildDate>Wed, 02 Sep 2026 00:00:00 GMT<\/lastBuildDate>/)
  })

  it('is still a valid feed with nothing published yet', () => {
    const xml = renderFeed([])

    assert.match(xml, /<channel>/)
    assert.doesNotMatch(xml, /<item>/)
    assert.doesNotMatch(xml, /lastBuildDate/)
  })

  it('writes each tag as a category', () => {
    const xml = renderFeed([post({ tags: ['chordpro', 'import'] })])

    assert.match(xml, /<category>chordpro<\/category>/)
    assert.match(xml, /<category>import<\/category>/)
  })
})
