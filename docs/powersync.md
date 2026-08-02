# PowerSync setup

PowerSync keeps a full SQLite replica of a user's data on each device, synced against
Supabase Postgres, so jar filters run locally and instantly with no network — see
[ADR-0004](./adr/0004-local-first-sync-on-supabase-and-powersync.md).

## The thing to understand first

PowerSync connects using a role with **`BYPASSRLS`** and reads the write-ahead log
directly. **Your RLS policies do not constrain what PowerSync replicates.** The two
authorisation layers guard different paths:

| Layer | Guards | Enforced by |
| --- | --- | --- |
| Sync rules (`powersync/sync-rules.yaml`) | what lands on a device — reads | PowerSync |
| RLS policies (`supabase/migrations/`) | what a client may write back | Supabase Data API |

A gap in the sync rules leaks another Household's data onto a device even if RLS is
perfect. They must agree, and a mismatch is the most likely serious bug in this
project.

## Every synced table needs an `id`

PowerSync requires a single text-type primary key column named `id` on every table it
syncs, and does not support composite keys. Ten of Jar's tables are join tables whose
natural key is the columns that carry their meaning, so they carry a surrogate `id` and
enforce that natural key as a `UNIQUE` constraint instead.

The alternative was concatenating the composite key into an id inside the sync rules
(`select *, household_id || '.' || title_id as id from library_entry`). That leaves the
Postgres schema alone, but the id then exists only on the device, so every write to
those ten tables becomes a special case in the upload connector — and those ten are
where nearly all writes land: ratings, viewings, library entries, tags, jar overrides.

The consequence to remember when writing the connector: two devices doing the same thing
offline generate two rows with different ids, and the second upload hits the unique
constraint. On these tables a unique violation means "already applied", and the
operation can be dropped rather than retried.

## 1. Database setup (one-time, against the hosted project)

Run this in the Supabase SQL editor. It is **not** a migration: it contains a
credential, and migrations are committed to git.

A copy with verification and teardown queries alongside it is at
`supabase/snippets/powersync-setup.sql` — fill in the password there and run it from
your editor. That directory is gitignored, precisely because that is where the real
password ends up, so the listing below stays the reference copy a fresh clone gets.

```sql
-- Replication user. Generate a strong password; store it in your password manager.
create role powersync_role with replication bypassrls login password '<generated>';
grant select on all tables in schema public to powersync_role;
alter default privileges in schema public grant select on tables to powersync_role;

-- Logical replication publication.
create publication powersync for all tables;
```

`for all tables` is the simple option and correct at this scale. On large datasets it
can cause memory spikes, in which case list tables explicitly.

Note `powersync_role` gets `select` on `public` only — it never sees the `private`
schema, which holds the RLS helper functions and nothing worth replicating.

## 2. Connect the instance

In the PowerSync Dashboard → **Database Connections** → Postgres tab: paste the
Supabase connection string, replace the credentials with `powersync_role` and its
password, **Test Connection**, then **Save**. PowerSync bundles Supabase's CA
certificate, so TLS verification needs no extra configuration.

## 3. Deploy sync rules

The rules live in [`powersync/sync-rules.yaml`](../powersync/sync-rules.yaml), kept in
this repo so they are reviewable alongside the RLS policies they must agree with.
Deploy them through the Dashboard's **Sync Streams** view, which validates before
applying.

They are organised to mirror the scoping in [data-model.md](./data-model.md):

- **household-scoped rows** — only for households the user belongs to
- **user-scoped rows** — the user's own *plus their co-members'*, because a Filter
  aggregates the whole household's Ratings and that has to be computable offline
- **global rows** — narrowed to the subset the user's Libraries actually reference, so
  a device never replicates the entire title catalogue

> ⚠️ The current file is a **draft** and has not been validated against a live
> PowerSync instance. Validate it in the Dashboard before relying on it.

## 4. Client auth

Enable Supabase Auth in the PowerSync **Client Auth** settings. Clients then present
their Supabase session, and `auth.user_id()` inside the sync rules resolves to the
signed-in user.

## 5. Client wiring

Writes go to local SQLite first and queue for upload through the Supabase Data API when
connectivity returns — which is where the RLS policies apply.

| File | Role |
| --- | --- |
| [`src/lib/db/schema.ts`](../src/lib/db/schema.ts) | The local tables, mirroring the Postgres schema |
| [`src/lib/db/supabase.ts`](../src/lib/db/supabase.ts) | Auth, and the Data API the upload queue writes through |
| [`src/lib/db/connector.ts`](../src/lib/db/connector.ts) | Supplies the session token and drains the upload queue |
| [`src/lib/db/database.ts`](../src/lib/db/database.ts) | Opens the database; the one file a web build would replace |
| [`src/lib/db/ids.ts`](../src/lib/db/ids.ts) | Client-generated primary keys |
| [`src/lib/db/time.ts`](../src/lib/db/time.ts) | Writing and reading the two timestamp renderings |
| [`src/lib/db/constraints.ts`](../src/lib/db/constraints.ts) | The Postgres checks, re-performed before a local write |
| [`src/lib/db/repositories/`](../src/lib/db/repositories/) | Reads as watchable SQL, writes as functions |

Set `EXPO_PUBLIC_POWERSYNC_URL` to the instance endpoint — see `.env.example`.

Three things stop being enforced once a row is on the device, because SQLite carries
none of them: **not null, checks and unique constraints**. A rating of 47 inserts
happily locally and fails on upload, so validation cannot be assumed from the schema.
[`constraints.ts`](../src/lib/db/constraints.ts) re-performs those checks before a local
write, and the repositories call it — see the note on the upload queue below for what
happens to a row that slips through.

**A native rebuild is required.** `@op-engineering/op-sqlite` is a native module, so
`npx expo prebuild --clean` and a fresh `pod install` are needed before the app will
launch — Expo Go cannot load it.

## The upload queue blocks

It is strictly ordered: a failing write is retried before anything behind it is sent.
That makes error classification in the connector load-bearing rather than cosmetic. A
rejected write retried forever wedges the queue, every later change silently stops
reaching the server, and the app carries on looking perfectly healthy.

`connector.ts` therefore drops permanently-failing operations and logs them, and retries
only what a later attempt could plausibly fix. `23505` is the expected member of that
list rather than an exceptional one — see the surrogate id note above.

## Verifying the two layers agree

There is no automated check that sync rules and RLS policies grant the same visibility.
Until there is, the manual test is: sign in as a user in one Household, confirm the
local SQLite replica contains nothing belonging to another. The RLS half already has a
test at [`supabase/tests/rls_test.sql`](../supabase/tests/rls_test.sql); the sync half
does not.
