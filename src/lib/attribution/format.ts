/**
 * How a channel is worded, in the one place both screens read it from.
 *
 * A plain module beside `touch.ts` for the `testCard.ts` reason (`CLAUDE.md`): these are
 * synchronous decisions worth a test, and the two surfaces that print them — the Identity tab
 * card and `/leads` — must agree. Two spellings of "where did this person come from" is exactly
 * the drift `durationCopy`/`termCopy` and `planText.ts` exist to prevent elsewhere in this repo.
 */

/** The three labels a channel is named by. Every one can be absent. */
export interface Channel {
  source: string | null
  medium: string | null
  campaign: string | null
}

/**
 * What to call an arrival that carried no labels at all.
 *
 * "Direct" and not "Unknown", because it is a real answer and a common one: somebody typed the
 * address, or opened a bookmark, or came from an app that strips referrers. It is distinct from
 * an account with **no row at all**, which `/leads` counts separately as "no attribution" — the
 * difference between "we know they came straight here" and "we never knew".
 */
export const DIRECT_LABEL = 'Direct'

/**
 * One line naming a channel: `instagram / social`, with the campaign appended when there is one.
 *
 * The medium is dropped rather than filled in when it is missing — a `?utm_source=newsletter`
 * with nothing else is honestly "newsletter", and inventing `/ referral` for it would put a word
 * in the URL author's mouth.
 */
export function channelLabel(channel: Channel): string {
  const head = [channel.source, channel.medium].filter((part): part is string => part !== null && part !== '').join(' / ')
  if (head === '') return channel.campaign === null || channel.campaign === '' ? DIRECT_LABEL : channel.campaign
  if (channel.campaign === null || channel.campaign === '') return head
  return `${head} · ${channel.campaign}`
}

/**
 * The conversion rate of a channel as a percentage, or `null` when there is nothing to divide by.
 *
 * `null` and not `0`, so a screen can print an em dash instead of a rate that reads as a failure:
 * a channel with no leads at all has not converted badly, it has not been measured. The
 * denominator is leads *this repo knows about* — registrations begun plus accounts created — and
 * never visits, which live in Vercel Web Analytics and are not available here.
 */
export function conversionPercent(accounts: number, pending: number): number | null {
  const total = accounts + pending
  if (total === 0) return null
  return Math.round((accounts / total) * 100)
}
