# A Jar starts as the whole Library

A Jar with no Filter now holds its Household's entire Library. Filters only ever narrow.
Every Household has exactly one **Library Jar** — created with the Household, holding
everything, never filtered and never deleted — and every other Jar is a narrowing of it.

This reverses the rule it replaces: a Jar with no Filter used to be its Pins alone, a
hand-curated list that started empty.

## Why

User feedback, and it matched what the screens were already implying.

- **Building a Jar felt backwards.** The create screen's match count starts at the whole
  Library (`useFilterMatches` has always read `null` as "everything") and each chip
  lowers it — but saving that untouched builder produced an *empty* Jar. The preview and
  the result disagreed about what "no rules" means.
- **A new Household had nothing to draw from.** The first thing a group wants is "pick
  something we own", and it had to build a Filter to get it.
- **The docs already said so.** data-model.md: "A group that wants a hand-picked jar
  curates its Household's Library and filters that."

## Decisions

**`null` Filter means the Library.** Contents are still
`(Library ∩ filter) ∪ Pins − Exclusions`; only the `null` case moves, from "nothing" to
"everything". ADR-0009's encoding is unchanged — no Filter is still SQL `NULL`, never an
empty group.

**Pins are bounded by the Library.** Contents are now
`(Library ∩ filter) ∪ (Library ∩ Pins) − Exclusions`. "A Jar is part of the Library" is
the whole model now, and a Title taken off the shelf must not linger in a Jar because it
was once pinned there. The override row survives; it takes effect again if the Title is
re-added.

**The Library Jar is a real row, flagged.** `jar.is_library`, at most one per Household
(partial unique index), and it may not carry a Filter (check constraint).

- *A row, not a virtual view* — a Draw references a `jar_id`, and Cooldown reads Draw
  history per Jar. A virtual Jar would need a second code path through both.
- *A flag, not a naming convention* — without it, adding a Filter to "Everything"
  silently turns it into an ordinary Jar and the Household loses its main one.
- *Created client-side* inside `createHousehold`'s transaction, like the starter Rating
  Categories, because Household creation must work offline.
- *Delete and un-flagging are refused by a trigger*, not only hidden in the UI. Deleting
  the Household still cascades it away.

**Existing Households are backfilled** by the migration. Existing `null`-Filter Jars are
not converted — the app is still in testing, so they simply start holding the whole
Library.

## What this does to Pin and Hide

**Hide becomes the everyday action; Pin becomes the exception.** Every Library Title is
already in the Library Jar and in every Jar whose Filter it matches, so the common wish
is to keep one *out*. Pin matters only where a Filter leaves a Title out — above all an
unlinked Title under an attribute Filter (ADR-0006).

**In the Library Jar, Pin means nothing** and is not offered. Hide is: it means "we have
it, don't draw it". That is distinct from removing the Title from the Library, which also
takes it out of every other Jar and out of the Library view.

**The Title screen's jar sheet offers both.** A Jar holding the Title offers Hide; a Jar
not holding it offers Pin; an existing override is shown filled and a tap clears it.

**The "N jars" badge leaves the Library Jar out** — it would always count it, so the
number would say nothing.

## Hand-curated Jars

No longer a starting state. The way to build one is a Tag and a Filter on that Tag:
the membership is visible on each Title, reusable across Jars, and survives the Jar
being deleted. Pins remain for the exceptions.

## Consequences

- ADR-0006's "Unlinked Titles are meant to reach a Jar by being Pinned" still holds for
  filtered Jars; in the Library Jar they are simply present.
- `compileFilter` still requires a Filter. `compileJarContents` is the one place `null`
  is interpreted, and it now agrees with the builder's preview.
