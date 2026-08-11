# Three annotation concepts, one filter language

Facts about a Title come from three sources with genuinely different lifecycles:
Title Attributes are synced from TMDB and externally owned, Ratings are per-user
numeric scores on a Rating Category, and Tags are user-authored scalar labels. We
store them as three separate concepts rather than collapsing them into one
key/optional-value tag table, but the jar filter language treats all three uniformly
as predicate leaves.

## Considered Options

A single `Tag { titleId, name, value?, userId? }` table was the appealing
alternative — one table, one code path. It was rejected because the three sources
disagree on ownership and lifecycle in ways that would surface as bugs: importing
TMDB cast as tags mints ~89 rows per title and leaves us permanently responsible for
reconciling against TMDB's changes, `userId` would be meaningful for Ratings but not
for Attributes, and nothing would prevent a Title from being tagged both `movie` and
`tv show` when media type is really an intrinsic TMDB fact.

## Consequences

The uniformity that made the single-table design attractive is preserved where it
actually pays off — in the filter language — at the cost of three storage shapes
instead of one.
