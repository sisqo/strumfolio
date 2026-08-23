/**
 * Reading the installation's settings, in the one way that is allowed to fail: quietly, to the
 * code defaults.
 *
 * A plain module rather than `'use server'` — nothing here is a form action, and both callers
 * are server-side already (`notifyTelegram`, and `/app-settings`' own page). Same shape as
 * `plans/resolve.ts`: the impure half, with the pure vocabulary it depends on kept next door
 * in `types.ts` where a test can reach it.
 *
 * **This must never throw**, and that is not a style preference. `notifyTelegram` is awaited
 * inside `auth.ts`'s `signIn` callback, after the account row has already been written; a
 * rejection there fails the sign-in itself. The concrete case is not hypothetical — it is the
 * ordinary state of affairs between deploying this code and applying migration `0028`, when
 * `app_settings` does not exist and Postgres answers the query with an error. So: `hasDatabase`
 * is checked before `db()` is ever called, the query is wrapped, and every exit returns real
 * settings. Exactly the discipline `entitlementsOf` documents when it reads `plansEnforced()`
 * before touching the database at all.
 */

import { db, hasDatabase } from '@/lib/db/client'
import { appSettings } from '@/lib/db/schema'

import { NOTIFY_DEFAULTS, NOTIFY_EVENTS, notifyKey, readBooleanSetting } from './types'
import type { NotifySettings } from './types'

export interface LoadedNotifySettings {
  settings: NotifySettings
  /**
   * Whether the answer came from the table or from the defaults alone. False means there is
   * nothing to read yet — no database, or `app_settings` not created — which is a fact
   * `/app-settings` has to be able to *say*, or its toggles would look live while every write
   * they made went nowhere. `notifyTelegram` ignores it: for deciding whether to send, "the
   * table says on" and "nothing says otherwise" are the same answer.
   */
  available: boolean
}

/**
 * The switches as they stand right now, read fresh on every call.
 *
 * No caching, deliberately, and it costs nothing worth naming: the readers are a sign-in, a
 * purchase and one admin screen — never a page render on the reading path, and never the gate
 * path `resolve.ts` guards so carefully. Caching would buy nothing here and would introduce
 * the one bug this design has no answer for, a switch turned off that keeps notifying.
 */
export async function loadNotifySettings(): Promise<LoadedNotifySettings> {
  if (!hasDatabase) return { settings: NOTIFY_DEFAULTS, available: false }

  try {
    const rows = await db().select({ key: appSettings.key, value: appSettings.value }).from(appSettings)

    const stored = new Map(rows.map((row) => [row.key, row.value]))
    const settings = { ...NOTIFY_DEFAULTS }
    for (const event of NOTIFY_EVENTS) {
      // `readBooleanSetting`, never `=== 'on'`: a cell this cannot recognise has to leave the
      // switch where the default put it. See that function's own comment on why the other
      // direction is the failure nobody notices.
      settings[event] = readBooleanSetting(stored.get(notifyKey(event)), NOTIFY_DEFAULTS[event])
    }

    return { settings, available: true }
  } catch (error) {
    /*
     * Logged rather than swallowed silently, but never rethrown — see this file's header. The
     * expected instance of this is migration `0028` not being applied yet, which reads exactly
     * like today: every switch on.
     */
    console.error('loadNotifySettings failed', error)
    return { settings: NOTIFY_DEFAULTS, available: false }
  }
}
