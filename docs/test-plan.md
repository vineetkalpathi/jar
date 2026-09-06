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
entry, Log, settings, sign-out UI, navigation shell (tabs/swipe).

## 0. Pre-flight (automated)

- [ ] `pnpm exec tsc --noEmit` — clean.
- [ ] `pnpm test` — 122 tests, 9 suites. Note: covers `src/lib` only (filter compile +
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
      which; relaunch lands on the same one. Switching is now reachable from the UI —
      see §13.
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
- [ ] **T9.4** Row tap (poster + title, not the Add pill) opens the TMDB preview
      (`/title/tmdb/[tmdbId]`) before adding; after adding, the same tap opens the real
      `/title/<id>` instead — confirm it's the _local_ Title id, not the TMDB id.
- [ ] **T9.5** Tap the outlined `+` circle → spinner, then solid green `✓`; never reverts
      after. Each row's status is its own `useQuery` against `library_entry`
      (`LIBRARY_ENTRY_FOR_TMDB_ID`), not locally-tracked state — confirm by adding a
      title from its TMDB preview screen (reached by tapping the row) and backing out:
      the row here must already show `✓` on return, with no re-fetch or remount needed.
      Adding the same title twice (two search sessions) → one Library entry, one Title
      row — `addToLibrary`'s find-or-insert and `title.tmdb_id`'s uniqueness are both
      doing their job.
- [ ] **T9.6** Add failing mid-flight (kill network after the circle is tapped) → rust
      error text under that row, circle returns to outlined `+` (not stuck spinning),
      retry works.
- [ ] **T9.7** The lone `‹` top-left (no "Close" label) returns to wherever Add was
      opened from ("+ Add a title" on the Jars grid). `hitSlop` gives it a real touch
      target despite the small glyph.
- [ ] **T9.8** A movie and a tv show with the same title (e.g. search something with both)
      → both appear, distinguishable by the "Movie"/"TV series" meta line.
- [ ] **T9.9** On the TMDB preview screen (`/title/tmdb/[tmdbId]`, opened by an unadded
      row): top-right is an outlined green circle with a `+`, not a bottom button. Tap →
      spinner in the same circle → solid green `✓`, and the household-rating section
      mounts in place with no navigation. Reopening the same title later (already added)
      shows `✓` immediately — confirm this resolves from the live
      `LIBRARY_ENTRY_FOR_TMDB_ID` query, not a re-add.
- [ ] **T9.10** Searching a person's exact full name (case-insensitive) merges their
      filmography straight into the results list — no separate "people" section, no
      navigation to another screen. Meta line for a merged-in credit reads `year · role`
      (character, or job title for a crew-only credit); a literal title match keeps
      `year · Movie`/`TV series`. Merged list is one ranked list, not titles-then-credits.
- [ ] **T9.11** The exact-match rule is deliberately narrow — confirm it holds: - A bare, common word ("Tom") matches no person exactly → plain title search only,
      no filmography merged in, even though TMDB returns several "Tom \_\_\_" people. - A misspelled or partial name ("Tom Hank") → same: no exact match, no merge. - A real one-word stage name that _is_ an exact match ("Madonna") → merges, despite
      being a single word — the rule is exact-match, not "looks like a full name." - Typing an accented name without the accent ("Timothee Chalamet",
      "Beyonce") still matches TMDB's accented canonical form — `foldName` strips
      diacritics (and case) from both sides before comparing. An unrelated name close
      in spelling ("Tom" vs "Tim") must still **not** match.
- [ ] **T9.12** A title literally named after a person who also gets matched (rare, but
      possible) → the literal title match wins on a key collision, not the credit
      (`mergeRows`).
- [ ] **T9.13** Search a person with a lot of talk-show/awards-show history (most A-list
      actors) — their real filmography ranks above "Self"/"Himself"/"Herself" credits
      even when a talk show is individually more popular than a given film (unit-tested
      in `tmdb.test.ts`; this is the screen-level check that `mergeRows` preserves that
      ordering rather than re-flattening it by popularity alone). Self-appearances are
      demoted, not hidden — they still show up, at the bottom.

## 10. Title detail

- [ ] **T10.1** Opened via a Jar's slip ⓘ, and via tapping an already-added row on Add a
      title — both land on the same screen for the same Title id.
- [ ] **T10.2** Dark register: ground is `dark.bg`, not `paper.bg`; no Caveat anywhere on
      this screen (title, genres and overview are all TMDB-sourced text — ADR-0003's
      handwriting rule). Top-left is a lone `‹` (no "Back" label); top-right is a green
      circle with a `✓` (`LibraryStatus`, always in-library here — every path into this
      screen originates from the Household's own Library, so it's static, not tappable).
- [ ] **T10.3** Poster renders from the live TMDB fetch (`getTitleDetails`), not from any
      locally cached path — confirm by checking the schema has no `poster_path` column.
      No `tmdb_id` (a hand-entered Title) → "Not linked to TMDB — added by hand.", no
      poster fetch attempted, no crash.
- [ ] **T10.4** Genres and tags read from the local cache (`title_genre`, `tag`/`title_tag`)
      — confirm they render even offline, unlike the overview/poster.
- [ ] **T10.5** TMDB fetch failure (airplane mode) → "Couldn't reach TMDB for the
      overview.", rest of the screen (name, year, runtime, genres, tags, ratings) still
      works from the local replica.
- [ ] **T10.6** Rating bars: one per the Household's _activated_ Categories
      (`CATEGORIES_FOR_HOUSEHOLD`), even ones with zero ratings on this Title (bar empty,
      "—"). Amber fill width matches `average / 10`. Eyebrow's rater count is the number
      of _distinct users_, not the number of rating rows (one user across several
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

## 13. Multiple households

The switcher, the context switch, and the two things deliberately _not_ switched — your
Log and your Ratings. See
[ADR-0010](./adr/0010-a-viewing-records-the-household-it-happened-in.md).

**Setup:** you need at least two households with different contents, and a third account
to leave one. Create household A in-app, create B from the switcher, and add a different
handful of titles to each. At least one title must be in **both** libraries — several
scenarios below turn on that case. Add a co-member to A (share the invite code) so the
Log has more than one watcher.

### 13a. The switcher itself

- [x] **T13.1** The name is tappable on all three tabs — Household (`ScreenTitle`),
      Jars (eyebrow), Explore ("Adding to …"). Each opens the same sheet.
- [x] **T13.2** The panel unfurls from directly **beneath the name you tapped**, at three
      visibly different heights. The anchor is measured per press, so this is the thing
      most likely to be off by a few points — check each tab separately.
- [x] **T13.3** The tapped name stays **lit** above the scrim; only the area below it
      dims.
- [x] **T13.4** The chevron turns to point up as the panel drops, and back on close.
- [x] **T13.5** Three ways to dismiss, all working: tap the scrim, **re-tap the name**
      (the modal covers the screen, so this goes through a transparent region rather
      than the anchor's own `Pressable`), and Android's back button.
- [x] **T13.6** Rows show the household name over its member names. The current one is
      forest.
- [x] **T13.7** Only one household → the sheet still opens, with one row plus Create and
      Join.
- [ ] **T13.8** Six or more households → the list scrolls after five rows (the sixth is
      half-visible, so the list reads as scrollable), and **Create / Join stay pinned**
      beneath the scroller rather than sinking below the fold.
- [ ] **T13.9** Device with a large safe-area inset (notch/Dynamic Island), and OS text
      size at maximum → the anchor is still correct, since it is measured in window
      coordinates rather than assumed.
- [x] **T13.10** Open the sheet, background the app, return → no invisible full-screen
      modal swallowing touches (the `sheet.tsx` unmount-timer failure mode).

### 13b. The context switch

- [x] **T13.11** Switch from Jars → B's jars, and **you are still on the Jars tab**.
      Same for Household and Explore.
- [x] **T13.12** On the Household tab: library, count, tags, log and settings all become
      B's.
- [x] **T13.13** On Explore: the eyebrow updates to name B, and adding a result lands in
      **B's** library.
- [x] **T13.14** Relaunch → still in B (`jar.activeHouseholdId` persisted).
- [x] **T13.15** Open Household Settings — the old "Switch household" list is gone, and
      nothing else on that screen regressed.
- [ ] **T13.16** Airplane mode → switching is instant and complete. Every household is
      already replicated, so nothing should need the network.

### 13c. What resets, and what doesn't

- [x] **T13.17** On the Household tab, build an ad-hoc filter with a **tag chip** (a
      household-scoped id), then switch. The draft clears and the full shelf shows.
      **Fail if** you see "0 of N" beside a chip that still looks valid — that is the
      regression the remount key exists to prevent.
- [x] **T13.18** Type in the library search, then switch → the term clears.
- [x] **T13.19** Search in Explore, then switch → the search **survives**, deliberately.
      The eyebrow exists so you can retarget an in-flight add; wiping the results would
      defeat it.

### 13d. Gaining a household

Before this feature there was no route to a second household at all, so all of this is
new ground.

- [ ] **T13.20** Sheet → Create a household → you land **in the new one**, not the one
      you came from. It has no jars and the five starter rating axes.
- [ ] **T13.21** Sheet → Join with a code → after sync you land in the joined household.
- [ ] **T13.22** Join with a bad code → error on the form, and backing out leaves you in
      the household you started in.
- [ ] **T13.23** Back out of Create without submitting → unchanged, still in the original.
- [ ] **T13.24** Create a household **offline** → works (it is one local transaction) and
      you land in it.
- [ ] **T13.25** The sheet's Create/Join push happens _after_ the panel has closed. On
      iOS especially, confirm the next screen always presents — a dropped navigation here
      is the `onClosed` race.

### 13e. The Log

- [ ] **T13.26** Default scope is "This household", and it shows nights stamped with this
      household only.
- [ ] **T13.27** **The double-count fix.** Take the title that is in both libraries, mark
      it seen in A, then switch to B and open the Log. It must appear in **A's Log only**.
      Before the stamp it appeared in both, as though watched twice.
- [ ] **T13.28** "Mine, everywhere" lists your nights across every household, each
      labelled with where it happened.
- [ ] **T13.29** Two people mark the same film on the same date in A → one card, both
      names.
- [ ] **T13.30** The same film on the same date in **both** A and B → in "Mine,
      everywhere" these are **two cards**, not one. Different occasions.
- [ ] **T13.31** Amber edge appears only when every _current_ member of the household is
      among the watchers. It is containment, not a headcount.
- [ ] **T13.32** No amber edge in "Mine, everywhere" at any time.
- [ ] **T13.33** Remove a member from A who has nights in its Log → their nights **stay**,
      still showing their name (this needs the extended `app_user` sync stream; a
      nameless card means that query isn't deployed).
- [ ] **T13.34** Leave a household you have nights in → those nights stay in your "Mine,
      everywhere" scope, **still showing that household's name** (extended `households`
      stream).
- [ ] **T13.35** Remove a title from a library you have watched it in → the night keeps
      its **name and poster** in both scopes (extended `catalogue` stream). A card
      reading "Untitled" with a blank poster means those two queries aren't deployed.
- [ ] **T13.36** Empty states read correctly in each scope, and differ.

### 13f. Ratings across households

- [ ] **T13.37** Rate a title on an axis in A; add the same title to B; open it in B →
      your score appears **below the "Rated in another household · not counted here"
      divider**, muted but draggable.
- [ ] **T13.38** Change that muted value in B → switch to A, the new value is there.
- [ ] **T13.39** The muted axis does **not** move B's household average, nor the score on
      B's library row. Only `household_category` axes count.
- [ ] **T13.40** Switch to the "Household" mode in B → the orphan axis is absent.
- [ ] **T13.41** Activate that axis in B (＋ Add a rating axis) → the capsule moves up
      into the main group, the divider disappears if it was the only one, and it now
      counts toward B's average.
- [ ] **T13.42** A title with no cross-household scores shows no divider at all.

### 13g. Draws, sync and regressions

- [ ] **T13.43** Finish a draw as watched → every participant's Viewing is stamped with
      **the jar's** household. Start a draw in A, back out, switch to B, return and
      finish → still attributed to A.
- [ ] **T13.44** Mark something seen offline, then reconnect → the Viewing uploads with
      its `household_id` and is not dropped by the connector (watch for a
      `[sync] dropping PUT on viewing/...` warning, which would mean the insert policy
      rejected it).
- [ ] **T13.45** `bottom-sheet.tsx` became `sheet.tsx`. Re-check every sheet still opens
      and closes: pin-to-jar, draw setup, watched date, person picker, the generic picker,
      and both sheets in Jar detail.

## 14. Platform matrix

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

## 15. Blockers to note before starting

1. **No sign-out UI** — T11.6 and repeated auth runs need a temporary button or an app
   reinstall between accounts.
2. ~~**No household switcher**~~ — resolved. The household name is the switcher on
   every tab that prints one (§13), and it is also the only route to creating or
   joining a second household.
3. **No Library browse screen** — titles can now be added in-app (Add a title, §9), but
   there's still no screen to browse or search what's already in the Library; a slip
   only becomes visible by landing in a jar whose filter matches it.
4. **Seed vs hosted mismatch** — `seed.sql` is local-only; port the inserts by hand for
   hosted testing (§1).
