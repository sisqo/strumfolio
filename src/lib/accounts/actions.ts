'use server'

/**
 * Switching which account a signed-in reader is looking at, and — for a global owner
 * only — deleting one, or hand-assigning it a plan on another address's behalf. Creating
 * one by hand is gone (PLAN.md, v3.8): self-service registration and automatic
 * provisioning on any first sign-in cover every real case it used to.
 */

import { eq, inArray, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { auth, signOut } from '@/auth'
import { isEmailShape, isOwner, normalizeEmail } from '@/lib/allowlist'
import { deletePasswordHash } from '@/lib/auth/credentials'
import { db, hasDatabase } from '@/lib/db/client'
import { accountIdOf } from '@/lib/db/ids'
import {
  accounts,
  credentials,
  pendingRegistrations,
  sections,
  signIns,
  singAlongSessions,
  songbooks,
  songs,
} from '@/lib/db/schema'
import { sendEmail } from '@/lib/email/send'
import { welcomeEmail } from '@/lib/email/templates'
import { paymentHistoryFor } from '@/lib/plans/history'
import type { PaymentHistoryLine } from '@/lib/plans/history'
import { isAdmitted } from '@/lib/roles'
import { notifyTelegram } from '@/lib/telegram/notify'
import { registrationNotice } from '@/lib/telegram/registrationNotice'

import { mayAccess, readAccountCookie, writeAccountCookie } from './current'
import { validateGrant } from './grant'
import { provisionAccount } from './provision'
import type {
  AccountResult,
  AdminActionResult,
  AdminNameResult,
  ConfirmPendingResult,
  EmailChangeResult,
  GrantInput,
  GrantResult,
  NameResult,
  SelfDeleteResult,
} from './types'

/**
 * Validates access, then writes the cookie. Navigating home afterwards is deliberately
 * not this function's job — `SwitchAccountButton`, the one caller, does it — because a
 * plain cookie write is not the only thing that has to happen once this settles:
 * `RoleProvider`'s client-side identity (`email`/`accountOwnerEmail`/`role`/`plan` in
 * `TopBar`, `UserMenu`, `ViewingAsPill`) is never re-read on its own just because the
 * cookie changed — layouts persist across a client-side navigation, so nothing remounts
 * `RoleProvider` and nothing tells it to ask again. This used to end in `redirect('/')`
 * itself, which is exactly what made that impossible to fix from the caller's side: a
 * `redirect()` thrown from inside a Server Action leaves no reliable point for the
 * caller to run anything once it settles (`forgotPassword/actions.ts`'s own comment on
 * that same pitfall) — including the one thing that actually needed to run, refreshing
 * `RoleProvider`. So the redirect moved out to `SwitchAccountButton`, right after the
 * refresh it exists to make possible; this function is left with only the write a
 * caller can't get wrong.
 */
export async function switchAccount(accountOwnerEmail: string): Promise<void> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return

  const normalized = normalizeEmail(email)
  if (!mayAccess(normalized, accountOwnerEmail, process.env.ALLOWED_EMAILS)) {
    return
  }

  await writeAccountCookie(accountOwnerEmail)
}

/**
 * The cascade itself, shared by `deleteAccount` (a global owner, on any account) and
 * `deleteMyAccount` (a reader, on their own) — what differs between the two is who may
 * call it and what happens once it is done, never this part.
 *
 * Deletion order follows the `restrict` foreign keys already on `songs` and `sections`
 * rather than requiring them to be relaxed: songs first, then the sections they pointed
 * at, then the now-empty songbooks, then any broadcast reading this account's repertoire,
 * and only then the account row itself. `userSongPrefs` needs nothing here — its foreign
 * key to `songs` is already `on delete cascade`. `members` is deliberately never touched:
 * the table is on its way out entirely in a later step and must not be referenced by new
 * code. `paddle_events` is deliberately never touched either, and for the opposite reason:
 * it is the ledger of what somebody actually paid, and a record of a payment that outlives
 * neither the account nor the dispute is no record at all — which is exactly why that table
 * carries no foreign key to `accounts` (see its own comment in `db/schema.ts`) rather than
 * a cascade that would have deleted it here. Two consequences to know, because they are not
 * guessable from the code: a deleted account's address stays in
 * `paddle_events.account_owner_email` with no path in the app that can remove it, and if
 * that same address ever registers again it inherits those rows. Should erasure have to win
 * over the ledger one day, the middle this leaves open is
 * `tx.update(paddleEvents).set({ accountOwnerEmail: null })` for the target inside this same
 * transaction — the absent foreign key already permits it, the payload keeps the event
 * intact, and it belongs here rather than in the webhook. Not done today: which of the two
 * wins is a product decision, not a tidying one.
 *
 * This list is the checklist a new table has to be added to. Migration 0021 exists because
 * `user_prefs` and `user_song_prefs` were once missing from it.
 */
async function removeAccountAndContent(target: string): Promise<void> {
  await db().transaction(async (tx) => {
    const owned = await tx
      .select({ id: songbooks.id })
      .from(songbooks)
      .where(eq(songbooks.accountId, accountIdOf(target)))
    const ids = owned.map((row) => row.id)

    if (ids.length > 0) {
      await tx.delete(songs).where(inArray(songs.songbookId, ids))
      await tx.delete(sections).where(inArray(sections.songbookId, ids))
      await tx.delete(songbooks).where(inArray(songbooks.id, ids))
    }

    await tx
      .delete(singAlongSessions)
      .where(eq(singAlongSessions.broadcastAccountId, accountIdOf(target)))
    await tx.delete(accounts).where(eq(accounts.ownerEmail, target))
  })

  /*
   * `accounts.ownerEmail` is unique, so the row just deleted was the only one this
   * address could ever have owned — `hasAccount` is `false` here by construction, with
   * nothing left to re-query.
   */
  const stillAdmitted = isAdmitted(target, process.env.ALLOWED_EMAILS, false)
  if (!stillAdmitted) {
    try {
      await deletePasswordHash(target)
    } catch (error) {
      // The account itself is already gone either way; a stray credential row left
      // behind proves nothing on its own and is not worth failing this action over.
      console.error('removeAccountAndContent: deletePasswordHash failed', error)
    }
  }
}

/**
 * Deletes an account and everything in it — immediately, with no check for "is it
 * empty", by design (see `PLAN.md`, *Niente più ospiti*, point 7): the only safety net
 * wanted is retyping the address, and this action enforces that net itself rather than
 * trusting the screen that calls it to have done so.
 *
 * Authorized with `isOwner` directly, not `asAdmin()`: an account's own owner is `admin`
 * on that one account, which would let anyone delete their own — this is a global-owner
 * power over every account, the same distinction `listAllAccounts` already draws. A
 * reader deleting their own account is `deleteMyAccount`, below.
 */
export async function deleteAccount(accountOwnerEmail: string, confirmEmail: string): Promise<AccountResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  const callerEmail = session?.user?.email
  if (!isOwner(callerEmail, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'not-allowed' }
  }

  const target = normalizeEmail(accountOwnerEmail)
  if (normalizeEmail(confirmEmail) !== target) {
    return { ok: false, reason: 'confirm-mismatch' }
  }

  try {
    await removeAccountAndContent(target)
  } catch (error) {
    console.error('deleteAccount failed', error)
    return { ok: false, reason: 'failed' }
  }

  /*
   * A global owner can be looking at the very account they just deleted — they switched
   * into it earlier from this same screen. The cookie would otherwise keep pointing at an
   * address `accounts` no longer has a row for; `currentAccountFor` falls back safely, but
   * only to the caller's own account, so it is put back explicitly rather than left stale.
   */
  const requested = await readAccountCookie()
  if (requested !== null && normalizeEmail(requested) === target && callerEmail) {
    await writeAccountCookie(callerEmail)
  }

  revalidatePath('/accounts')
  return { ok: true }
}

/**
 * Gives an account a plan by hand, or takes the gift away — `grant: null` is the clear.
 *
 * Writes **only** the five grant columns, and never `plan`/`planStatus`/`planExpiresAt`. Those
 * three belong to the (future) Paddle webhook, which re-asserts them at every renewal, so a
 * gift parked there would be erased by the next `subscription.updated` — that is, by a
 * *successful payment*, silently, with nothing left in the row to say it ever existed. That
 * failure mode is the entire reason the grant columns were added in 0024, so a `set({ plan: … })`
 * here would undo the migration's design while looking like a shortcut to the same result.
 * `entitlementsFor` reads both sides and takes the more generous per instant, which is what
 * makes writing only this half sufficient.
 *
 * One action for both directions, not a `grantPlan` and a `clearGrant`: both paths write the
 * same five columns, and a second `set({ … })` is a second place to forget one of them and
 * leave a row in a state nothing can explain.
 *
 * Clearing therefore **rewrites all five** rather than nulling them: `grantedPlan` and
 * `grantedUntil` go null — that pair is what `liveGrant` keys on, so the gift is genuinely
 * gone — while `grantedBy`/`grantedAt` record the caller and the moment. Both rejected
 * alternatives are worse in opposite directions. Nulling all five erases the only record that
 * a gift ever existed, since the audit lives on the row and nowhere else, leaving "who took
 * away my year?" permanently unanswerable. Leaving `grantedBy`/`grantedAt` untouched from the
 * *previous* decision attributes the withdrawal to whoever gave the gift. The consequence to
 * know when reading a row: these two columns mean *who last decided about the grant*, gift or
 * withdrawal, and a row with them set and `grantedPlan` null is a withdrawn gift, which is
 * exactly how `/accounts` renders it. `grantedNote` goes null on a clear — see
 * `validateGrant`'s comment on why a withdrawal records who and when but not why.
 *
 * `grantedBy` comes from the session and is deliberately not a parameter: an audit field a
 * caller can set records whatever the caller says, which is not an audit.
 *
 * Authorized with `isOwner` directly, not `asAdmin()`, the same distinction `deleteAccount`
 * and `listAllAccounts` already draw: an account's own owner resolves to `admin` on that one
 * account, so `asAdmin()` here would let every customer gift themselves `lifetime`.
 *
 * Deliberately blind to `SONGBOOK_PLANS`. Preparing the rows that will be enforced the day the
 * switch is flipped is the normal way to work; the flag changes what the screen *says*, never
 * what a row may hold.
 */
export async function setGrant(accountOwnerEmail: string, grant: GrantInput | null): Promise<GrantResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  const callerEmail = session?.user?.email
  if (!callerEmail || !isOwner(callerEmail, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'not-allowed' }
  }

  try {
    /*
     * One clock for the validation and for `grantedAt`, so the instant a gift was recorded and
     * the instant its end date was judged against are the same one.
     */
    const now = new Date()

    /*
     * Inside the `try`, not before it, even though nothing here queries. `grant` is typed
     * `GrantInput | null` and arrives from a browser, so the runtime value can be any shape at
     * all — `validateGrant` reads `input.note.trim()`, which throws on an argument that has no
     * `note`. Thrown out of a server action, that reaches the panel as an unexplained failure
     * with no line in this file's log; caught here it is the `failed` this function's return
     * type promises, and the same sentence as every other way a save can go wrong. The typed
     * signature is what the panel obeys, never what a direct call to the action has to send.
     */
    const fields = validateGrant(grant, now)
    if (!fields.ok) return { ok: false, reason: fields.reason }

    /*
     * `.returning(...)` and a length check, not because anything needs the value back: a
     * drizzle `update` against an address with no row *succeeds* and touches nothing, so
     * without this a gift to a deleted or mistyped address reports success. It is also why
     * this action needs no `isEmailShape` of its own — an address that is not an account is
     * caught here whatever it looks like.
     */
    const updated = await db()
      .update(accounts)
      .set({
        grantedPlan: fields.plan,
        grantedUntil: fields.until,
        grantedBy: normalizeEmail(callerEmail),
        grantedAt: now,
        grantedNote: fields.note,
        /*
         * Giving a gift also satisfies the mandatory plan-choice gate (PLAN.md, v3.7):
         * `plan_chosen_at` means "this account got a plan, one way or another", and an operator
         * *assigning* one is that just as much as a reader *choosing* one. Without this, a
         * customer handed premium by hand was still bounced to `/pricing` on every visit to
         * `/` and could not use the plan they had just been given — `hasChosenPlan` reads this
         * one column and nothing else, deliberately, because it runs on every home render.
         *
         * `coalesce`, so a later gift never rewrites the real first-activation date — the same
         * expression `activatePlanChoice` and `mockPurchase` already write, for the same reason.
         * `now.toISOString()` and never the `Date` itself: inside a raw `sql` template a `Date`
         * becomes a bind parameter postgres.js refuses outright, throwing the whole UPDATE — see
         * `mockPurchase`, where exactly that broke every purchase until it was fixed. The string
         * also keeps this stamp on the same instant as `grantedAt` beside it.
         *
         * Only on this path, never on the clear: taking a gift away does not un-happen the fact
         * that the account once had a plan, and re-locking somebody out of the app because
         * their gift ended is not what withdrawing a gift is for. They keep free's limits,
         * which is what `entitlementsFor` already resolves them to.
         */
        ...(fields.plan === null
          ? {}
          : { planChosenAt: sql`coalesce(${accounts.planChosenAt}, ${now.toISOString()})` }),
      })
      .where(eq(accounts.ownerEmail, normalizeEmail(accountOwnerEmail)))
      .returning({ ownerEmail: accounts.ownerEmail })

    if (updated.length === 0) return { ok: false, reason: 'unknown-account' }
  } catch (error) {
    console.error('setGrant failed', error)
    return { ok: false, reason: 'failed' }
  }

  revalidatePath('/accounts')
  return { ok: true }
}

/**
 * One account's payment history, for the admin panel — the same rows
 * `checkout.ts`'s `loadMyPaymentHistory` reads for the reader's own, gated the
 * opposite way: `isOwner` here, a session-scoped read there, the same split every
 * other query in this feature already draws (`listAccountPlans` versus `setGrant`
 * being the account's own, `deleteAccount` versus `deleteMyAccount`).
 *
 * Answers `{ ok: false }` rather than `null` on refusal, matching this file's other
 * results rather than `accounts/read.ts`'s bare-null idiom — a caller that only ever
 * calls this from behind `isOwner` itself has one reason to see `false`: the query
 * threw, not that the caller was refused twice.
 */
export async function loadAccountHistory(
  accountOwnerEmail: string,
): Promise<{ ok: true; history: PaymentHistoryLine[] } | { ok: false }> {
  if (!hasDatabase) return { ok: false }

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) return { ok: false }

  try {
    return { ok: true, history: await paymentHistoryFor(normalizeEmail(accountOwnerEmail)) }
  } catch (error) {
    console.error('loadAccountHistory failed', error)
    return { ok: false }
  }
}

/**
 * A reader deleting their own account — the self-service half `deleteAccount`'s own
 * comment says is deliberately not there: that action is a global-owner power over
 * *every* account, and this is the ordinary one every reader already has over their
 * own, with the same retype-to-confirm safety net checked here as well as by the
 * screen that calls it.
 *
 * Ends in `signOut`, not a plain return: the session cookie is a ninety-day JWT that
 * nothing short of signing out actually ends (`lib/auth/session.ts`'s own comment) —
 * every write path re-checking access on every call is what stops it from doing harm
 * in the meantime, but the account behind this session is now gone, and leaving the
 * reader signed in to it would strand them on a page with nothing left to show.
 */
export async function deleteMyAccount(confirmEmail: string): Promise<SelfDeleteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  const email = session?.user?.email
  if (!email) return { ok: false, reason: 'failed' }

  const target = normalizeEmail(email)
  if (normalizeEmail(confirmEmail) !== target) {
    return { ok: false, reason: 'confirm-mismatch' }
  }

  try {
    await removeAccountAndContent(target)
  } catch (error) {
    console.error('deleteMyAccount failed', error)
    return { ok: false, reason: 'failed' }
  }

  await signOut({ redirectTo: '/login' })
  // Unreachable: signOut with a redirectTo always throws to get there.
  return { ok: true }
}

/**
 * Your own first and last name, for `/profile` to prefill its form. `null` only when
 * there is nobody signed in — an existing account with no name yet reads back as two
 * empty strings, not null, so the screen has a form to show rather than a loading state
 * that never resolves (`PasswordScreen`'s `loadAccount` follows the same shape).
 */
export async function loadOwnName(): Promise<{ firstName: string; lastName: string } | null> {
  if (!hasDatabase) return null

  const session = await auth()
  const email = session?.user?.email
  if (!email) return null

  const target = normalizeEmail(email)
  const rows = await db()
    .select({ firstName: accounts.firstName, lastName: accounts.lastName })
    .from(accounts)
    .where(eq(accounts.ownerEmail, target))
    .limit(1)

  const row = rows[0]
  return { firstName: row?.firstName ?? '', lastName: row?.lastName ?? '' }
}

/**
 * Changes your own first and last name (`/profile`, `PLAN-account-name.md` point 5).
 * Keyed on the signed-in address itself, never `accountOwnerEmail` — the same choice
 * `setOwnPassword` (`lib/auth/actions.ts`) already makes for the same reason: this is a
 * fact about *you*, not about whichever account a global owner happens to have
 * switched into for support. Both fields are required, trimmed — this never writes an
 * empty name back over one that already exists.
 */
export async function updateOwnName(firstName: string, lastName: string): Promise<NameResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  const email = session?.user?.email
  if (!email) return { ok: false, reason: 'no-session' }

  const trimmedFirst = firstName.trim()
  const trimmedLast = lastName.trim()
  if (trimmedFirst === '' || trimmedLast === '') return { ok: false, reason: 'invalid-name' }

  try {
    await db()
      .update(accounts)
      .set({ firstName: trimmedFirst, lastName: trimmedLast })
      .where(eq(accounts.ownerEmail, normalizeEmail(email)))
    return { ok: true }
  } catch (error) {
    console.error('updateOwnName failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * An admin correcting an account's first and last name, for the Identity fieldset on
 * `/accounts/[email]` (`PLAN-account-admin.md`, point 4) — a separate action from
 * `updateOwnName` above, authorized with `isOwner` directly rather than `asAdmin()`, the
 * same distinction `setGrant`/`deleteAccount` already draw: an account's own owner is
 * `admin` on that one account, which would let any customer rename themselves through
 * this function too if it trusted the weaker check.
 */
export async function updateAccountName(ownerEmail: string, firstName: string, lastName: string): Promise<AdminNameResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'not-allowed' }
  }

  const trimmedFirst = firstName.trim()
  const trimmedLast = lastName.trim()
  if (trimmedFirst === '' || trimmedLast === '') return { ok: false, reason: 'invalid' }

  try {
    const updated = await db()
      .update(accounts)
      .set({ firstName: trimmedFirst, lastName: trimmedLast })
      .where(eq(accounts.ownerEmail, normalizeEmail(ownerEmail)))
      .returning({ ownerEmail: accounts.ownerEmail })
    if (updated.length === 0) return { ok: false, reason: 'failed' }

    revalidatePath('/accounts')
    return { ok: true }
  } catch (error) {
    console.error('updateAccountName failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * A global owner's own note about an account — support context, an exception granted, a
 * flag — never shown to the account's reader (`PLAN-account-admin.md`, point 3). An empty
 * string clears it. `isOwner`-gated inside, same reason as every other action here that
 * takes an explicit `ownerEmail`.
 */
export async function updateInternalNote(ownerEmail: string, note: string): Promise<AdminActionResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'not-allowed' }
  }

  const trimmed = note.trim()

  try {
    await db()
      .update(accounts)
      .set({ internalNote: trimmed === '' ? null : trimmed })
      .where(eq(accounts.ownerEmail, normalizeEmail(ownerEmail)))

    revalidatePath('/accounts')
    return { ok: true }
  } catch (error) {
    console.error('updateInternalNote failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Suspends or reactivates an account (`PLAN-account-admin.md`, point 9) — blocks only
 * **new** sign-ins, checked in `auth.ts`'s `signIn` callback via `isAccountSuspended`
 * (`accounts/read.ts`). Does not interrupt a session already issued: JWTs are not
 * revocable server-side in this app, so this stops the next attempt, not one already in
 * progress — see Decision #11, `PLAN-account-admin.md`. "Enter as this account" never
 * checks this column, so a suspended account stays reachable to whoever suspended it.
 *
 * No dedicated reason column: the context is expected to live in the internal note
 * beside it, not a second free-text field for the same kind of fact.
 */
export async function setAccountSuspended(ownerEmail: string, suspended: boolean): Promise<AdminActionResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'not-allowed' }
  }

  try {
    await db()
      .update(accounts)
      .set({ suspendedAt: suspended ? new Date() : null })
      .where(eq(accounts.ownerEmail, normalizeEmail(ownerEmail)))

    revalidatePath('/accounts')
    return { ok: true }
  } catch (error) {
    console.error('setAccountSuspended failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Renames an account's address (`PLAN-account-admin.md`, point 4) — a support request
 * that will come ("I typo'd my email", "switch me to my work address"), which today has
 * no answer short of deleting and recreating the account and losing everything in it.
 *
 * **This function used to be the hardest thing in this file, and v4.7 made it ordinary.**
 * Worth recording what it did, because the difference is the whole argument for numeric
 * keys: the address *was* the key, so renaming meant inserting a second `accounts` row
 * under the new address (spreading the old row to avoid maintaining a column list),
 * repointing six foreign-keyed tables at it by hand, checking that nothing still
 * referenced the old address, and only then deleting the old row — plus clearing
 * `paddleSubscriptionId` first, because for a moment two rows existed and its unique
 * constraint would have refused the copy. A helper (`reownFkTables`) held the six
 * `UPDATE`s and another (`anyRowStillReferences`) existed solely to catch the day
 * somebody added a seventh table and forgot it here. That day had already come:
 * `coupon_redemptions` was never on the list, so a rename orphaned the row recording
 * that this account had used a campaign, and the discount could be taken again.
 *
 * Now the address is a column and the key is an `id` nothing renames, so the account row
 * is **updated in place** and every foreign key keeps pointing at it with nothing to do.
 * Both helpers are gone, along with the second row, the unique-constraint dance and the
 * checklist. In order now: refuse if the new address already has an account, a password
 * or a sign-in row (this **renames**, it never merges two accounts); drop any stale
 * pending registration sitting on the *new* address, so its verification link can never
 * later provision an account onto somebody else's; rename the address; then carry along
 * the tables still keyed by an address rather than by that id.
 *
 * **Those tables are exactly four, and they are the whole list** — `credentials`,
 * `signIns`, `pendingRegistrations`, `passwordResetTokens` — for one reason each: a
 * global owner needs no row in `accounts` at all (v3.1), and `signIns` is written by
 * `signIn` in `auth.ts` *before* `provisionAccount` creates that row, so none of them can
 * carry a foreign key to it. Two of them move here; the other two do not, and that is
 * deliberate. `passwordResetTokens`: an unconsumed token under the old address simply
 * stops matching anything, a silent and harmless dead end. `pendingRegistrations` on the
 * old address likewise resolves to nothing.
 *
 * **What must never be added to this function**: `paddle_events.account_owner_email` and
 * `coupon_redemptions.account_owner_email`. Both used to be here, or looked as though they
 * belonged; both are now *history* — the address the event arrived for, the address the
 * discount was taken under — and each has an `account_id` beside it that a rename does not
 * disturb, which is what the reads use. Updating either would rewrite a record of
 * something that happened, and in the coupon's case would reopen the delete-and-recreate
 * loop its own index exists to close (`db/schema.ts` spells that out).
 */
export async function changeAccountEmail(oldOwnerEmail: string, newEmailRaw: string): Promise<EmailChangeResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'not-allowed' }
  }

  const oldEmail = normalizeEmail(oldOwnerEmail)
  const newEmail = normalizeEmail(newEmailRaw)

  if (!isEmailShape(newEmail)) return { ok: false, reason: 'invalid-email' }
  if (newEmail === oldEmail) return { ok: false, reason: 'same-email' }

  try {
    const oldRows = await db()
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.ownerEmail, oldEmail))
      .limit(1)
    if (oldRows[0] === undefined) return { ok: false, reason: 'not-found' }

    const [existingAccount, existingCredentials, existingSignIn] = await Promise.all([
      db().select({ x: accounts.ownerEmail }).from(accounts).where(eq(accounts.ownerEmail, newEmail)).limit(1),
      db().select({ x: credentials.email }).from(credentials).where(eq(credentials.email, newEmail)).limit(1),
      db().select({ x: signIns.email }).from(signIns).where(eq(signIns.email, newEmail)).limit(1),
    ])
    if (existingAccount.length > 0 || existingCredentials.length > 0 || existingSignIn.length > 0) {
      return { ok: false, reason: 'target-exists' }
    }

    await db().transaction(async (tx) => {
      await tx.delete(pendingRegistrations).where(eq(pendingRegistrations.email, newEmail))

      /* The rename itself. One statement, and everything keyed by this account's `id` —
         songbooks, preferences, comments, broadcasts, redemptions, events — follows it
         without being told, because none of them ever held the address. */
      const renamed = await tx
        .update(accounts)
        .set({ ownerEmail: newEmail })
        .where(eq(accounts.ownerEmail, oldEmail))
        .returning({ id: accounts.id })
      if (renamed.length === 0) {
        throw new Error('changeAccountEmail: account row vanished mid-transaction')
      }

      /* A no-op where that address never had a row, which is the ordinary case for a
         Google-only account with no password of its own. */
      await tx.update(credentials).set({ email: newEmail }).where(eq(credentials.email, oldEmail))
      await tx.update(signIns).set({ email: newEmail }).where(eq(signIns.email, oldEmail))
    })

    revalidatePath('/accounts')
    return { ok: true, newEmail }
  } catch (error) {
    console.error('changeAccountEmail failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Confirms a pending registration by hand, creating the account immediately without the
 * verification link ever being clicked (`PLAN-account-admin.md`, point 11) — for one
 * stuck behind an expired link, a spam filter, or an email that never arrived. Mirrors
 * `verifyEmail`'s transaction (`verify/actions.ts`: insert into `credentials`, delete
 * the pending row, `provisionAccount`, welcome email, Telegram notice) minus the
 * token-hash/expiry checks that only mean something for the self-service link — an
 * operator vouching for the address is what replaces them here. Kept as its own
 * implementation rather than a shared helper with `verifyEmail`: that function's
 * token/expiry check has to stay inside the same transaction as the row it reads, and
 * splitting the two apart would reopen the exact race that transaction exists to close.
 *
 * Does not sign the operator in as the new account — no `issueSessionCookie`/redirect,
 * unlike `verifyEmail`. This only creates the account; "Enter as this account" on its
 * own detail page is how an operator would act as it afterwards.
 *
 * Accepted risk, stated once here because no code path can check it: this creates a
 * real, immediately-usable account — login available at once, with the password chosen
 * at registration, not by the operator — for an address that never proved control of its
 * own inbox. The same kind of consciously-accepted exposure `PLAN-newsletter.md` already
 * took for Google's default newsletter opt-in.
 */
export async function confirmPendingRegistration(email: string): Promise<ConfirmPendingResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'not-allowed' }
  }

  const normalized = normalizeEmail(email)

  let result:
    | { ok: true; firstName: string | null; lastName: string | null; newsletterOptIn: boolean }
    | { ok: false }
  try {
    result = await db().transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(pendingRegistrations)
        .where(eq(pendingRegistrations.email, normalized))
        .limit(1)

      const row = rows[0]
      if (row === undefined) return { ok: false }

      await tx
        .insert(credentials)
        .values({ email: normalized, passwordHash: row.passwordHash })
        .onConflictDoUpdate({
          target: credentials.email,
          set: { passwordHash: row.passwordHash, updatedAt: new Date() },
        })

      await tx.delete(pendingRegistrations).where(eq(pendingRegistrations.email, normalized))

      return { ok: true, firstName: row.firstName, lastName: row.lastName, newsletterOptIn: row.newsletterOptIn }
    })
  } catch (error) {
    console.error('confirmPendingRegistration failed', error)
    return { ok: false, reason: 'failed' }
  }

  if (!result.ok) return { ok: false, reason: 'not-found' }

  const created = await provisionAccount(
    normalized,
    result.firstName !== null && result.lastName !== null
      ? { firstName: result.firstName, lastName: result.lastName }
      : undefined,
    result.newsletterOptIn,
  )

  if (created) {
    await sendEmail({ to: normalized, ...welcomeEmail() })
    await notifyTelegram('registration', registrationNotice())
  }

  revalidatePath('/accounts')
  return { ok: true }
}
