-- Whether an address has asked, through the one-click link in a courtesy email, never to
-- receive another one.
--
-- Courtesy emails (`courtesy_thanks`, `courtesy_checkin`) are sent under legitimate interest,
-- not newsletter consent, so `newsletter_prefs.subscribed` cannot answer this question and must
-- not be made to — unsubscribing from one says nothing about the other. This is deliberately a
-- column on `accounts` rather than a new table: the opt-out has no history worth keeping (when
-- it was withdrawn, from where), only a fact that is true or is not, the same shape
-- `suspended_at` already has on this same table.
--
-- Hand-written, not generated, same reason as 0024-0045's own notes: `db:generate` refuses to
-- run over the 0028-0030 snapshot collision.
--
-- Null means "never opted out" — every existing account, and every new one until its reader
-- (or an operator) sends this address a courtesy email, they follow the link, and they confirm.
-- The read path (`lib/courtesy/actions.ts`) treats a read failure the same generous way
-- `outreachAccountFor` treats an unreadable newsletter preference: refuse to send rather than
-- guess consent either way.

ALTER TABLE "accounts" ADD COLUMN "courtesy_opted_out_at" timestamp with time zone;
