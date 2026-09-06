import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { installOffer, installPlatform } from './offer'
import type { InstallPlatform } from './offer'

/** A real UA per case, kept whole: the tokens they are told apart by are easy to trim away. */
const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  /* An in-app web view: WebKit on iOS with no `Version/` token of its own. */
  iphoneInApp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS]',
  /* An iPad on iPadOS 17 with «Request Desktop Website» on, which is the default. */
  ipadAsMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  linuxChrome:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
}

test('iOS is told from Android and from a desktop', () => {
  assert.equal(installPlatform({ userAgent: UA.iphoneSafari, platform: 'iPhone', maxTouchPoints: 5 }), 'ios-safari')
  assert.equal(installPlatform({ userAgent: UA.androidChrome, platform: 'Linux armv8l', maxTouchPoints: 5 }), 'android')
  assert.equal(installPlatform({ userAgent: UA.linuxChrome, platform: 'Linux x86_64', maxTouchPoints: 0 }), 'other')
})

test('a browser on iOS that is not Safari is told apart from Safari', () => {
  assert.equal(installPlatform({ userAgent: UA.iphoneChrome, platform: 'iPhone', maxTouchPoints: 5 }), 'ios-other')
  assert.equal(installPlatform({ userAgent: UA.iphoneFirefox, platform: 'iPhone', maxTouchPoints: 5 }), 'ios-other')
})

test('an in-app web view gets the same answer as another browser, not Safari’s', () => {
  assert.equal(installPlatform({ userAgent: UA.iphoneInApp, platform: 'iPhone', maxTouchPoints: 5 }), 'ios-other')
})

test('an iPad reporting itself as a Mac is still iOS, and a real Mac is not', () => {
  assert.equal(installPlatform({ userAgent: UA.ipadAsMac, platform: 'MacIntel', maxTouchPoints: 5 }), 'ios-safari')
  assert.equal(installPlatform({ userAgent: UA.macSafari, platform: 'MacIntel', maxTouchPoints: 0 }), 'other')
})

test('a native prompt wins over every platform’s instructions', () => {
  for (const platform of ['android', 'other', 'ios-safari'] satisfies InstallPlatform[]) {
    assert.equal(installOffer({ platform, hasPrompt: true, installed: false }), 'prompt')
  }
})

test('the app already on the home screen offers nothing, prompt or no prompt', () => {
  assert.equal(installOffer({ platform: 'android', hasPrompt: true, installed: true }), null)
  assert.equal(installOffer({ platform: 'ios-safari', hasPrompt: false, installed: true }), null)
})

test('without a prompt, a phone gets instructions and a desktop gets no row', () => {
  assert.equal(installOffer({ platform: 'ios-safari', hasPrompt: false, installed: false }), 'ios-safari')
  assert.equal(installOffer({ platform: 'ios-other', hasPrompt: false, installed: false }), 'ios-other')
  assert.equal(installOffer({ platform: 'android', hasPrompt: false, installed: false }), 'android-manual')
  assert.equal(installOffer({ platform: 'other', hasPrompt: false, installed: false }), null)
})

/* The dismissal path, which is the one that would otherwise leave a row that does nothing:
   the event is spent, so the same Android that offered a one-tap install now says where its
   browser keeps the button instead. */
test('a dismissed prompt falls back to instructions rather than a dead row', () => {
  assert.equal(installOffer({ platform: 'android', hasPrompt: true, installed: false }), 'prompt')
  assert.equal(installOffer({ platform: 'android', hasPrompt: false, installed: false }), 'android-manual')
})
