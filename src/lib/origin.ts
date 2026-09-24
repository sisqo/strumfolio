/**
 * The origin a link in an email may carry, from the host and scheme a request claims.
 *
 * `requestOrigin` derives it from `x-forwarded-host`/`host` so a verification or reset link
 * follows whatever domain is live (see CLAUDE.md on `AUTH_URL`). On Vercel those headers are
 * Vercel's own and cannot be forged, and it only routes the project's own domains here. Behind
 * any proxy that passed them through, though, a stranger asking for a reset of somebody else's
 * account could name their own host and have the victim emailed a link to it — the token in the
 * URL is the account. So the host is checked against the ones this installation answers on, and
 * anything else is written as the production origin rather than trusted.
 */
export const PRODUCTION_ORIGIN = 'https://strumfolio.com'

/** Hosts a link may point at: the product's own, the Vercel deployments of this project, local. */
const OWN_HOSTS = new Set(['strumfolio.com', 'www.strumfolio.com', 'preview.strumfolio.com'])
const VERCEL_HOST = /^strumfolio(?:-[a-z0-9-]+)?-sisqoz\.vercel\.app$/
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

export function linkOrigin(host: string | null, proto: string | null): string {
  if (host === null) return 'http://localhost:3000'

  const lower = host.trim().toLowerCase()
  const name = lower.replace(/:\d+$/, '')

  if (LOCAL_HOSTS.has(name)) return `${proto === 'https' ? 'https' : 'http'}://${lower}`
  if (/:\d+$/.test(lower)) return PRODUCTION_ORIGIN
  if (OWN_HOSTS.has(name) || VERCEL_HOST.test(name)) return `https://${name}`
  return PRODUCTION_ORIGIN
}
