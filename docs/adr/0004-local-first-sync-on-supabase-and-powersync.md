# Local-first on SQLite, synced from day one via Supabase and PowerSync

Every device holds a full SQLite replica (`expo-sqlite`) of its Household's data;
Supabase provides Postgres, auth and row-level security upstream, and PowerSync keeps
the replica in sync with real offline support. Multi-user sync is in from the first
release rather than deferred, because Ratings and Viewings are made asynchronously on
each person's own phone — a single-device model would have made the shared Jars that
motivate household-shared Rating Categories impossible.

## Considered Options

A user-keyed but local-only v1 (profiles on one shared device, sync retrofitted later)
was the cheaper path and was rejected deliberately: it would have meant the household
effectively sharing one phone. Hand-rolled sync against Supabase alone was also
considered — viable at this data size, a few thousand rows — but rejected because
tombstones, clock skew, concurrent edits and partial-failure retry are individually
small and collectively the whole application, and they fail silently.

## Consequences

**SQLite is not incidental.** A Jar Filter is a boolean tree evaluated over Title
Attributes, Tags, Ratings aggregated across Users, and Viewings by recency. It is
compiled to SQL and run locally. A document store would mean re-implementing query
evaluation in JavaScript.

**Both free tiers pause after a week of inactivity.** At this scale the app uses well
under 1% of either quota, so the cost is $0 and will stay there; the inactivity pause
is the only real constraint, and weekly use keeps both instances warm. Local-first
makes this survivable rather than fatal — with the backend fully down the app still
opens, filters Jars and runs Draws, and only sync falls behind. If it ever becomes a
problem, PowerSync Open Edition is free and self-hostable.

**Authorisation lives in two places.** Household scoping must be expressed both as
Supabase RLS policies and as PowerSync sync rules. These have to agree, and a mismatch
shows up as data that syncs but shouldn't, or doesn't sync and should.

> **Amended by [ADR-0007](./0007-every-watch-group-is-a-household.md).** This
> consequence originally named cross-household Shared Jars as the case most likely to
> expose a mismatch. That case no longer exists: Titles and Rating Categories are
> globally readable, and everything else is plainly household-scoped, so no rule needs
> to expose one Household's rows to another. A device now replicates the data of every
> Household its User belongs to, not just one.
