import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { publicBarFrom } from './publicBar'

const PRICING = { href: '/pricing', label: 'Pricing' }

describe('publicBarFrom', () => {
  it('offers a visitor one action, and it is the one that gets them an account', () => {
    const bar = publicBarFrom(false)

    assert.deepEqual(bar.cta, { href: '/login', label: 'Sign in' })
  })

  /*
   * The words are load-bearing twice over: `/pricing` has printed exactly these since it
   * grew the branch this module generalises, and the plural is what the screen behind the
   * link actually shows. A second spelling is the failure this repo keeps warning about.
   */
  it('offers a reader their own songbooks, in the words /pricing already used', () => {
    const bar = publicBarFrom(true)

    assert.deepEqual(bar.cta, { href: '/', label: 'My songbooks' })
  })

  /*
   * The whole reason the destination is not a constant. `/` is the landing page only for
   * somebody with no session; pointing a signed-in reader's mark there would take them into
   * the app from a bar that already has a button for exactly that.
   */
  it('sends the mark to the public page for whoever is reading', () => {
    assert.equal(publicBarFrom(false).brandHref, '/')
    assert.equal(publicBarFrom(true).brandHref, '/home')
  })

  it('passes the quiet pills through untouched, and has none by default', () => {
    assert.deepEqual(publicBarFrom(false).links, [])
    assert.deepEqual(publicBarFrom(true, { links: [PRICING] }).links, [PRICING])
  })

  /*
   * The flag a CSS rule keys on, so it is worth pinning rather than leaving to inspection: the
   * long capsule is the only row that does not fit a phone once the mark is always drawn, and
   * `globals.css` narrows the bar for it alone. Getting this wrong takes «Pricing» off a
   * visitor's 360px phone, which is the measured decision it exists to protect.
   */
  it('marks the wide capsule, and only that one', () => {
    assert.equal(publicBarFrom(true).wideAction, true, 'My songbooks is the long one')
    assert.equal(publicBarFrom(false).wideAction, false, 'Sign in fits everywhere')
    assert.equal(
      publicBarFrom(true, { action: false }).wideAction,
      false,
      'no capsule is not a wide capsule',
    )
  })

  /*
   * `/checkout/<plan>` and `/pay` are the funnel, and `/pricing` has a third reader who was
   * redirected *to* it — for all three the capsule is a way out that must not be offered.
   * The mark is not part of that refusal: it is how somebody leaves a page they opened by
   * mistake, and it still has to lead somewhere true.
   */
  it('drops the capsule where a page offers no way out, and keeps the mark honest', () => {
    for (const signedIn of [false, true]) {
      const bar = publicBarFrom(signedIn, { links: [PRICING], action: false })

      assert.equal(bar.cta, undefined)
      assert.equal(bar.brandHref, signedIn ? '/home' : '/')
      assert.deepEqual(bar.links, [PRICING], 'suppressing the action is not suppressing the row')
    }
  })
})
