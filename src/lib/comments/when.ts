/**
 * «3 days ago», «yesterday», «14 March» — the meta line's date, in the three forms both
 * the rail and the card use.
 *
 * A plain module rather than a helper inside either component: they both need it, and a
 * copy in each is how the rail and the card come to word the same instant differently.
 *
 * `now` is a parameter with a default so the boundaries can be tested without waiting a
 * day for one — F.I.R.S.T.'s repeatability, and the reason this is not `Date.now()` inline.
 */
export function whenOf(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const days = Math.floor((now - then) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`

  // Past a month the interval stops being the useful fact and the date itself starts
  // being one — «43 days ago» is arithmetic nobody asked for.
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
}
