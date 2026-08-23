/**
 * The one fixed, fake identity every owner-only preview in this app renders with — an
 * address and a token that exist in no table, ever. `lib/email/preview.ts` was the first
 * place that needed one (a verification/reset link that looks real without risking a real
 * credential), and `/verify` and `/reset-password`'s own `?preview=1` (both gated on
 * `isOwner`, same as `/thanks?preview=`) reuse the exact same pair rather than inventing a
 * second fake identity: whichever preview an owner is looking at, "preview@strumfolio.com"
 * is what they see, never a real pending row.
 */

export const SAMPLE_EMAIL = 'preview@strumfolio.com'
export const SAMPLE_TOKEN = 'preview-token'
