# Jar

A shared movie and TV log with customizable ratings, and "jars" — groupings of titles
a watch group draws from at random when it's time to pick something to watch.

## Language

### People

**User**:
One person with their own account and device. Users own the subjective things —
their Ratings and their Viewings — and nobody else's.
_Avoid_: account, profile, member, viewer

**Household**:
A group who watch together regularly, together with the shared vocabulary that makes
filtering possible: a Library, a set of Tags, and the Rating Categories it has
activated. Any recurring watch group is a Household — a family, a friend group, a
long-distance movie club.
_Avoid_: family, group, team, workspace, space

**Guest**:
Someone who takes part in a Draw without belonging to that Household. Their Viewing is
recorded like anyone's, but they own nothing in it and their Ratings never enter its
Filters.
_Avoid_: visitor, non-member, participant

### The catalogue

**Title**:
A single movie or TV show, shared app-wide — one row per film, not one per Household. A
series is one Title regardless of how many seasons it has; seasons and episodes are not
modelled.
_Avoid_: media object, item, entry, film, show (when meaning the general concept)

**Title Attribute**:
An externally-owned fact about a Title, cached from TMDB — media type, genre, cast,
release year, runtime. Read-only; the app never authors these, and a Title not linked
to TMDB simply has none.
_Avoid_: metadata, TMDB tag, system tag

**Library**:
The set of Titles a Household has deliberately added — and therefore its curated set.
Every Jar draws from its Household's Library, never from TMDB at large. A Title in the
Library that a User has no Viewing for is, by definition, one they want to watch —
there is no separate watchlist.
_Avoid_: collection, catalogue, watchlist

**Viewing**:
A record that one User watched a Title on a given date — for a series, a single
sitting rather than finishing the show. Rewatches are separate Viewings, so
watched-ness, rewatch count, and recency are all derived rather than stored.
_Avoid_: watch, view, play, watch history entry

### Jars

**Jar**:
A named grouping of Titles a Household draws from at random. Its contents are
everything in the Library matching its Filter, plus its Pins, minus its Exclusions — so
a Jar with no Filter is a hand-curated list, and one with no Pins or Exclusions is
purely automatic.
_Avoid_: list, collection, playlist, bucket

**Filter**:
The boolean expression defining which Library Titles a Jar admits, evaluated over
Title Attributes, Tags, Ratings, and Viewings alike.
_Avoid_: query, rule, criteria, search

**Predicate**:
A single test inside a Filter — one Title Attribute, Tag, Rating, Viewing, Library or
Draw fact compared against a value. The leaves of the Filter; the set of them is
closed.
_Avoid_: condition, rule, clause, term

**Pin**:
A Title forced into a Jar regardless of its Filter.
_Avoid_: manual add, include, favourite

**Exclusion**:
A Title kept out of a Jar despite matching its Filter — the veto, so that rejecting a
Title never requires lying about its Tags.
_Avoid_: block, ban, remove

### Drawing

**Draw**:
One occasion of picking from a Jar: the Candidates it served, which were knocked out,
and how the night ended. Recorded, not ephemeral — past Draws are what stop a Jar
serving the same title three Fridays running.
_Avoid_: pick, roll, spin, shuffle, session

**Candidate**:
A Title served by a Draw. Candidates are frozen when the Draw begins, so changing the
Library mid-Draw cannot alter what's on the table.
_Avoid_: option, choice, nominee

**Knock Out**:
Eliminating a Candidate during a Draw. Means "not tonight" and is scoped to that Draw
alone — unlike an Exclusion, which keeps a Title out of a Jar permanently.
_Avoid_: reject, veto, remove, pass

**Cooldown**:
The reduced likelihood of a Title being served as a Candidate shortly after it was
drawn or watched, decaying back to normal over time. Never zero — a Title is made
unlikely, never unavailable, so that a small Jar cannot run out of eligible
Candidates.
_Avoid_: cooloff, penalty, blacklist, recently-played

Every Draw serves `n` Candidates and knocks out until one remains; drawing a single
title is simply `n = 1`. ("I'm feelin' saucy" is button copy for that case, not a
domain term.)

### User annotations

**Tag**:
A scalar label a Household puts on a Title, carrying no value — `cozy`, `date-night`,
`dads-pick`. Scoped to the Household, because a Tag says how *this group* thinks about
a Title. Distinct from a Title Attribute, which comes from TMDB and cannot be edited.
_Avoid_: label, category, keyword

**Rating Category**:
A named dimension a Title can be scored on — plot, acting, cinematography, soundtrack,
rewatchability. Anyone can coin one and the catalogue is app-wide, so a score on an
axis means the same thing in every Household; each Household activates the subset it
cares about. Retired Categories are archived, never deleted, so existing Ratings and
Filters keep their meaning.
_Avoid_: rating type, criterion, axis

**Rating**:
One User's 1–10 score for a single Title on a single Rating Category. Each User owns
their own Ratings and they travel with them between Households; a Title has no single
canonical score.
_Avoid_: score, review, star rating

**Rating Policy**:
How a Household resolves several members' Ratings into one answer for a Filter:
a **coverage** rule (must everyone have rated it, or does one suffice?) and an
**aggregator** (average, lowest, or highest). Set once as a Household default and
overridable by any individual predicate.
_Avoid_: rating strategy, consensus mode, scoring rule
