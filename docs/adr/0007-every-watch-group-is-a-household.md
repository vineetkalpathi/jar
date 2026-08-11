# Every watch group is a Household; Rating Categories are global

Supersedes parts of [ADR-0005](./0005-households-own-the-catalogue-users-own-opinions.md)
and [ADR-0004](./0004-local-first-sync-on-supabase-and-powersync.md).

A Household is not a family — it is **the unit of shared vocabulary**, and it exists so
that filtering is possible. A Filter needs a bounded catalogue, Tag names that mean one
thing, and rating axes that are comparable between people. Any group you watch with
regularly gets its own Household: your family, a friend group, a long-distance movie
club. There is no separate SharedJar concept.

Three structural changes make this work.

**Titles are global.** One row per film app-wide, with a Household's Library expressed
as a join. Previously each Household held its own copy of every Title, which meant a
person belonging to two Households rated the same movie twice, and TMDB attributes were
cached and refreshed once per Household.

**Rating Categories are a global catalogue; each Household activates a subset.** A
Rating is keyed on its Category, so household-scoped Categories would have partitioned
ratings by group and reintroduced double-rating through the back door. Global
Categories mean one score per person per axis, valid in every group they join. Each
Household chooses which subset appears in its rating UI and filter builder, so a friend
group isn't cluttered by axes only your family cares about.

**Tags stay household-scoped.** The asymmetry with Categories is deliberate: a Tag is a
statement about how *this group* thinks about a Title — `date-night` means something
different with your sister than with a friend group — while a Rating is a statement
about what *you* think, full stop. Collective things are scoped; personal things travel.

## Considered Options

A dedicated `SharedJar` entity — an ad-hoc group holding hand-picked Contributions
across Households — was the earlier design and is now removed. It could not support
Filters, because Tags and Rating Categories had no meaning across Households, which
left the two jar concepts with an awkward and blurry boundary. Household-per-watch-group
gives every group the full feature set instead, and the curation that Contributions
provided now happens in the Library, which is where "which Titles do we care about"
belongs.

## Consequences

**Filtering a curated set works with no special case.** A group's Library *is* its
hand-picked set, so an ordinary Jar Filter over it narrows exactly those Titles. No
"Pins, but filtered" composition rule is needed.

**Deleted:** `SharedJar`, `SharedJarParticipant`, `Contribution`, the attribute-only
Filter restriction, the XOR foreign key on `Draw`, and the parked question of matching
Rating Categories by name across Households.

**Ratings become visible in every Household a User joins.** This is the point — it is
what stops double-rating — but it is a real disclosure. Joining a group exposes your
scores to that group's Filters.

**The global Category namespace can accumulate near-duplicates** as unrelated users
coin their own axes. Per-household activation contains the symptom; it does not prevent
the growth.

**Sync and RLS simplify.** There is no longer any cross-household row exposure to
express, which removes the most error-prone case from the two places authorisation is
encoded. Titles and Rating Categories become globally readable; Libraries, Tags, Jars
and Draws stay household-scoped.

**Guests remain the answer for one-off nights.** Household-per-group is for people you
watch with repeatedly. A visitor is a `DrawParticipant` who is not a member: they take
part in the knock-outs, their Viewing is recorded, and the Household's Filters are
untouched.
