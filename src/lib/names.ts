/**
 * A name somebody typed — a songbook, a section, their own first or last name — as the server
 * will store it, or `null` when there is nothing storable.
 *
 * A Server Action receives whatever was posted, and a form's own limits are a hint to a browser:
 * a name of a megabyte used to be stored as sent and then drawn on `/accounts`, in emails and in
 * the Telegram registration notice. A non-string answers `null` too, rather than throwing out of
 * `.trim()` as a 500.
 */
export const NAME_MAX = 100

export function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  /* On one line: a songbook or section name is written back out as `{songbook: …}` and
     `{division: …}` (`import/export.ts`), and a line break inside one became a directive of its
     own — `Book}` + `{start_of_abc` folded the whole exported song into an ABC block. */
  const trimmed = value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').trim()
  return trimmed === '' || trimmed.length > NAME_MAX ? null : trimmed
}
