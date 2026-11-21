/**
 * The calls a reading screen makes on its own answer at `POST /api/reader/*`, not as Server
 * Actions (2026-10-17).
 *
 * **Why not actions.** Next.js runs a page's Server Actions in the router's own queue, and a
 * navigation that overtakes a pending one discards it and schedules a refresh of the page it
 * lands on (`app-router-instance.js`, `needsRefresh`). On a stage's wifi that is «connected but
 * dead» the action hangs, Next/Previous lands at once from the prefetch, and the refresh then
 * fails — which Next answers with a full browser navigation: the song reloads under the reader's
 * hands, auto-scroll stopped. Every song opened fired four of these, so the next press of Next
 * almost always overtook one. A plain `fetch` is outside that queue.
 *
 * So what a song page sends **without the reader asking for a new page** goes through these
 * routes: the reads on opening a song, the preferences queue, the notes, the leader's Strum
 * Together pings, the identity read and the offline walk's list. What the reader presses
 * deliberately (start a session, rename, delete) stays an action.
 *
 * Each route calls the action function itself, unchanged, so every check it runs on a
 * browser's arguments still runs — a Server Action was never more trusted than this. What an
 * action got from Next for free and a route does not is the same-origin check, done here.
 */

import { hasSessionCookie } from '@/auth'
import { hasDatabase } from '@/lib/db/client'

/**
 * A million characters, below the 3 MB `serverActions.bodySizeLimit` the same calls had as
 * actions (`next.config.ts`) and far above anything they send: a note, a set of preferences.
 */
const MAX_BODY = 1_000_000

/**
 * A Server Action refuses a cross-site caller by comparing `Origin` with the host; a route
 * handler does nothing of the kind. `Sec-Fetch-Site` first, which every current browser sends;
 * `Origin` against the host for one that does not.
 */
function fromThisSite(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site')
  if (site !== null) return site === 'same-origin'
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (origin === null || host === null) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 300
}

/**
 * One route's `POST`: `parse` turns the JSON body into the call's arguments, or `null` for a
 * body that is not this call's (400); `run` makes the call. The answer is `{ value }`, `null`
 * standing for a `void` call.
 *
 * `needsSession` names the calls whose answer to nobody would be **wrong rather than empty**,
 * and those answer **401 when the request carries no session cookie at all** — which is what
 * they got as actions, posted to the page's own URL and redirected to `/login` by the
 * middleware once a cookie had expired, so the call rejected and the caller kept what it had.
 * Here the middleware lets `/api/reader/` through, and the action answers for nobody:
 * `no-destination` for a write, which the preferences queue and the notes outbox drop as
 * finished (a capo or a note written in the last minutes of a ninety-day cookie was lost), and
 * `missing` for a song's content, which `SongProvider` reads as deleted (a song opened from the
 * offline copy showed as gone). The cookie and not `currentUser()`: a revoked session, or an
 * account that is gone, still reaches the action and is answered as it was, rather than retried
 * for ever. The other reads keep their own «nobody» answer, which is how a signed-out page
 * learns it.
 */
export function readerRoute<Input>(
  parse: (body: unknown) => Input | null,
  run: (input: Input) => Promise<unknown>,
  needsSession: (input: Input) => boolean = () => false,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (!fromThisSite(request)) return new Response(null, { status: 403 })

    const text = await request.text()
    if (text.length > MAX_BODY) return new Response(null, { status: 413 })

    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return new Response(null, { status: 400 })
    }
    const input = parse(body)
    if (input === null) return new Response(null, { status: 400 })
    if (hasDatabase && needsSession(input) && !(await hasSessionCookie())) return new Response(null, { status: 401 })

    try {
      const value = (await run(input)) ?? null
      return Response.json({ value }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      console.error(`${new URL(request.url).pathname} failed`, error)
      return new Response(null, { status: 500 })
    }
  }
}
