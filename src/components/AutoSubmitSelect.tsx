'use client'

import type { SelectHTMLAttributes } from 'react'

/**
 * A `<select>` that submits the form it sits in the moment its value changes — for a form
 * with no button of its own, where the field *is* the action. `/accounts`'s sort order is the
 * one caller: the search field beside it submits on Enter natively, and a "Search" button for
 * the pair would be a third control the design (`Accounts.dc.html`) does not draw.
 *
 * `'use client'` for the one handler and nothing else; every attribute passes straight
 * through, so the server page still decides name, options and default. Without JavaScript
 * the select still renders and still submits with Enter from the search field — degraded,
 * not broken.
 */
export function AutoSubmitSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(event) => event.currentTarget.form?.requestSubmit()} />
}
