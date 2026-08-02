# Filter evaluation semantics

A Filter is a boolean tree whose leaves are Predicates over Title Attributes, Tags,
Ratings, Viewings, Library facts and Draw history. Three rules govern how it
evaluates, and each is a deliberate choice a future reader would otherwise be tempted
to "correct."

## Unknown never matches, and negation does not rescue it

Attribute and Rating Predicates use standard SQL three-valued logic. A Title with no
TMDB link has no genre, so both `genre = horror` and `NOT genre = horror` are unknown,
and the Title is excluded either way. Likewise an unrated Title fails
`NOT rating(scare-factor) >= 8`.

This is strict by design. The escape hatch is an explicit `IS NULL` Predicate, which
is cheap precisely because the filter builder produces ANY-groups: "not horror, or
genre unknown" is one group with two rows, no nesting and no new UI. Lenient
semantics were rejected because they have no equally cheap way to express the
opposite — and because they would drop unlinked Titles into a `runtime <= 100` jar
that has no idea how long they are.

Unlinked Titles are meant to reach a Jar by being **Pinned**, not by matching an
attribute Filter.

## Viewings are closed-world

Viewing Predicates are the exception: a Viewing row either exists or it does not, so
there is no unknown case and no three-valued logic. `NOT watched(by any)` means
plainly "nobody has seen it." Do not add null handling here to match the attribute
rules — the asymmetry is correct.

## Activity time is relative by default

`lastWatched`, `addedToLibrary` and `lastDrawn` accept either a relative duration
("older than 2 years") or an absolute date, and the builder offers the relative form
first. Jars are long-lived, and an absolute date silently changes a saved jar's
meaning every day it exists — "not watched since 2024" quietly becomes "not in five
years." Absolute dates remain available because fixed-window retrospective jars are a
genuine use ("what we watched during lockdown") and cost only a mode switch on a leaf
that already needs a value picker.

`releaseYear` is unaffected: it is a Title Attribute and absolute by nature.

## Population defaults to the Household

Any Predicate spanning people — Ratings, Viewings — defaults to the whole Household,
overridable by naming raters explicitly. `lastWatched` aggregates with MAX over that
population, because "we haven't seen it in two years" means the most recent Viewing by
anyone, not the oldest.
