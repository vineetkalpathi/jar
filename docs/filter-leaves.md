# Filter Predicate catalogue

The complete set of Predicates a Jar Filter may contain. The catalogue is **closed** —
adding a leaf type is a deliberate change, not a configuration option — so the filter
builder can offer typed controls and validate what it produces.

Evaluation rules (three-valued logic, closed-world Viewings, relative time, default
population) are in [ADR-0006](./adr/0006-filter-evaluation-semantics.md).

Filters are stored as a general boolean tree; the v1 builder produces one shape only —
ANY-groups combined with AND — per [ADR-0002](./adr/0002-filter-stored-as-tree-ui-limited-to-two-levels.md).

The **JSON encoding** of that tree is [ADR-0009](./adr/0009-filter-json-encoding.md),
implemented in [`src/lib/filter/`](../src/lib/filter/). This catalogue remains the
closed set of leaves it must express: adding one here means adding it to the type union
and to `LEAF_SPECS` in the same change.

## Title Attributes

Cached from TMDB. Absolute; unknown never matches, and negation does not rescue it.

| Leaf | Type | Operators |
| --- | --- | --- |
| `mediaType` | enum `movie` \| `tv` | is, is not |
| `genre` | multi-valued text | contains, not contains, is null |
| `releaseYear` | int | `=` `≠` `<` `≤` `>` `≥`, between, is null |
| `runtime` | int (minutes) | `=` `≠` `<` `≤` `>` `≥`, between, is null |
| `language` | text | is, is not, is null |

`genre` and `language` are TMDB's `en-US` display names ("Action", "English"), not ids
or codes, so these predicates are text comparisons — see
[ADR-0008](./adr/0008-store-genre-and-language-as-names.md).
| `castMember` | person ref | contains, not contains |
| `director` | person ref | contains, not contains |

TMDB keywords, `popularity` and `vote_average` are deliberately **not** filterable —
keywords duplicate the job of Tags with a vocabulary the Household cannot edit, and
`vote_average` duplicates Ratings with a stranger's opinion.

## Tags

Household-owned scalar labels.

| Leaf | Operators |
| --- | --- |
| `tag` | has, does not have |

Tags are **closed-world**, like Viewings and unlike Title Attributes: an untagged Title
matches `does not have cozy`. ADR-0006's unknown rule covers Attributes and Ratings,
both of which come from outside the group — but a Tag is the Household's own vocabulary
on its own Library, so a Title it hasn't called cozy is one the group doesn't consider
cozy. That is knowledge, not a gap.

## Ratings

Three-valued: an unrated Title never matches, in either polarity.

| Leaf | Operators |
| --- | --- |
| `rating(category)` | `=` `≠` `<` `≤` `>` `≥`, between, is null, is not null |

Rating Categories are a global catalogue; a Household activates the subset it uses, and
the filter builder offers only those. A Rating is keyed to the Category rather than to a
Household, so a score travels with its User into every group they join.

Modifiers, each defaulting from the Rating Policy of the Jar's Household:

| Modifier | Values | Default |
| --- | --- | --- |
| `raters` | explicit list of Users | the whole Household |
| `coverage` | any \| all | Household Rating Policy |
| `aggregator` | avg \| min \| max | Household Rating Policy |

"My ratings" in the builder is sugar: it resolves to a concrete user id when the Jar is
saved, never a live self-reference, so a Jar means the same thing on every device.

## Viewings

Closed-world — no unknown case.

| Leaf | Operators | Modifiers |
| --- | --- | --- |
| `watched` | by any, by all (negatable) | `population` |
| `watchCount` | `=` `≠` `<` `≤` `>` `≥` | `population` |
| `lastWatched` | older than, within (relative); before, after, between (absolute) | `population`, aggregated MAX |

A Title nobody has watched fails every `lastWatched` operator, in both directions,
rather than reading as infinitely long ago. "Never watched" is `watched` negated, and
one way of saying it is enough — see
[ADR-0009](./adr/0009-filter-json-encoding.md).

## Library and Draw history

| Leaf | Operators |
| --- | --- |
| `addedToLibrary` | relative + absolute time |
| `addedBy` | is, is not |
| `lastDrawn` | relative + absolute time, is null ("never drawn") |

`lastDrawn` exists for explicit jars like "titles this Jar has never picked." Ordinary
repeat suppression needs no Predicate — Cooldown handles it during the Draw.

It takes a `scope` modifier: this Jar alone (the default, matching that phrasing) or the
whole Household's Draw history.

## Every Jar has the full catalogue

There is no restricted Filter variant. Every watch group is a Household with its own
Library, Tags and activated Rating Categories, so every Jar can use every leaf — see
[ADR-0007](./adr/0007-every-watch-group-is-a-household.md). A group wanting a
hand-picked jar curates its Library and filters that.

## Worked examples

| Jar | Filter |
| --- | --- |
| Action thriller movies | `genre contains action` AND `genre contains thriller` AND `mediaType is movie` |
| Rewatchable TV | `mediaType is tv` AND `rating(rewatchability) > 5` |
| Anything with Rob Lowe | any(`mediaType is movie`, `mediaType is tv`) AND `castMember contains Rob Lowe` |
| Short weeknight pick | `runtime <= 100` AND `watched by any` is false |
| Comfort rewatch | `watchCount >= 3` AND `lastWatched older than 1 year` |
| Not horror, unknowns welcome | any(`NOT genre = horror`, `genre is null`) |
