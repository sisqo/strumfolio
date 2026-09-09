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
 * `/password` stays, and is the same shape with a far smaller blast radius: it needs a
 * session exactly as `/` does, so a signed-out reader who types it is shown the form
 * instead of `/login` — but that form is identical for everybody and names no account, so
 * there is nothing of the previous reader left in it. It belongs here only while that
 * stays true.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

async function main() {
  const routes = [
    '/password',
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
