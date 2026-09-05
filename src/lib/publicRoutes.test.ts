import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { PUBLIC_ROUTES, isBlogPath, isFollowPath, isSessionFreePath } from './publicRoutes'

describe('isSessionFreePath', () => {
  it('admits every path the list itself declares public', () => {
    for (const route of PUBLIC_ROUTES) {
      assert.equal(isSessionFreePath(route.path), true, `${route.path} should be session-free`)
    }
  })

  it('admits the blog and a Strum Together guest, which are not in the list', () => {
    assert.equal(isSessionFreePath('/blog'), true)
    assert.equal(isSessionFreePath('/blog/chordpro-explained'), true)
    assert.equal(isSessionFreePath('/follow/abc123'), true)
  })

  /**
   * The half that matters to `FeedbackProvider`: these are the pages somebody is *using* the
   * app on, and the only ones the feedback launcher may appear on. A path wrongly admitted
   * here takes the launcher away from a screen that should have it.
   */
  it('refuses every screen that needs a session', () => {
    for (const path of [
      '/',
      '/songs/certe-notti',
      '/songs/certe-notti/edit',
      '/songbooks/repertorio',
      '/profile',
      '/billing',
      '/help',
      '/export',
      '/booklet',
      '/accounts',
      '/checkout/plus',
      '/thanks',
    ]) {
      assert.equal(isSessionFreePath(path), false, `${path} should need a session`)
    }
  })

  /**
   * A prefix test that admitted `/blogging` would hand a signed-in reader's page to anybody,
   * and one that admitted a bare `/follow` would admit a route that does not exist.
   */
  it('does not admit a path that merely starts like a public one', () => {
    assert.equal(isBlogPath('/blogging'), false)
    assert.equal(isSessionFreePath('/blogging'), false)
    assert.equal(isFollowPath('/follow'), false)
    assert.equal(isFollowPath('/follow/abc/extra'), false)
    assert.equal(isSessionFreePath('/toolsmith'), false)
  })
})
