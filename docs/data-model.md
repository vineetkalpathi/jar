# Data model

The entities behind the language in [CONTEXT.md](../CONTEXT.md). This is the bridge
between the glossary and the tables — it records structure and the constraints that
carry meaning, not column types or DDL.

The schema itself lives in
[`supabase/migrations/`](../supabase/migrations/20260731000000_initial_schema.sql) and is
the source of truth for types, indexes and row-level security. This document stays as
the explanation of *why* it is shaped that way.

Terms are capitalised where they are defined in the glossary.

## Scoping

Three scopes, and which one a row sits in is the model's central decision — see
[ADR-0007](./adr/0007-every-watch-group-is-a-household.md).

| Scope | Entities | Why |
| --- | --- | --- |
| Global | Title, TitleCredit, TitleGenre, Person, RatingCategory | Facts and axes that mean the same thing everywhere |
| Household | LibraryEntry, Tag, TitleTag, HouseholdCategory, Jar, Pin, Exclusion, Draw | Vocabulary and curation belonging to one watch group |
| User | Rating, Viewing | Irreducibly personal; travels with the person between Households |

Nothing is scoped to one Household but readable by another, which is what keeps the RLS
policies and PowerSync sync rules simple enough to keep in agreement.

## People

**User** — one person with an account. Identity comes from Supabase auth.

| Field | Notes |
| --- | --- |
| `id`, `displayName` | |

**Household** — a recurring watch group and the vocabulary it shares. A User may belong
to several.

| Field | Notes |
| --- | --- |
| `id`, `name` | |
| `ratingCoverage` | `any` \| `all` — default `any` |
| `ratingAggregator` | `avg` \| `min` \| `max` — default `avg` |

**HouseholdMember** — key `(householdId, userId)`.

## Catalogue

**Title** — global. One row per film or series app-wide; a series is one Title
regardless of seasons. Attribute fields are cached from TMDB and all nullable, because
a Title need not be linked to TMDB at all.

| Field | Notes |
| --- | --- |
| `id` | |
| `tmdbId` | nullable; unique where present |
| `name` | present even when unlinked |
| `mediaType` | `movie` \| `tv`, nullable |
| `releaseYear`, `runtime` | nullable; `runtime` in minutes |
| `language` | nullable text — TMDB's `en-US` name ("English"), not an ISO code. See [ADR-0008](./adr/0008-store-genre-and-language-as-names.md) |
| `attributesRefreshedAt` | nullable — drives the 6-month TMDB cache obligation |
| `ownerHouseholdId` | nullable; set **only** for hand-entered Titles, keeping them private to their creator |

**LibraryEntry** — key `(householdId, titleId)`. "This Household has this Title." The
Library is this join, and it is also the Household's curated set.

| Field | Notes |
| --- | --- |
| `addedByUserId` | metadata, not ownership |
| `addedAt` | filterable via `addedToLibrary` |

**Person** — `id`, `tmdbPersonId`, `name`. Global.

**TitleCredit** — key `(titleId, personId, role)` where `role` is `cast` or `director`.
Normalised rather than a JSON array so `castMember contains` is an indexed lookup.

**TitleGenre** — key `(titleId, genre)`, where `genre` is TMDB's `en-US` display name
("Action"), not its numeric id. TMDB must therefore always be queried with
`language=en-US`, or the same film yields different genre spellings for different
users and saved Filters stop matching. See
[ADR-0008](./adr/0008-store-genre-and-language-as-names.md).

## Annotations

**Tag** — household vocabulary. Unique on `(householdId, name)`.

**TitleTag** — key `(householdId, titleId, tagId)`. Carries `householdId` explicitly
because `titleId` is global.

**RatingCategory** — a global catalogue. Unique on `name`, case-insensitive: coining a
Category is find-or-create, so two people scoring "Cosiness" are scoring the same axis.

| Field | Notes |
| --- | --- |
| `id`, `name` | |
| `archivedAt` | nullable — archived, never deleted, so existing Ratings and Filters keep their meaning |

**HouseholdCategory** — key `(householdId, categoryId)`. Which Categories a Household
surfaces in its rating UI and filter builder. Keeps a friend group from seeing axes only
your family cares about. A new Household is seeded with the starter set below.

**Rating** — key `(userId, titleId, categoryId)`. No Household appears in the key, which
is what lets a Rating travel with its User into every group they join.

| Field | Notes |
| --- | --- |
| `value` | 1–10 |
| `updatedAt` | |

**Viewing** — deliberately *not* keyed on `(titleId, userId)`: rewatches are separate
rows.

| Field | Notes |
| --- | --- |
| `id`, `titleId`, `userId` | |
| `watchedOn` | for a series, a single sitting rather than finishing it |

## Jars

**Jar** — household-owned.

| Field | Notes |
| --- | --- |
| `id`, `householdId`, `name`, `createdAt` | |
| `filter` | boolean tree, stored as JSON. General tree even though the v1 builder produces only ANY-groups ANDed together — see [ADR-0002](./adr/0002-filter-stored-as-tree-ui-limited-to-two-levels.md) |

**JarOverride** — key `(jarId, titleId)` with `kind` of `pin` or `exclusion`. Pins and
Exclusions share one table so that "a Title may not be both Pinned and Excluded in the
same Jar" is enforced by the primary key rather than by a trigger.

Contents are `(Library ∩ filter) ∪ Pins − Exclusions`, evaluated as SQL against the
local SQLite replica.

A group that wants a hand-picked jar curates its Household's Library and filters that —
no separate concept is needed.

## Draws

**Draw** — one occasion of picking.

| Field | Notes |
| --- | --- |
| `id`, `jarId`, `drawnAt` | |
| `n` | Candidates served; `n = 1` is "I'm feelin' saucy" |
| `outcome` | `in_progress` \| `watched` \| `abandoned` \| `no_pick` |
| `resultTitleId` | nullable until one Candidate survives |

**DrawParticipant** — key `(drawId, userId)`. `userId` **may reference a non-member**:
that is a Guest. Guests take part in the knock-outs and get a Viewing recorded, while
the Household's Filters and rater populations are untouched.

**Candidate** — key `(drawId, titleId)`. Written when the Draw begins, which freezes the
slate against mid-Draw Library changes.

| Field | Notes |
| --- | --- |
| `knockedOutAt` | nullable; null means still in play |

## Derived, never stored

Storing these would create a second source of truth that can disagree with the first.

| Value | Derivation |
| --- | --- |
| watched? | any Viewing exists for that User and Title |
| rewatch count | count of Viewings |
| last seen | max `watchedOn` |
| want to watch | in the Library with no Viewing by that User |
| currently watching | has a recent Viewing |
| Cooldown weight | decay over recent Draws and Viewings |
| a Title's "score" | there isn't one — Ratings aggregate at read time per the Rating Policy |

## Keys

Every table has a surrogate `id` — including the ten join tables, which read most
naturally as being keyed on the columns that carry their meaning. PowerSync requires a
single primary key column called `id` on every synced table and does not support
composite keys, so those tables would otherwise not sync at all.

The keys below are therefore written as they are *meant*, and the schema enforces each
one as a `UNIQUE` constraint rather than a primary key. Nothing about their meaning
changes; [powersync.md](./powersync.md) has the reasoning and the alternative that was
rejected.

## Constraints that carry meaning

1. `Rating` keyed `(userId, titleId, categoryId)` — one score per person per axis, with no Household in it, so opinions travel.
2. `Viewing` **not** unique per `(titleId, userId)` — rewatches are the point.
3. `RatingCategory.name` unique case-insensitively — comparability depends on it.
4. `Title.tmdbId` unique where present — two Households adding the same film must converge on one row.
5. `Title.ownerHouseholdId` set only for hand-entered Titles; null means globally visible.
6. A Title may not be both Pinned and Excluded in the same Jar — structural, via `JarOverride`'s unique constraint on `(jarId, titleId)`.
7. `Candidate` rows are immutable once written apart from `knockedOutAt`.
8. `RatingCategory.archivedAt` is set, never deleted, while Ratings referencing it exist.
9. A Filter referencing an archived RatingCategory still resolves.
10. `DrawParticipant.userId` need not be a `HouseholdMember` — this is what a Guest is.

## Deliberately deferred to development

These are decided *not* to be decided yet. They do not block a schema; each is recorded
so it isn't mistaken for an oversight.

**Cooldown parameters.** The shape is settled — multiplicative weight, decaying back to
normal over time, never zero, so a small Jar cannot deadlock. The actual half-life and
the relative weight of "recently drawn" versus "recently watched" are to be tuned
against real use. Cooldown is computed from Draws and Viewings, so tuning it changes no
stored data.

## Settled during development

**The Filter JSON shape** is [ADR-0009](./adr/0009-filter-json-encoding.md), implemented
in [`src/lib/filter/`](../src/lib/filter/). The column stays opaque to the
database; validation is the client's job.

**The seed set of Rating Categories** is Plot, Acting, Cinematography, Soundtrack and
Rewatchability — the five axes [CONTEXT.md](../CONTEXT.md) names when it defines the
concept. The global rows are seeded by migration with fixed ids, mirrored in
[`src/lib/rating-categories.ts`](../src/lib/rating-categories.ts); activating them
for a new Household is a client write, because household creation must work offline.

## Open questions

**Removing a Title from a Library.** Ratings and Viewings are user-scoped and reference
the Title directly, so they survive. Whether that is desirable — or whether removal
should warn that history is being orphaned from the group's view — is undecided.

**Concurrent creation of a global Title.** Two Households adding the same film at the
same moment must converge; the unique constraint on `tmdbId` handles the database side,
but the client-side upsert-and-merge behaviour under offline sync is unspecified.

**Governance of the global Category catalogue.** Anyone can coin an axis and it is
visible app-wide. Per-household activation contains the clutter, but nothing prevents
near-duplicates accumulating over time.
