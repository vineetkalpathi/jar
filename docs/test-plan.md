# Manual test plan — pages built so far

Covers everything shipped on `design`: boot routing, auth, onboarding, the household
gate, the Jars grid, Create jar, Jar detail, Add a title and Title detail — plus the
theme/typography layer, the TMDB service and the offline/sync behaviour underneath them.

## What exists

| Route                                              | File                    |
| -------------------------------------------------- | ----------------------- |
| `/` router                                         | `src/app/index.tsx`     |
| `/sign-in`, `/sign-up`                             | `src/app/(auth)/`       |
| `/welcome`, `/create-household`, `/join-household` | `src/app/(onboarding)/` |
| `/jars`, `/create-jar`, `/jar/[id]`                | `src/app/(app)/`        |
| `/add-title`, `/title/[id]`                        | `src/app/(app)/`        |

Not built, so out of scope: Library (the browse-and-search-what-you-own screen —
distinct from Add a title, which searches TMDB), filter builder, draw flow, Rating
entry, Log, settings, sign-out UI, household switcher UI, navigation shell (tabs/swipe).

## 0. Pre-flight (automated)

- [ ] `pnpm exec tsc --noEmit` — clean.
- [ ] `pnpm test` — 113 tests, 9 suites. Note: covers `src/lib` only (filter compile +
      validate, constraints, cooldown, time, sync-rules, the TMDB client and its
      db-wiring). No component or screen tests.
- [ ] `pnpm theme` regenerates `src/theme/tokens.css` with no diff vs committed file.

## 1. Environment and data setup

The app points at **hosted** Supabase + hosted PowerSync (`.env`). `supabase/seed.sql`
only runs on a local `npx supabase db reset`, and a hosted PowerSync instance cannot
reach `127.0.0.1` — so **local Supabase and the real app cannot be combined** without a
tunnel.

Pick one:

- **A (recommended) — hosted + seeded catalogue.** In the Supabase SQL editor, run the
  `title`, `title_genre`, `person`, `title_credit` inserts from `seed.sql`, then insert
  `library_entry` / `tag` / `title_tag` / `rating` / `viewing` / `jar` / `jar_override`
  rows against the household id you create in-app. There is no in-app way to add a
  title, so slips can only come from SQL.
- **B — local Supabase for data-layer only.** `npx supabase start && npx supabase db
reset` to exercise migrations, RLS (`supabase/tests/rls_test.sql`) and seed integrity.
  App-level sync is untestable in this mode.

Pre-flight checks either way:

- [ ] Sync rules deployed and matching `powersync/sync-rules.yaml`; PowerSync dashboard
      shows the instance connected and replicating.
- [ ] `.env` has all four `EXPO_PUBLIC_*` vars. Blank/missing Supabase or PowerSync ones
      → app throws at `supabase.ts`/`connector.ts` on launch (verify the error message
      names `.env.example`). A missing `EXPO_PUBLIC_TMDB_API_TOKEN` only throws when
      Add a title actually searches (`lib/tmdb/client.ts`) — the rest of the app still
      boots.

## 2. Boot and routing (`index.tsx`)

The three-way decision — session? replica caught up? household? — is the highest-risk
logic here.

- [x] **T2.1 Cold start, signed out** → `/sign-in`, no flash of any other screen.
- [x] **T2.2 Warm start, signed in with household** → straight to `/jars`. Confirm the
      sign-in screen never appears for a frame (the `loading` vs `null` distinction).
- [x] **T2.3 Fresh install, existing account with a household** — reinstall, sign in.
      Must show `Catching up…` then land on `/jars`. **Must never** show `/welcome`.
      This is the bug the `hasSynced` guard exists for; test it on a throttled network
      (Network Link Conditioner, 3G) to widen the window.
- [x] **T2.4 Fresh account, no household** → `/welcome` after first sync completes.
- [x] **T2.5 Second launch after T2.3** → no `Catching up…` (`hasSynced` is persisted).
- [x] **T2.6 Airplane mode, session in storage, replica populated** → `/jars` works
      fully offline.
- [x] **T2.7 Airplane mode + fresh install + stored session** → sits on `Catching up…`
      indefinitely. Confirm it recovers when connectivity returns (no restart needed).

## 3. Auth

Sign in (`(auth)/sign-in.tsx`)

- [x] **T3.1** Valid credentials → lands on `/jars` or `/welcome`. No double navigation.
- [x] **T3.2** Wrong password → "That email and password don't match an account.",
      shown under the password field, underline turns rust.
- [x] **T3.3** Button disabled until both fields non-empty; spinner shows and the label
      stays put (no width jump) during submit.
- [ ] **T3.4** Rapid double-tap on Sign in fires one request (`busy` guard).
- [ ] **T3.5** Email field → `next` focuses password; password `go` submits.
- [ ] **T3.6** Airplane mode → "Couldn't reach the server. Check your connection."
- [ ] **T3.7** Signed in, deep-link to `/sign-in` → redirected to `/` by the auth layout.
- [ ] **T3.8** `Make an account` link → `/sign-up`.

Sign up (`(auth)/sign-up.tsx`)

- [ ] **T3.9** New account, confirmations **off** → session issued, session listener
      navigates, `app_user` row written with the display name (check `/welcome` greets
      "Hello, <name>" and the Supabase `app_user` table has the row).
- [ ] **T3.10** Confirmations **on** → "Check your email" panel naming the typed email;
      `Back to sign in` works. Then confirm via link and sign in.
- [ ] **T3.11** Existing email → "There's already an account with that email…".
- [ ] **T3.12** 5-char password → "Passwords need to be at least 6 characters."
- [ ] **T3.13** Garbage email → "That doesn't look like an email address."
- [ ] **T3.14** Whitespace-only name → button stays disabled.
- [ ] **T3.15** Repeated signups from one project → email rate-limit copy appears (or
      skip; it is exercised by `authErrorMessage` unit coverage gaps — worth adding).
- [ ] **T3.16** Display name with an emoji / accents / 100 chars survives round-trip to
      `app_user.display_name` and renders on `/welcome`.

## 4. Onboarding

Welcome

- [ ] **T4.1** Greets by display name; falls back to "Hello" if `app_user` hasn't
      arrived (throttle the network on a fresh install to see it).
- [ ] **T4.2** Both buttons navigate; primary/secondary variants render per design.
- [ ] **T4.3** Pending-household note is absent normally.
- [ ] **T4.4** After a bad-code join (T4.9), the note appears with singular copy; join a
      second bad code → plural "2 households…".

Create household

- [ ] **T4.5** Valid name → `/jars` via `replace` (back gesture does **not** return to
      the form). Verify in Postgres: one `household`, one `household_member`, and
      **5 `household_category`** rows (starter set), all from one local transaction.
      Console must show **no** `[sync] dropping PUT` warnings — that was the 42501
      RLS bug caused by the connector's `upsert`, fixed in `connector.ts`.
- [ ] **T4.6** Whitespace-only name → button disabled. Name of `"   x   "` → trimmed.
- [ ] **T4.7** Offline creation → grid works immediately; rows appear in Postgres on
      reconnect, categories included and FK-valid.
- [ ] **T4.8** Very long name (200 chars) → header wraps, tile eyebrow doesn't break
      layout.

Join household

- [ ] **T4.9** Non-UUID code ("abc") → `ConstraintError` copy from
      `uuid()`, inline, no write attempted.
- [ ] **T4.10** Well-formed but nonexistent UUID → navigates to `/jars`… and, because
      no household row exists, the household gate bounces to `/` → `/welcome` with the
      pending note. Confirm the connector logs a permanent `23503` drop and the queue
      is **not** wedged (a subsequent create-household still uploads).
- [ ] **T4.11** Real code from another member (read the id out of Postgres) → membership
      syncs, household appears, `/jars` shows their jars.
- [ ] **T4.12** Joining a household you're already in → no duplicate row, returns
      cleanly.

## 5. Household gate and active household

- [ ] **T5.1** Signed in with ≥1 household → `(app)` renders; no flash of `Loading`
      beyond a frame.
- [ ] **T5.2** Belongs to two households → the persisted `jar.activeHouseholdId` decides
      which; relaunch lands on the same one. (No switcher UI yet — set the key by
      joining a second household and confirming it falls back to `all[0]` alphabetically
      until `select` is wired to UI.)
- [ ] **T5.3** Stored id names a household the user has left → falls back to the first,
      no blank screen.
- [ ] **T5.4** Membership revoked while the app is open (delete `household_member` in
      Postgres) → screen redirects to `/` and onward to `/welcome` without a crash from
      `useHousehold()` throwing.

## 6. Jars grid

Seeded expectations (The Sofa, from `seed.sql`) — verify counts exactly:

| Jar                  | Expected slips                                     |
| -------------------- | -------------------------------------------------- |
| Short weeknight pick | 1 (Friends)                                        |
| Cozy night in        | 1 (WALL·E — Spirited Away is excluded by override) |
| Comfort rewatch      | 0 (Heat fails `coverage: all` on Rewatchability)   |
| Family archive       | 1 (Grandma's 80th, via pin — no filter)            |

- [ ] **T6.1** Counts above match on both the tile and the detail header.
- [ ] **T6.2** Empty household → "Nothing to draw from yet", explanatory paragraph, and
      only the dashed New jar tile.
- [ ] **T6.3** Grid parity: with 1, 2, 3 and 4 jars, the last row's tiles stay
      half-width (the `spacer` cell). A lone tile must **not** stretch full width.
- [ ] **T6.4** New jar tile sits _beside_ the last jar, not below the grid.
- [ ] **T6.5** Live update: insert a `library_entry` in Postgres that matches a jar's
      filter → the tile count and fill level rise **without** leaving the screen.
- [ ] **T6.6** Fill level: 0 slips → no fill; 1 slip → thin sliver (~8%); 40+ → capped
      at 88%, glass still reads as glass.
- [ ] **T6.7** Count still resolving → tile shows `…`, then the number.
- [ ] **T6.8** Jar with an unreadable filter (set `jar.filter = '{"bad":1}'` in
      Postgres) → tile shows `…` permanently and logs `[jars] could not count`; the rest
      of the grid keeps working, no red screen.
- [ ] **T6.9** Long jar name → clamps to 2 lines, centred, stays out of the fill.
- [ ] **T6.10** Singular/plural: "1 jar" / "2 jars", "1 slip" / "2 slips".
- [ ] **T6.11** VoiceOver: each tile announces "<name>, N slips", button role; New jar
      announces "New jar".
- [ ] **T6.12** Scroll with 12+ jars — no clipped last row (24px bottom padding).

## 7. Create jar

- [ ] **T7.1** Valid name → `replace` to `/jar/<id>`; back from detail goes to the grid,
      never back to the form.
- [ ] **T7.2** Disabled until non-empty; whitespace trimmed.
- [ ] **T7.3** Cancel returns to the grid with nothing created.
- [ ] **T7.4** Created offline → appears in the grid instantly, syncs later.
- [ ] **T7.5** New jar has `filter = NULL` in Postgres (not `{}`), and detail shows the
      empty-jar copy.
- [ ] **T7.6** Keyboard: `autoFocus` fires, `go` submits, KeyboardAvoidingView keeps the
      button visible on a small device (iPhone SE).

## 8. Jar detail

- [ ] **T8.1** Slips render in Caveat (`Hand`), sorted by title name, with
      `year · N min` metadata; hairline separators between rows.
- [ ] **T8.2** Title with no year/runtime (Grandma's 80th) → no metadata line, no stray
      separator dot.
- [ ] **T8.3** Header count matches list length, singular/plural correct.
- [ ] **T8.4** `← Jars` returns to the grid.
- [ ] **T8.5** Filter change in Postgres (edit `jar.filter`) → contents recompile and
      the list updates live (effect keyed on `jar.filter`).
- [ ] **T8.6** Jar deleted in Postgres while open → "That jar isn't here."
- [ ] **T8.7** Navigate to `/jar/<random-uuid>` → same message, no crash.
- [ ] **T8.8** Unreadable filter (as T6.8) → list stays empty, warning logged, no crash.
- [ ] **T8.9** **Known copy bug to confirm:** a jar that _has_ a filter but matches
      nothing (Comfort rewatch) shows "This jar has no filter yet, so nothing falls into
      it" — wrong for that case. Log it rather than fixing blind.
- [ ] **T8.10** Rapid back/forward between grid and detail → no stale contents from the
      previously-viewed jar (the `active` guard in the effect).

## 9. Add a title

Requires a working `EXPO_PUBLIC_TMDB_API_TOKEN`. `lib/tmdb/` has its own unit coverage
against a mocked `fetch` (`tmdb.test.ts`, `import.test.ts`) — this section is about the
screen wiring, not TMDB's response shapes.

- [ ] **T9.1** Typing debounces (350ms) — confirm via Network tab / log that a fast typist
      fires one search, not one per keystroke; a slow early response landing after a
      faster later one never overwrites it (the `active` guard).
- [ ] **T9.2** Results merge movies and tv shows, ranked by popularity — not movies-then-tv.
- [ ] **T9.3** Empty query → hint copy, no request. No results → "No results for …".
      Offline / bad token → rust error text, not a crash.
- [ ] **T9.4** Add → button becomes a disabled spinner, then "Added ✓" + "View"; the row
      never reverts to "Add" after (`added` map keyed by `mediaType:tmdbId`).
- [ ] **T9.5** "View" opens `/title/<id>` for the Title just created — confirm it's the
      *local* Title id, not the TMDB id, and it's the same row on a second add of the
      same title (convergence on `tmdb_id`, `library.ts`).
- [ ] **T9.6** Add the same title twice (two different search sessions) → one Library
      entry, one Title row — `addToLibrary`'s find-or-insert and `title.tmdb_id`'s
      uniqueness are both doing their job.
- [ ] **T9.7** Add failing mid-flight (kill network after the button is tapped) → rust
      error banner, button returns to "Add" (not stuck spinning), retry works.
- [ ] **T9.8** `‹ Close` returns to wherever Add was opened from ("+ Add a title" on the
      Jars grid).
- [ ] **T9.9** A movie and a tv show with the same title (e.g. search something with both)
      → both appear, distinguishable by the "Movie"/"TV series" meta line.

## 10. Title detail

- [ ] **T10.1** Opened via a Jar's slip ⓘ, and via Add a title's "View" — both land on
      the same screen for the same Title id.
- [ ] **T10.2** Dark register: ground is `dark.bg`, not `paper.bg`; no Caveat anywhere on
      this screen (title, genres and overview are all TMDB-sourced text — ADR-0003's
      handwriting rule).
- [ ] **T10.3** Poster renders from the live TMDB fetch (`getTitleDetails`), not from any
      locally cached path — confirm by checking the schema has no `poster_path` column.
      No `tmdb_id` (a hand-entered Title) → "Not linked to TMDB — added by hand.", no
      poster fetch attempted, no crash.
- [ ] **T10.4** Genres and tags read from the local cache (`title_genre`, `tag`/`title_tag`)
      — confirm they render even offline, unlike the overview/poster.
- [ ] **T10.5** TMDB fetch failure (airplane mode) → "Couldn't reach TMDB for the
      overview.", rest of the screen (name, year, runtime, genres, tags, ratings) still
      works from the local replica.
- [ ] **T10.6** Rating bars: one per the Household's *activated* Categories
      (`CATEGORIES_FOR_HOUSEHOLD`), even ones with zero ratings on this Title (bar empty,
      "—"). Amber fill width matches `average / 10`. Eyebrow's rater count is the number
      of *distinct users*, not the number of rating rows (one user across several
      categories counts once).
- [ ] **T10.7** Rating written in Postgres while the screen is open → bar and average
      update live (plain `useQuery`, no manual refresh).
- [ ] **T10.8** Navigate to `/title/<random-uuid>` → "That title isn't here.", no crash.
- [ ] **T10.9** Not yet built, so not testable here: "in N jars", "Mark a card" / Rating
      entry link (see §14, next blocker to pick up).

## 11. Sync, offline and the upload queue

- [ ] **T11.1** Two devices (or sim + device) signed in as Alice and Bob in The Sofa:
      jar created on one appears on the other within seconds.
- [ ] **T11.2** Offline on device A: create household + 2 jars, rename nothing, then
      reconnect → all rows land in Postgres in order, no duplicates.
- [ ] **T11.3** Isolation: Cara (Film Club) sees only Club picks and Film Club's library.
      Confirm The Sofa's titles, tags and ratings are **absent from her local replica**,
      not merely hidden — inspect via a temporary debug query if needed.
- [ ] **T11.4** Queue-wedge check: force a permanent failure (bad join code, T4.10), then
      make a legitimate write. The legitimate write must still reach Postgres.
- [ ] **T11.7** Regression: every write path is a plain insert. Watch the console through
      create-household → create-jar → join-household; a single `[sync] dropping PUT …
42501` means the SELECT-policy-on-write problem is back.
- [ ] **T11.5** Token expiry: leave the app open past the access-token lifetime (or force
      a refresh) → sync reconnects without a sign-out.
- [ ] **T11.6** **Account switch on one device.** There is no sign-out UI yet, so add a
      temporary `signOut()` button or clear app data. Sign in as Alice, then as Bob on
      the same device → Bob must not see any of Alice's rows (`disconnectAndClear`).
      This is a data-leak test; do not skip it.

## 12. Theme, typography and chrome

- [ ] **T12.1** Splash holds until Vollkorn / Alegreya Sans / Caveat load; no flash of
      system font on any screen.
- [ ] **T12.2** Simulate a font-load failure (rename an asset) → splash still hides and
      the app renders in fallback faces.
- [ ] **T12.3** Caveat appears **only** on slips — never on buttons, titles, labels.
- [ ] **T12.4** Backgrounds: paper everywhere; no white gaps behind the Stack during
      transitions (`contentStyle` bg).
- [ ] **T12.5** Safe areas: notch/Dynamic Island device and a home-indicator device —
      content clears both; Android status bar not overlapped.
- [ ] **T12.6** OS dark mode on (`userInterfaceStyle: automatic`) → screens stay paper,
      status bar text stays legible (`style="dark"`).
- [ ] **T12.7** OS text size at maximum → forms remain usable; jar labels clamp rather
      than overflow.
- [ ] **T12.8** No screen renders as a blank grey page (the `SafeAreaView`/NativeWind
      regression the `Screen` doc warns about) — check every route.

## 13. Platform matrix

|               | iOS sim | Android emulator | Physical device | Web |
| ------------- | ------- | ---------------- | --------------- | --- |
| Boot + auth   |         |                  |                 |     |
| Onboarding    |         |                  |                 |     |
| Jars + detail |         |                  |                 |     |

- Web is expected to be the weakest target (op-sqlite / PowerSync RN bindings). Run
  `pnpm web` once and record what actually happens rather than assuming.
- Android: verify keyboard resize (no `KeyboardAvoidingView` behaviour there by design)
  and the back button on every screen — especially that `replace` navigations don't
  leave a returnable form in the stack.

## 14. Blockers to note before starting

1. **No sign-out UI** — T11.6 and repeated auth runs need a temporary button or an app
   reinstall between accounts.
2. **No household switcher** — `ActiveHousehold.select` is unreachable from the UI, so
   T5.2 is partially untestable.
3. **No Library browse screen** — titles can now be added in-app (Add a title, §9), but
   there's still no screen to browse or search what's already in the Library; a slip
   only becomes visible by landing in a jar whose filter matches it.
4. **Seed vs hosted mismatch** — `seed.sql` is local-only; port the inserts by hand for
   hosted testing (§1).
