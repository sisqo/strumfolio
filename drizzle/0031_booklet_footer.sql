-- One column, nullable, no default: almost no account will ever set this, and a null
-- resolves to the fixed brand line or nothing at all, the same as an empty string would
-- (see `resolveFooterText`, `booklet/actions.ts`) — no backfill needed.
--
-- Snapshot warning (same as 0027's own note, PLAN.md Domande aperte #19): every
-- `drizzle-kit` snapshot from 0015 on is a byte-for-byte copy of an old one, not a real
-- incremental diff — confirmed again here (0028/0029/0030 share one id/prevId and are
-- byte-identical). Discard whatever `db:generate` proposes; this file and its journal
-- entry were written by hand, the same way 0024-0027 were.
ALTER TABLE "accounts" ADD COLUMN "booklet_footer" text;
