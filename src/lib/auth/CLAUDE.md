# Sessions, sign-in and registration

Loaded when working under `src/lib/auth/`. The rules that bind every route are repeated in the root `CLAUDE.md`.

## The password is chosen on `/verify`, never on `/register`

**Since 2026-09-24 registering asks for a name, an address and nothing else; the password and
the newsletter switch are answered on `/verify`, by whoever opened the link.** Until then the
password was typed at registration and stored on the pending row, and registering again on a
still-pending address replaced it — so a stranger who knew an address could register over its
owner's attempt (or before it), the owner clicked a genuine Strumfolio link, and the account was
born with the stranger's password. Every «don't overwrite» variant left the second case open;
asking only after the inbox is proved closes both.

- **No migration.** `pending_registrations.password_hash` stays `NOT NULL` and `register` writes
  `NO_PENDING_PASSWORD` (`''`, `verify/types.ts`) into it — over an older row's real hash too.
  `readPendingCredential` reads that as no pending password, so `/login` answers such an address
  as it answers a stranger; rows from before the change keep their hash and still get the
  «confirm your email» answer until they expire. Dropping the column is a later, separate step.
- **`/verify`'s GET still writes nothing** — the form is `VerifyForm` over `verifyEmail`, a
  POST. `verifyEmail` also calls `recordSignIn` now: it signs in with `issueSessionCookie`, so
  `auth.ts`'s callback, where every other sign-in is counted, never ran for a registrant.
- **`confirmPendingRegistration` creates the account with no password** — the pending one may be
  a stranger's; the person comes in with Google or «Forgot password».

## A session no longer outlives its account

**`currentUser()` now asks the database whether the account still exists**, and that reverses a
property this repo used to state as a feature: it was deliberately query-free — `auth()` reads the
JWT cookie, `readAccountCookie` a cookie, `roleOf` the environment. Everything in that chain is
pure, so `roleOf` answered `admin` for a reader looking at the account named by their own email
whether or not a row backed it. **Deleting somebody's account removed their rows and left their
browser signed in for the rest of the ninety-day cookie, with every write still permitted.**
`deleteMyAccount` hid it by calling `signOut`; `deleteAccount` — an operator removing *somebody
else's* account — cannot reach that browser at all. Reproduced and fixed 2026-09-11.

- **Two halves, and only one of them is automatic.** `currentUser()` answering `null` closes the
  writes everywhere at once, because every write funnels through `permit()` or, for one reached
  by a slug, `accessTo()` — which asked nothing until 2026-09-24, so a suspended reader could
  still save and delete songs by posting to the action ids. Getting the reader
  off the screen is `requireAccount()` (`lib/auth/session.ts`), and that has to be *called* — the
  pages read `currentUser` to scope their data, not as a gate.
- **`middleware.ts` cannot do this**, which is why it is not there: it runs on the edge, where
  this app's Postgres driver does not reach — the same constraint that makes `rememberUrlCoupon`
  a client effect. The only universal gate in the app is the one that cannot ask the question.
- **`src/lib/auth/gatedRoutes.test.ts` is what stops a new route forgetting.** It walks
  `src/app/**/page.tsx`, skips what `publicRoutes.ts` calls session-free plus a named exempt set,
  and fails when a page has no `requireAccount` in itself or in a layout above it. It earned its
  place immediately: it caught `/brand`, `/help/chordpro` and `/songs/[slug]/edit` — the editor —
  in the same commit that added it.
- **Put the call in a layout wherever the segment has a `loading.tsx`** (`(home)` and
  `songbooks/[slug]` are the two). A `redirect()` thrown from inside a page's own async body is
  not a redirect once Suspense is streaming a shell around it; `(home)/layout.tsx` carries that
  scar in full.
- **A global owner is exempt**, the same exemption `isAdmitted` already stated: their admission
  comes from `ALLOWED_EMAILS` rather than a row, and they may be standing inside a customer's
  account they have just deleted from that very screen.
- **`accountExists` fails open** — no database configured, or a read that throws, both answer
  "exists". Answering "gone" on a blip would sign out every reader of the app at once, which is
  far worse than a deleted account surviving a few more minutes. Memoized with React `cache()`,
  the first use of it here, so the several `currentUser()` calls one request makes cost one query.
- **A session can be revoked since 2026-09-25, and `auth()` is where** — owner's decision. The
  JWT carries `signedInAt`, stamped by the `jwt` callback on sign-in and by
  `issueSessionCookie`; `accounts.sessions_valid_after` (`0052`) is the moment before which
  none is believed (`sessionRevoked`, `lib/auth/revocation.ts`). It is written by
  `writePasswordHash`/`deletePasswordHash` (every password change, reset and removal, the
  operator's included), by `changeAccountEmail`, and by `provisionAccount` when the row is
  born — the last so a session left from an earlier holder of the address cannot wake inside the
  new account. `setOwnPassword` and `removeOwnPassword` re-issue the reader's own cookie, so
  only the *other* sessions end. **The check wraps `auth()` in `src/auth.ts`, not
  `currentUser`**: about thirty operator actions read `auth()` and `isOwner` directly, and a
  narrower check would leave a stolen owner session working after a password change. The
  middleware's own instance is untouched (edge, no database). Always a JavaScript `Date`, never
  the database's `now()`: the claim and the column must come from the same clock, or a Neon clock
  a second ahead refuses the cookie issued right after it. Tokens from before the claim count as
  the oldest there are, and `null` revokes nothing, so the migration signed nobody out.
- **Deleting yourself goes through `currentUser`**, so a suspended account cannot: deleting
  clears the suspension with the row, and the address could register again (owner's decision,
  2026-09-25). The same goes for the name and the newsletter preference.

## An AI token is a second way to be somebody (2026-09-27)

`currentUser`, `accessTo` and `permitOn` answer for an MCP token before they read the session
(`lib/auth/actor.ts`, `runAsToken`): the token's own account, admin there and nowhere else, never
through `roleOf`, so an owner's token is not a global owner. **`auth()` is deliberately left alone**,
so every operator action that reads it sees nobody and refuses. A change to any of those three
functions must keep the actor branch first; `actor.test.ts` pins the cross-account refusal, and
`src/lib/mcp/CLAUDE.md` has the rest. Token revocation is not `sessions_valid_after`: a password
change leaves tokens alone, by decision.
