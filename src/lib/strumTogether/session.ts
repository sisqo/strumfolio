'use server'

/**
 * "Strum Together": one broadcast per person, and the token that lets someone with no
 * account watch it.
 *
 * The row this module owns is `sing_along_sessions` — see its own doc comment in
 * `db/schema.ts` for why it is keyed by owner rather than by token, and why only the
 * owner's own actions keep it alive. Everything a guest is allowed to *read* with a
 * token lives in `./guestReads`, deliberately kept apart from what only a signed-in
 * owner may *write* here.
 *
 * Since v3.3 it also owns `sing_along_devices`: how many devices are following, which is
 * what a plan caps. The rules that decide it are pure and live in `./devices`; what is
 * here is the part that touches the world. The whole lifecycle rides on `pollBroadcast`,
 * the request a guest already makes every four seconds — admission, the heartbeat, the
 * refusal and the peak, in one round trip. A separate `joinBroadcast` action was rejected
 * and the reason is worth stating, because it is the first thing a reader asks for: the
 * poll has to be able to answer `full` anyway, for the phone whose slot went stale while
 * its screen was locked and which wakes to a session that has since filled up. Two actions
 * that can refuse a join are two actions that can disagree about whether this device is in
 * — and the branch is free, since the query the throttle needs already answers it.
 */

import { randomBytes } from 'node:crypto'
import { and, count, eq, gte, lt, lte, ne, sql } from 'drizzle-orm'
import { cookies } from 'next/headers'

import { accessTo, asEditor, currentUser } from '@/lib/auth/session'
import { songAccountOf } from '@/lib/data/access'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts, singAlongDevices, singAlongSessions } from '@/lib/db/schema'
import { UNGATED } from '@/lib/plans/entitlements'
import { deviceCapOf } from '@/lib/plans/resolve'
import { PLANS } from '@/lib/plans/types'
import type { LimitReason } from '@/lib/plans/types'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'

import { DEVICE_COOKIE, admits, holdsSlot, needsHeartbeat, staleBefore } from './devices'

/**
 * How long a broadcast survives with nobody at the wheel.
 *
 * Long enough to outlast a set's intermission, short enough that a link shared once
 * and forgotten does not stay a standing, unauthenticated way to read the whole
 * repertoire for weeks.
 */
const IDLE_HOURS = 8

/**
 * The largest live count that is ever written into `accounts.sing_along_peak_devices`.
 *
 * The peak is the one number in this feature that cannot be recovered afterwards, and with
 * `SONGBOOK_PLANS` unset — the shipping default — nothing else bounds it: `admits` lets
 * everybody in by design, so anyone holding a follow link can seat a device per request and
 * watch the count climb. The refusal is deliberately *not* the place to stop that (see
 * `admits`: with the switch off the cap must refuse nobody, and a row ceiling there would
 * turn away the 101st guest of an installation that enforces nothing). So the *measurement*
 * is what carries the ceiling instead, and only the measurement: a count this high is no
 * longer a marketing signal, it is an anomaly, so recording it would corrupt the one column
 * the decision calls unrecoverable while discarding it loses nothing anybody would act on.
 *
 * `UNGATED.limits.devices` rather than a literal, because the honest phrasing of this number
 * is «more devices than the most generous plan permits» — the same value `deviceCapOf`
 * returns when nothing is enforced, so the peak stays exact across every real plan and every
 * unenforced install of a believable size. The price, stated because a reader could not guess
 * it: an unenforced installation with a genuine audience of 150 records 100 and then stops
 * climbing. That is the trade, and it is the right way round — an exact number up to the
 * ceiling beats a number one anonymous caller can set.
 */
const PEAK_CEILING = UNGATED.limits.devices

/**
 * How many joins one address may make before its further joins stop being counted at all,
 * and over what window.
 *
 * The number is chosen from the venue, not from the attacker. A hundred phones at a rehearsal
 * reach this server through one wifi's single public address, all inside the first minute —
 * the exact session the peak column exists to measure — so a limit that bit there would
 * silently under-count the one case the measurement is for. Three times premium's cap leaves
 * that room and a set's worth of rejoins from locked screens on top of it. An honest guest
 * joins once per broadcast and never comes close.
 *
 * Ten minutes rather than one: `checkRateLimit` is a fixed window, so a short one lets a
 * caller take the whole allowance again the instant it rolls over, and the thing being bounded
 * here is sustained growth rather than a burst.
 */
const JOIN_LIMIT = 3 * PLANS.premium.devices
const JOIN_WINDOW_MS = 10 * 60 * 1000

export interface BroadcastState {
  token: string
  songSlug: string | null
  semitones: number
}

function freshToken(): string {
  return randomBytes(24).toString('base64url')
}

function isFresh(lastActiveAt: Date): boolean {
  return Date.now() - lastActiveAt.getTime() <= IDLE_HOURS * 60 * 60 * 1000
}

/**
 * The one row that answers to this email, unless its owner has gone idle long enough
 * for it to count as over — checked here, at the moment it is read, rather than by a
 * cleanup job: nothing else in this app runs on a schedule, and a row a few hours past
 * its time costs nothing sitting there unread.
 */
async function activeRowByOwner(email: string) {
  if (!hasDatabase) return null

  const rows = await db()
    .select()
    .from(singAlongSessions)
    .where(eq(singAlongSessions.ownerEmail, email))
    .limit(1)

  if (rows.length === 0 || !isFresh(rows[0].lastActiveAt)) return null
  return rows[0]
}

/** Same question, asked with the guest's token instead of the owner's address. */
async function activeRowByToken(token: string) {
  if (!hasDatabase) return null

  const rows = await db()
    .select()
    .from(singAlongSessions)
    .where(eq(singAlongSessions.token, token))
    .limit(1)

  if (rows.length === 0 || !isFresh(rows[0].lastActiveAt)) return null
  return rows[0]
}

/** Whether a guest's token still resolves to a live broadcast. Used by `./guestReads`. */
export async function isTokenActive(token: string): Promise<boolean> {
  return (await activeRowByToken(token)) !== null
}

/**
 * Which account's repertoire a guest's token grants a read of, or null if the token does
 * not resolve to a live broadcast. Every guest read in `./guestReads` is scoped to this
 * and nothing wider — a token proves the broadcaster started a broadcast, not that a
 * stranger may browse every account in the installation.
 */
export async function broadcastAccountForToken(token: string): Promise<string | null> {
  const row = await activeRowByToken(token)
  return row?.broadcastAccountEmail ?? null
}

/** The signed-in reader's own broadcast, so the menu can redraw the QR/link it already made. */
export async function getMyBroadcast(): Promise<BroadcastState | null> {
  const user = await currentUser()
  if (user === null) return null

  const row = await activeRowByOwner(user.email)
  if (row === null) return null

  return { token: row.token, songSlug: row.currentSongSlug, semitones: row.currentSemitones }
}

/**
 * Starts a broadcast of the reader's **current account**, or restarts this reader's own:
 * a fresh token, nothing showing yet.
 *
 * Requires admin on that account — the one role there is to hold (v3.1) — because
 * reading a repertoire together is not editing it: a guest may *follow* one with no
 * role at all (see `guestReads.ts`), but exposing one to strangers with a link is
 * closer to publishing than to reading, and only that account's own admin, or a global
 * owner who has switched into it, may do that.
 *
 * Restarting rather than refusing when one already exists: the previous link stops
 * working the moment a new one is made, so there is never more than one live link per
 * person, and never a question of which of several is the real one.
 *
 * Requires a plan that includes leading, too — `free` does not. That refusal answers with
 * a **reason** rather than the bare `{ ok: false }` this used to return, which is why the
 * three guards below are now three branches: told "couldn't start, try again", somebody on
 * free would press it forever, since trying again is the one thing that cannot help. The
 * freeze deliberately does not reach here: leading a Strum Together changes no song, so an
 * account over its caps can still start one (see `entitlementsFor`).
 *
 * No device cap is checked here, deliberately: how many may *follow* is a question asked at
 * the door, on each guest's own poll, and `mayLead` already refuses at the only point that
 * concerns the leader. What is new here is the delete below — a new link releases the old
 * link's followers, which the cascade does for free.
 */
export async function startBroadcast(): Promise<
  | { ok: true; token: string }
  | { ok: false; reason: 'no-session' | 'not-allowed' | 'no-database' | LimitReason | 'failed' }
> {
  const editor = await asEditor()
  if (!editor.ok) return { ok: false, reason: editor.reason }
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const refused = editor.entitlements.refused.lead
  if (refused !== null) return { ok: false, reason: refused }

  const token = freshToken()

  try {
    /*
     * A restart is a DELETE and then an INSERT of the session row — never an UPDATE of the
     * token — and both in one transaction.
     *
     * Deleting the row is also what releases the old link's followers, in that one statement
     * and with no statement of its own: `sing_along_devices` references the token `ON DELETE
     * cascade`. It finds the previous row whether or not it was still fresh, which is also
     * what finally clears the device rows of a broadcast that was abandoned rather than
     * stopped — nothing else ever deletes those, and this is what bounds them to one abandoned
     * broadcast per account instead of one per broadcast ever started.
     *
     * The rejected alternative is the shape this had until the token stopped being rewritten:
     * delete the *device* rows, then rotate the token in place with an upsert. It reads as the
     * careful version and it is the broken one. `ON UPDATE no action` means a token that still
     * has referencing rows cannot be updated at all — the UPDATE raises 23503 — and the window
     * is open to any guest: a join landing between the device delete and the rotation passes
     * its own referential check against the still-committed old token, so the *leader's*
     * transaction is the one that aborts. The whole restart then fails, and NavMenu says
     * «Couldn't start. Try again.» for a schema constraint, at the one moment restarting is the
     * documented remedy for the leader's own second phone having eaten a slot — that is, while
     * guests are arriving. Nothing on the session row survives a restart anyway
     * (`currentSongSlug` and `currentSemitones` were reset by that upsert, and `createdAt` is
     * read nowhere), so preserving the row bought nothing and cost that.
     *
     * DELETE-then-INSERT closes the window with fewer statements rather than with a lock taken
     * on purpose: the DELETE holds the session row, so a concurrent join either committed
     * before it — and is cascaded away, which is the intended outcome — or blocks on it, then
     * finds its parent gone and fails into the `gone` path `seatDevice` already answers with
     * `expired`. No token is ever updated, so `ON UPDATE no action` cannot fire from here at
     * all; it now guards against a future edit rather than against this one.
     *
     * The price, named because it is a real regression over the upsert: two tabs pressing Start
     * in the same instant. The loser's DELETE cannot see the winner's uncommitted row, so its
     * INSERT collides on `owner_email` and this returns `failed` — «Couldn't start. Try again.»,
     * which is true advice here, because the next press's DELETE does find the row. The upsert
     * absorbed that case by rotating a token, which is to say by reinstating the 23503 above.
     *
     * In a transaction so a failed insert cannot leave the leader with no broadcast and the
     * previous link's audience already released — the idiom `provision.ts`,
     * `sections/actions.ts` and `import/actions.ts` already use.
     */
    await db().transaction(async (tx) => {
      await tx.delete(singAlongSessions).where(eq(singAlongSessions.ownerEmail, editor.email))

      await tx
        .insert(singAlongSessions)
        .values({ ownerEmail: editor.email, token, broadcastAccountEmail: editor.accountOwnerEmail })
    })

    return { ok: true, token }
  } catch (error) {
    console.error('startBroadcast failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Ends the reader's broadcast: one delete, and the link stops resolving to anything.
 *
 * Nothing here mentions devices, and nothing should be added: `sing_along_devices`
 * references the token `ON DELETE cascade`, so every follower's row goes with this row, in
 * this statement, inside whatever transaction it is already part of. A second delete would
 * be dead code whose only effect is to hide the cascade from the next reader. The peak is
 * already durable — it is written per join, on `accounts` — so there is nothing to flush
 * here either.
 */
export async function stopBroadcast(): Promise<{ ok: boolean }> {
  const user = await currentUser()
  if (user === null || !hasDatabase) return { ok: false }

  try {
    await db().delete(singAlongSessions).where(eq(singAlongSessions.ownerEmail, user.email))
    return { ok: true }
  } catch (error) {
    console.error('stopBroadcast failed', error)
    return { ok: false }
  }
}

/**
 * Called when the reader presses play: this song, at this key, is what the broadcast
 * shows now. Silently does nothing if this reader has no *active* broadcast — pressing
 * play on an ordinary read must never start one by accident, and must never revive one
 * that has already gone idle past `IDLE_HOURS` either. Without that second check, an
 * unrelated play press on any song, days later, would quietly resurrect a broadcast — and
 * the link that was shared and long forgotten — under the exact same old token.
 *
 * Also silently does nothing if `songSlug` is not on the shelf the broadcast is actually
 * showing: a global owner switched into account B while broadcasting account A could
 * otherwise read a private song from B and have it pushed straight to A's guests — the
 * only reader for whom this can even arise, now that nobody else ever has more than
 * their own account open (v3.1). The broadcast shows only what it was started on, never
 * whatever the reader's browser tab happens to have open.
 */
export async function broadcastPlay(songSlug: string, semitones: number): Promise<void> {
  const user = await currentUser()
  if (user === null || !hasDatabase) return

  try {
    const active = await activeRowByOwner(user.email)
    if (active === null) return
    if ((await songAccountOf(songSlug)) !== active.broadcastAccountEmail) return
    if ((await accessTo(active.broadcastAccountEmail)) === null) return

    await db()
      .update(singAlongSessions)
      .set({ currentSongSlug: songSlug, currentSemitones: semitones, lastActiveAt: sql`now()` })
      .where(eq(singAlongSessions.ownerEmail, user.email))
  } catch (error) {
    console.error('broadcastPlay failed', error)
  }
}

/**
 * Called when the reader changes key on the song already showing.
 *
 * Checked against what the broadcast is currently showing, not assumed: retuning some
 * other song — one open locally but never played to the broadcast — must not silently
 * make the broadcast claim to be showing it. Guarded by the same freshness check as
 * `broadcastPlay`, for the same reason: an idle broadcast must stay over, not be nudged
 * back to life by a change of key on whatever the reader happens to be reading.
 *
 * Neither this nor `broadcastPlay` knows anything about devices, and the temptation to
 * "keep the count fresh here" is the obvious wrong move: both refresh the **session's**
 * `lastActiveAt`, which is leader liveness, and the leader's own device is never a row in
 * `sing_along_devices` at all — so there is nothing here to heartbeat. Reading the devices
 * would put a paid query on the play button and on every change of key, fifteen times a
 * minute's worth of nothing.
 */
export async function broadcastTranspose(songSlug: string, semitones: number): Promise<void> {
  const user = await currentUser()
  if (user === null || !hasDatabase) return

  try {
    const active = await activeRowByOwner(user.email)
    if (active === null) return
    if ((await songAccountOf(songSlug)) !== active.broadcastAccountEmail) return

    await db()
      .update(singAlongSessions)
      .set({ currentSemitones: semitones, lastActiveAt: sql`now()` })
      .where(
        and(
          eq(singAlongSessions.ownerEmail, user.email),
          eq(singAlongSessions.currentSongSlug, songSlug),
        ),
      )
  } catch (error) {
    console.error('broadcastTranspose failed', error)
  }
}

/**
 * The broadcast row and — in the same statement — this one device's row on it, or null if
 * the token resolves to nothing.
 *
 * One round trip, because this is what every guest pays fifteen times a minute forever. It
 * replaces `activeRowByToken` on the poll path only; `isFresh(lastActiveAt)` still decides
 * expiry, in JavaScript, on the row this returns. A `.limit(1)` is correct here precisely
 * because the join is narrowed to **this** device — the row asked for is one row. (A join
 * that fetched the whole audience would be a different query, and `.limit(1)` on that one
 * would silently truncate every broadcast to a single follower.)
 *
 * With no device cookie there is no row to look for, and `false` in the join condition keeps
 * that case to the same single statement rather than a second query shape to keep in step.
 */
async function sessionWithDevice(token: string, deviceId: string | null) {
  const rows = await db()
    .select({
      songSlug: singAlongSessions.currentSongSlug,
      semitones: singAlongSessions.currentSemitones,
      lastActiveAt: singAlongSessions.lastActiveAt,
      broadcastAccountEmail: singAlongSessions.broadcastAccountEmail,
      deviceLastSeenAt: singAlongDevices.lastSeenAt,
    })
    .from(singAlongSessions)
    .leftJoin(
      singAlongDevices,
      and(
        eq(singAlongDevices.token, singAlongSessions.token),
        deviceId === null ? sql`false` : eq(singAlongDevices.deviceId, deviceId),
      ),
    )
    .where(eq(singAlongSessions.token, token))
    .limit(1)

  return rows[0] ?? null
}

/**
 * Postgres' `foreign_key_violation`. Read off the driver's `code` rather than the message,
 * which is localised and reworded between server versions.
 */
function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23503'
}

/**
 * Takes a device's place on a broadcast, refuses it because the plan has no room, or finds the
 * broadcast gone from under it.
 *
 * Five statements in this order, behind one rate limit, and the order is load-bearing:
 * **sweep, count, cap, seat, peak**. Count before sweeping and a device that closed its tab
 * three minutes ago still blocks the slot. Seat before checking and the cap is decided
 * against a table that already contains the device it is deciding about. Peak before seating
 * and the number recorded is one short.
 *
 * A CAP HERE IS A DETERRENT, NOT A BOUNDARY — the same admission `checkRateLimit` makes
 * about itself, and it needs saying at the one place the refusal happens. Four holes, none
 * of them closable at a price worth paying:
 *
 * The identity is a cookie handed to an anonymous caller of a public, unauthenticated server
 * action. A private window is a new device and clearing one cookie is a new identity, so this
 * deters casual link-forwarding and stops nobody who is trying.
 *
 * The count is read and then the row is written, so two devices arriving in the same instant
 * can both read "room left" and both be seated — one device over the cap, `checkRateLimit`'s
 * own documented race in another costume. Acceptable for a deterrent; unacceptable for a
 * boundary.
 *
 * A browser that sends no cookie at all is never counted (see `pollBroadcast`), and the cap
 * governs *following*, never *reading*: the token stays a valid read credential, and
 * `guestReads.ts` knows nothing about slots. Nothing but the guest screen's own ordering
 * keeps a refused device from browsing the whole repertoire.
 *
 * And the leader's own second phone, opened on their own follow link, **is** a device and
 * does take a slot — visible on `standard`, where the cap is 1, so a leader who scans their
 * own QR to check it can lock out the friend the link was made for. There is deliberately no
 * exemption: the follow page is session-free by design, so the server has nothing to tell
 * that phone apart with, and inventing an exemption would mean either trusting a cookie or
 * teaching that page about sessions. A leader who has done it gets their slot back by
 * restarting the broadcast, which releases every slot.
 *
 * What that honesty must not become is an invitation, and there is one thing it was quietly
 * short of: a bypassable cap costs the installation one extra guest, while an *unbounded* join
 * path costs it a table that grows for as long as somebody keeps looping and a peak column —
 * the unrecoverable one — reading whatever they liked. Those are the two things step 0 and
 * `PEAK_CEILING` bound, and neither of them is the cap. The cap is still a deterrent.
 */
async function seatDevice(
  token: string,
  deviceId: string,
  broadcastAccountEmail: string,
  now: Date,
): Promise<'seated' | 'uncounted' | 'full' | 'closed' | 'gone'> {
  const cutoff = staleBefore(now)

  /*
   * 0. The rate limit, and it is the only thing that bounds how often one anonymous caller may
   * make the five statements below run. Before the sweep deliberately: everything past this
   * point writes, and the sweep is a DELETE issued before this function has decided anything,
   * which is precisely what a caller hammering the action would be paying for with somebody
   * else's compute.
   *
   * Refusing the join is what it must NOT do, which is why the answer is `uncounted` rather
   * than `full`: that is branch (a)'s behaviour — the guest keeps following, invisible to the
   * cap and to the peak — and it is chosen because the address being counted is *shared*. A
   * venue's wifi is one IP for the whole room, so a limit that refused would turn away the
   * friend the link was made for while the attack it is aimed at simply moves to mobile data.
   * Uncounted costs the leader nothing they can see and the measurement one device it never
   * knew about; refusing would cost somebody their place at a performance.
   *
   * `ip === null` means no proxy in front (local development), and it is allowed through for
   * the reason `register/actions.ts` allows it: a limit keyed on an address nobody has is a
   * limit on everybody at once.
   *
   * One thing this trades away, said out loud so that nobody has to discover it: because the
   * answer is `uncounted` rather than a refusal, a caller who deliberately burns their
   * address's allowance is then *let in uncounted* until the window rolls over, so the cap
   * stops applying to that address. That is a worse bypass than clearing a cookie in effort
   * only, not in effect, and the cap was already a deterrent. What this bounds is the thing
   * that was not bounded at all: how many rows and how much compute one address can make this
   * function spend.
   */
  const ip = await requestIp()
  if (ip !== null && !(await checkRateLimit(`follow:ip:${ip}`, JOIN_LIMIT, JOIN_WINDOW_MS))) {
    return 'uncounted'
  }

  /*
   * 1. Sweep — bounded to this one broadcast's rows, reachable through the primary key's
   * leading column, and run at joins only. This is the one moment accuracy matters, because
   * we are about to count; a sweep inside a plain poll would be fifteen DELETEs a minute per
   * device for an answer nobody asked for. It also releases the joiner's own lapsed row.
   */
  await db()
    .delete(singAlongDevices)
    .where(and(eq(singAlongDevices.token, token), lt(singAlongDevices.lastSeenAt, cutoff)))

  /*
   * 2. Count — keeping the freshness predicate even though the sweep has just run. The
   * predicate IS the rule (a slot is held for `DEVICE_STALE_SECONDS` after the last
   * heartbeat); the delete is only hygiene, and the two can race with a concurrent join. A
   * count of `token = $1` alone would be correct exactly as long as nobody edits the sweep.
   *
   * And it excludes THIS device, which is why the predicate is not simply the sweep's inverse.
   * `admits` counts the **other** devices, and the joiner's own row is normally absent or was
   * just swept — but not always: two polls for the same device id can overlap, and then this
   * device would be refused because of itself. Concretely, on `standard` (cap 1): a friend taps
   * the link twice, both tabs poll with the same cookie (see `pollBroadcast`'s last paragraph),
   * both find no row, and the second one would count the first one's brand-new row as a rival
   * and answer `full` to a device that is following in the other tab. The exclusion goes here
   * and nowhere else — the sweep must keep deleting the joiner's own lapsed row, which is what
   * makes a rejoin work, and the peak below must keep counting this device, which is what
   * makes it a peak. The genuine race between two *different* devices is untouched and stays
   * disclosed above.
   */
  const counted = await db()
    .select({ held: count() })
    .from(singAlongDevices)
    .where(
      and(
        eq(singAlongDevices.token, token),
        ne(singAlongDevices.deviceId, deviceId),
        gte(singAlongDevices.lastSeenAt, cutoff),
      ),
    )
  const held = counted[0]?.held ?? 0

  /*
   * 3. Cap — one read, and `enforced` is not inferred from `max`; see `admits`. Resolved for
   * the account **being broadcast**, never for the broadcast's owner: a global owner
   * broadcasting somebody else's account spends that account's plan, exactly as
   * `startBroadcast` spends `editor.accountOwnerEmail`'s. `broadcastAccountForToken` is where
   * that mapping lives, but it is not called here — the poll's select already holds the
   * address, and calling it would be a second round trip for a value in hand.
   */
  const { max, enforced } = await deviceCapOf(broadcastAccountEmail)
  if (!admits(held, max, enforced)) {
    /*
     * Two refusals, not one, and the difference is whether waiting can ever help. A cap of 0
     * admits nobody at all, so «leave this open, a place will free up» — which is what the
     * guest's screen says on `full` — is a promise this broadcast cannot keep: no device
     * closing its link changes 0, and the leader cannot restart to release the slots either,
     * because `startBroadcast` now refuses the same plan outright.
     *
     * `free` is the only plan with 0 today, and it is reachable here for exactly the reason
     * `pollBroadcast` says nobody is evicted: a broadcast that was already running when the
     * subscription lapsed keeps playing, and its cap is now free's. So this is the lapsed-plan
     * case wearing the only shape the door can see it in. Keyed on the number rather than on
     * the plan name, because this function knows a cap and deliberately not a plan.
     */
    return max === 0 ? 'closed' : 'full'
  }

  /*
   * 4. Seat — an upsert, because the row may still be there unswept: a stale row rejoining is
   * the ordinary case, not an exotic one. `joinedAt` is rewritten too, which is why the column
   * is not called `createdAt`: it means «since when on this broadcast», and a slot that lapsed
   * and came back has genuinely joined again.
   */
  try {
    await db()
      .insert(singAlongDevices)
      .values({ token, deviceId })
      .onConflictDoUpdate({
        target: [singAlongDevices.token, singAlongDevices.deviceId],
        set: { lastSeenAt: sql`now()`, joinedAt: sql`now()` },
      })
  } catch (error) {
    /*
     * The one error path the token foreign key creates, and it is an ordinary event rather
     * than a fault: between the poll's select and this insert the leader pressed Stop, or
     * restarted — either way the session row this one references is deleted. With a hundred
     * phones each polling every four seconds, "somebody was mid-join when the leader stopped"
     * is a thing that simply happens.
     *
     * Answered as `gone` — which the caller reports as `expired`, the truth — instead of being
     * left to throw. A thrown server action would reach the guest as no answer at all, they
     * would wait another tick to be told the same thing, and production would carry an opaque
     * digest for a race the design knowingly allows. Narrow on purpose: anything that is not
     * `foreign_key_violation` is rethrown, because a poll that cannot write must not quietly
     * come to mean "the broadcast ended".
     */
    if (!isForeignKeyViolation(error)) throw error
    return 'gone'
  }

  /*
   * 5. Peak — one conditional UPDATE, where 0 rows changed is the ordinary case, and it runs
   * with the plans unenforced too: counting is measurement, not a limit, and unenforced the
   * peak is free to climb above the cap the plan would have imposed, which is the marketing
   * signal the column exists for.
   *
   * The count is a subselect evaluated **after** the seat, not the `held + 1` this function
   * already has in hand. That difference is the rehearsal case: a hundred phones opening the
   * link within a few seconds all read `held = 0` before any insert lands, so all hundred
   * would write 1 and the peak would record 1 for a hundred-device session — in exactly the
   * scenario the measurement exists to capture. Counting inside the statement makes each
   * writer observe a growing number instead. The hundred UPDATEs do serialise on this one
   * `accounts` row's lock, each a no-op after the first few; that is the sharp edge of a join
   * stampede, and it self-limits because only joins do this.
   *
   * Written on `broadcast_account_email`'s row — the customer whose shelf is being sung from,
   * the same address whose plan was just consulted.
   *
   * Its own try/catch, and this is the one failure in this function that must not cost anybody
   * their place: a measurement nobody can write down is not a reason to refuse a guest at the
   * door of a performance. Migration 0025 not having been run is the concrete case, and this
   * log line is the only place it would ever be mentioned.
   *
   * The second predicate is the ceiling, and it *discards* rather than clamps: writing
   * `least(live, PEAK_CEILING)` would record a poisoned session as exactly 100 and leave it
   * indistinguishable from a real premium rehearsal, which is the one thing this column must
   * never be. See `PEAK_CEILING` for why the ceiling is here and not in the refusal. It costs
   * a third evaluation of the same subselect inside the one statement (the `set`, the `<`, and
   * now this) — a count over one broadcast's handful of rows, on a join only, against the
   * alternative of a number an anonymous caller gets to choose.
   */
  try {
    const live = sql<number>`(select count(*)::int from ${singAlongDevices}
      where ${singAlongDevices.token} = ${token} and ${singAlongDevices.lastSeenAt} >= ${cutoff})`

    await db()
      .update(accounts)
      .set({ singAlongPeakDevices: live })
      .where(
        and(
          eq(accounts.ownerEmail, broadcastAccountEmail),
          lt(accounts.singAlongPeakDevices, live),
          lte(live, PEAK_CEILING),
        ),
      )
  } catch (error) {
    console.error('recording the Strum Together device peak failed', error)
  }

  return 'seated'
}

/**
 * What a guest's link is currently showing — and, in the same request, this device taking or
 * keeping its place among the followers.
 *
 * Three failures now. `expired` is the old one: whether the token never existed or has simply
 * gone idle too long is not a distinction a guest can act on differently, so there is one
 * reason rather than two. `full` means the account's plan has no room for another device right
 * now. `closed` means it has no room for anybody, ever, until something about the account
 * changes — a broadcast still playing on a plan that has since lapsed to one that cannot carry
 * followers at all. The two are split because the guest's screen has to promise different
 * things: waiting works for one and cannot work for the other, and a screen that says «leave
 * this open, a place will free up» to somebody for whom no place exists is a lie the code knows
 * it is telling. Neither carries a **number** — the guest has no account, no plan and nothing
 * to act on, and naming the leader's cap to a stranger tells a friend what their friend pays
 * for.
 *
 * Both are terminal for the four-second loop, and `FollowSession` must stop it on either: that
 * is what bounds a refused device to the cost of a manual retry instead of a join attempt every
 * four seconds forever, and it also stops a refused device racing legitimate guests for the
 * first freed slot.
 *
 * NOBODY ALREADY FOLLOWING IS EVER EVICTED, and there is no statement anywhere in this file
 * that could. A broadcast that was already running when the plan lapsed keeps every device on
 * it and keeps playing — you do not cut a live performance — and only new joins are refused.
 * The two ways to see `full` are never having held a slot, and having let one lapse.
 *
 * The five branches, in the order the code takes them:
 *
 * (a) NO COOKIE AT ALL — cookies blocked, or a request that never passed through middleware.
 * Counts nothing, writes nothing, refuses nothing. An unidentifiable device is invisible to
 * the cap and to the peak. Both alternatives are worse: turning that guest away cuts a live
 * performance over a browser setting, and minting an id here would create a row per poll for
 * a browser that will never remember it — growing the table and eating a `standard` leader's
 * single slot within seconds.
 *
 * (b) A ROW ON THIS TOKEN THAT STILL HOLDS ITS SLOT — the steady state, and the only one that
 * happens at scale: one read, and a write at most once every ~32 s. No count, no cap check.
 *
 * (c) A ROW ON A DIFFERENT TOKEN — nothing to do for this broadcast. It is invisible to this
 * query, the join proceeds as if it were not there, the same device id is reused, and the row
 * on the other token lapses on its own. No rebinding, no eviction, no cross-broadcast write.
 *
 * (d) NO ROW ON THIS TOKEN, or one that has lapsed — the join: sweep, count, cap, seat, peak.
 * Two reads and three writes, once per device per broadcast. A join arriving from an address
 * that has already made hundreds of them is answered like (a) instead — see step 0 of
 * `seatDevice`: it follows, uncounted, rather than being turned away over a shared IP.
 *
 * (e) NO ROOM — `full` or `closed`, with no row written and nobody already following so much
 * as looked at.
 *
 * The device id is **read** here and minted nowhere in this file: it is issued in
 * `middleware.ts`, on the `/follow/[token]` navigation, before this action ever runs — and on
 * the navigation *only*, which is what makes branch (a) reachable at all. A Server Action
 * POSTs to the page's own URL, so this very call goes through that same middleware, and a
 * middleware `Set-Cookie` is fed back into the same request's `cookies()` by Next; minting on
 * the poll would therefore hand a cookie-less browser a fresh identity fifteen times a minute
 * instead of leaving it uncounted.
 * Splitting the minting from the row is what makes "a reload or a second tab is one device"
 * literally true even for two tabs opened in the same instant with no cookie yet — both
 * middleware responses mint, the last `Set-Cookie` wins, and because minting creates no row
 * the losing id never exists in the database. Both tabs then poll with the same jar value and
 * share one row.
 */
export async function pollBroadcast(
  token: string,
): Promise<
  | { ok: true; songSlug: string | null; semitones: number }
  | { ok: false; reason: 'expired' | 'full' | 'closed' }
> {
  /*
   * No database means the file repository, which has no broadcasts to follow — the same
   * answer `activeRowByToken`'s null gave on this path before, and the reason there is no
   * second no-database branch anywhere in this feature.
   */
  if (!hasDatabase) return { ok: false, reason: 'expired' }

  const deviceId = (await cookies()).get(DEVICE_COOKIE)?.value ?? null

  const row = await sessionWithDevice(token, deviceId)
  if (row === null || !isFresh(row.lastActiveAt)) return { ok: false, reason: 'expired' }

  const showing = { ok: true as const, songSlug: row.songSlug, semitones: row.semitones }
  if (deviceId === null) return showing

  const now = new Date()

  if (row.deviceLastSeenAt !== null && holdsSlot(row.deviceLastSeenAt, now)) {
    /*
     * The heartbeat: the only write a settled follower can cause, at most one per ~32 s, and
     * it touches this device's row and NOTHING else. It must never also set
     * `singAlongSessions.lastActiveAt` — that column moves only when the owner acts, which is
     * what makes "a guest cannot keep a broadcast alive by watching" true, and a heartbeat
     * that nudged it would make every polled broadcast immortal and defeat `IDLE_HOURS`
     * entirely. `broadcastPlay` two functions up sets exactly that column; do not copy it.
     */
    if (needsHeartbeat(row.deviceLastSeenAt, now)) {
      await db()
        .update(singAlongDevices)
        .set({ lastSeenAt: sql`now()` })
        .where(and(eq(singAlongDevices.token, token), eq(singAlongDevices.deviceId, deviceId)))
    }

    return showing
  }

  /*
   * Five answers, because the broadcast can end between the select above and the insert below
   * — see `seatDevice`. `gone` is reported as `expired`, which is what it is; the guest's
   * screen already knows what that means. `uncounted` falls through to the same answer as
   * `seated` on purpose and is deliberately not a state the guest is told about: it means this
   * join was not written down, which is a fact about the measurement and not about them.
   */
  const seat = await seatDevice(token, deviceId, row.broadcastAccountEmail, now)
  if (seat === 'full') return { ok: false, reason: 'full' }
  if (seat === 'closed') return { ok: false, reason: 'closed' }
  if (seat === 'gone') return { ok: false, reason: 'expired' }

  return showing
}

/**
 * The leader's «2 of 3»: how many devices are following their own broadcast right now, and
 * how many their plan allows.
 *
 * `following` is the count and `devices` is the **cap** — the field names are the parameter
 * order of the sentence that renders them (`audienceSentence`, `plans/types.ts`), which is
 * the only place either number is worded. Null when this reader has no live broadcast and null
 * when the read failed, because the client renders nothing either way: a missing count costs a
 * leader nothing, while a wrong one sends them debugging a broadcast that is working.
 *
 * `enforced` deliberately does not cross the wire. With the switch off the cap is
 * `UNGATED.limits.devices`, which is 100, which is also `PLANS.premium.devices` — so the
 * client's single test for «this cap is not worth naming» resolves premium, lifetime and
 * enforcement-off at once. That is not a coincidence to be tidied away: it is why the panel
 * can say «2 devices following» rather than the lie «2 of 100» without ever being told whether
 * anything is being enforced.
 *
 * Counted with the same predicate `seatDevice` refuses on, and that is the point of the
 * feature: if the leader's line and the door disagreed about what a held slot is, a leader
 * reading «3 of 3» would be contradicted by a friend who has just successfully joined — and
 * the whole reason this number is on screen is that a refused friend and the leader should not
 * both be looking at what appears to be a fault.
 *
 * A narrow action of its own rather than a wider `getMyBroadcast`, which runs once on mount of
 * every page in the app: folding a count and a plan read into it would put queries behind
 * every navigation to render a string visible only inside one panel, and `NavMenu` keeps
 * `broadcast === null` and `askFailed` deliberately apart — a refresh loop calling
 * `getMyBroadcast` would keep clearing that distinction.
 */
export async function broadcastAudience(): Promise<{ following: number; devices: number } | null> {
  const user = await currentUser()
  if (user === null || !hasDatabase) return null

  try {
    const row = await activeRowByOwner(user.email)
    if (row === null) return null

    const cutoff = staleBefore(new Date())
    /* In parallel: the cap does not depend on the count, and this runs every ten seconds while
     * a panel is open — one round trip's latency is worth not paying twice. */
    const [counted, cap] = await Promise.all([
      db()
        .select({ held: count() })
        .from(singAlongDevices)
        .where(and(eq(singAlongDevices.token, row.token), gte(singAlongDevices.lastSeenAt, cutoff))),
      deviceCapOf(row.broadcastAccountEmail),
    ])

    return { following: counted[0]?.held ?? 0, devices: cap.max }
  } catch (error) {
    console.error('broadcastAudience failed', error)
    return null
  }
}
