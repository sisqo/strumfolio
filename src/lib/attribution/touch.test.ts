import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  ATTRIBUTION_COOKIE_MAX_DAYS,
  decodeAttribution,
  effectiveLastTouch,
  encodeAttribution,
  isDeniedRefererHost,
  mergeTouch,
  normalizeLandingPath,
  readTouch,
} from './touch'
import type { Attribution, Touch } from './touch'

const NOW = new Date('2026-09-08T10:00:00Z')
const LATER = new Date('2026-11-20T10:00:00Z')
const HOST = 'strumfolio.com'

function read(path: string, referer: string | null = null, now: Date = NOW) {
  return readTouch(new URL(`https://strumfolio.com${path}`), referer, HOST, now)
}

function touch(overrides: Partial<Touch> = {}): Touch {
  return {
    source: null,
    medium: null,
    campaign: null,
    term: null,
    content: null,
    clickIdKind: null,
    clickId: null,
    refererHost: null,
    landingPath: '/',
    at: NOW.toISOString(),
    ...overrides,
  }
}

describe('normalizeLandingPath', () => {
  it('collapses a Strum Together link so no broadcast token is ever recorded', () => {
    assert.equal(normalizeLandingPath('/follow/8f3c1d9ab24e7f60'), '/follow')
  })

  it('keeps a blog article whole, because which article converted is the information', () => {
    assert.equal(normalizeLandingPath('/blog/come-leggere-accordi-sul-palco'), '/blog/come-leggere-accordi-sul-palco')
  })

  it('keeps a tool whole, for the same reason', () => {
    assert.equal(normalizeLandingPath('/tools/capo-calculator'), '/tools/capo-calculator')
  })

  it('collapses anything else with a dynamic segment, so a GROUP BY has finitely many values', () => {
    assert.equal(normalizeLandingPath('/songs/hallelujah'), '/songs/*')
    assert.equal(normalizeLandingPath('/songbooks/live-2026'), '/songbooks/*')
  })

  it('leaves a single-segment path alone and keeps the root as the root', () => {
    assert.equal(normalizeLandingPath('/help'), '/help')
    assert.equal(normalizeLandingPath('/'), '/')
  })

  it('ignores a trailing slash rather than treating it as a second value', () => {
    assert.equal(normalizeLandingPath('/pricing/'), '/pricing')
  })
})

describe('isDeniedRefererHost', () => {
  it('denies the OAuth host, which is what every Google sign-in returns through', () => {
    assert.equal(isDeniedRefererHost('accounts.google.com', HOST), true)
  })

  it('allows organic Google search, which is a real and different answer', () => {
    assert.equal(isDeniedRefererHost('www.google.com', HOST), false)
  })

  it("denies Paddle's checkout, the same shape as the OAuth return", () => {
    assert.equal(isDeniedRefererHost('checkout.paddle.com', HOST), true)
  })

  it('denies our own host and every preview deployment of it', () => {
    assert.equal(isDeniedRefererHost('strumfolio.com', HOST), true)
    assert.equal(isDeniedRefererHost('strumfolio-abc123.vercel.app', HOST), true)
  })

  it('allows an ordinary referring site', () => {
    assert.equal(isDeniedRefererHost('www.reddit.com', HOST), false)
  })
})

describe('readTouch', () => {
  it('reads a tagged arrival as a touch that may overwrite', () => {
    const result = read('/?utm_source=instagram&utm_medium=social&utm_campaign=lancio')
    assert.equal(result?.overwrites, true)
    assert.equal(result?.touch.source, 'instagram')
    assert.equal(result?.touch.medium, 'social')
    assert.equal(result?.touch.campaign, 'lancio')
    assert.equal(result?.touch.landingPath, '/')
  })

  it('keeps the first click id present, and names which network it belongs to', () => {
    const result = read('/pricing?gclid=EAIaIQobCh')
    assert.equal(result?.touch.clickIdKind, 'gclid')
    assert.equal(result?.touch.clickId, 'EAIaIQobCh')
    assert.equal(result?.overwrites, true)
  })

  it('treats a click id alone as tagged, since Meta often sends nothing else', () => {
    const result = read('/login?fbclid=IwAR0abc')
    assert.equal(result?.touch.clickIdKind, 'fbclid')
    assert.equal(result?.overwrites, true)
  })

  it('reads an external referer as a first-touch-only arrival', () => {
    const result = read('/pricing', 'https://www.reddit.com/r/guitar/comments/x')
    assert.equal(result?.overwrites, false)
    assert.equal(result?.touch.source, 'www.reddit.com')
    assert.equal(result?.touch.medium, 'referral')
  })

  it('is not a touch at all when a Google sign-in returns — the whole reason rule 2 exists', () => {
    assert.equal(read('/', 'https://accounts.google.com/signin/oauth'), null)
  })

  it('is not a touch when Paddle returns', () => {
    assert.equal(read('/thanks', 'https://checkout.paddle.com/order'), null)
  })

  it('is not a touch for an internal navigation', () => {
    assert.equal(read('/pricing', 'https://strumfolio.com/login'), null)
  })

  it('is not a touch for the three one-time email links, even with a referer', () => {
    assert.equal(read('/verify?token=abc', 'https://mail.google.com/'), null)
    assert.equal(read('/forgot-password', 'https://mail.google.com/'), null)
    assert.equal(read('/reset-password?token=abc', 'https://mail.google.com/'), null)
  })

  it('still reads a tagged newsletter link, which is an email we sent and is meant to count', () => {
    const result = read('/pricing?utm_source=newsletter&utm_medium=email', 'https://mail.google.com/')
    assert.equal(result?.touch.source, 'newsletter')
    assert.equal(result?.overwrites, true)
  })

  it('names an untagged Strum Together arrival as its own channel, without overwriting', () => {
    const result = read('/follow/8f3c1d9ab24e7f60')
    assert.equal(result?.touch.source, 'strum-together')
    assert.equal(result?.touch.medium, 'referral')
    assert.equal(result?.touch.landingPath, '/follow')
    assert.equal(result?.overwrites, false)
  })

  it('lets campaign parameters win over the Strum Together channel on the same link', () => {
    const result = read('/follow/8f3c1d9ab24e7f60?utm_source=instagram')
    assert.equal(result?.touch.source, 'instagram')
    assert.equal(result?.overwrites, true)
  })

  it('records no token from a Strum Together link', () => {
    const result = read('/follow/8f3c1d9ab24e7f60?utm_source=instagram')
    assert.equal(JSON.stringify(result).includes('8f3c1d9ab24e7f60'), false)
  })

  it('caps a long value instead of storing it, since anybody can write the URL', () => {
    const result = read(`/?utm_campaign=${'a'.repeat(300)}`)
    assert.equal(result?.touch.campaign?.length, 80)
  })

  it('treats an empty parameter as absent rather than as a source', () => {
    assert.equal(read('/?utm_source='), null)
  })

  it('ignores a referer it cannot parse', () => {
    assert.equal(read('/pricing', 'not a url'), null)
  })
})

describe('mergeTouch', () => {
  it('starts a first touch when the browser carried nothing', () => {
    const result = read('/?utm_source=instagram')
    assert.notEqual(result, null)
    const merged = mergeTouch(null, result!)
    assert.equal(merged?.first.source, 'instagram')
    assert.equal(merged?.last, null, 'one arrival means no last touch to store')
  })

  it('records a second, different campaign as the last touch and keeps the first', () => {
    const first = mergeTouch(null, read('/?utm_source=instagram')!)
    const second = mergeTouch(first, read('/pricing?utm_source=google&utm_medium=cpc', null, LATER)!)
    assert.equal(second?.first.source, 'instagram')
    assert.equal(second?.last?.source, 'google')
    assert.equal(second?.last?.at, LATER.toISOString())
  })

  it('refuses to let an external referer overwrite a first touch that already exists', () => {
    const first = mergeTouch(null, read('/?utm_source=instagram')!)
    const again = mergeTouch(first, read('/pricing', 'https://www.reddit.com/r/guitar', LATER)!)
    assert.equal(again, null, 'nothing changed, so nothing is written and the window does not restart')
  })

  it('lets an external referer fill a first touch when there is none', () => {
    const merged = mergeTouch(null, read('/pricing', 'https://www.reddit.com/r/guitar')!)
    assert.equal(merged?.first.source, 'www.reddit.com')
  })

  it('does not store a repeat of the same campaign as a second touch', () => {
    const first = mergeTouch(null, read('/?utm_source=instagram')!)
    assert.equal(mergeTouch(first, read('/?utm_source=instagram', null, LATER)!), null)
  })

  it('does not rewrite when the newest campaign is the one already stored as last', () => {
    const first = mergeTouch(null, read('/?utm_source=instagram')!)
    const second = mergeTouch(first, read('/?utm_source=google', null, LATER)!)
    assert.equal(mergeTouch(second, read('/?utm_source=google', null, LATER)!), null)
  })

  it('never lets a Strum Together arrival overwrite the campaign somebody really came from', () => {
    const first = mergeTouch(null, read('/?utm_source=instagram')!)
    assert.equal(mergeTouch(first, read('/follow/8f3c1d9ab24e7f60', null, LATER)!), null)
  })
})

describe('effectiveLastTouch', () => {
  it('answers the first touch when there has only ever been one', () => {
    const attribution: Attribution = { first: touch({ source: 'instagram' }), last: null }
    assert.equal(effectiveLastTouch(attribution).source, 'instagram')
  })

  it('answers the last when there is one', () => {
    const attribution: Attribution = { first: touch({ source: 'instagram' }), last: touch({ source: 'google' }) }
    assert.equal(effectiveLastTouch(attribution).source, 'google')
  })
})

describe('encodeAttribution and decodeAttribution', () => {
  it('round-trips an ordinary attribution', () => {
    const attribution: Attribution = { first: touch({ source: 'instagram', campaign: 'lancio' }), last: null }
    const encoded = encodeAttribution(attribution)
    assert.notEqual(encoded, null)
    assert.deepEqual(decodeAttribution(encoded), attribution)
  })

  it('fits two touches with every field at its cap, whole — which is what makes the ceiling unreachable', () => {
    const wide = touch({
      source: 'a'.repeat(80),
      medium: 'b'.repeat(80),
      campaign: 'c'.repeat(80),
      term: 'd'.repeat(80),
      content: 'e'.repeat(80),
      clickIdKind: 'msclkid',
      clickId: 'f'.repeat(80),
      refererHost: 'g'.repeat(80),
      landingPath: '/blog/' + 'h'.repeat(70),
    })
    const encoded = encodeAttribution({ first: wide, last: wide })
    assert.notEqual(encoded, null)
    assert.ok(encoded!.length <= 2048, `a maximal payload is ${encoded!.length} bytes`)
    assert.deepEqual(decodeAttribution(encoded), { first: wide, last: wide }, 'nothing had to be shed')
  })

  it('sheds term and content rather than losing the campaign, when something does not fit', () => {
    /* Unreachable from any URL at the current value cap — see `encodeAttribution`. Constructed
       here directly so the shedding order is still pinned for whoever raises that cap. */
    const huge = touch({ source: 'a'.repeat(80), campaign: 'c'.repeat(80), term: 'd'.repeat(4000), content: 'e'.repeat(4000) })
    const encoded = encodeAttribution({ first: huge, last: huge })
    assert.notEqual(encoded, null)
    const decoded = decodeAttribution(encoded)
    assert.equal(decoded?.first.campaign, 'c'.repeat(80), 'the campaign survives')
    assert.equal(decoded?.first.term, null, 'the qualifier does not')
  })

  it('reads a missing, empty or unparseable cookie as an empty browser rather than throwing', () => {
    assert.equal(decodeAttribution(null), null)
    assert.equal(decodeAttribution(undefined), null)
    assert.equal(decodeAttribution(''), null)
    assert.equal(decodeAttribution('{not json'), null)
    assert.equal(decodeAttribution('"a string"'), null)
    assert.equal(decodeAttribution('{"first":{"source":"x"}}'), null, 'a touch with no landing path is not a touch')
  })

  it('caps values coming back out of the cookie too, since an older deploy wrote it', () => {
    const decoded = decodeAttribution(JSON.stringify({ first: { source: 'z'.repeat(300), landingPath: '/', at: NOW.toISOString() } }))
    assert.equal(decoded?.first.source?.length, 80)
  })
})

describe('the window', () => {
  it('is the advertising networks’ own lookback, so the numbers are comparable', () => {
    assert.equal(ATTRIBUTION_COOKIE_MAX_DAYS, 90)
  })
})
