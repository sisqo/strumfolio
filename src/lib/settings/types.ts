/**
 * The installation-wide settings an owner may change from `/app-settings`, as plain data.
 *
 * A module with **no `@/lib/db` import anywhere in it**, deliberately, and no `'use server'`
 * either. Two reasons, and the second is the one that would be missed: a `'use server'` module
 * may only export async functions, so the parser and the defaults below could not live beside
 * the keys they belong to (the same split `plans/testCard.ts` exists for); and this file is
 * value-imported by the toggle component, which is a client component — `PricingPlans.tsx`'s
 * own header explains what importing a database-touching module into one of those costs, which
 * is the whole module shipped to the browser.
 *
 * The stored vocabulary is `'on'`/`'off'`, not `'true'`/`'false'`, to match what this repo
 * already says everywhere else a flag is read (`SONGBOOK_PLANS === 'on'`, `plans/resolve.ts`):
 * one spelling for "switched on" across env vars and rows alike.
 */

/**
 * The six things worth being told about the moment they happen. Every one of them is a
 * notification `notifyTelegram` already sends today — this list adds the ability to stop one,
 * it does not add the notifications themselves.
 */
export const NOTIFY_EVENTS = [
  'registration',
  'purchase',
  'downgrade',
  'cancellation',
  'kept_current',
  'feedback',
] as const

export type NotifyEvent = (typeof NOTIFY_EVENTS)[number]

/** One switch's row key in `app_settings`. Prefixed so a later family of settings cannot collide. */
export function notifyKey(event: NotifyEvent): string {
  return `notify.${event}`
}

export const NOTIFY_LABEL: Record<NotifyEvent, string> = {
  registration: 'New registration',
  purchase: 'Purchase',
  downgrade: 'Scheduled downgrade',
  cancellation: 'Scheduled cancellation',
  kept_current: 'Kept current plan',
  feedback: 'New feedback',
}

export const NOTIFY_NOTE: Record<NotifyEvent, string> = {
  registration: 'Somebody signed up and their account was created.',
  purchase: 'A plan was bought, upgraded, or re-bought.',
  downgrade: 'Somebody chose a cheaper plan, starting at the end of the period they paid for.',
  cancellation: 'Somebody cancelled, taking effect at the end of the period they paid for.',
  kept_current: 'Somebody undid a scheduled downgrade or cancellation, staying on their current plan.',
  feedback: 'Somebody sent feedback from the "Share your feedback" sheet.',
}

export type NotifySettings = Record<NotifyEvent, boolean>

/**
 * Every switch is on until somebody turns it off, and that is not a taste — it is what the app
 * did before these switches existed. It is also what an unreadable `app_settings` has to
 * resolve to (see `loadNotifySettings`): the table not being there yet must look exactly like
 * today rather than like silence.
 */
export const NOTIFY_DEFAULTS: NotifySettings = {
  registration: true,
  purchase: true,
  downgrade: true,
  cancellation: true,
  kept_current: true,
  feedback: true,
}

/**
 * One stored cell, read back as a boolean — with anything unrecognised falling to `fallback`
 * and **never** to `false`.
 *
 * That direction is the whole point of this function existing rather than a `=== 'on'` at the
 * call site. `false` here means notifications quietly stop, which is the one failure nobody
 * notices: no error, no log, just an owner who stops hearing about sign-ups and assumes
 * nobody is signing up. Same reasoning as `readPendingPlan` in `plans/types.ts`, which refuses
 * to let an unrecognised value mean `'free'` for the mirror-image reason.
 */
export function readBooleanSetting(raw: string | null | undefined, fallback: boolean): boolean {
  if (raw === 'on') return true
  if (raw === 'off') return false
  return fallback
}

/** What gets written to the cell. The inverse of `readBooleanSetting`'s two recognised inputs. */
export function writeBooleanSetting(value: boolean): string {
  return value ? 'on' : 'off'
}

/** Whether a string off the wire is one of `NOTIFY_EVENTS` — a form value cannot be trusted to be. */
export function isNotifyEvent(value: string): value is NotifyEvent {
  return (NOTIFY_EVENTS as readonly string[]).includes(value)
}

/**
 * Whether the Lifetime plan is in the catalogue at all.
 *
 * This is what `LIFETIME.closesOn` used to decide, and the reason it moved here is written in
 * `prices.ts` beside the field's own removal: a date compiled into the code takes the offer
 * off the page on the first deploy after that day, not on that day. `lifetimeOpen()` in
 * `app/pricing/page.tsx` had already been converted from a `const` to a function over exactly
 * that bug; a row in this table is the version of the fix that does not need a deploy at all.
 *
 * Not prefixed `notify.` — this is the first setting in here that is not a notification, which
 * is precisely the growth `appSettings`' own comment in `schema.ts` says the key/value shape
 * exists for. The prefix is what keeps the two families from ever colliding.
 */
export const LIFETIME_ON_SALE_KEY = 'lifetime.on_sale'

/**
 * On until somebody turns it off, like every switch above it — and for the stronger version of
 * their reason. The Lifetime is in the catalogue today; an unreadable `app_settings`, or this
 * migration not yet applied, has to look exactly like today rather than like a plan silently
 * withdrawn from sale. `readBooleanSetting`'s own comment is the general form of this: the
 * failure nobody notices is the one where a thing quietly stops.
 */
export const LIFETIME_ON_SALE_DEFAULT = true
