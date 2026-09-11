import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { isSessionFreePath } from '@/lib/publicRoutes'

/**
 * Every route that needs a session must send a reader whose account has been deleted back to
 * `/login`, and this test is what stops a new one forgetting.
 *
 * **The failure it guards against is silent, which is why it is worth a filesystem test.** The
 * session cookie is a ninety-day JWT that nothing revalidates, so an account removed from
 * `/accounts` left that browser signed in with every write still permitted — see
 * `accounts/read.ts`' `accountExists`. `currentUser` answering `null` closes the writes
 * everywhere at once, because `permit` funnels them; getting the reader *off the screen* is
 * `requireAccount`, and that has to be called. A page added without it looks perfectly correct
 * to whoever writes it: they have an account, so they never see the case.
 *
 * A layout counts for its own segment and everything under it, which is how
 * `songbooks/[slug]/page.tsx` is covered by the layout beside it — and the only place the call
 * may go when a segment has a `loading.tsx`, since a `redirect()` from inside a page body is
 * swallowed once Suspense is streaming a shell around it.
 */
const APP = join(process.cwd(), 'src/app')

/** The URL a page file serves: route groups vanish, dynamic segments become a placeholder. */
function routeOf(relative: string): string {
  const segments = relative
    .split('/')
    .slice(0, -1)
    .filter((part) => !(part.startsWith('(') && part.endsWith(')')))
    .map((part) => (part.startsWith('[') ? 'x' : part))
  return `/${segments.join('/')}`
}

function pagesUnder(dir: string, base = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...pagesUnder(full, base === '' ? entry : `${base}/${entry}`))
    else if (entry === 'page.tsx') found.push(base === '' ? entry : `${base}/${entry}`)
  }
  return found
}

/**
 * Routes deliberately outside the rule.
 *
 * The operator screens are exempt because a global owner is exempt from the check itself: their
 * admission comes from `ALLOWED_EMAILS` and not from a row, so there is no deleted account to
 * catch — and they may be standing inside a customer's account they have just removed from that
 * very screen. `/password` is the standalone tool, and `/design-system` a reference page.
 *
 * **`/` is the interesting one, and it is an exemption rather than an omission.** It is the only
 * dual-audience route: `(home)/layout.tsx` already resolves a deleted account to the public home,
 * because `currentUser()` answers null and `audience()` reads that as a visitor. Redirecting it
 * would make the brand mark — which `TopBar`, `PublicHeader` and `SiteHeader` all point at `/` —
 * bounce to the sign-in form from every page in the app, which reads as being thrown out of the
 * product's own front door. Nothing is weakened: `permit()` still refuses every write, and the
 * page rendered is the same marketing page a stranger gets.
 */
const EXEMPT = new Set(['/', '/accounts', '/accounts/x', '/coupons', '/leads', '/pages', '/emails', '/design-system', '/password'])

describe('every route that needs a session throws out a deleted account', () => {
  it('calls requireAccount, in the page or in a layout above it', () => {
    const missing: string[] = []

    for (const relative of pagesUnder(APP)) {
      const route = routeOf(relative)
      if (isSessionFreePath(route) || EXEMPT.has(route)) continue

      /* The page itself, or any layout from its own directory upwards — a layout guards
         everything beneath it. */
      const parts = relative.split('/').slice(0, -1)
      const candidates = [join(APP, relative)]
      for (let i = parts.length; i >= 0; i--) candidates.push(join(APP, ...parts.slice(0, i), 'layout.tsx'))

      const guarded = candidates.some((file) => {
        try {
          return readFileSync(file, 'utf8').includes('requireAccount')
        } catch {
          return false
        }
      })
      if (!guarded) missing.push(route)
    }

    assert.deepEqual(missing, [], `these routes need a session but never call requireAccount: ${missing.join(', ')}`)
  })
})
