# AI access over MCP

Loaded when working under `src/lib/mcp/`. The endpoint is `app/api/mcp/route.ts`; the history it
leaves behind is `src/lib/revisions/`. Built 2026-09-27, every rule below the owner's decision.

## What it is

A remote MCP server inside the app, so a musician's own AI assistant can read and edit their
songbooks. **Personal tokens first, OAuth later**: a token is created on `/profile` («AI access»)
and pasted into the client. Claude Code takes it directly (`claude mcp add --transport http … --header
"Authorization: Bearer …"`); **Claude Desktop does not** — its custom connectors are OAuth only,
so a token needs a local bridge (`mcp-remote`); Claude.ai's `static_headers` connectors are set by
an organisation Owner, and whether a single person on a personal plan can use them is untested.
OAuth is what opens it to everybody, and is phase two.

- **Behind `STRUMFOLIO_MCP=on`** (`enabled.ts`), read by the route (404 when off), `/profile`
  (no section) and `/pricing` (the «AI MCP integration» row keeps its old Premium «coming soon»
  while off, and is computed from `PLANS[plan].aiAccess` while on). Off in production until the
  owner switches it on; set it before the push that should bake it, like every module-scope read.
- **From Standard up** (`PlanLimits.aiAccess`, `refused.aiAccess`), asked on **every call**, not
  when the token is made. On Free the token still authenticates, `tools/list` still answers, and
  every tool answers one sentence saying the plan is needed — so the assistant can tell its user
  why, and the tokens work again the day the plan is back. With `SONGBOOK_PLANS` off everything is
  `UNGATED`, which includes this, the same as every other gate.
- **Read and write, never delete.** No tool removes a song, a section or a songbook. Do not add
  one without asking: «an AI mistake is always repairable» is what the undo design rests on.

## How a token becomes an account — `lib/auth/actor.ts`

The route resolves the bearer to one account (`tokens.ts`, one 401 for every failure) and runs the
whole request inside `runAsToken`. `currentUser`, `accessTo` and `permitOn` read the actor
first, so **every write tool calls the app's own action** — `saveSong`, `createSongbook`,
`moveSong`, `createSection`… — and gets its freeze, caps, suspension check, revalidation and note
re-anchoring for free. There is no second copy of any gate, and that is the reason for the seam.

- **The actor is the token's account and nothing else.** It never goes through `roleOf`, so an
  owner's own token is not a global owner (`actor.test.ts` asserts it). `auth()` is deliberately
  not overridden: the thirty-odd operator actions that read the session and `isOwner` see nobody
  and refuse, which is the direction wanted.
- **Reads query directly**, scoped by `accountId` in every `where` (`tools.ts`), and return only
  what the tool promises. A read added later must scope the same way — the actor protects actions,
  not a query written here.
- **A token cannot manage tokens**: `mcp/actions.ts` refuses under an actor, and refuses a global
  owner standing in a customer's account (a token belongs to whoever created it).
- `'use server'` modules may export only async functions — `mcp/actions.ts` exporting a constant
  broke `/profile` in dev with a build error the type-checker never saw.

## Tokens — `tokens.ts`

sha256 of 32 random bytes, prefix `sfm_`, unique index on the hash. **No expiry; dead after 180
days unused** (`TOKEN_IDLE_DAYS`, from `last_used_at`, or `created_at` if never used), revocable by
hand, ten live per account. **A password change does not touch them** — `sessions_valid_after` is
about browsers — while suspension and deletion end them (the account row is read on every call;
deletion cascades). `last_used_at` is written at most every five minutes.

## Writing — whole text plus version

`update_song` takes the whole ChordPro and the `version` `get_song` returned. `songs.version`
(`0053`) is an integer every rewrite of words, title or artist increments — **not `updatedAt`**,
which Postgres keeps to the microsecond and a JS `Date` to the millisecond. `saveSong` compares it
under `SELECT … FOR UPDATE` and answers `conflict`; the editor does not send one yet, so its
saves stay last-write-wins. Title and artist are arguments; a `{title:}` the write *adds* to the
body gets a warning in the answer, since the sample songbook's songs already carry such lines and
those are the owner's text.

## History — `src/lib/revisions/`

`song_revisions` keeps a text in two cases only: **before every AI write**, and **before an app
write over a text an AI wrote** (`songs.ai_written_at` set) — a queued offline edit landing after
the AI's would otherwise erase it without trace. A restore always keeps what it replaces. Twenty
per song, **and the newest `app` row is never pruned** (`prunable`): it is the song as a person
left it before the AI started. The editor shows it under the words (`SongHistory`) and restores by
reloading the page. The Privacy Policy §2, §3's contract row and §6 describe tokens and history,
and Terms §5 the beta — change the retention and those three move with it.

## The protocol — `protocol.ts`

Hand-written, stateless JSON over Streamable HTTP, **legacy era only** (`initialize`, versions
`2025-11-25`/`2025-06-18`/`2025-03-26`). The `2026-07-28` revision dropped the handshake for
per-request `_meta`; a dual-era client that tries it gets a plain 400, which that spec names as the
signal to fall back. A modern-only client does not work until this learns `server/discover`. No
`Mcp-Session-Id`, GET/DELETE are 405, a batch array is accepted, a notification is 202.

## The ChordPro guide — `guide.ts`

What the assistant is told, as a resource and in `instructions`. Its own text, not a render of
`components/ChordProGuide.tsx`: **the two must agree**, and it is on the root `CLAUDE.md`'s
ChordPro fan-out list.

## Verifying

`npm test` covers the protocol, tokens, pruning and the actor. The route is checked with curl
against `next dev` (`STRUMFOLIO_MCP=on`): `initialize`, `notifications/initialized` → 202,
`tools/list`, `tools/call`, a stale `version` → the conflict sentence, another account's slug or
section → «No such…», an idle, revoked or suspended token → 401, a Free account → the plan
sentence. A dev token is a row inserted by hand (hash of a secret generated locally); never paste a
real one into a transcript.
