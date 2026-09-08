import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { PUBLIC_ROUTES, isBlogPath, isFollowPath, isOutsideAppPath, isSessionFreePath } from './publicRoutes'

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
   * The landing page, stated on its own rather than left to the loop above — this is the row
   * whose absence used to bounce every anonymous visitor and every crawler to `/login`, and
   * the assertion it replaces said the opposite (`'/'` was in the list of paths that need a
   * session, two tests down).
   */
  it('admits the landing page, which is also the app home', () => {
    assert.equal(isSessionFreePath('/'), true)
  })

  /**
   * The half that matters to `FeedbackProvider`: these are the pages somebody is *using* the
   * app on, and the only ones the feedback launcher may appear on. A path wrongly admitted
   * here takes the launcher away from a screen that should have it.
   */
  it('refuses every screen that needs a session', () => {
    for (const path of [
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

describe('isOutsideAppPath', () => {
  /**
   * The one case the whole predicate exists for. `/` is session-free *and* the app's own home,
   * so asking `isSessionFreePath` here — which is what `FeedbackProvider` did until the
   * landing page moved — would take the feedback bubble off the home screen of every
   * signed-in reader, and look correct to anybody checking it signed out.
   */
  it('does not call the landing page outside the app, though it is public', () => {
    assert.equal(isSessionFreePath('/'), true)
    assert.equal(isOutsideAppPath('/'), false)
  })

  it('calls every other public page outside the app', () => {
    for (const path of ['/login', '/register', '/pricing', '/changelog', '/tools', '/privacy-policy']) {
      assert.equal(isOutsideAppPath(path), true, `${path} should be outside the app`)
    }
    assert.equal(isOutsideAppPath('/blog/chordpro-explained'), true)
    assert.equal(isOutsideAppPath('/follow/abc123'), true)
  })

  /** A page that needs a session is inside the app by definition, not merely "not public". */
  it('calls a page that needs a session inside the app', () => {
    assert.equal(isOutsideAppPath('/songbooks/repertorio'), false)
    assert.equal(isOutsideAppPath('/help'), false)
  })
})

describe('PUBLIC_ROUTES', () => {
  /**
   * The sitemap reads `indexable`, and these two rows are the ones a future edit is most
   * likely to get backwards: `/` carries the whole argument for the product and must be
   * offered, `/login` is a form whose pitch moved to `/` and must not compete with it.
   */
  it('offers the landing page to a crawler and withholds the sign-in form', () => {
    const indexable = (path: string) => PUBLIC_ROUTES.find((route) => route.path === path)?.indexable

    assert.equal(indexable('/'), true)
    assert.equal(indexable('/login'), false)
    assert.equal(indexable('/register'), true)
  })

  /** Reachable-without-a-session only because they arrive in an email: nothing to index. */
  it('withholds the pages that only work with a token', () => {
    for (const path of ['/verify', '/forgot-password', '/reset-password']) {
      assert.equal(
        PUBLIC_ROUTES.find((route) => route.path === path)?.indexable,
        false,
        `${path} should not be indexable`,
      )
    }
  })
})
