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

-- Logical replication publication. Scoped to `public` deliberately — see below.
create publication powersync for tables in schema public;
```

**Not `for all tables`.** That form publishes every schema in the database, which on
Supabase means `auth`, `storage`, `realtime`, `vault` and the rest — roughly 55 tables
against the 19 that are ours. Nothing extra reaches a device, because sync rules decide
that, but the write-ahead log for all of it is streamed to the PowerSync service, and
`auth.users` carries password hashes, email addresses and refresh tokens. There is no
reason to put those on the wire to replicate a film catalogue.

`for tables in schema public` (Postgres 15+) keeps the property that matters — new
tables are included automatically as migrations add them — without the rest of the
database coming along. Listing tables explicitly has neither property; see the
troubleshooting note below for why enumerating them is the wrong fix.

Note `powersync_role` gets `select` on `public` only — it never sees the `private`
schema, which holds the RLS helper functions and nothing worth replicating.

### If deploying sync rules reports tables "not part of publication"

```
Table "public"."household" is not part of publication 'powersync'.
```

The publication exists but is empty, which happens when it was created without
`for all tables` — Supabase's **Database → Replication** UI creates one that way, and so
does re-running the block above after the `create role` line has already failed.

Check what is actually published, by schema:

```sql
select schemaname, count(*)
from pg_publication_tables
where pubname = 'powersync'
group by schemaname
order by 2 desc;
```

Want a single row: `public`, 19. Zero rows means the publication is empty and nothing
replicates. A count near 55 spread across `auth`, `storage` and `realtime` means it was
created `for all tables` — it works, but see above for why to narrow it.

Either way, recreate rather than adding tables one by one:

```sql
drop publication if exists powersync;
create publication powersync for tables in schema public;
```

`alter publication powersync add table …` for each table named in the error also clears
it, and is the wrong fix. It enumerates the tables that exist *today*, so the next
migration adds a table that replicates to nobody — and a table PowerSync never publishes
is not an error anywhere. It is simply always empty on the device, which reads as
missing data rather than as a misconfiguration. That is the same silent failure mode
`src/lib/db/sync-rules.test.ts` exists to catch on the client side.

Expect 19 tables afterwards, matching the `new Table(...)` declarations in
`src/lib/db/schema.ts`. Then redeploy the sync rules — dropping the publication does not
drop the replication slot, but the instance needs to re-read the schema.

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

### Never alias the table being selected from

A row is published under the name it is selected *as*, so `SELECT h.* FROM household h`
syncs into a local table called `h`. The client declares `household`, so the query
succeeds, replicates correctly, and lands somewhere nothing reads — an account that
looks empty rather than broken.

Joined tables are unaffected: their aliases only exist to write the `ON` clause and
never reach the client. Only the source table is spelled out in full, and every query
in the file follows that rule. The dashboard validator warns about this, and it caught
it here on every one of the seven streams.

`src/lib/db/sync-rules.test.ts` now checks it, along with the rest of the agreement
between this file and `schema.ts`: no aliased sources, nothing published that the
client does not declare, and nothing declared that never syncs.

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

The structural half is automated in `src/lib/db/sync-rules.test.ts` — that the rules and
the client schema name the same tables. That is the cheap half.

The expensive half, whether the rules and the RLS policies grant the same *visibility*,
has no automated check. Until it does, the manual test is: sign in as a user in one Household, confirm the
local SQLite replica contains nothing belonging to another. The RLS half already has a
test at [`supabase/tests/rls_test.sql`](../supabase/tests/rls_test.sql); the sync half
does not.
