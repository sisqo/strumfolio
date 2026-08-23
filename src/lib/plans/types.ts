/**
 * The vocabulary of the plans: what can be stored, what each plan grants, and what a
 * refusal is called. Nothing here decides anything — the one decision lives in
 * `entitlements.ts`, and the environment is read only in `resolve.ts`.
 *
 * Five stored values for four sets of limits. `lifetime` is stored as itself and mapped
 * to premium's row rather than written as `premium` with no expiry, because what somebody
 * bought and what they get are two different facts: a refund, a re-price or a "who is
 * still on the old lifetime deal" question all need the first one, and a row that has
 * already been flattened into the second cannot answer any of them.
 *
 * `text` in the column with a narrowing reader here, rather than a pgEnum: there is not
 * one pgEnum and not one CHECK constraint across this schema's 24 migrations. A new plan
 * name is then a deploy instead of an `ALTER TYPE` on a live database, and — the part that
 * matters during a deploy, when both versions are serving — a value written by the newer
 * one degrades gracefully when read by the older instead of throwing. Same idiom as
 * `readInstrument`/`readChordDisplay` in `prefs/types.ts`.
 *
 * Unlimited is `null`, never a large number. A sentinel like 999_999 reads as a real cap
 * in every listing, every log line and every comparison — "897 of 999999 songs" is a
 * progress bar nobody meant to draw — and the day somebody imports a million-song archive
 * it silently stops being a lie and starts being a wall. Premium's `devices: 100` is the
 * opposite case and is deliberately a number: it is a real technical cap that the pricing
 * page merely calls unlimited.
 */

export type Plan = 'free' | 'standard' | 'plus' | 'premium' | 'lifetime'

export const PLAN_VALUES = ['free', 'standard', 'plus', 'premium', 'lifetime'] as const satisfies readonly Plan[]

/**
 * Reads a plan from a value that came out of the database.
 *
 * Anything unrecognised means `free` — the column's own default, so this agrees with what
 * the database writes for a row nobody has touched. The plan column is written from a
 * closed set by our own webhook, so a string this cannot interpret is either corruption or
 * a newer deploy, and granting paid limits on a string we cannot read is granting them on
 * no evidence at all. Note the deliberate asymmetry with `readPlanStatus`, which falls the
 * other way: an unreadable plan must never *grant*, an unreadable status must never
 * *revoke*.
 */
export function readPlan(value: unknown): Plan {
  return PLAN_VALUES.includes(value as Plan) ? (value as Plan) : 'free'
}

/**
 * Reads `accounts.pendingPlan` — never with `readPlan`, on purpose. `readPlan` degrades an
 * unrecognised value to `'free'`, and in this column `'free'` means "cancel at period end"
 * (`resolveSubscription`, `entitlements.ts`): degrading a corrupt or newer-deploy value here
 * would silently *schedule a revocation*, the exact asymmetry `readPlan`'s own comment warns
 * about — an unreadable plan must never grant, and here it must never revoke either. `null`
 * is the generous, always-safe answer: nothing scheduled, the account simply keeps whatever
 * it already has.
 */
export function readPendingPlan(value: unknown): Plan | null {
  return typeof value === 'string' && PLAN_VALUES.includes(value as Plan) ? (value as Plan) : null
}

/**
 * The name a reader recognizes, for the one place today that names a plan back to the
 * person on it rather than to an operator: the account menu's own plan line. `/pricing`
 * spells the same five names out as literals in its own column data instead of reading
 * this — its copy already has to hand-place each name beside its own price and features,
 * so a shared map would buy it nothing there — but anywhere the app names a plan on its own,
 * with no copy around it, this is the one spelling.
 */
export const PLAN_LABEL: Record<Plan, string> = {
  free: 'Free',
  standard: 'Standard',
  plus: 'Plus',
  premium: 'Premium',
  lifetime: 'Lifetime',
}

/**
 * Where a subscription stands with the payment processor, written by the (future) Paddle
 * webhook and by nothing else. `grace` still gets the plan's entitlements: a failing card
 * is not a lapsed customer.
 */
export type PlanStatus = 'active' | 'grace' | 'expired'

export const PLAN_STATUS_VALUES = ['active', 'grace', 'expired'] as const satisfies readonly PlanStatus[]

/**
 * Reads a status from a value that came out of the database.
 *
 * Falls back to `active`, not to `expired`, and that direction is the whole point:
 * `expired` is the only status value that takes something away, and a string we cannot
 * interpret is not evidence that anybody lapsed. Under the freeze rule, failing shut here
 * would lock a paying customer out of editing their own songs because of one unreadable
 * byte. `active` is also the column's default, so this agrees with every untouched row.
 */
export function readPlanStatus(value: unknown): PlanStatus {
  return PLAN_STATUS_VALUES.includes(value as PlanStatus) ? (value as PlanStatus) : 'active'
}

/**
 * How much of the printable booklet a plan includes.
 *
 * `no` is the whole feature withheld; `branded` prints the «Printed with Strumfolio» line
 * that every booklet carries today; `plain` prints without it. `custom` is premium's value
 * and today behaves exactly like `plain` — the customizable booklet is a later step, so
 * nothing may gate on `custom` yet. The only question any caller asks of this field in
 * this run is `bookletBrandLine`, i.e. whether the tier is `branded`.
 */
export type BookletTier = 'no' | 'branded' | 'plain' | 'custom'

export interface PlanLimits {
  /** How many songbooks the account may hold. null is unlimited, never a large number. */
  songbooks: number | null
  /** How many songs, across the whole account rather than per songbook. */
  songs: number | null
  /** Whether the reader may pick the ukulele: `saveGlobalPrefs` is the one server-side control point. */
  ukulele: boolean
  /** Matrix-only in this run: no call site reads it yet. Do not invent a gate for it. */
  smartCapo: boolean
  /** Read by `loadBooklet` (`no` refuses) and by `bookletBrandLine` (`branded` prints the line). */
  booklet: BookletTier
  /** May start a Sing Together broadcast — read by `startBroadcast`. */
  mayLead: boolean
  /**
   * How many OTHER devices may follow one Sing Together broadcast at a time — read through
   * `deviceCapOf` (`resolve.ts`) and compared by `admits` (`singAlong/devices.ts`), and by
   * nothing else. The leader's own device is never one of them: they are playing inside the
   * app and never open the follow link, which is what makes `standard`'s 1 a duo and `plus`'
   * 3 a quartet. Free's 0 is unreachable rather than harsh — free cannot lead at all.
   *
   * Premium's 100 is the technical cap the listing calls unlimited, which is why this is
   * never null. `UNGATED.limits.devices` is the same 100 deliberately, and that coincidence
   * is load-bearing twice over: it is what `deviceCapOf` fails open to, and it is what lets a
   * screen decide «this cap is not worth naming» with one comparison against
   * `PLANS.premium.devices`. Which is why the refusal is never inferred from this number
   * alone — with the plans unenforced a bare `held < max` would refuse a 101st guest nobody
   * meant to cap.
   */
  devices: number
}

/**
 * The decided table, one row per stored value. Written out literally rather than derived,
 * so reading the code and reading the pricing page are the same act.
 */
export const PLANS: Record<Plan, PlanLimits> = {
  free: { songbooks: 1, songs: 30, ukulele: false, smartCapo: false, booklet: 'no', mayLead: false, devices: 0 },
  standard: {
    songbooks: 3,
    songs: 300,
    ukulele: true,
    smartCapo: true,
    booklet: 'branded',
    mayLead: true,
    devices: 1,
  },
  plus: { songbooks: null, songs: null, ukulele: true, smartCapo: true, booklet: 'plain', mayLead: true, devices: 3 },
  premium: {
    songbooks: null,
    songs: null,
    ukulele: true,
    smartCapo: true,
    booklet: 'custom',
    mayLead: true,
    devices: 100,
  },
  /**
   * Deliberately a copy of premium's values, not a `plan === 'lifetime' ? premium : plan`
   * step somewhere. Every such branch is a place a later reader forgets it, and there is no
   * upper bound on how many of them a codebase grows; with a fifth row here, `effectivePlan`
   * can report `lifetime` honestly and not one branch anywhere special-cases it. The rule
   * that these two must stay identical survives as a single test line,
   * `assert.deepEqual(PLANS.lifetime, PLANS.premium)` — so a change to premium that is not
   * mirrored here fails the suite rather than shipping.
   */
  lifetime: {
    songbooks: null,
    songs: null,
    ukulele: true,
    smartCapo: true,
    booklet: 'custom',
    mayLead: true,
    devices: 100,
  },
}

/**
 * How the plans order, for the one comparison that needs it: which of a subscription and a
 * manual grant is the more generous side at a given instant.
 *
 * `lifetime` ranks strictly above `premium` even though their limits are identical, so the
 * comparison is total and a tie can never leave the winner undefined. Ranking is not
 * pricing: it says which row grants more, nothing about what anything costs.
 */
export const PLAN_RANK: Record<Plan, number> = {
  free: 0,
  standard: 1,
  plus: 2,
  premium: 3,
  lifetime: 4,
}

/** What the account actually holds right now, which is what the caps are compared against. */
export interface RepertoireCounts {
  songbooks: number
  songs: number
}

/**
 * Why a write was refused by the plan rather than by a permission.
 *
 * Four, not one: they have different remedies, and a message that gives the wrong one is
 * worse than no message. `songbook-limit`/`song-limit` mean "this would be one more than
 * your plan allows" — the answer is an upgrade, and *which* cap was hit is the whole
 * content of the sentence. `frozen` means the repertoire is already over the caps after a
 * downgrade or an expiry, and the answer is a deletion the customer can make for free:
 * telling them to buy more would be both wrong and expensive. `plan-required` is a feature
 * that is simply not in the plan — leading, printing, the ukulele — where no count is
 * involved at all.
 */
export type LimitReason = 'songbook-limit' | 'song-limit' | 'frozen' | 'plan-required'

/**
 * The wording, once. Spread into `WRITE_MESSAGE` (`songbooks/types.ts`) and `SAVE_MESSAGE`
 * (`import/types.ts`) rather than retyped in each, which is how two independently-worded
 * copies of "you are over your limit" would otherwise come to exist — and `startBroadcast`
 * and `loadBooklet` have no message map at all to have copied from.
 *
 * The *capless* wording, since this map is reached by reason alone and a static map cannot
 * know a number. Whenever the refusal carries a `LimitFacts`, `writeMessage`/`saveMessage`
 * prefer `limitSentence` over the two count lines here.
 *
 * Those two count lines are a floor that nothing currently stands on, which is worth knowing
 * before anybody edits them expecting a reader to see the result. Every site that can answer
 * `songbook-limit` or `song-limit` attaches `limitFacts` beside it (five, in
 * `songbooks/actions.ts` and `import/actions.ts`), and the one refusal that travels — a
 * `resolveSection` failure — is *relayed* with its `limit` by both of its callers rather
 * than rebuilt without it, so the numbered sentence always wins; and the two gates that
 * *do* answer a bare reason — `startBroadcast`, `loadBooklet` —
 * read `refused.lead`/`refused.booklet`, which are `'plan-required' | null` and can never
 * hold a count. So the lines these two keys carry are reachable only by a future site that
 * forgets `limitFacts`. They stay because `Record<LimitReason, string>` demands all four
 * keys, and that demand is the reason this map is a `Record` at all: a fifth reason cannot
 * arrive with no wording for it. Kept deliberately vague about *which* number rather than
 * guessing one — a wrong cap is worse than no cap, and the site that lands here is by
 * definition a site that does not know which plan refused.
 *
 * English, like the rest of the code and like both maps it is spread into. `PLAN.md` and
 * the rest of this project's docs are the Italian half; the strings the code ships are not.
 */
export const LIMIT_MESSAGE: Record<LimitReason, string> = {
  'songbook-limit': 'Your plan does not allow another songbook.',
  'song-limit': 'Your plan does not allow another song.',
  frozen: 'Your repertoire is over your plan’s limits: you can only delete until it fits again.',
  'plan-required': 'This is not included in your plan.',
}

/**
 * The two facts a numbered refusal needs: which cap was hit and where it stands.
 *
 * `kind` is not "songbooks or songs" in the sense of which action the reader pressed — it
 * is which cap actually refused them, and the two come apart. Pasting songs into an
 * account with no songbook to put them in is refused by the *songbook* cap
 * (`resolveSection` in `import/actions.ts` would have to mint one), and telling that reader
 * about their song cap sends them looking in the wrong place. Deriving `kind` from the
 * `LimitReason` rather than from the call site keeps that right for free at every site.
 *
 * `max` is a number and never null: `null` is unlimited, and an unlimited cap cannot be the
 * thing that refused a write, so there is no such refusal to word. That is why this is a
 * separate optional fact on the result rather than a field on `PlanLimits` — the type says
 * "there is a number to name here", and `limitFacts` is the only thing that decides so.
 */
export interface LimitFacts {
  kind: 'songbooks' | 'songs'
  max: number
}

/**
 * The cap to name in a refusal, or `undefined` when there is no single number to name.
 *
 * Takes `PlanLimits` rather than the whole `Entitlements`, which is what lets this live
 * here beside the wording instead of in `entitlements.ts`: that file imports this one, so
 * the other direction would be a cycle — and this decides nothing about who may write, so
 * putting it there would also have mixed a wording concern into the one file that answers
 * the limit questions.
 *
 * `frozen` and `plan-required` deliberately return `undefined`. Neither has one number that
 * would help: `frozen` means the repertoire is over the caps — plural, possibly both of
 * them — and the remedy is a deletion, so quoting a cap would read as an invitation to buy
 * the very thing that would not fix it; `plan-required` is a feature that is simply absent
 * from the plan, with no count involved anywhere. Both keep the static wording of
 * `LIMIT_MESSAGE`, which is exactly what "no cap to name" falls back to.
 */
export function limitFacts(limits: PlanLimits, reason: LimitReason): LimitFacts | undefined {
  if (reason === 'songbook-limit' && limits.songbooks !== null) {
    return { kind: 'songbooks', max: limits.songbooks }
  }
  if (reason === 'song-limit' && limits.songs !== null) {
    return { kind: 'songs', max: limits.songs }
  }
  return undefined
}

/**
 * The numbered refusal, worded once for both sides.
 *
 * Here rather than in `WRITE_MESSAGE`'s or `SAVE_MESSAGE`'s neighbourhood for the same
 * reason `LIMIT_MESSAGE` is here: the songbook side and the song side must not come to say
 * it differently, and one sentence with `kind` as a parameter cannot drift the way two
 * sentences in two files would.
 *
 * It names the cap instead of the overage — «goes up to 30 songs», not «you have 30 of 30»
 * — because the cap is the number that decides what to do next: whether to delete, to
 * reorganise, or to buy a bigger plan. The overage only restates that the answer was no,
 * which the refusal has already said. Note what is *not* the argument here, tempting as it
 * is: that today's count is already on the screen and repeating it would add nothing. For
 * songbooks that happens to be true, for songs it is false, and the sentence must not rest
 * on it.
 *
 * Which is why the song sentence carries «in all» and the songbook sentence carries no such
 * phrase. The asymmetry is deliberate; tidying the two branches back into one shared
 * template is the mistake this paragraph exists to prevent. `PlanLimits.songs` is a cap
 * across the whole account, and the only song count this app renders anywhere is *per
 * songbook*: `countBySlug` buckets by songbook slug and the home screen prints
 * `counts[group.slug]`, while the account-wide total exists solely inside `countRepertoire`,
 * server-side, and reaches no screen at all. So a bare «goes up to 300 songs», read on a
 * songbook that holds 80, invites precisely the wrong conclusion — «this one has room» —
 * and every row of a refused paste repeats it. The songbook sentence needs no phrase because
 * the home screen lists every songbook the account has, which makes «goes up to 1 songbook»
 * self-evidently account-wide.
 *
 * The rejected alternative was to render the account-wide song total on the screens that
 * refuse, and leave both sentences bare. That is a change to several screens rather than to
 * one string, and it would still leave the sentence ambiguous on every screen that had not
 * yet been given the total — the refusal has to survive being read anywhere.
 *
 * The singular is spelled out rather than left to a bare plural: `free` allows exactly one
 * songbook, so «goes up to 1 songbook» is the *most commonly seen* form of this sentence in
 * the whole installation, not an edge case.
 *
 * No pricing link and no «upgrade to…»: which plan to buy, and where, belongs to the
 * interface that reads the outcome — see `WriteResult`'s own comment on why the union
 * carries no link.
 */
export function limitSentence(limit: LimitFacts): string {
  if (limit.kind === 'songbooks') {
    return `This plan goes up to ${limit.max} ${limit.max === 1 ? 'songbook' : 'songbooks'}.`
  }

  return `This plan goes up to ${limit.max} ${limit.max === 1 ? 'song' : 'songs'} in all.`
}

/**
 * Whether the cap in an audience count is a number worth putting on the leader's screen.
 *
 * Three ways it is not, and only the first is obvious. The cap is `PLANS.premium.devices` or
 * above, which also covers lifetime and `SONGBOOK_PLANS` switched off, since
 * `UNGATED.limits.devices` is that same number — «2 of 100» would advertise a cap nobody
 * configured as though it were about to bite. The cap is 0, which admits nobody and makes «0
 * of 0» a ratio about nothing. Or the count is already **above** the cap, which is «2 of 1»:
 * a sentence that reads as a fault in the software.
 *
 * Those last two are not defensive coding, and the comment they used to carry — that free's 0
 * cannot be reached because free cannot lead — was wrong. Both are reachable while everything
 * is working exactly as decided. A plan that lapses or is downgraded **under a live
 * broadcast** does not interrupt it — you do not cut a live performance, see `pollBroadcast` —
 * so a broadcast with two devices on it can find itself holding free's cap of 0 or standard's
 * 1 at the next tick of the leader's panel. And `seatDevice` documents a read-then-write race
 * that can seat one device over the cap, which produces «2 of 1» with no plan change at all.
 *
 * Shared with the screens rather than restated in JSX for the reason `audienceSentence` gives
 * for existing: the panel's «a place frees up…» hint is only true when the cap is real *and*
 * reached, and a copy of this condition next to the markup is a copy that drifts — telling a
 * leader a place will free up under a cap of 0, where no place ever can.
 */
function capWorthNaming(following: number, devices: number): boolean {
  return devices > 0 && devices < PLANS.premium.devices && following <= devices
}

/**
 * Whether this broadcast is at a cap that is real, reached, and could actually let somebody in
 * again — the one state in which telling the leader that a place frees up is true.
 *
 * `following === devices` rather than `>=`: above the cap is `capWorthNaming`'s business and is
 * already excluded there, and repeating the comparison here is how the two come to disagree.
 */
export function audienceIsFull(following: number, devices: number): boolean {
  return capWorthNaming(following, devices) && following === devices
}

/**
 * The leader's «2 of 3»: how many devices are following their Sing Together broadcast, and
 * how many the plan allows.
 *
 * Here beside `limitSentence` for the reason that one gives for itself: one sentence with
 * parameters cannot drift the way two copies on two screens would. It words a *measurement*
 * rather than a refusal, which is why it is not a `LimitReason` and not in `LIMIT_MESSAGE` —
 * nobody has been told no, and the guest who actually was is deliberately told nothing about
 * plans at all (`pollBroadcast`'s `full` carries no number).
 *
 * `capWorthNaming` decides between the two forms, and its premium test settles **three** cases
 * at once: `UNGATED.limits.devices` is `PLANS.premium.devices`, so premium, lifetime and
 * enforcement-switched-off all land on the bare count. That is where `SONGBOOK_PLANS` shows up
 * on a screen: flipping it off does not remove this line, it removes the «of 3». Counting is
 * measurement, not a limit.
 *
 * The bare count is also the fallback for a cap that cannot be named honestly — 0, or one the
 * count has already passed — and that is a deliberate choice of the *weaker* true sentence over
 * the stronger false one. «2 devices following» under a lapsed plan says less than the leader
 * might want, but everything it says is so; «2 of 0 devices following» reads as a bug in the
 * app, and the panel would follow it with a promise that a place frees up. Where the lapse is
 * worth explaining is the plan screen, which can name a plan, and not a line whose whole job is
 * to count who is in the room.
 *
 * The two forms pluralise on different words, and getting that backwards is the easy mistake:
 * the ratio agrees with the **cap** («0 of 1 device following», «2 of 3 devices following»)
 * while the bare count agrees with the **count** («1 device following»). `standard`'s cap is 1,
 * so «0 of 1 device following» and «1 of 1 device following» are the two most-often-read forms
 * of this sentence in the whole installation rather than an edge case — the same argument
 * `limitSentence` makes for spelling out its own singular.
 */
export function audienceSentence(following: number, devices: number): string {
  if (!capWorthNaming(following, devices)) {
    return `${following} ${following === 1 ? 'device' : 'devices'} following`
  }

  return `${following} of ${devices} ${devices === 1 ? 'device' : 'devices'} following`
}

/**
 * `ThanksScreen`'s three sentences about a plan just bought: the storage half, the Sing
 * Together half, and the two combined into the hero's own single line. Kept here rather than
 * written once in the component for the reason `audienceSentence` gives for existing — a
 * plan's real numbers, worded once beside the table they read from, instead of redrafted by
 * hand for Standard, Plus, Premium and Lifetime and left to drift the day a cap changes.
 *
 * All three take a bare `Plan` rather than `CheckoutPlan` (`lib/plans/prices.ts`) — which is
 * every plan besides `free` these are actually meant to describe — because `PLANS` itself is
 * a `Record<Plan, …>` and importing `CheckoutPlan` back from `prices.ts` here would close a
 * cycle (`prices.ts` already imports `Plan` from this file). `ThanksScreen` never calls these
 * with `free`; that branch is worded on its own, since a reader who has not paid gets no
 * numbers named at them at all.
 */

/**
 * The storage half: what a plan lets a reader keep, worded as the timeline step under "Build
 * your songbook" reads it. `null` is genuinely unlimited (see `PlanLimits.songs`'s own
 * comment), which is why this names no number at all rather than printing one — Plus and
 * Premium share this exact sentence, and that agreement is the point, not a coincidence to
 * tidy away.
 */
export function thanksSongsCaption(plan: Plan): string {
  const { songs, songbooks } = PLANS[plan]
  if (songs === null) return 'Unlimited songs, organized your way.'
  return `${songs} songs across ${songbooks} ${songbooks === 1 ? 'songbook' : 'songbooks'}.`
}

/**
 * The Sing Together half: how many other devices may follow a broadcast this plan starts,
 * worded as the timeline step under "Bring the whole room" reads it. Mirrors
 * `audienceSentence`'s own three-way split on `PLANS.premium.devices` — 100 is the technical
 * cap the rest of the app already calls unlimited, not a number this sentence may print bare.
 */
export function thanksDevicesCaption(plan: Plan): string {
  const { devices } = PLANS[plan]
  if (devices >= PLANS.premium.devices) return 'Start a Sing Together session, unlimited devices.'
  if (devices === 1) return 'Start a Sing Together session, one device following.'
  return `Start a Sing Together session, up to ${devices} devices following.`
}

/**
 * Both halves, joined into the one sentence the hero prints after the renewal clause — the
 * same two facts as the pair above, worded the way the hero's single line needs them rather
 * than as two separate steps.
 */
export function thanksCapacitySentence(plan: Plan): string {
  const { songs, songbooks, devices } = PLANS[plan]
  const songsClause =
    songs === null ? 'every songbook, every song' : `${songbooks} ${songbooks === 1 ? 'songbook' : 'songbooks'}, ${songs} songs`
  const devicesClause =
    devices >= PLANS.premium.devices
      ? 'the whole room following along'
      : devices === 1
        ? 'one screen following along'
        : `up to ${devices} screens following along`
  return `${songsClause}, ${devicesClause}.`
}
