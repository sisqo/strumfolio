'use server'

/**
 * Changing an installation-wide setting — the only write `/app-settings` makes.
 *
 * Re-checks `isOwner` itself rather than trusting the page that rendered the form, the same
 * discipline every write in `plans/checkout.ts` applies to its own flag: a server action is
 * reachable by anything holding a session cookie, so the page's `notFound()` is a courtesy to
 * the reader and never the fence.
 *
 * `event` arrives as a bare `string` because it comes from a form value, which the type system
 * cannot vouch for; `isNotifyEvent` is the actual check, and an unrecognised one is refused
 * rather than normalised — the same choice `mockPurchase` makes with `isCheckoutPlan` over
 * `readPlan`, so a typo cannot quietly write a row nobody asked for.
 *
 * There is no history kept: the row carries who wrote it last and when, and nothing more. A
 * ledger of every flip would be `paddle_events`' shape, and that table exists because money
 * needs one — a handful of notification switches do not, and inventing the table now would be building
 * for a question nobody has asked. The `console.warn` is the deployment log's copy, in the same
 * voice `checkout.ts` logs its own mutations.
 */

import { eq } from 'drizzle-orm'

import { auth } from '@/auth'
import { isOwner } from '@/lib/allowlist'
import { db, hasDatabase } from '@/lib/db/client'
import { appSettings } from '@/lib/db/schema'

import { isNotifyEvent, notifyKey, writeBooleanSetting } from './types'

export type SettingFailure = 'no-session' | 'not-owner' | 'no-database' | 'invalid-event' | 'failed'

export async function setNotifySetting(
  event: string,
  value: boolean,
): Promise<{ ok: true } | { ok: false; reason: SettingFailure }> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return { ok: false, reason: 'no-session' }
  if (!isOwner(email, process.env.ALLOWED_EMAILS)) return { ok: false, reason: 'not-owner' }
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  if (!isNotifyEvent(event)) return { ok: false, reason: 'invalid-event' }

  const key = notifyKey(event)

  try {
    /*
     * Upsert, not update: there is no row for a setting nobody has touched, and that absence
     * is the normal state rather than a gap to have backfilled — see `appSettings`' own comment
     * in `schema.ts`. `updatedAt` is set explicitly on the conflict branch because
     * `defaultNow()` only fires on insert.
     */
    await db()
      .insert(appSettings)
      .values({ key, value: writeBooleanSetting(value), updatedBy: email })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: writeBooleanSetting(value), updatedBy: email, updatedAt: new Date() },
      })

    console.warn(`app setting: ${key} => ${writeBooleanSetting(value)} (by ${email})`)
    return { ok: true }
  } catch (error) {
    /*
     * The expected instance is migration `0028` not applied yet: the table is not there, so the
     * write cannot land. Reported as a failure rather than swallowed — unlike the *read*, which
     * has to fall back silently (see `read.ts`), a save that did not save must say so, or the
     * screen would claim a change it did not make.
     */
    console.error('setNotifySetting failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/** Who last changed this setting, and when — for the one line `/app-settings` shows under the switches. */
export async function loadSettingAuthor(event: string): Promise<{ by: string | null; at: string } | null> {
  if (!hasDatabase || !isNotifyEvent(event)) return null

  try {
    const rows = await db()
      .select({ updatedBy: appSettings.updatedBy, updatedAt: appSettings.updatedAt })
      .from(appSettings)
      .where(eq(appSettings.key, notifyKey(event)))
      .limit(1)

    const row = rows[0]
    if (row === undefined) return null

    return { by: row.updatedBy, at: row.updatedAt.toISOString() }
  } catch {
    // Never the reason a screen fails to render: no author line is a smaller loss than no page.
    return null
  }
}
