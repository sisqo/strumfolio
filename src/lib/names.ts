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
  const trimmed = value.trim()
  return trimmed === '' || trimmed.length > NAME_MAX ? null : trimmed
}
