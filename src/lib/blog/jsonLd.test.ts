import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { articleJsonLd, faqJsonLd, jsonLdText, softwareToolJsonLd } from './jsonLd'
import type { PostMeta } from './meta'

const POST: PostMeta = {
  slug: 'capo-second-fret',
  title: 'Capo on the second fret',
  description: 'What your fingers play and what the song is in.',
  date: '2026-06-12',
  category: 'Capo',
  cover: '/blog/capo-second-fret.webp',
  draft: false,
}

describe('an article, as structured data', () => {
  it('says the same day the page and the sitemap say', () => {
    /* The failure this guards is invisible on the page: a schema block dated differently from
       the byline under the headline, which is worse than publishing no schema at all. */
    assert.equal(articleJsonLd(POST).datePublished, POST.date)
  })

  it('points at itself with an absolute URL', () => {
    const data = articleJsonLd(POST)

    assert.deepEqual(data.mainEntityOfPage, {
      '@type': 'WebPage',
      '@id': 'https://strumfolio.com/blog/capo-second-fret',
    })
    assert.equal(data.image, 'https://strumfolio.com/blog/capo-second-fret/og')
  })

  it('carries the generated card and not the cover', () => {
    /* Same choice `socialImage` makes and for the same reason — a photograph three hundred
       pixels wide in a search result is worth less than a legible title. */
    assert.ok(!String(articleJsonLd(POST).image).endsWith('.webp'))
  })

  it('names a publisher and no author', () => {
    const data = articleJsonLd(POST) as { publisher: { name: string }; author?: unknown }

    assert.equal(data.publisher.name, 'Strumfolio')
    assert.equal(data.author, undefined)
  })
})

describe('a tool, as structured data', () => {
  const TOOL = { name: 'Capo calculator', description: 'Every fret at once.', path: '/tools/capo-calculator' }

  it('is a web application that costs nothing', () => {
    const data = softwareToolJsonLd(TOOL) as { '@type': string; offers: { price: string }; url: string }

    assert.equal(data['@type'], 'WebApplication')
    assert.equal(data.offers.price, '0')
    assert.equal(data.url, 'https://strumfolio.com/tools/capo-calculator')
  })
})

describe('a block of questions, as structured data', () => {
  const ITEMS = [
    { question: 'Does a capo change the key?', answer: 'No. It changes the shapes you hold.' },
    { question: 'Which fret should I use?', answer: 'The one that leaves you the most open shapes.' },
  ]

  it('carries every question the page shows, in order', () => {
    const data = faqJsonLd(ITEMS) as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] }

    assert.equal(data.mainEntity.length, 2)
    assert.equal(data.mainEntity[0].name, ITEMS[0].question)
    assert.equal(data.mainEntity[1].acceptedAnswer.text, ITEMS[1].answer)
  })
})

describe('putting it in the page', () => {
  it('escapes a closing script tag rather than ending the document early', () => {
    /* A security detail that looks like a formatting detail: unescaped, the `</script>` in a
       string would close the tag and spill the rest of the JSON into the page as markup. */
    const text = jsonLdText(faqJsonLd([{ question: 'Why?', answer: 'Because </script> exists.' }]))

    assert.ok(!text.includes('</script>'))
    assert.ok(text.includes('\\u003c/script>'))
  })

  it('still parses as JSON after the escaping', () => {
    const text = jsonLdText(articleJsonLd(POST))

    assert.deepEqual(JSON.parse(text).datePublished, POST.date)
  })
})
