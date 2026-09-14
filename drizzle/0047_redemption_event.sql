-- Which webhook event recorded a redemption — the key the payment history was missing.
--
-- `/billing`'s ledger already knows how to draw a discounted line: `PaymentHistoryTable` strikes
-- `full_amount` through and prints the code under the figure. It never did, because the three
-- fields behind that drawing were only ever filled by `fromMockPayload` — the mock wrote them
-- flat into its own payload — and a real Paddle `transaction.completed` carries neither a code
-- nor a listino. So a reader who bought Standard at 30% off saw «Paid for Standard €2.44» with
-- nothing anywhere to say why, which is the one question a payment history exists to answer.
-- Third of the same family, after `purchase`/`payment` and the yearly comparison.
--
-- The figures are not derived from the payload, and that is the point of the column. The totals
-- are tax-inclusive with the discount applied to the ex-VAT subtotal, so `total + discount` is
-- €3.30 where the listino is €3.49 — arithmetic that happens to be wrong, and `paddle_events`'
-- own rule is that a figure on the ledger comes from what was stored, never from a sum done
-- later. `coupon_redemptions` already holds `full_amount`, `paid_amount`, `code` and
-- `discount_percent`, written in the same transaction as the event that caused them. What was
-- missing was only the pointer back.
--
-- A column rather than reusing `id`, which is a `randomUUID()`: an `id` holding an event id
-- «except for rows written before today» is the kind of quiet overload this schema argues
-- against everywhere else (`plan_status` is not `status`; `owner_email` stays an email).
--
-- Nullable for ever: the redemptions written before this column existed have no event to name,
-- and they simply do not annotate a line. The unique index is partial for that reason — two
-- rows with a null pointer are not a collision — and it buys a third defence on top of the two
-- ceilings: one `transaction.completed` can record at most one redemption, replayed or not.
--
-- Hand-written, not generated, same reason as 0024-0046's own notes: `db:generate` refuses to
-- run over the 0028-0030 snapshot collision.

ALTER TABLE "coupon_redemptions" ADD COLUMN "event_id" text;

CREATE UNIQUE INDEX "coupon_redemptions_event" ON "coupon_redemptions" ("event_id") WHERE "event_id" is not null;
