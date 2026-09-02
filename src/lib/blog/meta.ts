/**
 * What an article declares about itself, and the check that makes those declarations
 * trustworthy.
 *
 * Every article is one `.mdx` file in `content/blog/`, opening with an `export const meta`
 * block. That shape was chosen so writing an article is creating a file and nothing else —
 * no second list to keep in step, no registry entry to forget — and it costs one guarantee:
 * `tsc --noEmit` does not look inside `.mdx` files, so a missing `description` or a date of
 * `2026-02-31` is not a type error, and nothing would catch it before a reader did.
 *
 * This module is that guarantee, rebuilt where it can live. `parsePostMeta` is called by
 * `loadPost` for every article on every build, and it **throws** rather than repairing or
 * skipping: an article with a broken date fails `next build`, loudly, at the moment somebody
 * can still fix it. Silently dropping the article would be worse — the build would go green
 * and the piece simply would not be on the site.
 *
 * Pure and dependency-free on purpose: `npm test` in this repo is `node:test` over plain
 * modules, with no React renderer anywhere, so a rule that lives here is testable and the
 * same rule written inside a page component is not. `plans/testCard.ts` next to `checkout.ts`
 * exists for the same reason.
 */

/** An article's own declarations, after checking — the shape the rest of the blog reads. */
export interface PostMeta {
  /**
   * From the file name, never from the file's contents.
   *
   * A `slug` field inside the meta block could disagree with the file it sits in, and one of
   * the two would have to win; taking it from the name means the URL and the file are the
   * same fact and cannot drift.
   */
  slug: string
  title: string
  /** The sentence Google prints under the title in a result. */
  description: string
  /** `YYYY-MM-DD`, a real calendar date. */
  date: string
  /** Labels only — there are no tag pages. See `PLAN-blog.md` on why not yet. */
  tags: string[]
  /** An absolute path under `public/`, or null to fall back to the generated card. */
  cover: string | null
  /** Excluded from the index, the sitemap, the feed, and from being built at all. */
  draft: boolean
}

/**
 * The longest description Google will print before it truncates, near enough.
 *
 * Enforced rather than advised, and the strictness is the point: a description over this
 * length is not a slightly worse description, it is a sentence whose ending nobody will ever
 * read, and the writer will not find that out by looking at the page. Trimming it is ten
 * seconds' work at build time and impossible to notice afterwards.
 */
const DESCRIPTION_MAX = 160

/** Lowercase words joined by single hyphens — what both a URL and a tag have to be. */
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function fail(slug: string, problem: string): never {
  throw new Error(`content/blog/${slug}.mdx: ${problem}`)
}

function requireString(slug: string, raw: Record<string, unknown>, field: string): string {
  const value = raw[field]
  if (typeof value !== 'string' || value.trim() === '') {
    fail(slug, `\`${field}\` must be a non-empty string`)
  }
  return value.trim()
}

/**
 * Whether `value` is a real day, not merely four digits and two pairs.
 *
 * `new Date('2026-02-31')` does not throw — it rolls forward to March 3rd — so the check has
 * to be the round trip: format the parsed date back and see whether it says what it was given.
 */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.toISOString().slice(0, 10) === value
}

/**
 * Checks a slug taken from a file name before it is allowed to become a URL.
 *
 * Exported because `listSlugs` uses it to refuse a badly named file outright, without having
 * to open it: a file called `My Post.mdx` would otherwise become a URL with a space in it.
 */
export function isValidSlug(slug: string): boolean {
  return KEBAB.test(slug)
}

/**
 * Turns one article's raw `meta` export into a `PostMeta`, or throws saying which file is
 * wrong and why.
 *
 * `raw` is `unknown` because it genuinely is: it comes out of an `.mdx` file that no compiler
 * checked, which is the whole reason this function exists.
 */
export function parsePostMeta(slug: string, raw: unknown): PostMeta {
  if (!isValidSlug(slug)) {
    fail(slug, 'the file name must be lowercase words joined by hyphens — it becomes the URL')
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    fail(slug, 'missing `export const meta = { … }` at the top of the file')
  }
  const fields = raw as Record<string, unknown>

  const title = requireString(slug, fields, 'title')

  const description = requireString(slug, fields, 'description')
  if (description.length > DESCRIPTION_MAX) {
    fail(
      slug,
      `\`description\` is ${description.length} characters; search results cut off around ${DESCRIPTION_MAX}, so the rest would never be read`,
    )
  }

  const date = requireString(slug, fields, 'date')
  if (!isCalendarDate(date)) {
    fail(slug, `\`date\` must be a real date as YYYY-MM-DD, not ${JSON.stringify(date)}`)
  }

  const tags = parseTags(slug, fields.tags)

  const cover = parseCover(slug, fields.cover)

  const draft = fields.draft ?? false
  if (typeof draft !== 'boolean') fail(slug, '`draft` must be true or false when present')

  return { slug, title, description, date, tags, cover, draft }
}

function parseTags(slug: string, value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) fail(slug, '`tags` must be an array of strings when present')

  const tags = value.map((tag) => {
    if (typeof tag !== 'string' || !KEBAB.test(tag)) {
      fail(slug, `tag ${JSON.stringify(tag)} must be lowercase words joined by hyphens`)
    }
    return tag
  })

  /*
   * A duplicate tag would print twice on the article and count twice the day tag pages exist.
   * Cheap to catch here, invisible everywhere else.
   */
  if (new Set(tags).size !== tags.length) fail(slug, '`tags` contains the same tag twice')

  return tags
}

function parseCover(slug: string, value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || !value.startsWith('/')) {
    fail(slug, '`cover` must be an absolute path under public/, such as /blog/my-post.webp')
  }
  return value
}

/**
 * Newest first, and by slug when two articles share a date.
 *
 * The tie-break is not decoration: two pieces published the same day would otherwise come out
 * in whatever order the file system happened to list them, which differs between this machine
 * and Vercel's build container — and an index, a sitemap and a feed that disagree about the
 * order between builds are three ways of looking untended.
 *
 * Sorts a copy: the caller's array is left alone.
 */
export function byNewest<T extends { date: string; slug: string }>(posts: readonly T[]): T[] {
  return [...posts].sort((a, b) => (a.date === b.date ? a.slug.localeCompare(b.slug) : b.date.localeCompare(a.date)))
}
