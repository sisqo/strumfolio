/**
 * Where Paddle tells this app that money moved.
 *
 * Thin on purpose: verify, hand over, answer. The mapping is `lib/plans/webhook.ts` and the
 * write is `lib/plans/webhookApply.ts`, both of which say why they are shaped as they are.
 *
 * **Only a 2xx means "delivered"**, and that is the whole of the error design here. Every
 * other status — 400, 401, 500, a timeout — is retried on the same budget (3 attempts over
 * ~15 minutes in sandbox, 60 over ~3 days in live), so the one answer that can actually lose
 * an event is a 2xx on a failure. Which status therefore matters only to whoever reads the
 * log: 401 says the signature did not check out, 500 says something else went wrong. Note that
 * the first of those still lumps together a forged request, a rotated secret and a timestamp
 * older than the five-second window — they are genuinely indistinguishable here, and the
 * rotated-secret case recovers on its own once the right value is deployed, because the
 * retries are still running.
 *
 * **A missing database is also a non-2xx**, for the same reason and against the instinct: it
 * is a configuration fault that will be fixed, and the retry window is precisely the thing
 * that turns a fixed fault into no lost payment.
 *
 * **The signature is checked with the SDK and the body is read as Paddle's own wire format,
 * not as the SDK's entities.** `unmarshal` would do both at once, but it deserialises `data`
 * into typed objects whose fields are camelCase (`currentBillingPeriod`, `customerId`) — so
 * the snake_case this app's mapping reads would come back `undefined` for every field, and the
 * webhook would quietly grant nothing for ever. Worse, that deserialiser **throws** on a
 * payload missing a field it expects, and a throw here is a 500, which Paddle retries for
 * three days: one unexpected shape becomes an event that can never be delivered. Reading the
 * parsed body directly keeps `webhook.ts`'s defensive readers in charge, where an unknown
 * shape means "this event changes nothing" instead of an exception — and it is the same shape
 * stored in `paddle_events.payload`, so replaying from the ledger one day runs this same code.
 *
 * **`Webhooks` is constructed standalone, with no API key** — the SDK exports it apart from
 * the `Paddle` client, so this route holds one secret rather than two and cannot call the
 * Paddle API even by mistake. **That costs the explicit `NodeRuntime.initialize()` below, and
 * without it nothing here works.** The SDK keeps its crypto implementation in a static
 * `RuntimeProvider` that only the `Paddle` constructor fills in: the node entry point wraps
 * `Paddle` in a subclass whose constructor calls `initialize()` first, and `Webhooks` —
 * re-exported from `notifications/` — initializes nothing. With the provider unset,
 * `isValidSignature` logs «Unknown runtime» and returns **false for every signature**, so the
 * route rejects every legitimate delivery and the only symptom is a verification failure that
 * looks exactly like a wrong secret. Found by signing a request by hand and watching a
 * known-good signature be refused.
 *
 * `PADDLE_NOTIFICATION_WEBHOOK_SECRET` belongs to *one* notification destination — sandbox and
 * production have separate destinations with separate secrets, and crossing them makes every
 * delivery fail verification in exactly the same way.
 *
 * **It is reachable without a session**, which `middleware.ts` has to be told: `isPublicAsset`
 * carries the path. Without that line every delivery would be answered with a redirect to
 * `/login`, which Paddle does not follow and counts as a failure — three days of retries
 * against a sign-in page, with nothing in this file ever running.
 */

import { NodeRuntime, Webhooks } from '@paddle/paddle-node-sdk'

import { hasDatabase } from '@/lib/db/client'
import { applyPaddleEvent } from '@/lib/plans/webhookApply'

/* Fills the SDK's static crypto provider. See the note above: without this call every
   signature, correct or not, is refused. */
NodeRuntime.initialize()

const webhooks = new Webhooks()

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get('paddle-signature') ?? ''
  const body = await request.text()
  const secret = process.env.PADDLE_NOTIFICATION_WEBHOOK_SECRET ?? ''

  if (!signature || !body || !secret) {
    console.error('[paddle] refused: missing signature, body or PADDLE_NOTIFICATION_WEBHOOK_SECRET')
    return Response.json({ error: 'Missing signature, body or secret' }, { status: 400 })
  }

  if (!hasDatabase) {
    console.error('[paddle] no DATABASE_URL — answering 500 so the delivery is retried')
    return Response.json({ error: 'No database' }, { status: 500 })
  }

  try {
    /* The raw string is what was signed, so it must never be parsed and re-serialised
       before this call. Answers false — it does not throw — for a bad signature, a stale
       timestamp (the window is five seconds) or a secret that does not match. */
    if (!(await webhooks.isSignatureValid(body, secret, signature))) {
      console.error('[paddle] signature rejected; Paddle will retry')
      return Response.json({ error: 'Bad signature' }, { status: 401 })
    }

    const event = JSON.parse(body) as {
      event_id?: string
      event_type?: string
      occurred_at?: string
      data?: unknown
    }

    if (!event.event_id || !event.event_type) {
      console.error('[paddle] verified body carries no event_id/event_type')
      return Response.json({ error: 'Unreadable event' }, { status: 500 })
    }

    const occurredAt = event.occurred_at ? new Date(event.occurred_at) : null

    const outcome = await applyPaddleEvent(
      {
        eventId: event.event_id,
        eventType: event.event_type,
        /* Null rather than an Invalid Date: the column is nullable precisely so a body this
           app cannot fully read is still recorded. */
        occurredAt: occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : null,
        data: event.data,
      },
      body,
    )

    console.log(`[paddle] ${event.event_type} ${event.event_id} -> ${outcome}`)
    return Response.json({ received: true, outcome })
  } catch (error) {
    console.error('[paddle] delivery failed, Paddle will retry:', error)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}
