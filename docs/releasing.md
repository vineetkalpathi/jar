# Releasing

Two destinations, in order: **TestFlight**, where a handful of invited people run the
real app on their own phones, and the **App Store**, where anyone with a link (or a
search) can install it and updates arrive on their own. TestFlight is not a detour on
the way to the second — it is the same build, the same credentials and the same store
record, reviewed more leniently. Nothing here is thrown away when you promote.

The distinction that matters throughout: **a build is native, an update is JavaScript.**
Anything that changes native code — a new package with a native module, an SDK bump, a
change to `app.json` that feeds the native project — needs a new build, which means a
new submission and a tester action. Everything else can go out over the air in seconds.
Getting `expo-updates` in before the first tester install is what keeps the second
category large.

## Where the app stands today

Nine things are missing between the current tree and a build that a person who is not
you can install and use. They are listed here so the stages below can assume them, and
roughly in the order they hurt.

| | Gap | Consequence if skipped | Stage |
| --- | --- | --- | --- |
| 1 | No EAS project (`extra.eas.projectId`, `eas.json`) | Nothing can build | 0 |
| 2 | `EXPO_PUBLIC_*` not in EAS | App throws on launch, `supabase.ts` | 0 |
| 3 | `expo-updates` not installed | Every JS fix costs a full rebuild + resubmit | 0 |
| 4 | No password reset | A forgotten password is unrecoverable | 0 |
| 5 | Supabase default mailer | Confirmation emails silently rate-limited | 0 |
| 6 | No TMDB attribution screen | Breaches the TMDB terms (ADR-0003) | 0 |
| 7 | Sign out is labelled "(dev)" | Cosmetic, but it is the only account control | 0 |
| 8 | No account deletion | App Store rejection, guideline 5.1.1(v) | 2 |
| 9 | No privacy policy URL | Cannot complete either store's listing | 2 |

Items 1–7 are prerequisites for handing the app to anyone at all. 8 and 9 are only
enforced at App Store review, but 8 in particular is a design problem rather than a
screen — see [Account deletion](#account-deletion) — so it wants thinking about long
before it blocks a submission.

---

## Stage 0 — make the app releasable

### 0.1 Create the EAS project

The CLI is not a project dependency; install it globally or go through `npx`.

```bash
npm i -g eas-cli
eas login
npx eas-cli@latest init
```

`init` writes `extra.eas.projectId` into `app.json`. Commit it — it is the identifier
every later command resolves against, and a regenerated one orphans your builds.

Then `eas.json`:

```json
{
  "cli": { "version": ">= 16.0.1", "appVersionSource": "remote" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal", "channel": "preview" },
    "production": { "autoIncrement": true, "channel": "production" }
  },
  "submit": {
    "production": { "ios": { "appleId": "", "ascAppId": "" } }
  }
}
```

`appVersionSource: "remote"` puts EAS in charge of the build number and
`autoIncrement` advances it per build. Both stores reject a build number they have seen
before, and managing that by hand in `app.json` is a reliable way to waste a twenty
minute build.

Note the project uses **pnpm** with a `pnpm-workspace.yaml` that exists solely to carry
the `lightningcss` override. EAS reads a workspace file as a monorepo signal; if the
first build fails resolving modules, that file is the first thing to look at.

### 0.2 Move the environment into EAS

`EXPO_PUBLIC_*` variables are inlined into the bundle at **build** time, and `.env` is
gitignored, so EAS Build sees none of it. `src/lib/db/supabase.ts` throws on a missing
URL or key by design, which means a build with an empty environment fails at launch on
the tester's phone rather than in your terminal.

```bash
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL   --value ...
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_KEY   --value ...
eas env:create --environment production --name EXPO_PUBLIC_POWERSYNC_URL  --value ...
eas env:create --environment production --name EXPO_PUBLIC_TMDB_API_TOKEN --value ...
```

Repeat for `preview` if that profile points somewhere different. None of these are
secret — the Supabase key is the publishable one and RLS is what protects it, and the
TMDB token is read-only and revocable by deliberate choice (ADR-0003) — so they are
plain environment variables rather than EAS secrets. That is a decision about *these*
values, not a general rule.

Verify before building, not after:

```bash
eas env:list --environment production
```

### 0.3 Install expo-updates

```bash
pnpm expo install expo-updates
eas update:configure
```

Choose a `runtimeVersion` policy. `appVersion` ties compatibility to the `version`
field in `app.json` — simple, and it forces you to bump the version when native
changes, which you should be doing anyway. `fingerprint` computes it from the actual
native dependency graph and is harder to get wrong; prefer it if you would rather not
have to remember.

The policy is the safety interlock: an update is only delivered to builds whose runtime
version matches, so a JS bundle that calls into a native module the installed build does
not have will never reach it. Getting this wrong is how an OTA update crashes an app on
launch with no way to push a fix, so it is worth reading
<https://docs.expo.dev/eas-update/runtime-versions/> once rather than guessing.

### 0.4 Close the auth loop

Two things that only bite when the user is not you:

**Password reset.** There is no reset screen and `supabase.ts` sets
`detectSessionInUrl: false` with a comment saying sign-in is email and password "for
now". A tester across the country who forgets their password currently has no route
back into their account except you editing the database. This needs a request screen, a
`jar://` deep link handler for the callback, a new-password screen, and the redirect URL
allowlisted under Supabase → Authentication → URL Configuration. The `scheme` is
already `jar` in `app.json`, so the link half is configuration rather than plumbing.

**Custom SMTP.** Supabase's built-in mailer is explicitly for development and allows
only a handful of messages per hour across the whole project. Sign-up returns
`needs-confirmation` when the project requires a confirmed address, so that mailer is on
the critical path of every new account — and `authErrorMessage` in
`src/lib/auth/actions.ts` already carries a case for the hourly cap, which is the error
your family will meet first. Wire a real sender (Resend, Postmark, SES) under Supabase →
Project Settings → Authentication → SMTP Settings before inviting anyone.

The alternative is turning off email confirmation entirely, which is defensible for a
household app of six people and removes the mailer from sign-up — but not from password
reset, so SMTP is needed either way the moment reset exists.

### 0.5 The attribution screen

ADR-0003 records that the TMDB logo and the notice in `README.md` **must** appear in the
app's About or Credits section. That is a term of the API licence, not a preference, and
the app currently has no such screen — `TMDB` appears only as the placeholder caption in
`src/components/poster.tsx`. Both stores also ask you to declare third-party content
during submission, so this is due at Stage 1 regardless.

The same screen is the natural home for the app version, a support email, and later the
privacy policy link and the delete-account control — so it is worth building as a real
Settings/About route rather than a legal footnote. While you are there, `Sign out (dev)`
in `src/app/(app)/household-settings.tsx:274` should lose its suffix and probably move.

---

## Stage 1 — TestFlight

### 1.1 Apple, one time

Everything here happens on Apple's side and gates the first build.

| Where | Action |
| --- | --- |
| [developer.apple.com](https://developer.apple.com/programs/) | Enrol in the Apple Developer Program — **$99/year**, and enrolment can take a day or two to clear. Do it first. |
| App Store Connect | Create the app record. Bundle ID must be exactly `com.vinkal.jar`. |
| App Store Connect | Note the **ASC App ID** (numeric) and your **Team ID** for `eas.json`. |

The app's name in App Store Connect must be globally unique across the store. "Jar"
almost certainly is not available; pick the store-facing name now, since changing it
later means a new record. The name inside the app (`app.json` → `name`) is independent
and can stay as it is.

Credentials themselves need no manual work — EAS generates and stores the distribution
certificate and provisioning profile on first build. `eas credentials -p ios` inspects
them if something looks wrong.

### 1.2 Build and submit

```bash
eas build -p ios --profile production --submit
```

`npx testflight` does the same thing with fewer prompts. Setting `EXPO_APPLE_ID` and
`EXPO_APPLE_TEAM_ID` in your shell skips the interactive questions on every run.

After upload, App Store Connect runs automated processing for a few minutes to an hour.
Export compliance is asked once per build unless you declare it up front — add this to
`app.json` to stop the prompt recurring:

```json
"ios": { "infoPlist": { "ITSAppUsesNonExemptEncryption": false } }
```

That declaration is accurate here: the app uses HTTPS and nothing else cryptographic.

### 1.3 Invite testers

Two groups, and the difference is worth understanding because it decides how much
friction each new tester costs you.

**Internal** — up to 100, but each must be given a role on your App Store Connect team,
which means an Apple ID invitation and acceptance. Builds appear immediately, with no
review. Fine for you and one other person; heavy for family.

**External** — up to 10,000. The first build submitted to an external group gets a
**Beta App Review** (typically under a day); subsequent builds are available as soon as
processing finishes. You can invite by email, or enable a **public link** that anyone
can use to join without you touching App Store Connect again. For testers spread across
the country, the public link is the answer — you send one URL, ever.

External testing needs "What to Test" notes and a beta app description on the record.

### 1.4 What a tester actually does

Install TestFlight from the App Store, open the invite link or email, tap Install. Later
builds arrive as a push notification and update in place with one tap. No cables, no
UDIDs, no profiles, and nothing that requires them to be in the same room as you.

The one obligation: **builds expire 90 days after upload.** An expired build refuses to
launch until the tester installs a newer one. So a new native build every quarter is the
floor, whether or not anything changed — which is another argument for `expo-updates`
carrying the real work in between.

---

## Shipping changes, once people are on it

This is the steady state, and the reason Stage 0.3 is not optional.

**A JavaScript change** — a screen, a filter fix, a copy change, anything under `src/`
that does not pull in a new native dependency:

```bash
eas update --branch production --message "fix cooldown half-life"
```

Testers get it on next launch (or the one after, depending on your update-check policy).
No review, no submission, no tester action. Roll it back by publishing the previous
commit's bundle to the same branch.

**A native change** — a new package with native code, an SDK upgrade, an icon or splash
change, anything in the `ios`/`android`/`plugins` blocks of `app.json`: full rebuild,
resubmit, testers update from TestFlight. Bump `version` in `app.json` when you do, so
the `appVersion` runtime policy does its job.

**A schema change** is a third category and the one with a genuine ordering hazard,
because it spans two systems that must agree:

1. Author and verify the migration locally (`docs/database.md`).
2. `npx supabase db push` against the hosted project.
3. Update `powersync/sync-rules.yaml` and deploy it from the PowerSync dashboard.
4. Update `src/lib/db/schema.ts` to match, and ship it as a build or an update.

`docs/powersync.md` is explicit that a gap between the sync rules and the RLS policies
is the most likely serious bug in this project — a table that replicates to nobody reads
as missing data rather than as a misconfiguration. `src/lib/db/sync-rules.test.ts` and
`supabase/tests/rls_test.sql` are what catch it; run both before step 2, not after.

Old clients keep running against the new schema for as long as someone has not updated,
so migrations should be additive. Dropping or renaming a column that a shipped bundle
still selects breaks that device until it updates.

---

## Stage 2 — the App Store

The build is already the right build. What changes is the review, which is thorough
rather than lenient, and the store record, which now needs to be complete.

### Account deletion

Guideline 5.1.1(v): an app that lets people create an account must let them delete it
from inside the app. This is the item most likely to fail a first submission, and it is
a design question before it is a screen — `docs/README.md` already lists "what happens
to a Household's view of history when a Title leaves its Library" as open, and this is
the same shape of problem one level up:

- What happens to a Household when its last member deletes their account?
- A Household's Library and Jars are shared; a departing member's Ratings and Viewings
  are theirs. ADR-0005 draws that line already — deletion should follow it.
- Deletion has to propagate through PowerSync to co-members' devices, which makes it a
  sync-rules concern as well as a repository one.

Apple accepts a deletion that is initiated in-app and completes asynchronously, but not
one that redirects to a web form or asks the user to email you.

### Everything else the record needs

| Item | Notes |
| --- | --- |
| Privacy policy URL | Required by both stores. Must be publicly reachable and describe the account data, the TMDB calls, and anything you log. |
| App Privacy questionnaire | Apple's data-collection disclosure. Email address, user content, and identifiers all apply here. |
| Screenshots | iPhone 6.9" display, portrait. `supportsTablet` is unset, so no iPad set is needed — leave it that way unless you want to support iPad properly. |
| Description, keywords, subtitle | Modest effort for a family app, but the fields are mandatory. |
| Age rating questionnaire | Straightforward; TMDB content descriptions do not change it. |
| Support URL | Can be a single page. |
| Third-party content declaration | Where TMDB attribution is declared. |

**Sign in with Apple** is *not* required: it is triggered by offering third-party or
social login, and the app has only email and password.

### Unlisted distribution

If the goal stays "friends and family" but you want the App Store's automatic updates
and no 90-day expiry, **Unlisted App Distribution** is the middle option: the app is
installable only via a direct link, invisible to search and browse. It still goes
through full App Review with all of the above, and is requested from Apple separately
after the app is approved. Worth knowing about before you write a store description for
an audience of eight.

### Submit

```bash
eas build -p ios --profile production --submit
```

Then in App Store Connect, attach the build to a version and submit for review. First
review is typically a day or two. Enable **phased release** for updates once real people
depend on it.

---

## Android, briefly

The same build pipeline, different economics, and it is worth deciding early because it
changes what you owe your Android testers.

**Play Console — $25, one time.** The internal testing track takes up to 100 testers by
email, updates arrive automatically like any app, and there is no 90-day expiry. Needs a
Google Cloud service account JSON for `eas submit` to upload; see the Play Console → API
access flow. Play also requires an AAB rather than an APK for store distribution, which
is the EAS default for `production`.

**No store — free.** `eas build -p android --profile preview` produces an APK on a
shareable install link. Zero cost and zero platform paperwork, but every update is a
manual re-install, and Play Protect will warn on sideload. Reasonable for one or two
Android holdouts, painful past that.

Note that `expo-updates` works identically on both, so the APK route is less bad than it
sounds as long as native changes stay rare.

---

## Production backend

The stores are only half of "production". The other half is that
`zktnjdedaeznmgyeijof` and its PowerSync instance are currently serving your development
machine and are about to start serving real people's data.

**Split dev from prod, or accept that you cannot experiment.** Once someone else's
Library lives in that project, an untested migration costs them their data, and
`npx supabase db reset` against the wrong linked project costs everyone theirs. A second
Supabase project plus a second PowerSync instance, pointed at by a `.env` you keep
locally, restores the freedom to break things. `npx supabase start` for a fully local
stack is the cheaper version of the same instinct — the seed data in `supabase/seed.sql`
exists precisely for that.

**Know the free-tier behaviour.** Supabase pauses free projects after about a week of
inactivity, which is unlikely once real users exist but very likely for a dev project
you touch monthly. Free tier also has no point-in-time recovery, so the backup story for
a household's whole Library is a daily snapshot at best. If the data matters to the
people in it, that is what the Pro tier buys.

**Re-verify the two authorisation layers against the deployed schema.** `rls_test.sql`
and `sync-rules.test.ts` are written to be run, and the failure mode they guard —
another Household's rows reaching a device — becomes a real disclosure rather than a
local bug the moment a second household is not also you.

---

## Order of operations

1. EAS project, `eas.json`, environment variables pushed (0.1–0.2).
2. `expo-updates` installed and configured (0.3).
3. First `preview` build, installed on your own device — proves the pipeline against the
   remote backend before Apple is involved.
4. Custom SMTP, password reset, About screen, sign-out cleanup (0.4–0.5).
5. Apple enrolment and the App Store Connect record (1.1) — start the enrolment early,
   it is the only step with a queue you do not control.
6. First TestFlight build, internal group, yourself only (1.2–1.3).
7. External group with a public link; send it out.
8. Live on it. Ship JS updates freely; rebuild when native changes or at 90 days.
9. Account deletion, privacy policy, store listing (Stage 2) when the App Store becomes
   the goal.
