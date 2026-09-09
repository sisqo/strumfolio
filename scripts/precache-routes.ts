/**
 * Writes the list of page URLs the service worker installs with, eagerly, on every
 * device.
 *
 * Songs and songbooks are not among them any more (v3.0): which ones exist is now
 * private per account, and this list is baked once into the build, identical for
 * every device that ever installs it — there is no reader to scope it to yet. Their
 * offline coverage moves to `lib/offline/sync.ts`, a warm-up that runs per signed-in
 * reader instead, over exactly the accounts they can see.
 *
 * **`/` left on 2026-09-09 for the same reason, and what precaching it cost is worth
 * knowing.** This list is fetched at install time with *this device's own* cookies, and
 * Serwist answers a precached URL out of the cache without ever asking the network — its
 * `PrecacheRoute` is registered inside the `Serwist` constructor, before anything in
 * `runtimeCaching`, so no rule in `sw.ts` can get in front of it. A device that installed
 * the worker while signed in therefore kept that reader's own home screen under `/` for
 * good: signing out really did end the session — `/help` and every other page redirected
 * to `/login`, as they should — and `/` alone went on showing the app as though nothing
 * had happened, which is indistinguishable from a logout that failed. `/` has its own
 * `NetworkFirst` rule in `sw.ts` now, which keeps the installed app openable with no
 * network without letting the page outlive the session it was rendered for.
 *
 * **`/password` left the same day, and the reason is the sharper half of the story.** It was
 * kept back for a moment as "the same shape with a smaller blast radius" — a form identical
 * for everybody, naming no account — which was true and beside the point. Every URL here is
 * fetched during the worker's `install`, with `credentials: 'same-origin'`, and
 * `/password` needs a session: fetched without one it follows the middleware's redirect to
 * `/login`, `sw.ts`'s `rejectUnauthenticated` refuses a redirected response, `cachePut`
 * returns false, and `PrecacheStrategy` throws `bad-precaching-response`. Serwist awaits
 * every entry together, so that one rejection fails **the whole install**: the new worker is
 * discarded and the old one goes on serving.
 *
 * Which made the bug above self-sealing, and is why removing `/` from this list was not by
 * itself enough to fix anybody's browser. A signed-out reader is exactly who has the stale
 * home under `/`, and a signed-out reader was exactly who could not install the worker that
 * would have replaced it. `sw.ts`'s header used to answer this with "registration only
 * happens on pages that are already behind the gate, so a valid cookie exists at install
 * time" — true of the *first* registration, and not of an **update**, which the browser
 * starts by itself on any navigation in scope, signed in or not.
 *
 * **So the rule for this list is not "account-agnostic", it is "fetchable by a stranger".**
 * Anything that answers a redirect, a 401 or a 404 to a browser with no session bricks the
 * update path for every signed-out device, silently and for good — there is no failed
 * request to see, only a worker that never changes. Check a candidate with
 * `curl -sSI -o /dev/null -w '%{http_code} %{num_redirects}' https://strumfolio.com<path>`
 * before adding it. What is left is `/manifest.webmanifest`, which is in the middleware's own
 * `isPublicAsset`, alongside the build assets and `public/brand/` that `next.config.ts` adds.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

async function main() {
  const routes = [
    // A metadata route, not a file in public/, so it has to be listed here.
    '/manifest.webmanifest',
  ]

  const output = path.join(process.cwd(), 'generated', 'precache-routes.json')
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(routes, null, 2)}\n`, 'utf8')

  console.log(`Precache routes: ${routes.length}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
