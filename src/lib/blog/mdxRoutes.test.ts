import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

/**
 * No `.mdx` file under `src/app/`, because every one of them would be a URL.
 *
 * This test is the other half of a decision made in `next.config.ts`. `pageExtensions` lists
 * `mdx` there — not to route anything, but because Next's vendored-React alias rule tests
 * resources against `pageExtensionsRegex`, and without the entry the blog's articles resolved
 * the client copy of `react/jsx-dev-runtime` inside a server component and threw on every
 * article in `next dev`. That config comment has the full chain.
 *
 * What listing it costs is route resolution: an `.mdx` dropped into the app directory becomes
 * a page. The repo used to buy that guarantee by leaving `pageExtensions` alone, which turned
 * out to be the same lever as the React one and could not be kept. So it is bought here
 * instead, and the trade is a good one — a config that forbids something silently tells
 * nobody, while a failing test names the file.
 *
 * The articles themselves live in `content/blog/` and are imported by `lib/blog/posts.ts`,
 * nowhere near this directory, so this asserts a property that already holds rather than
 * asking anybody to change how the blog is written.
 */
const APP = join(process.cwd(), 'src/app')

function mdxFilesUnder(directory: string, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`

    if (entry.isDirectory()) return mdxFilesUnder(join(directory, entry.name), relative)

    return entry.name.endsWith('.mdx') ? [relative] : []
  })
}

describe('.mdx under src/app', () => {
  it('is empty, because `pageExtensions` would turn every file into a route', () => {
    const found = mdxFilesUnder(APP)

    assert.deepEqual(
      found,
      [],
      `these would each become a URL — move them to content/ and import them:\n  ${found.join('\n  ')}`,
    )
  })
})
