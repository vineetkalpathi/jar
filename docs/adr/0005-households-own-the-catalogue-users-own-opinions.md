# Households own the catalogue, Users own their opinions

> **Status: partially superseded by [ADR-0007](./0007-every-watch-group-is-a-household.md).**
> The core split still holds — Households own the Library, Jars and Tags; Users own
> their Ratings and Viewings. Two things changed: Rating Categories are now a global
> catalogue that each Household activates a subset of, and the cross-household
> `SharedJar` described below no longer exists. Every watch group is a Household.

A Household owns the Library, its Jars, its Tags and its Rating Categories. A User
owns their Ratings and their Viewings, and nobody else's. The line is between shared
vocabulary and private judgement: a Jar must mean the same thing to everyone drawing
from it, while "how good was the soundtrack" is irreducibly personal.

## Consequences

**Rating Categories are household-scoped on purpose.** If each User invented their own,
one person's "Rewatchability" and another's "Re-watch Score" could never be compared or
aggregated, which would quietly foreclose shared Jars. The cost is that nobody gets a
private rating axis.

**Cross-household Shared Jars cannot use that vocabulary.** Because Tags and Rating
Categories are household-owned, they mean nothing outside the Household that coined
them. A Shared Jar is therefore filled by Contribution — each participant putting in
Titles from their own Library — and any Filter it carries may only test Title
Attributes, which come from TMDB and mean the same thing everywhere. This is why a
Shared Jar is a distinct concept rather than a Jar with more members.

**Aggregating Ratings across Users is a read-time concern.** No stored value is a
Title's "score." Any shared Jar predicate must name its aggregator explicitly, because
"we both like it" and "one of us loves it" are different questions.
