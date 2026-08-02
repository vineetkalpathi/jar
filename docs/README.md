# Jar — design documentation

Jar is a movie and TV log with customizable ratings, and **jars**: groupings of titles a
watch group draws from at random when it's time to pick something to watch. It models a
real ritual — pull a few candidates out, knock them out one at a time, watch whatever
survives.

The design is settled. These documents began as the output of a design session and are
intended to be sufficient on their own; where application code now exists it is linked
from the document that specifies it.

## Read in this order

1. **[CONTEXT.md](../CONTEXT.md)** — the glossary. Every capitalised term in these docs
   is defined there, with the wordings we rejected. Start here; the rest assumes it.
2. **[data-model.md](./data-model.md)** — entities, fields, scoping, and the constraints
   that carry meaning. The bridge between the glossary and a schema.
3. **[filter-leaves.md](./filter-leaves.md)** — the closed catalogue of Predicates a jar
   filter can contain, with operators and worked examples.
4. **[database.md](./database.md)** — how to run the database locally, author
   migrations, and verify a change before committing it.
5. **[powersync.md](./powersync.md)** — sync setup, and why sync rules rather than RLS
   are what actually protect reads.
6. **[adr/](./adr/)** — why things are the way they are. Read when a decision looks
   arbitrary, or before changing one.

The schema itself is
[`supabase/migrations/`](../supabase/migrations/20260731000000_initial_schema.sql), with
an isolation test in [`supabase/tests/`](../supabase/tests/rls_test.sql).

## The model in a nutshell

A **Title** is a movie or series, global — one row per film app-wide. A **Household** is
any group who watch together regularly, and it owns the vocabulary that makes filtering
possible: a **Library** of Titles, a set of **Tags**, and the **Rating Categories** it
has activated. A **Rating** belongs to a User rather than a Household, so opinions
travel with people between groups.

A **Jar** is a **Filter** over its Household's Library, plus **Pins**, minus
**Exclusions**. Drawing from one creates a **Draw**, which freezes its **Candidates**,
records who took part, and remembers what got **Knocked Out** — which is what lets
**Cooldown** stop the same film turning up three Fridays running.

## Decisions

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](./adr/0001-three-annotation-concepts-one-filter-language.md) | Three annotation concepts, one filter language | Current |
| [0002](./adr/0002-filter-stored-as-tree-ui-limited-to-two-levels.md) | Filters stored as a tree; UI builds two levels | Current |
| [0003](./adr/0003-tmdb-is-a-cached-enrichment-source.md) | TMDB is a cached enrichment source | Amended by 0007 |
| [0004](./adr/0004-local-first-sync-on-supabase-and-powersync.md) | Local-first sync on Supabase + PowerSync | Amended by 0007 |
| [0005](./adr/0005-households-own-the-catalogue-users-own-opinions.md) | Households own the catalogue, Users own opinions | Partially superseded by 0007 |
| [0006](./adr/0006-filter-evaluation-semantics.md) | Filter evaluation semantics | Current |
| [0007](./adr/0007-every-watch-group-is-a-household.md) | Every watch group is a Household; Categories are global | Current |
| [0008](./adr/0008-store-genre-and-language-as-names.md) | Store genre and language as names, not ids | Current |
| [0009](./adr/0009-filter-json-encoding.md) | The JSON encoding of a Filter | Current |

Superseded ADRs are kept rather than deleted — the reasoning still explains why the
current design is shaped the way it is. Each carries a pointer to what replaced it.

## Stack

Expo SDK 57 / React Native 0.86 / TypeScript. Local SQLite (`expo-sqlite`) as the
working store, Supabase for Postgres, auth and row-level security, PowerSync keeping the
two in sync with real offline support. Jar filters compile to SQL and run against the
local replica, so the app opens and draws with no network. Reasoning in
[ADR-0004](./adr/0004-local-first-sync-on-supabase-and-powersync.md).

`npm test` runs the suite. The filter compiler's tests execute their generated SQL
against a real in-memory SQLite via `node:sqlite`, rather than asserting on the strings
emitted — filter semantics live in how SQL treats NULL, and a string assertion passes
happily on SQL that means the wrong thing.

TMDB supplies Title Attributes. Its terms cap caching at six months and require
attribution — both are obligations, not preferences, and are detailed in
[ADR-0003](./adr/0003-tmdb-is-a-cached-enrichment-source.md).

## Not yet decided

Deliberately deferred, and recorded so they aren't mistaken for oversights — all in
[data-model.md](./data-model.md):

- Cooldown parameters (shape settled, half-life to be tuned against real use)

Genuinely open, needing a product decision:

- What happens to a Household's view of history when a Title leaves its Library
- Client-side convergence when two Households create the same global Title while offline
- Governance of the global Rating Category catalogue
- Household invites — no mechanism is modelled
