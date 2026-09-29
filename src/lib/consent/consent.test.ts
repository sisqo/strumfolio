import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseRegion, regionOf, requiresConsent } from './region'
import type { Touch } from '@/lib/attribution/touch'

import {
  adsConfigFrom,
  bannerAllowedOn,
  tagAllowedOn,
  decideConsent,
  gclidOf,
  parseConsent,
  serializeConsent,
  tagPageLocation,
  tagReferrer,
} from './state'
import { CONSENT_MAX_DAYS, CONSENT_VERSION } from './types'

const NOW = Date.UTC(2026, 8, 27)
const DAY = 24 * 60 * 60 * 1000

describe('which countries have to be asked', () => {
  it('asks the EU, the rest of the EEA, the UK and Switzerland', () => {
    for (const code of ['IT', 'DE', 'FR', 'IE', 'NO', 'IS', 'LI', 'GB', 'CH']) {
      assert.equal(requiresConsent(code), true, code)
    }
  })

  it('does not ask elsewhere', () => {
    for (const code of ['US', 'CA', 'BR', 'JP', 'AU']) assert.equal(requiresConsent(code), false, code)
  })

  it('asks when the country is unknown, which is where a missing header lands', () => {
    assert.equal(requiresConsent(null), true)
    assert.equal(requiresConsent(undefined), true)
    assert.equal(requiresConsent(''), true)
    assert.equal(requiresConsent('XX1'), true)
  })

  it('reads lowercase codes the same', () => {
    assert.equal(requiresConsent('us'), false)
    assert.equal(regionOf('it'), 'eea')
  })

  it('reads anything stored but «other» as the EEA', () => {
    assert.equal(parseRegion('other'), 'other')
    assert.equal(parseRegion('eea'), 'eea')
    assert.equal(parseRegion(undefined), 'eea')
    assert.equal(parseRegion('OTHER'), 'eea')
  })
})

describe('the Ads configuration', () => {
  it('needs all three values', () => {
    assert.deepEqual(adsConfigFrom('AW-123', 'a', 'b'), { id: 'AW-123', signupLabel: 'a', purchaseLabel: 'b' })
    assert.equal(adsConfigFrom('AW-123', 'a', undefined), null)
    assert.equal(adsConfigFrom('AW-123', '', 'b'), null)
    assert.equal(adsConfigFrom(undefined, 'a', 'b'), null)
  })

  it('refuses an id that is not an Ads id', () => {
    assert.equal(adsConfigFrom('G-ABC123', 'a', 'b'), null)
    assert.equal(adsConfigFrom('AW-12x', 'a', 'b'), null)
  })
})

describe('the stored answer', () => {
  it('round-trips', () => {
    const choice = { version: CONSENT_VERSION, ads: 'granted' as const, at: NOW - DAY }
    assert.deepEqual(parseConsent(serializeConsent(choice), NOW), choice)
  })

  it('forgets an answer from an older version', () => {
    assert.equal(parseConsent(`${CONSENT_VERSION - 1}:granted:${NOW}`, NOW), null)
  })

  it('forgets an answer older than six months, keeps one just inside', () => {
    assert.equal(parseConsent(`${CONSENT_VERSION}:denied:${NOW - (CONSENT_MAX_DAYS + 1) * DAY}`, NOW), null)
    assert.notEqual(parseConsent(`${CONSENT_VERSION}:denied:${NOW - (CONSENT_MAX_DAYS - 1) * DAY}`, NOW), null)
  })

  it('ignores garbage and dates in the future', () => {
    assert.equal(parseConsent('yes', NOW), null)
    assert.equal(parseConsent(`${CONSENT_VERSION}:maybe:${NOW}`, NOW), null)
    assert.equal(parseConsent(`${CONSENT_VERSION}:granted:${NOW + DAY}`, NOW), null)
    assert.equal(parseConsent('%E0%A4%A', NOW), null)
  })
})

describe('what the browser does', () => {
  const granted = { version: CONSENT_VERSION, ads: 'granted' as const, at: NOW }
  const denied = { version: CONSENT_VERSION, ads: 'denied' as const, at: NOW }

  it('does nothing at all when Ads is not configured, whatever else is true', () => {
    for (const region of ['eea', 'other'] as const) {
      for (const choice of [null, granted, denied]) {
        for (const adClick of [true, false]) {
          assert.deepEqual(decideConsent({ configured: false, choice, region, adClick }), { load: false, ask: false })
        }
      }
    }
  })

  it('asks in the EEA a visitor who arrived from an ad, and loads nothing until the answer', () => {
    assert.deepEqual(decideConsent({ configured: true, choice: null, region: 'eea', adClick: true }), { load: false, ask: true })
  })

  it('neither asks nor loads in the EEA for a visitor who never arrived from an ad', () => {
    assert.deepEqual(decideConsent({ configured: true, choice: null, region: 'eea', adClick: false }), { load: false, ask: false })
  })

  it('loads without asking outside the EEA, however the visitor arrived', () => {
    for (const adClick of [true, false]) {
      assert.deepEqual(decideConsent({ configured: true, choice: null, region: 'other', adClick }), { load: true, ask: false })
    }
  })

  it('honours an answer everywhere, a «no» outside the EEA and a «yes» from an organic visitor included', () => {
    for (const region of ['eea', 'other'] as const) {
      for (const adClick of [true, false]) {
        assert.deepEqual(decideConsent({ configured: true, choice: granted, region, adClick }), { load: true, ask: false })
        assert.deepEqual(decideConsent({ configured: true, choice: denied, region, adClick }), { load: false, ask: false })
      }
    }
  })
})

describe('where the banner may appear by itself', () => {
  it('on the public pages and the checkout', () => {
    for (const path of ['/pricing', '/login', '/register', '/blog', '/blog/some-post', '/tools/capo-calculator', '/cookie-policy', '/checkout/standard']) {
      assert.equal(bannerAllowedOn(path, true, ''), true, path)
    }
  })

  it('on / only for a visitor, since a reader\'s / is their songbooks', () => {
    assert.equal(bannerAllowedOn('/', true, ''), true)
    assert.equal(bannerAllowedOn('/', false, ''), false)
  })

  it('never on a reading, editing or guest screen, nor on a page whose address is a secret', () => {
    for (const path of ['/songs/wonderwall', '/songs/wonderwall/edit', '/songbooks/main', '/follow/abc', '/app-settings', '/qa', '/pay', '/verify', '/reset-password', '/courtesy-unsubscribe']) {
      assert.equal(bannerAllowedOn(path, false, ''), false, path)
      assert.equal(bannerAllowedOn(path, true, ''), false, path)
    }
  })
})

describe('the gclid handed over after a late «yes»', () => {
  const touch = (clickIdKind: string | null, clickId: string | null): Touch => ({
    source: null, medium: null, campaign: null, term: null, content: null,
    clickIdKind, clickId, refererHost: null, landingPath: '/', at: '2026-09-27T00:00:00.000Z',
  })

  it('is the last Google click, then the first', () => {
    assert.equal(gclidOf({ first: touch('gclid', 'A'), last: touch('gclid', 'B') }), 'B')
    assert.equal(gclidOf({ first: touch('gclid', 'A'), last: touch('fbclid', 'F') }), 'A')
    assert.equal(gclidOf({ first: touch('gclid', 'A'), last: null }), 'A')
  })

  it('is nothing without a Google click', () => {
    assert.equal(gclidOf(null), null)
    assert.equal(gclidOf({ first: touch('msclkid', 'M'), last: touch(null, null) }), null)
  })
})

describe('the address Google\'s tag is shown', () => {
  const O = 'https://strumfolio.com'

  it('never carries the verification or reset token, nor the address', () => {
    assert.equal(tagPageLocation(`${O}/verify?email=a%40b.it&token=SECRET`), `${O}/verify`)
    assert.equal(tagPageLocation(`${O}/reset-password?email=a%40b.it&token=SECRET`), `${O}/reset-password`)
    assert.equal(tagPageLocation(`${O}/courtesy-unsubscribe?t=SECRET`), `${O}/courtesy-unsubscribe`)
  })

  it('hides a guest link and every screen inside the app', () => {
    assert.equal(tagPageLocation(`${O}/follow/TOKEN`), `${O}/follow`)
    assert.equal(tagPageLocation(`${O}/accounts/a%40b.it`), `${O}/app`)
    assert.equal(tagPageLocation(`${O}/songs/my-song/edit`), `${O}/app`)
    assert.equal(tagPageLocation(`${O}/songbooks/main`), `${O}/app`)
  })

  it('keeps public paths, the checkout and Google\'s own click ids, nothing else', () => {
    assert.equal(tagPageLocation(`${O}/pricing?gclid=G1&utm_source=x&coupon=C#top`), `${O}/pricing?gclid=G1`)
    assert.equal(tagPageLocation(`${O}/checkout/standard?cycle=year`), `${O}/checkout/standard`)
    assert.equal(tagPageLocation(`${O}/?wbraid=W`), `${O}/?wbraid=W`)
    assert.equal(tagPageLocation(`${O}/blog/a-post`), `${O}/blog/a-post`)
  })

  it('reduces a referrer the same way, or to its origin when it is another site', () => {
    assert.equal(tagReferrer(`${O}/verify?email=a%40b.it&token=SECRET`, O), `${O}/verify`)
    assert.equal(tagReferrer('https://www.google.com/search?q=chords', O), 'https://www.google.com/')
    assert.equal(tagReferrer('', O), '')
    assert.equal(tagReferrer('not a url', O), '')
  })
})

describe('where Google\'s tag may be loaded at all', () => {
  it('on the landing and home page, the checkout and public pages', () => {
    for (const path of ['/', '/checkout/plus', '/pricing', '/register', '/login', '/blog/a-post', '/tools/capo-calculator', '/cookie-policy']) {
      assert.equal(tagAllowedOn(path, ''), true, path)
    }
  })

  it('never where the address carries a secret or a person, nor inside the app', () => {
    for (const path of ['/verify', '/reset-password', '/courtesy-unsubscribe', '/follow/TOKEN', '/qa', '/pay', '/accounts/a@b.it', '/songs/x', '/songbooks/y', '/profile']) {
      assert.equal(tagAllowedOn(path, ''), false, path)
    }
  })

  it('never on an allowed page whose query carries an address or a token', () => {
    /* What the sign-in form redirects an unverified address to — `/login` by its path alone. */
    const unverified = `?${new URLSearchParams({ unverified: '1', email: 'reader@strumfolio.test' })}`
    assert.equal(tagAllowedOn('/login', unverified), false)
    assert.equal(bannerAllowedOn('/login', true, unverified), false)
    assert.equal(tagAllowedOn('/', '?token=SECRET'), false)
    assert.equal(bannerAllowedOn('/', true, '?email=a%40b.it'), false)
  })

  it('still on a query that carries neither', () => {
    assert.equal(tagAllowedOn('/login', '?reset=1'), true)
    assert.equal(tagAllowedOn('/pricing', '?coupon=HAPPYSONG&gclid=G1'), true)
    assert.equal(bannerAllowedOn('/pricing', false, '?coupon=HAPPYSONG'), true)
  })
})
