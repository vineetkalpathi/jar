# Database workflow

The schema lives in `supabase/migrations/` as hand-authored SQL — the **imperative
migrations** workflow. (Supabase also offers *declarative schemas*, where you edit a
desired end-state in `supabase/schemas/` and generate migrations from it. This project
does not use that; if `supabase/schemas/` ever appears, the rules below change.)

The CLI is a dev dependency, so every command is `npx supabase …`.

## Running it locally

```bash
npx supabase start          # boots Postgres, Auth, PostgREST, Studio in Docker
npx supabase db reset       # drops the DB and replays every migration from scratch
npx supabase stop           # when you're done
```

`db reset` is the one that matters. It proves migrations are **replayable from
nothing** — which is exactly what will happen on a fresh environment. Run it often; a
migration that only works incrementally is a broken migration.

It then loads [`supabase/seed.sql`](../supabase/seed.sql): two Households that must not
see each other, a Library with enough opinions for a Filter to have something to match,
and Jars carrying real [ADR-0009](./adr/0009-filter-json-encoding.md) filter trees. Sign
in as `alice@example.com`, `bob@example.com` or `cara@example.com`, password
`jarjarjar`. Browse it at Studio on <http://127.0.0.1:54323>.

The seed is local-only — it is not a migration and never reaches a deployed
environment.

## Making a schema change

1. **Create the file — never hand-name it.** The timestamp format is load-bearing for
   ordering:
   ```bash
   npx supabase migration new add_household_invites
   ```
2. **Write the SQL** in the generated file.
3. **Apply and verify:**
   ```bash
   npx supabase db reset
   npx supabase migration list --local
   ```

To *explore* before committing to a migration, run SQL directly and iterate freely:

```bash
npx supabase db query "select * from jar limit 5;" --local
```

Once you're happy, write it into a migration file properly. Don't reach for
`apply_migration`-style shortcuts that write history entries on every call — they leave
you unable to iterate, and later diffs come out empty or conflicting.

## Before committing a change

```bash
npx supabase db advisors --local --type security
npx supabase db advisors --local --type performance
docker exec -i supabase_db_jar psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/tests/rls_test.sql
```

The RLS test runs against the seeded database, so every fixture it creates is namespaced
(`RLS Global Title`, `rls-alice@test.invalid`) and every assertion is scoped to its own
rows. Counting whole tables would measure the seed instead of the policies.

Advisors are a linter — necessary, not sufficient. The RLS test is what actually proves
one household cannot see another's data. It caught a bug advisors did not: policies were
correct but `authenticated` had no table `GRANT`, so every query failed with "permission
denied" regardless. **RLS decides which rows; grants decide whether the table is
reachable at all.** You need both.

The test creates two users in two separate households, asserts isolation in both
directions, and rolls everything back.

## Deploying

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

**Migrations are immutable once pushed.** Before the first deploy — where this project
is now — editing a migration in place and re-running `db reset` is correct and clean.
After the first deploy, a change is always a *new* migration, never an edit to an old
one.

## Accepted advisor warnings

`db advisors --type security` reports six `rls_policy_always_true` warnings. All are
deliberate:

| Table | Why |
| --- | --- |
| `household` (insert) | You create a household *before* you are a member of it, so the check cannot reference membership |
| `person`, `title_credit`, `title_genre` | A shared TMDB cache the client rewrites on refresh — see below |
| `rating_category` (insert) | Coining a Category is find-or-create by name, open to anyone |
| `rating_category` (update) | Policy permits UPDATE, but a **column grant** narrows it to `archived_at`, so names cannot be changed. The linter inspects policies and cannot see the grant |

## Creating a household cannot use `RETURNING`

Because `household_select` requires membership and you are not yet a member of a
household at the instant you create it, Postgres applies the SELECT policy to the
returned row and the statement fails:

```
insert into household (name) values ('...');            -- ok
insert into household (name) values ('...') returning id; -- 42501
```

So `supabase.from('household').insert(...).select()` — and anything else with
`Prefer: return=representation` — fails with *"new row violates row-level security
policy"*, even though the insert itself is permitted. The row is genuinely written when
the `RETURNING` is dropped.

This costs nothing in the intended architecture, because writes go to local SQLite first
and the client generates the id itself; it only bites code that reaches for the Data API
directly. Generate the household id client-side, then insert the `household_member` row
with it.

**The genuine residual risk** is `person`, `title_credit` and `title_genre`: any
authenticated user can modify or delete cached catalogue rows that every Household
reads. The blast radius is re-fetchable TMDB data and no personal information is
exposed. The proper fix is moving TMDB sync server-side into an Edge Function holding
the service role, at which point those three become select-only.

## Still to build

**PowerSync sync rules.** [ADR-0004](./adr/0004-local-first-sync-on-supabase-and-powersync.md)
notes that authorisation is encoded in two places that must agree. The RLS policies here
are one; the PowerSync sync rules are the other, and they do not exist yet. A mismatch
shows up as data that syncs but shouldn't, or doesn't sync and should.
