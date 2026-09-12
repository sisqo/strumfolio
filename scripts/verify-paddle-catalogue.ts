/**
 * Asserts that Paddle's catalogue still charges what `/pricing` prints.
 *
 * This is the script `prices.ts` describes as the thing that replaces its manual rule — «a
 * single script that reads Paddle's `/prices` and asserts every `paddleId` here still carries
 * these `amount` values». The comparison itself is `lib/plans/catalogue.ts`, covered by tests;
 * everything here is fetching and printing.
 *
 *   npx tsx scripts/verify-paddle-catalogue.ts                  # live, ids from prices.ts
 *   npx tsx scripts/verify-paddle-catalogue.ts --sandbox        # sandbox, matched on custom_data
 *   npx tsx scripts/verify-paddle-catalogue.ts --from cat.json  # an already-fetched response
 *
 * **`--from` exists because this repo holds no Paddle credential.** The sandbox key lives in
 * the Claude Code plugin's own user config and the live connection authorises over OAuth in a
 * browser, so neither reaches `process.env` here — see the root `CLAUDE.md`. Until a
 * `PADDLE_API_KEY` exists, the way to run this is to fetch the catalogue through the Paddle
 * MCP server (`client.prices.list({ per_page: 100 })`) and hand the response over as a file.
 * The file is the Paddle response verbatim, `{data: [...]}` or a bare array — deliberately
 * one format rather than a second one of our own that would need its own conversion to drift.
 *
 * **Exit 2 means nothing was verified, and it is not a pass.** Every `paddleId` in `prices.ts`
 * is `''` today, so a live run has nothing to compare; reporting that as success would make
 * this script read as agreement at exactly the moment it is checking nothing. Wire it into CI
 * only once a live catalogue exists, and let exit 2 be what says it is not there yet.
 */

import { readFileSync } from 'node:fs'

import { compareCatalogue, expectedCatalogue, type CataloguePrice } from '../src/lib/plans/catalogue'
import { loadEnv } from './load-env'

const HOSTS = { live: 'https://api.paddle.com', sandbox: 'https://sandbox-api.paddle.com' }

interface PaddlePrice {
  id: string
  status: string
  tax_mode: string
  unit_price: { amount: string; currency_code: string }
  unit_price_overrides?: unknown[]
  billing_cycle?: { interval: string; frequency: number } | null
  trial_period?: unknown
  custom_data?: { plan?: string; cycle?: string } | null
}

function normalise(price: PaddlePrice): CataloguePrice {
  return {
    id: price.id,
    plan: price.custom_data?.plan ?? null,
    cycle: price.custom_data?.cycle ?? null,
    amount: price.unit_price.amount,
    currency: price.unit_price.currency_code,
    taxMode: price.tax_mode,
    interval: price.billing_cycle?.interval ?? null,
    frequency: price.billing_cycle?.frequency ?? null,
    hasTrial: price.trial_period != null,
    overrides: price.unit_price_overrides?.length ?? 0,
    status: price.status,
  }
}

/** Follows `meta.pagination.next` rather than counting pages: Paddle hands back a full URL. */
async function fetchPrices(host: string, apiKey: string): Promise<PaddlePrice[]> {
  const prices: PaddlePrice[] = []
  let url: string | null = `${host}/prices?per_page=100`

  while (url) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (!response.ok) {
      throw new Error(`Paddle answered ${response.status} ${response.statusText} for ${url}`)
    }

    const body = (await response.json()) as { data: PaddlePrice[]; meta?: { pagination?: { has_more?: boolean; next?: string } } }
    prices.push(...body.data)
    url = body.meta?.pagination?.has_more ? (body.meta.pagination.next ?? null) : null
  }

  return prices
}

function readSnapshot(file: string): PaddlePrice[] {
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as PaddlePrice[] | { data: PaddlePrice[] }
  return Array.isArray(parsed) ? parsed : parsed.data
}

async function main() {
  loadEnv()

  const args = process.argv.slice(2)
  const sandbox = args.includes('--sandbox')
  const from = args[args.indexOf('--from') + 1]
  const environment = sandbox ? 'sandbox' : 'live'

  /* Sandbox ids are in no file here by decision — `paddleId` holds the live ones — so sandbox
     prices are found by the `{plan, cycle}` stamped on them when the catalogue was created. */
  const matchBy = sandbox ? 'custom-data' : 'id'

  let prices: PaddlePrice[]
  if (args.includes('--from')) {
    if (!from) {
      console.error('--from needs a path to a Paddle /prices response.')
      process.exit(2)
    }
    prices = readSnapshot(from)
  } else if (process.env.PADDLE_API_KEY) {
    prices = await fetchPrices(HOSTS[environment], process.env.PADDLE_API_KEY)
  } else {
    console.error(
      'No PADDLE_API_KEY and no --from <file>. This repo holds no Paddle credential — fetch\n' +
        'the catalogue through the Paddle MCP server and pass the response with --from.',
    )
    process.exit(2)
  }

  const report = compareCatalogue(expectedCatalogue(), prices.map(normalise), matchBy)

  for (const failure of report.failures) console.error(`  ✗ ${failure}`)

  if (report.unwired.length) {
    console.error(
      `\n${report.unwired.length} of ${report.unwired.length + report.checked} listino rows have no paddleId yet:`,
    )
    for (const row of report.unwired) {
      console.error(`  – ${row.plan}${row.cycle ? `/${row.cycle}` : ''} (€${row.euro})`)
    }
  }

  if (report.failures.length) {
    console.error(`\nMISMATCH: the ${environment} catalogue disagrees with the listino.`)
    process.exit(1)
  }

  if (report.unwired.length) {
    console.error('\nNOTHING VERIFIED: write the live price ids into `prices.ts` first.')
    process.exit(2)
  }

  console.log(`OK — ${report.checked} ${environment} prices match the listino, euro and tax-inclusive.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
