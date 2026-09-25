import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { couponCookieCode, couponCookieValue, readCouponCookie } from './cookieValue'

describe('the coupon cookie', () => {
  const secret = 'test-secret'

  it('reads back as signed only what this server wrote', () => {
    const value = couponCookieValue('HAPPYSONG', secret)
    assert.deepEqual(readCouponCookie(value, secret), { code: 'HAPPYSONG', signed: true })
  })

  it('reads a bare code, from before signing or typed by hand, as unsigned', () => {
    assert.deepEqual(readCouponCookie('HAPPYSONG', secret), { code: 'HAPPYSONG', signed: false })
  })

  it('refuses a signature for another code, a forged one, or one under another secret', () => {
    const [, signature] = couponCookieValue('HAPPYSONG', secret).split('.')
    assert.equal(readCouponCookie(`SECRETCODE.${signature}`, secret)?.signed, false)
    assert.equal(readCouponCookie('HAPPYSONG.AAAA', secret)?.signed, false)
    assert.equal(readCouponCookie(couponCookieValue('HAPPYSONG', 'other'), secret)?.signed, false)
  })

  it('writes the bare code, never trusted, when no secret is configured', () => {
    assert.equal(couponCookieValue('HAPPYSONG', ''), 'HAPPYSONG')
    assert.equal(readCouponCookie(couponCookieValue('HAPPYSONG', secret), '')?.signed, false)
  })

  it('hands back the code alone to the places that only show it', () => {
    assert.equal(couponCookieCode(couponCookieValue('HAPPYSONG')), 'HAPPYSONG')
    assert.equal(couponCookieCode(''), null)
    assert.equal(couponCookieCode(undefined), null)
  })
})
