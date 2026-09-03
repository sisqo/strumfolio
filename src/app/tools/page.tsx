import { redirect } from 'next/navigation'

/**
 * `/tools` — a redirect, until there is more than one tool to list.
 *
 * It exists because the URL is implied by the one published under it, and somebody trimming
 * `/tools/chordpro-converter` back a segment must not land on a sign-in form. Without this
 * the guard in `middleware.ts` sends them to `/login`, which is the exact failure
 * `publicRoutes.ts` was written to prevent.
 *
 * A redirect rather than a hub page on purpose: an index listing one entry is a thin page,
 * and thin pages are worse than none. When the second tool lands this becomes a real index —
 * and the entry in `publicRoutes.ts` becomes `indexable: true` with it.
 */
export default function ToolsIndexPage() {
  redirect('/tools/chordpro-converter')
}
