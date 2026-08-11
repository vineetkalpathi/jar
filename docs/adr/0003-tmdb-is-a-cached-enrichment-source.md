# TMDB is a cached enrichment source, not the system of record

A Title is an entity we own, with a nullable `tmdbId`. Linked Titles carry a locally
cached snapshot of their Title Attributes plus a `refreshedAt` timestamp; unlinked
Titles (home videos, fan edits, shorts TMDB has never heard of) carry only a name and
whatever Tags a Household gives them. Jar filters evaluate entirely against local data,
so the app opens instantly and works with no network.

> **Amended by [ADR-0007](./0007-every-watch-group-is-a-household.md).** Titles are now
> global — one row per film app-wide rather than one per Household — so the cached
> snapshot and its refresh are a once-per-film job. Hand-entered Titles stay private to
> their creator via a nullable `ownerHouseholdId`.

## Consequences

**The cache is legally time-bounded.** TMDB's API terms prohibit caching their data
for longer than 6 months, so the snapshot needs a refresh path — this is a licence
obligation, not a performance optimisation, and it is the reason `refreshedAt` exists.

**Refresh must update in place, never delete.** If an expired snapshot were dropped
rather than replaced, `genre = horror` would silently stop matching and the horror jar
would quietly empty. Staleness may degrade to "slightly out of date"; it must never
degrade to "gone."

**Attribution is required.** The app must display the TMDB logo and the notice "This
product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise
approved by TMDB" in an About or Credits section. The free licence covers
non-commercial use only; shipping this commercially would require a separate written
agreement with TMDB.

**Attribute predicates are partial.** Because `tmdbId` is nullable, every filter leaf
over a Title Attribute needs an "unknown" branch. An unlinked Title can never match
`genre = horror` — it can only be reached through Tags.
