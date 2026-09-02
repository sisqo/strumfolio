/**
 * An article's date, written out.
 *
 * Split from the date `Date` would give: a bare `YYYY-MM-DD` is parsed as UTC midnight, so
 * `new Date('2026-09-01').toLocaleDateString(…)` renders August 31st anywhere west of
 * Greenwich — the trap `changelog.ts` already fell into once and documents. Reading the three
 * numbers out of the string cannot do that, because it never builds a `Date` at all.
 *
 * The day is shown, unlike `/changelog`'s month-only rendering, and the two differ on purpose:
 * a release note answers *roughly when*, while an article is a thing written on a day, and a
 * reader deciding whether a guide is still current wants the day it was written.
 */
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** `2026-09-02` → `2 September 2026`. Anything unreadable is handed back untouched. */
export function postDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (match === null) return date

  const month = MONTHS[Number(match[2]) - 1]
  if (month === undefined) return date

  return `${Number(match[3])} ${month} ${match[1]}`
}
