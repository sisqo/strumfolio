/**
 * Database schema.
 *
 * Songs are keyed by their slug rather than a surrogate id. That keeps the two
 * repository implementations interchangeable — a file on disk has a slug and
 * nothing else — and it lets preferences be keyed the same way in both. The
 * trade-off is deliberate: renaming a slug orphans that song's saved
 * transposition, which for filenames that rarely change is a fair price for
 * having one key everywhere.
 */

import { sql } from 'drizzle-orm'
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/**
 * One person's space: their own songbooks, and nobody else's (v3.1) — an email and an
 * account are the same thing, and no third party can be invited into someone else's. The
 * only way in from outside is a global owner (`ALLOWED_EMAILS`), who can open any account
 * with full control; there is nothing in between.
 *
 * Keyed by its owner's email rather than a surrogate id, like every other person-scoped
 * table in this schema (`sign_ins`, `user_prefs`). An account is never renamed and never
 * changes hands: it is identified by who it belongs to, not by a name someone picked.
 *
 * A row here can exist before it owns anything, and must keep working when it does. That
 * is no longer the ordinary case — since 2026-08-30 `provisionAccount` seeds the example
 * songbook into every new account — but it stays reachable in two ordinary ways: an owner
 * who deletes their last songbook, and an account whose seeding failed (that write is
 * deliberately allowed to fail without taking the account row with it). Deriving "the set
 * of accounts" from `songbooks` instead would leave both with no existence at all, and
 * would give the admin's "every account" screen nothing to list them under.
 */
export const accounts = pgTable(
  'accounts',
  {
    ownerEmail: text('owner_email').primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * What this account has bought.
     *
     * `text` with a narrowing reader (`readPlan`, `lib/plans/`) rather than a pgEnum — the
     * same choice every other constrained column in this schema makes (`instrument`,
     * `notation`, `chordDisplay`; there is not one pgEnum and not one CHECK across 24
     * migrations). A new plan name is then a deploy rather than an `ALTER TYPE` on a live
     * database, and a value written by a newer version of the app degrades to `free`
     * instead of failing the read.
     *
     * `lifetime` is stored as itself and mapped to premium's limits by the code, not
     * written as `premium` with a null expiry: what somebody bought and what they get are
     * two different facts, and only the first one belongs in a column.
     *
     * Defaulted to `'free'` rather than nullable so every account that already exists
     * answers the question the moment this column is born. The consequence to know: the
     * day `SONGBOOK_PLANS` is turned on, every one of those accounts is on `free`, and one
     * already over free's caps freezes to deletions-only until its row says otherwise.
     * Giving the installation's own owner their `lifetime` row is a hand-run `UPDATE`
     * after the migration, not something this schema can express — who the global owners
     * are lives in `ALLOWED_EMAILS`, an environment variable, not in any table.
     */
    plan: text('plan').notNull().default('free'),
    /**
     * `active` | `grace` | `expired`, written by the Paddle webhook and by nothing else.
     * `grace` still gets the plan's entitlements: a failing card is not a lapsed customer.
     *
     * Named `plan_status` and not `status`, because a bare `status` on a table about a
     * person reads as "is this account active" — which this column never means, and which
     * nothing in this app has ever stored. Defaulted to `active`, the value that makes a
     * `free` row a fixpoint: free, active, no expiry.
     */
    planStatus: text('plan_status').notNull().default('active'),
    /**
     * When the paid period ends. **Null means never** — it is what `free` and `lifetime`
     * both carry — and reading a null the other way round would expire every account in
     * the installation on the first deploy. `entitlementsFor` takes `now` as a parameter
     * rather than reading the clock precisely so that this comparison is testable.
     */
    planExpiresAt: timestamp('plan_expires_at', { withTimezone: true }),
    /**
     * Paddle's own two ids for this account, nullable because almost every account has
     * never paid anything.
     *
     * Unique on the subscription, not on the customer: one subscription belongs to exactly
     * one account, while the same Paddle customer can legitimately buy for two addresses
     * (a second account for a partner, for a child) — a unique customer id would refuse
     * the second purchase's webhook and there would be nothing wrong with it. Postgres
     * treats nulls as distinct, so the constraint costs the unpaid accounts nothing.
     */
    paddleCustomerId: text('paddle_customer_id'),
    paddleSubscriptionId: text('paddle_subscription_id'),
    /**
     * A gift, in its own columns rather than in `plan`/`plan_expires_at`.
     *
     * That separation is the entire point of these five columns. A renewal webhook
     * rewrites the subscription columns; a grant living there would be erased by the next
     * `subscription.updated`, so somebody given a year would lose it to a *successful*
     * payment — a silent one, with nothing in the row left to say it ever happened.
     * `entitlementsFor` reads both sides and takes whichever is more generous, so a grant
     * survives every write Paddle makes, and outlives a downgrade.
     *
     * `grantedBy`/`grantedAt`/`grantedNote` are the audit trail, not decoration: a gift
     * with no giver and no reason recorded is indistinguishable from a bug in the webhook.
     *
     * `grantedBy`/`grantedAt` record the **last decision about the grant** — the giving or the
     * taking away, not only the giving. `setGrant` (`accounts/actions.ts`) writes both on the
     * clear path too, nulling only `grantedPlan`/`grantedUntil`/`grantedNote`, because the
     * alternative erases the only record that a gift ever existed: this row is the whole audit,
     * there is no separate table. So a row with `grantedBy` set and `grantedPlan` null is not a
     * partial write — it is a withdrawn gift, and `/accounts` prints it as one. `liveGrant` keys
     * on `grantedPlan` alone, so the gift is genuinely gone either way.
     */
    grantedPlan: text('granted_plan'),
    grantedUntil: timestamp('granted_until', { withTimezone: true }),
    grantedBy: text('granted_by'),
    grantedAt: timestamp('granted_at', { withTimezone: true }),
    grantedNote: text('granted_note'),
    /**
     * The Google Ads click id the registration arrived with, captured once and never
     * updated. Marketing data, not a subscription fact — nothing in `entitlementsFor` may
     * read it, and null is the ordinary case: everyone who came from anywhere else.
     */
    gclid: text('gclid'),
    /**
     * The most devices that have ever followed one of this account's Strum Together
     * broadcasts at the same time — the high-water mark, never today's number.
     *
     * Here beside `gclid` rather than with the plan columns above, because it is the same
     * kind of fact: a measurement of a customer, not a term of their subscription. Nothing
     * in `entitlementsFor` may read it, and no gate anywhere consults it. It exists to
     * answer «who would have paid for a bigger plan» — which is why it is collected from
     * the start and **with the plans unenforced too**, where it is free to climb above the
     * cap the account's plan would have imposed. That headroom is the whole signal, and it
     * is the one number in this feature that cannot be recovered retroactively: a peak
     * nobody wrote down at the time is gone.
     *
     * Headroom, though, not an open number. The write is `seatDevice`'s, on a public
     * unauthenticated join, so a count above the most generous plan's cap is discarded rather
     * than recorded — see `PEAK_CEILING`. Above that line the number stops being «this
     * customer outgrew their plan» and becomes «somebody looped a request», and one anonymous
     * caller must not get to write the one column that cannot be repaired.
     *
     * Written on the row of `sing_along_sessions.broadcast_account_email`, never of the
     * broadcast's `owner_email`. The two differ when a global owner broadcasts somebody
     * else's account, and the customer being measured is the one whose shelf the guests are
     * reading. Written on a join and nowhere else, as one conditional UPDATE — a heartbeat
     * cannot raise a live count and a lapse cannot either, so a join is provably the only
     * moment a maximum can rise.
     *
     * `notNull().default(0)`, never nullable: 0 is true of every account the instant this
     * column is born, so there is no "not measured yet" state to distinguish from "never had
     * a follower". The feature prefix is deliberate too — a bare `peak_devices` on a table
     * about people reads as «devices signed in», which this never means.
     */
    singAlongPeakDevices: integer('sing_along_peak_devices').notNull().default(0),
    /**
     * What the subscription becomes once `planExpiresAt` passes — a downgrade to another
     * paid plan, or a cancellation, stored as `'free'` rather than as a second boolean next
     * to it (see `resolveSubscription` in `plans/entitlements.ts`). Null means nothing is
     * scheduled, which is every row's state until a reader chooses to change or cancel a
     * live paid plan through the mock checkout.
     *
     * Read with `readPendingPlan` (`plans/types.ts`), never with `readPlan`: `readPlan`
     * degrades an unrecognised value to `'free'`, and in this column `'free'` means "cancel
     * at period end" — degrading a corrupt or newer-deploy value here would silently
     * schedule a revocation instead of the harmless no-op a `plan` column gets from the same
     * degradation. The generous direction, matching every other fail-open rule this feature
     * takes.
     *
     * Deliberately kept apart from `grantedPlan`/`grantedUntil`, for the same reason those
     * are apart from `plan`/`planExpiresAt`: a scheduled downgrade is a fact about the
     * subscription, resolved by `liveSubscription` alone, and must never be read as if it
     * were a gift or blended with one.
     */
    pendingPlan: text('pending_plan'),
    /**
     * The billing period `pendingPlan` will renew on once it takes effect. Meaningless, and
     * left null, whenever `pendingPlan` is null or `'free'` — a cancellation has no next
     * cycle to carry.
     */
    pendingCycle: text('pending_cycle'),
    /**
     * When this account first completed the mandatory plan-choice step (PLAN.md, v3.7)
     * — Free or paid, either counts. Null means "not yet chosen", the same idiom as
     * `pendingPlan`/`grantedPlan`: a column nobody has written to yet already means the
     * right thing, with no separate boolean needed.
     *
     * Backfilled to `createdAt` for every account that existed before this column did
     * (migration 0027) — the gate only applies to accounts created afterwards, and every
     * pre-existing account counts as already activated from the day it was actually created,
     * not from the day this column was added.
     */
    planChosenAt: timestamp('plan_chosen_at', { withTimezone: true }),
    /**
     * What the printed booklet's footer says, in place of the fixed «Printed with
     * Strumfolio» line — only ever read when the account's *current* plan tier is
     * `custom` (`bookletCustomFooterAllowed`, `plans/entitlements.ts`); a downgrade
     * leaves the row untouched but unreachable, the same way `allowedInstrument`
     * (`prefs/actions.ts`) leaves a stored ukulele choice in place but unread.
     * Null, not defaulted to empty, since almost no row will ever answer this and a
     * null prints exactly as much as an empty string would.
     */
    bookletFooter: text('booklet_footer'),
  },
  (table) => [unique('accounts_paddle_subscription_id').on(table.paddleSubscriptionId)],
)

/**
 * A songbook is a container: every song belongs to exactly one.
 *
 * The slug is generated once from the initial name and never changes — renaming
 * touches `name` only. That is what makes a rename free: no foreign key to
 * update, no URL that moves, no precache entry to regenerate.
 *
 * `accountOwnerEmail` says which account this songbook belongs to (v3.0), but the slug
 * stays the primary key, globally unique across every account rather than merely within
 * one — see this file's own top comment on why a song's slug is also its identity, which
 * did not stop being true when songs became per-account. `/songs/[slug]` and
 * `/songbooks/[slug]` are generated **statically at build time**: `generateStaticParams`
 * enumerates every slug once, with no request and no signed-in reader to resolve "which
 * account" for. Two accounts minting a same-named copy of one songbook do not
 * get to share a slug; `uniqueSlug` gives the copy a fresh one, the same tool
 * `createSongbook` already uses for a name that collides with an existing songbook.
 * Cross-account privacy is a permission check at read time, layered on top of a route
 * that already resolves to exactly one songbook — not a second identity for the same one.
 */
export const songbooks = pgTable(
  'songbooks',
  {
    slug: text('slug').primaryKey(),
    accountOwnerEmail: text('account_owner_email')
      .notNull()
      .references(() => accounts.ownerEmail),
    name: text('name').notNull(),
    /**
     * The one songbook, anywhere in the installation, kept as the example to copy from.
     * Not what a new account is seeded with, and never has been since v3.3: that is the
     * fixed public-domain set in `lib/songbooks/sample.ts` (see `provisionAccount`), which
     * does not read this flag. What remains of it is a marked source for `copySongbook`.
     * A partial unique index rather than application code is what keeps a second
     * flagged row from ever existing: moving the flag to another songbook is a plain
     * `UPDATE` on both rows, not a deploy, and the database itself refuses to leave two
     * set at once even if that update is ever done out of order.
     */
    isExampleTemplate: boolean('is_example_template').notNull().default(false),
    /**
     * Where this songbook sits among the reader's own, on the one screen that lists
     * them all. Renumbered 1..N across the account on every arrangement, like a
     * section's within its songbook. The migration that adds this column backfills
     * every existing row with its alphabetical rank before making it required, so
     * nothing here is ever unset.
     */
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('songbooks_one_example_template')
      .on(table.isExampleTemplate)
      .where(sql`${table.isExampleTemplate}`),
    /**
     * Postgres does not index the referencing side of a foreign key, and until now nothing
     * needed it to: every read here was for one account, on a table with a handful of rows
     * per person. The entitlement counts change that — every write now asks "how many
     * songbooks does this account have", and joins through this column to ask the same of
     * its songs. The first plain (non-unique) index in this schema, added for that.
     */
    index('songbooks_account_owner_email_idx').on(table.accountOwnerEmail),
  ],
)

/**
 * A songbook is divided into sections, and every song is in exactly one of them.
 *
 * A serial id, not a slug: a section has no route of its own, so it needs no readable
 * key — and an id that does not derive from the name is what keeps renaming free
 * without having to freeze anything.
 *
 * Two unique constraints, each doing a different job. `(songbook_slug, name)` says
 * two sections of the same songbook cannot share a name: that is not two things, it
 * is a typo or a double tap — and it lets the import address a section *by name*
 * without ever creating a twin. `(id, songbook_slug)` exists only to be referenced:
 * see the composite key on `songs`.
 *
 * No `accountOwnerEmail` of its own (v3.0): `songbookSlug` is still globally unique (see
 * `songbooks`' own comment), so which account a section belongs to is always one join
 * away and never needs to be written here to agree with anything.
 */
export const sections = pgTable(
  'sections',
  {
    id: serial('id').primaryKey(),
    songbookSlug: text('songbook_slug')
      .notNull()
      .references(() => songbooks.slug, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    /** Renumbered 1..N across the songbook on every arrangement, like the songs. */
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('sections_songbook_name').on(table.songbookSlug, table.name),
    unique('sections_id_songbook').on(table.id, table.songbookSlug),
  ],
)

/**
 * No `accountOwnerEmail` of its own either, for the same reason as `sections`: a song's
 * `songbookSlug` is globally unique and always resolves to one songbook, which is always
 * one account's. A query scoped to "the current account's songs" joins to `songbooks`
 * for it; that join was already free to add next to the one this table's own reads
 * already do against `sections`.
 */
export const songs = pgTable(
  'songs',
  {
    slug: text('slug').primaryKey(),
    title: text('title').notNull(),
    artist: text('artist'),
    tags: text('tags').array().notNull().default([]),
    /**
     * Three free-form links a song can carry — a video, a tab, an official page,
     * whatever earns a place — kept as three named columns rather than one array so
     * a gap between two filled ones (the second empty, the third not) stays a fact
     * about *which* slot is empty, not a hole a list would collapse or reorder away.
     */
    link1: text('link1'),
    link2: text('link2'),
    link3: text('link3'),
    body: text('body').notNull(),
    /**
     * `restrict` puts the "refuse to delete a non-empty songbook" rule in the
     * database rather than only in the UI, so no code path can orphan a song.
     *
     * Not null since v2.3: it was nullable so the column could be added to a
     * populated table, and in the whole life of the table it never held a null —
     * every way a song can arrive gives it a songbook. With the section
     * mandatory it is also derivable from `section_id`, so a null would be a state
     * that no longer means anything.
     */
    songbookSlug: text('songbook_slug')
      .notNull()
      .references(() => songbooks.slug, { onDelete: 'restrict' }),
    /**
     * Which section of that songbook holds the song. Every song has one.
     *
     * It was nullable for exactly one deploy, which is what made the migration
     * additive: the code then in production knew nothing about this column, so it
     * could not fill it, and a song imported between the migration and the deploy
     * would have failed its insert. The contracting migration repeated the backfill —
     * for anything imported in that window — and made it `not null`, which is where
     * «one and only one section» stops being a rule in the code and becomes a fact
     * about the table.
     */
    sectionId: integer('section_id').notNull(),
    /**
     * Where the song sits inside its **section**, when someone has said.
     *
     * Null means nobody has: the song then sorts by title, after the ones that were
     * placed by hand — which is what Postgres does with nulls in an ascending sort
     * anyway, so the fallback needs no code. That makes this column additive in the
     * strongest sense: every existing row is null, so the order stays alphabetical
     * until the first drag, and a song imported into an ordered section joins at
     * the end rather than jumping into the middle.
     *
     * Renumbered 1..N within each section on every arrangement, so the values never
     * drift into gaps or ties that would leave two songs' order undefined.
     */
    position: integer('position'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * The songbook of a song is written twice — here, and on its section — and this
     * is what makes the two copies impossible to disagree: a song cannot point at a
     * section of another songbook. The alternative was trusting the code, and the
     * code is where mistakes live.
     *
     * `on update cascade` is not decoration: it is the only thing that lets a section
     * move to another songbook. Measured on a scratch schema — with `no action` the
     * update is refused whichever row goes first, because the constraint is checked
     * per statement, not per transaction. With the cascade, `sections.songbook_slug`
     * is updated and the songs follow. `on delete` stays `restrict`: a section holding
     * songs may not be deleted.
     *
     * While `section_id` is null the pair is not checked at all (Postgres `MATCH
     * SIMPLE`), which is exactly what the additive phase of the migration needs.
     */
    foreignKey({
      columns: [table.sectionId, table.songbookSlug],
      foreignColumns: [sections.id, sections.songbookSlug],
      name: 'songs_section_songbook_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /**
     * The other half of the entitlement count: songs are counted per account by joining to
     * `songbooks`, and this is the side of that join Postgres would otherwise answer by
     * scanning every song in the installation.
     */
    index('songs_songbook_slug_idx').on(table.songbookSlug),
  ],
)

/**
 * How somebody proves they are the address they claim, when it is not Google saying so.
 *
 * A table of its own rather than a column on `accounts`, because not everyone who can
 * sign in with a password owns an account: a global owner needs no row in `accounts` at
 * all to get in (v3.1), so a column there could never hold their hash. A row here grants
 * nothing on its own — `roleOf` never consults this table — it only answers *how* someone
 * proves they are the address they claim, never *whether* they may be here.
 *
 * The hash carries its own parameters (see `lib/auth/password.ts`), so this column is
 * opaque text on purpose: nothing but that module should read its shape.
 */
export const credentials = pgTable('credentials', {
  email: text('email').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * A registration by email and password, before it is proven real (v3.2).
 *
 * Deliberately not `accounts`/`credentials`: the whole point is that nothing durable
 * exists yet — no account at all — until the link in the verification email
 * is clicked. Same principle this project already applies elsewhere ("nothing exists
 * until there is a real reason for it"), just pointed the other way: here the reason is
 * proving the address is real, not proving an account is used.
 *
 * Keyed by email, not by the token, for the same reason `accounts` is keyed by owner:
 * one attempt in flight per address, not one row per link ever sent. Registering again
 * while a row is still pending overwrites it (`onConflictDoUpdate`) rather than adding a
 * second one — a fresh token and a resent email is how "I never got it" is handled,
 * with no separate resend path to keep in sync.
 */
export const pendingRegistrations = pgTable('pending_registrations', {
  email: text('email').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  verificationTokenHash: text('verification_token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * A password-reset link waiting to be used (v3.2).
 *
 * Keyed by email, like `pendingRegistrations`: at most one live reset per address, so
 * asking again simply overwrites the row with a new token and a new expiry instead of
 * leaving an older, still-valid link usable alongside it.
 */
export const passwordResetTokens = pgTable('password_reset_tokens', {
  email: text('email').primaryKey(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * A fixed window rate limit, shared by every surface that needs one (v3.2) — no foreign
 * key to anything, because `key` is not always an email: it can be an IP address, or an
 * action name folded into the key, depending on what the caller is throttling.
 *
 * Keyed by that string directly rather than by a surrogate id, in the same spirit as
 * every other row in this schema that names the thing it is about: there is exactly one
 * live window per key, and a new one simply replaces the old rather than accumulating.
 */
export const rateLimitHits = pgTable('rate_limit_hits', {
  key: text('key').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  count: integer('count').notNull().default(1),
})

/**
 * Global preferences: one row per person.
 *
 * `userEmail` is foreign-keyed to `accounts.ownerEmail` with `onDelete: 'cascade'`
 * (v3.5) — unlike `sign_ins`, a preference has no reason to outlive the account it
 * belongs to, and before this it did not: an account deleted through the app left
 * this row behind for good, since nothing else in the schema pointed at it to clean
 * it up. Found as stray rows in production, keyed by addresses `accounts` no longer
 * had — see `userSongPrefs.userEmail`'s own comment for the other half of the gap.
 */
export const userPrefs = pgTable('user_prefs', {
  userEmail: text('user_email')
    .primaryKey()
    .references(() => accounts.ownerEmail, { onDelete: 'cascade' }),
  zoomStep: integer('zoom_step').notNull().default(2),
  notation: text('notation').notNull().default('int'),
  /**
   * Which instrument the chord diagrams are drawn for.
   *
   * A preference about the reader, like the notation, so it belongs here rather than
   * in local storage next to the theme: the same person picks up the same instrument
   * on the phone and on the tablet. Defaulted rather than nullable so every existing
   * row already answers the question.
   */
  instrument: text('instrument').notNull().default('guitar'),
  /**
   * How much of a chord the sheet draws — `name`, `shape`, `diagrams` or `fingerings`
   * (`ChordDisplay`). Defaulted rather than nullable, same reasoning as `instrument`
   * right above: every existing row already answers the question, with the answer that
   * changes nothing for a reader who has never touched this preference.
   *
   * It grew from two values to four without a migration, which is the payoff of the
   * plain-`text`-no-CHECK convention this schema follows throughout: the column already
   * accepted any string, so only `readChordDisplay` had to learn the new ones.
   */
  chordDisplay: text('chord_display').notNull().default('name'),
  /**
   * Whether chords are written with sharps or with flats — `sharp` or `flat`.
   *
   * Defaulted to `sharp` and not nullable, so there is no "unset" state for the reading
   * screen to draw: the control is two segments with one of them always lit, and a third
   * state would be a thing it has no way to show. See `readChord` for what it does.
   */
  accidentals: text('accidentals').notNull().default('sharp'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Per-song preferences: the key you sing it in, and the speed you read it at.
 *
 * `songSlug` cascading on the *song's* deletion only ever cleans up half of this
 * table for a deleted account: it clears everyone's preferences on the songs that
 * account owned, but not that account's own preferences on songs it never owned —
 * a global owner switched into another account, say, who moved a capo there before
 * ever switching back. `userEmail` now cascades on `accounts.ownerEmail` too (v3.5)
 * for exactly that other half — see `userPrefs.userEmail`'s own comment for how the
 * gap this closes was found.
 */
export const userSongPrefs = pgTable(
  'user_song_prefs',
  {
    userEmail: text('user_email')
      .notNull()
      .references(() => accounts.ownerEmail, { onDelete: 'cascade' }),
    songSlug: text('song_slug')
      .notNull()
      .references(() => songs.slug, { onDelete: 'cascade' }),
    semitones: integer('semitones').notNull().default(0),
    scrollSpeed: integer('scroll_speed').notNull().default(3),
    /**
     * The fret the capo is on, 0 for none.
     *
     * Not the same thing as `semitones`, which is why it is a second column and not a
     * clever reuse of the first: transposing moves the sound, a capo moves the hand and
     * leaves the sound where it was. Defaulted rather than nullable, because every row
     * that exists already answers this — nobody had a capo on.
     */
    capo: integer('capo').notNull().default(0),
    /**
     * Which shape to draw instead of the default, for chords of this song a reader has
     * picked an alternative for. Keyed `${instrument}:${root}:${family}`, valued with the
     * chosen shape's own fingering text (`'320003'`) — see `SongPrefs.chordShapes` in
     * `lib/prefs/types.ts` for why a fingering rather than an index into the candidate
     * list. `'{}'` rather than nullable, same reasoning as `capo` above: every row that
     * exists already answers this, with nothing chosen.
     */
    chordShapes: jsonb('chord_shapes').notNull().default({}),
    /**
     * When this reader last opened this song, for the home screen's "Recently
     * played" (v3.5). Null, not defaulted to now: a row can exist for reasons that
     * have nothing to do with having opened the song — a transposition saved once,
     * long since forgotten — and those must not count as recently played the moment
     * this column is born under them.
     */
    lastOpenedAt: timestamp('last_opened_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userEmail, table.songSlug] })],
)

/**
 * An anchored comment: a private note pinned to one point of one song (v4.0).
 *
 * A second table rather than more columns on `userSongPrefs`, for two reasons that both
 * had to hold. That row is one set of scalars per (reader, song) and a list does not fit
 * in it; and its write path, `prefsQueue`, keeps at most one pending entry per song with
 * last-write-wins — right for a capo tapped five times, destructive for two notes edited
 * one after the other.
 *
 * `id` is `text` and minted by the *client*, not a `serial` or a database default. That is
 * what lets a note written with no signal have a stable identity before any server has
 * seen it, which the offline outbox keys by; a server-assigned id would leave every queued
 * note anonymous until it drained.
 *
 * Not gated by any plan, deliberately, and the same reasoning `saveSongPrefs` gives for
 * checking nothing: a note about how this one reader reads, on their own screen, is not a
 * modification of anything shared.
 */
export const userSongComments = pgTable(
  'user_song_comments',
  {
    id: text('id').primaryKey(),
    userEmail: text('user_email')
      .notNull()
      .references(() => accounts.ownerEmail, { onDelete: 'cascade' }),
    songSlug: text('song_slug')
      .notNull()
      .references(() => songs.slug, { onDelete: 'cascade' }),
    /**
     * Index into `SongDocument.blocks`, and the offset in that block's text.
     *
     * Nullable *together*: both null is the orphan state, a note whose text was rewritten
     * or deleted under it (`lib/comments/reanchor.ts`). Nullable rather than a separate
     * `orphaned` boolean so an orphan that still carries half an anchor cannot be
     * represented at all.
     */
    blockIndex: integer('block_index'),
    charOffset: integer('char_offset'),
    /** `lyric` or `chord` — whether the note is about the syllable or the shape above it. */
    target: text('target').notNull().default('lyric'),
    /**
     * The anchored text as it read when the note was written, for the rail's «on grace».
     *
     * Denormalized on purpose: recomputing it from the document works right up until the
     * moment it matters most, since an orphan has no anchor left to recompute from and
     * this is then the only surviving trace of what the note was about.
     */
    anchorLabel: text('anchor_label').notNull().default(''),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('user_song_comments_song_idx').on(table.userEmail, table.songSlug)],
)

/**
 * A "Strum Together" broadcast: a token a guest can use to read the whole repertoire
 * with no account, and the one song — and its key — its owner is currently showing
 * everyone who followed that link.
 *
 * Keyed by the owner, not by the token: one active broadcast per person, not one row
 * per link ever created. Starting a new one overwrites this row, so an old, forgotten
 * link simply stops resolving to anything current instead of piling up rows nobody is
 * watching. The token still needs its own uniqueness — two people's links must never
 * collide — hence the separate constraint rather than making it the key.
 *
 * `lastActiveAt` moves only when the owner does something — starting the broadcast, or
 * playing a song — never when a guest merely reads this row. A guest left polling
 * cannot keep a session alive on their own: once its owner has stopped, it expires on
 * schedule regardless of who is still watching.
 *
 * `broadcastAccountEmail` says *whose account's* repertoire is on show (v3.0) — almost
 * always the same as `ownerEmail`, but not necessarily: a global owner who has switched
 * into someone else's account may broadcast that repertoire instead of their own (v3.1 —
 * nobody but a global owner can, now that an account has no collaborators to switch in
 * as). Kept apart from `ownerEmail` because the two answer different questions — who is
 * in control of this broadcast, and which shelf of songs it is reading from — and the
 * guest-facing reads (`guestReads.ts`) only ever need the second one.
 */
/**
 * How often, and when last, each address has actually gotten in — through Google or a
 * password makes no difference; both reach the same `signIn` callback in `auth.ts`, and
 * this is written from there, once admission is already decided. Never itself a gate:
 * a row here grants nothing, and a missing row simply means "not yet", not "not allowed".
 *
 * Keyed by email like everything else about a person, but never joined to `accounts`: a
 * global owner signs in too, and this is written from `signIn` in `auth.ts` *before*
 * `provisionAccount` runs on the same address, so the row this would join to may not
 * exist yet even on the sign-in that writes it. A row here is as true of a global owner
 * as of an ordinary account owner, which is exactly why it cannot depend on either having
 * a row anywhere else.
 */
export const signIns = pgTable('sign_ins', {
  email: text('email').primaryKey(),
  signInCount: integer('sign_in_count').notNull().default(0),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }).notNull().defaultNow(),
})

export const singAlongSessions = pgTable(
  'sing_along_sessions',
  {
    ownerEmail: text('owner_email').primaryKey(),
    token: text('token').notNull(),
    broadcastAccountEmail: text('broadcast_account_email')
      .notNull()
      .references(() => accounts.ownerEmail),
    /** Cleared, not left dangling, if the song itself is ever deleted mid-broadcast. */
    currentSongSlug: text('current_song_slug').references(() => songs.slug, {
      onDelete: 'set null',
    }),
    currentSemitones: integer('current_semitones').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('sing_along_sessions_token').on(table.token)],
)

/**
 * One device following one Strum Together broadcast: the row a plan's device cap counts.
 *
 * A row here is a **following session**, and the cookie in `device_id` is an **identity**.
 * Keeping those two apart is what the composite key is for: the same browser following two
 * different broadcasts is two rows, and the row left behind on the one it walked away from
 * simply lapses within `DEVICE_STALE_SECONDS` — the same rule, and the same visible
 * behaviour, as a closed tab. The rejected alternative was `device_id` alone as the key with
 * the token rebound on a move, which frees the old broadcast's slot instantly but flaps: one
 * browser with two broadcasts open in two tabs would see a different token on every poll,
 * turning every poll into a cap check plus a write — roughly thirty writes a minute for that
 * one browser, which is precisely what the heartbeat throttle exists to prevent. Same
 * composite idiom as `user_song_prefs`.
 *
 * The foreign key is on the **token**, not on the session's `owner_email` primary key, and it
 * is `ON DELETE cascade ON UPDATE no action`. The cascade does all of the work: `startBroadcast`
 * restarts by deleting the session row and inserting a fresh one, `stopBroadcast` deletes it,
 * and `removeAccountAndContent` deletes it too — so «a new link releases the old link's
 * followers», «stop clears the audience» and account deletion are one statement each, with
 * nothing about devices written anywhere. Carrying an audience across a restart is the
 * behaviour that had to be prevented: those devices are polling the old token, so they are
 * gone, yet their rows would sit on the new broadcast holding slots for up to two minutes, and
 * on `standard` (cap 1) the leader would share a new link and the friend it was made for could
 * not join.
 *
 * `no action` rather than `cascade` on UPDATE states the other half: nothing may rotate a token
 * in place. Nothing does, and `startBroadcast` deletes and inserts precisely so that it does
 * not — a token UPDATE with even one follower attached raises 23503 and takes the leader's
 * whole restart down with it, mid-performance, reported to them as «Couldn't start. Try again.»
 * So this clause guards a future edit rather than today's code, and `cascade` here would let
 * that edit look like it worked while quietly seating ghosts on the fresh link.
 *
 * `joined_at`, not `created_at`, and the name is load-bearing: a join rewrites it, because a
 * row that lapsed and came back has genuinely joined again. It means «since when on this
 * broadcast», with nothing ambiguous about a slot that was released and re-taken.
 *
 * **No secondary index, and that is the design.** A `(token, last_seen_at)` index looks
 * obviously right; adding it would be a mistake, for three reasons a reader cannot guess.
 * The cascade from `sing_along_sessions` finds these rows by `token`, which is already the
 * leading column of the primary key. The count and the sweep are range scans over one
 * broadcast's rows — a few hundred at premium, a handful in practice — where an index on the
 * timestamp saves nothing measurable. And the decisive one: an index on `last_seen_at` makes
 * every heartbeat a non-HOT update, adding an index tuple, WAL and vacuum pressure to the
 * single highest-frequency write in the whole feature, about two a minute per device, forever.
 */
export const singAlongDevices = pgTable(
  'sing_along_devices',
  {
    token: text('token')
      .notNull()
      .references(() => singAlongSessions.token, { onDelete: 'cascade' }),
    /**
     * The opaque id from the guest's `songbook-device` cookie, minted by the server in
     * `middleware.ts` and never accepted from a request body: a count a guest can name is
     * whatever a guest says it is.
     */
    deviceId: text('device_id').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Refreshed by a throttled write inside the poll the guest already makes, and by nothing
     * else. It must never be updated in the same statement as
     * `sing_along_sessions.last_active_at`: that column moves only when the *owner* acts, so
     * that a guest left polling cannot keep a broadcast alive, and a heartbeat that nudged it
     * would make any watched broadcast immortal — ending exactly the guarantee `IDLE_HOURS`
     * exists to give.
     */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.token, table.deviceId] })],
)

/**
 * Every webhook Paddle has ever sent, exactly as it arrived.
 *
 * `eventId` is the primary key, and that *is* the idempotency mechanism: the handler
 * inserts the event and applies it in **one transaction**, `onConflictDoNothing`, and an
 * insert that returns zero rows means "already processed, stop". No `processedAt` column,
 * because a separate marker would create the one state this design has no answer for —
 * recorded but not applied — which sharing the transaction rules out instead. Paddle
 * retries any delivery it did not see a 200 for, so none of this is hypothetical.
 *
 * `payload` is `text`, not `jsonb`: Paddle signs an HMAC over the exact request body, so
 * the raw bytes are the only version of it that can ever be re-verified. `jsonb` would
 * reorder keys and normalise numbers and quietly make that impossible, in exchange for
 * queries this table does not need to serve.
 *
 * `accountOwnerEmail` is nullable and has **no foreign key**, deliberately. An event can
 * arrive for an address that owns no account yet — a checkout completed before the
 * verification link is clicked — and `deleteAccount` has to stay possible: a foreign key
 * would either cascade, destroying the record of what somebody actually paid, or restrict,
 * leaving paid accounts undeletable. Append-only is discipline in the handler, not
 * something this table enforces, consistent with a schema that has no triggers and no
 * CHECK constraints anywhere in it.
 */
export const paddleEvents = pgTable('paddle_events', {
  eventId: text('event_id').primaryKey(),
  eventType: text('event_type').notNull(),
  /**
   * Paddle's own timestamp for the event, as opposed to `receivedAt`, which is ours. The
   * two differ on a retry, and the difference is the only way to tell a late delivery from
   * a late purchase. Nullable so that a malformed or newly-shaped body is still *recorded*
   * — the ledger's job is to have the event, not to have understood it.
   */
  occurredAt: timestamp('occurred_at', { withTimezone: true }),
  accountOwnerEmail: text('account_owner_email'),
  /** Denormalised out of the payload so a subscription's history is a query, not a parse. */
  paddleSubscriptionId: text('paddle_subscription_id'),
  payload: text('payload').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Installation-wide settings an owner changes from `/app-settings` — today the four Telegram
 * notification switches, and whatever joins them later.
 *
 * **Key/value rather than a column per setting**, which is a departure from `user_prefs` right
 * above and a deliberate one: that table holds a fixed, small set of questions about a reader,
 * while this one is expected to grow on a different clock — the whole point of the screen is
 * that a knob can be turned without a deploy, and a column per knob puts a migration back in
 * front of every new one. The cost is that the value is `text` and the meaning lives in code:
 * `settings/types.ts` owns the vocabulary (`'on'`/`'off'`), the defaults and the parser, and
 * `readBooleanSetting` is what keeps an unrecognised cell from meaning `false`.
 *
 * **Nothing in here may be a secret.** The tokens and API keys stay in the environment, where
 * no code path can read them back out to a screen — see `/app-settings`' own comment. What
 * lives here is policy: which events notify, not what to notify through.
 *
 * There is no row for a setting nobody has touched, and that is the normal state rather than
 * an incomplete one: absent means "whatever the code default says", which is what makes this
 * whole table optional — the app behaves exactly as it did before the migration that creates
 * it, and exactly the same again if it ever becomes unreadable.
 *
 * `updatedBy` has **no foreign key**, for the reason `paddle_events.accountOwnerEmail` has
 * none: the record of who last turned something off should survive that person's account being
 * deleted, and a foreign key would either cascade it away or make the account undeletable.
 * It is the last writer only — this table is not a ledger, and there is no history here.
 */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by'),
})
