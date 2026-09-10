/**
 * The vocabulary of an outreach action — something the platform decides to do *to* a reader,
 * as opposed to everything else in this repo, which is something a reader does.
 *
 * A module with **no `@/lib/db` import anywhere in it**, and no `'use server'` either — the
 * same two reasons `settings/types.ts` and `coupons/types.ts` state for themselves. A
 * `'use server'` module may only export async functions, so the registry and the parsers below
 * could not sit beside the words they belong to; and this file is value-imported by the panel
 * on `/accounts/[email]`, which is a client component, where importing a database-touching
 * module ships the whole of it to the browser.
 *
 * **The registry is code, not rows.** A new action is a deploy, exactly as a new plan name is
 * (`plans/types.ts`) and a new notification switch is (`settings/types.ts`): there is no table
 * of action definitions, because every definition needs a handler compiled beside it, and a row
 * describing an action nobody wrote code for is a promise the database cannot keep. What *is*
 * stored is one row per occurrence actually claimed — see `outreachActions` in `schema.ts`.
 */

import type { Plan } from '@/lib/plans/types'

/**
 * Every action the platform knows how to aim at a reader. Both of these are declared and
 * neither is built: the engine around them is (claiming, recording, suppressing, retrying,
 * reading back), which is what makes adding the first real handler a small change instead of a
 * feature. `HANDLERS` in `handlers.ts` is where "declared" becomes "built", and it is a
 * `Record` over this list precisely so a new member here cannot compile until somebody has
 * decided whether it has a handler yet.
 */
export const OUTREACH_KINDS = ['birthday_greeting', 'upgrade_voucher', 'gift_notice'] as const

export type OutreachKind = (typeof OUTREACH_KINDS)[number]

/**
 * What sets an action off, and therefore which screen owns it.
 *
 * `panel` is everything this engine was built for: the Outreach tab lists it, computes its
 * eligibility, offers a Run button, and is where a schedule would eventually take over
 * (`runDueOutreach`).
 *
 * `elsewhere` is an action another screen decides the moment for — today only `gift_notice`,
 * which a gift being given is the trigger for. Such a kind is **still recorded here**, because
 * this table is the answer to «what has this platform done to this reader», and the unique
 * index is still what keeps it from happening twice. What it is not is *drivable* from the
 * panel: `outreachViewFor` draws no line for it, so nothing offers to run it out of context,
 * nothing computes an eligibility that would not be consulted, and its rows appear where they
 * belong — as history. It is a field rather than a convention because the alternative is a
 * screen quietly listing an action whose button would refuse.
 */
export const OUTREACH_TRIGGERS = ['panel', 'elsewhere'] as const

export type OutreachTrigger = (typeof OUTREACH_TRIGGERS)[number]

/**
 * How often one action comes round, and therefore what an occurrence of it is called.
 *
 * This is the field the whole table hangs off: uniqueness is on `(kind, occurrence, account)`,
 * so a cadence of `once` makes an action a one-shot for life and `yearly` makes it repeat
 * without ever doubling up inside one year. There is deliberately no `monthly` or `weekly`
 * until something needs one — an unused cadence is an untested one, and
 * `occurrenceKeyFor` is where a third member would have to be given a key format that is
 * unambiguous for the rest of time.
 */
export const OUTREACH_CADENCES = ['once', 'yearly'] as const

export type OutreachCadence = (typeof OUTREACH_CADENCES)[number]

/**
 * How an action reaches the reader.
 *
 * `in_app` is declared and nothing renders it yet: an in-app action's handler is the thing
 * that would have to create the surface it appears on. It is here rather than added later
 * because the consent gate is **channel-conditional** — `email` requires a newsletter
 * subscription and `in_app` cannot, since a message shown inside an account somebody is
 * already signed into is not marketing mail — and a gate with one branch is a gate whose rule
 * nobody can see.
 */
export const OUTREACH_CHANNELS = ['email', 'in_app'] as const

export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number]

export const CHANNEL_LABEL: Record<OutreachChannel, string> = {
  email: 'Email',
  in_app: 'In the app',
}

/**
 * Who an action is for, as a plan question — the only audience rule this engine owns.
 *
 * Anything finer (this month's sign-ups, accounts over a song count, readers who lapsed twice)
 * belongs to the action's own handler and not here: those are the selections a campaign is
 * built around, they change with the campaign, and encoding them as enum members would grow
 * this list once per campaign and never shrink it.
 */
export const OUTREACH_AUDIENCES = ['everyone', 'without_paid_plan', 'with_paid_plan'] as const

export type OutreachAudience = (typeof OUTREACH_AUDIENCES)[number]

export const AUDIENCE_LABEL: Record<OutreachAudience, string> = {
  everyone: 'Every account',
  without_paid_plan: 'Accounts on no paid plan',
  with_paid_plan: 'Accounts on a paid plan',
}

/** Whether this plan counts as paid for `OUTREACH_AUDIENCES`. `lifetime` is paid; `free` is not. */
export function isPaidPlan(plan: Plan): boolean {
  return plan !== 'free'
}

/**
 * What has become of one claimed occurrence.
 *
 * **Only `done` is terminal**, and that asymmetry is the design rather than an accident of
 * implementation. A `done` row is never touched again by any code path, which is what "never
 * twice" means in practice; `failed`, `suppressed`, and a `pending` row abandoned by a process
 * that died are all retried *in place*, on the same row, by an operator. The alternative —
 * treating every claimed row as final — turns one failed afternoon into an occurrence silently
 * cancelled forever, with a row on file saying it was handled.
 */
export const OUTREACH_STATUSES = ['pending', 'done', 'failed', 'suppressed'] as const

export type OutreachStatus = (typeof OUTREACH_STATUSES)[number]

export const STATUS_LABEL: Record<OutreachStatus, string> = {
  pending: 'Started',
  done: 'Done',
  failed: 'Failed',
  suppressed: 'Skipped',
}

/**
 * Reads a stored `status` cell back.
 *
 * Falls to `'pending'` for anything unrecognised, which is the **cautious** direction here and
 * the opposite of what `readBooleanSetting` argues for its own case. A cell this cannot read
 * must never resolve to `'done'` — that would be this module inventing the claim that
 * something was delivered — and it must not resolve to `'failed'` either, which invites a
 * retry of something that may well have gone out. `'pending'` says exactly what is true: a row
 * exists, and what became of it is not known from here.
 */
export function readOutreachStatus(value: unknown): OutreachStatus {
  return typeof value === 'string' && (OUTREACH_STATUSES as readonly string[]).includes(value)
    ? (value as OutreachStatus)
    : 'pending'
}

/** A status an operator may act on again. `done` is the one that is finished with. */
export function isRetryable(status: OutreachStatus): boolean {
  return status !== 'done'
}

/**
 * Narrows a kind arriving from a form or a URL.
 *
 * `null` rather than a fallback, unlike `readOutreachStatus` above and for the reason that
 * inverts it: this reads an *argument*, not a stored cell, so there is no history to
 * misrepresent — an unrecognised kind is a caller that has no business here, and the action it
 * asked for refuses with `unknown-kind` instead of quietly running a different one.
 */
export function readOutreachKind(value: unknown): OutreachKind | null {
  return typeof value === 'string' && (OUTREACH_KINDS as readonly string[]).includes(value)
    ? (value as OutreachKind)
    : null
}

/** One action, as declared. Everything here is printed somewhere on `/accounts/[email]`. */
export interface OutreachDefinition {
  kind: OutreachKind
  label: string
  /** What it does, in the words the account screen prints under its title. */
  note: string
  cadence: OutreachCadence
  channel: OutreachChannel
  audience: OutreachAudience
  /** Which screen decides the moment. See `OUTREACH_TRIGGERS`. */
  trigger: OutreachTrigger
  /**
   * What is still missing before a handler for this can be written — printed on the screen, so
   * «Not built yet» is never left looking like an oversight — or null once nothing is.
   *
   * It is data rather than a comment because the operator reading that row is the person who
   * would have to supply the missing thing.
   */
  missing: string | null
}

/**
 * The two actions named when this engine was designed, declared so the shape of a definition
 * is answerable from a real example rather than from prose — plus the one that is actually
 * sent. Neither of the first two has a handler (`handlers.ts`), and the screen says so on the
 * row itself.
 */
export const OUTREACH: Record<OutreachKind, OutreachDefinition> = {
  birthday_greeting: {
    kind: 'birthday_greeting',
    label: 'Birthday greeting',
    note: 'A greeting on the reader’s birthday, once a year.',
    cadence: 'yearly',
    channel: 'email',
    audience: 'everyone',
    trigger: 'panel',
    /*
     * Nothing in this schema records a date of birth — not `accounts`, not `user_prefs` — so
     * this action is not merely unwritten, it has no input. Whoever builds it decides where the
     * date is asked for first (`/profile` is the only self-service surface that could ask), and
     * that decision is a product one, not a detail of the handler.
     */
    missing: 'No date of birth is stored anywhere: this needs a column and a screen that asks for it.',
  },
  upgrade_voucher: {
    kind: 'upgrade_voucher',
    label: 'Upgrade offer with a voucher',
    note: 'One offer to move up a plan, carrying a coupon code, sent at most once per account.',
    cadence: 'once',
    channel: 'email',
    audience: 'without_paid_plan',
    trigger: 'panel',
    /*
     * The coupon half already exists — `coupon_campaigns` mints codes and `coupon_redemptions`
     * holds the ceiling that makes one verifiable — so what is missing is the choice of which
     * campaign an offer points at, and the email itself.
     */
    missing: 'Which campaign the offer carries, and the email that carries it.',
  },
  gift_notice: {
    kind: 'gift_notice',
    label: 'Gift notice',
    note: 'Tells a reader that a plan has been put on their account by hand.',
    /*
     * Read by nothing, for this kind alone. `occurrenceKeyFor` mints a key from a cadence, and
     * this action has none — a gift is not due, somebody decides it — so its occurrences are
     * named by `giftOccurrenceKey` (`accounts/giftNotice.ts`) after the gift itself, and the
     * only reason a cadence is set at all is that every definition carries one. `'once'` is
     * the nearer of the two lies: nothing about this recurs on a clock.
     */
    cadence: 'once',
    channel: 'email',
    /*
     * Declared for the record on the row, and *not* consulted: `eligibilityFor` never runs for
     * an `elsewhere` kind, which is what keeps `consentGate` — written for marketing mail —
     * from refusing a message that is transactional. A gift notice reports something done to
     * the account of the person reading it, the same footing `purchaseEmail` and
     * `planChangeEmail` are sent on, and neither of those asks about the newsletter either.
     */
    audience: 'everyone',
    trigger: 'elsewhere',
    /* Nothing is missing: it is written and it is sent — from the Plan & gift tab, which is
       where the decision to give a plan is taken. */
    missing: null,
  },
}

/** Every definition in declaration order — what the account screen iterates. */
export const OUTREACH_LIST: readonly OutreachDefinition[] = OUTREACH_KINDS.map((kind) => OUTREACH[kind])

/** How long a skip reason may be. Long enough for a sentence, short enough not to be a note field. */
export const MAX_OUTREACH_REASON = 200

/**
 * How long an attempt is assumed to still be running.
 *
 * A `pending` row younger than this is refused rather than taken over, which is the one place
 * the engine could send twice; older than this, it is offered to an operator as a retry —
 * because the alternative is an occurrence stuck forever behind a row whose process died, and
 * because the person pressing the button is the one who can tell whether the first attempt
 * landed. Fifteen minutes is far longer than any delivery here takes (a Resend call, or an
 * in-app write) and far shorter than the gap between two occurrences of anything.
 *
 * It lives in this module, beside the vocabulary, rather than in `run.ts` where it is enforced:
 * `read.ts` needs it too — to tell the screen not to offer a retry it would refuse — and
 * `read.ts` cannot import `run.ts`, which imports it.
 */
export const STALE_ATTEMPT_MS = 15 * 60 * 1000

/**
 * How much of a handler's own `detail` or `reason` is stored.
 *
 * Clamped rather than trusted: both columns are unbounded `text`, and a handler that hands back
 * a whole API response — or a stack trace — would put it on a row an operator reads at a
 * glance. Long enough for a subject line, a coupon code and a sentence of context.
 */
export const MAX_OUTREACH_DETAIL = 500

/**
 * Every way one of this feature's four writes can refuse, in one union.
 *
 * One union rather than four, which is the `CampaignFailure` precedent and not a shortcut:
 * running an action, running everything due, skipping one and retrying one are four entry
 * points into the same claim-and-record path, and each of them can reach all but a couple of
 * these. Splitting them would repeat five members four times to remove two.
 */
export type OutreachFailure =
  /** Not a global owner. Every write here re-checks it; a page's `notFound()` is never the fence. */
  | 'not-allowed'
  | 'no-database'
  /** A kind that is not in `OUTREACH_KINDS` — see `readOutreachKind`. */
  | 'unknown-kind'
  /** No `accounts` row for that address, so there is nothing to aim at and no id to claim with. */
  | 'no-account'
  /** Consent, suspension or audience says no — `eligibility.ts` owns which. */
  | 'not-eligible'
  /** Declared, but `HANDLERS` has nothing for it yet. Refused *before* claiming, so no row is left behind. */
  | 'not-built'
  /** A `done` row already exists for this occurrence. The whole point of the feature, reported rather than hidden. */
  | 'already-done'
  /**
   * A `pending` row is being worked on right now — an attempt started inside
   * `STALE_ATTEMPT_MS` and has not settled. Refused rather than taken over, which is the one
   * way this engine could send twice.
   */
  | 'in-flight'
  /** The claim was made and the handler refused. The row says `failed` and carries its reason. */
  | 'delivery-failed'
  | 'failed'

export type OutreachResult = { ok: true } | { ok: false; reason: OutreachFailure }

export const OUTREACH_MESSAGE: Record<OutreachFailure, string> = {
  'not-allowed': 'Only a global owner may run an action.',
  'no-database': 'No database configured: nothing can be run or recorded.',
  'unknown-kind': 'Unknown action.',
  'no-account': 'No account for this address.',
  'not-eligible': 'This account is not eligible for this action right now.',
  'not-built': 'This action has no handler yet, so there is nothing to run.',
  'already-done': 'Already done for this occurrence — that is what keeps it from happening twice.',
  'in-flight': 'An attempt is already running for this occurrence. Wait for it to settle.',
  'delivery-failed': 'Delivery failed. The attempt is recorded and can be retried.',
  failed: 'Something went wrong. Please try again.',
}
