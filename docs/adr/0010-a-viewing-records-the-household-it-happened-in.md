# A Viewing records the Household it happened in

`Viewing` gains a nullable `householdId`. This is a deliberate exception to the rule in
[data-model.md](../data-model.md) that user-scoped rows carry no Household, so it is
written down rather than left to be discovered.

The rule it bends is still the right rule. A Rating and a Viewing belong to a person and
travel with them into every group they join; that is what makes
[ADR-0005](./0005-households-own-the-catalogue-users-own-opinions.md)'s split work, and
`householdId` does not change it. `Viewing` is still keyed on nothing but its own id,
still readable as "this person watched this film", still unaffected by a Household being
renamed, left or deleted.

What the column records is the **occasion**, not the ownership. Where you were, not
whose row it is.

## Why it became necessary

The Log used to derive that attribution rather than store it, by joining through
`library_entry`: *every Viewing of a Title this Household stocks*. Under one Household
per user that is indistinguishable from the truth. It stops being true the moment a
person belongs to two.

A film you watched with your family, stocked by both your Households, appeared in both
Logs — once each, as though you had watched it twice. There was no fact anywhere in the
database that could tell those two Logs apart, because the occasion had never been
recorded. No query could have fixed it.

## Consequences

**The Log selects on the stamp.** `VIEWINGS_FOR_HOUSEHOLD` filters on `household_id`
rather than joining `library_entry`. A night now belongs to exactly one Household, and it
survives the Title being taken off that shelf.

**The user-scoped Log becomes possible.** One list spanning every Household, each night
labelled with where it happened, is only legible because the occasion is recorded. That
is the feature the column was added for.

**Membership no longer gates history, on either side.** The `household_member` join is
gone from the Log. Someone who has left the group was still there that evening, and
erasing them rewrites what happened; symmetrically, your own nights in a Household you
have left stay in your own Log. Two things follow from that, and both are handled in
`powersync/sync-rules.yaml` rather than by denormalising names onto the Viewing row:

- the `households` stream syncs any Household you have a Viewing in, and the display name
  of anyone who has watched in one of yours;
- the `catalogue` stream syncs any Title you have a Viewing of or a Rating on, since a
  user-scoped opinion outlives the library entry that used to make its Title sync.

Denormalising the household and title names onto `viewing` would have been simpler and
was rejected: it is a second source of truth for a name that can change, and
data-model.md's "Derived, never stored" exists to prevent exactly that.

**"Everyone was there" is now containment, not a count.** The amber edge on a Log card
compares the set of watchers against the set of current members. A headcount was
equivalent only while the Log could contain nothing but current members, which is no
longer true — and will be less true still once Guests exist.

**Null is a real value.** `on delete set null` keeps a person's history when a Household
is deleted out from under it. The Log renders those nights unattributed rather than
dropping them. `recordViewing` nonetheless requires a Household: every caller knows the
answer — a screen has an active one, a Draw has one through its Jar — and an optional
argument would let a night be written with no occasion at all, which is precisely the
row nothing can place.

**A Draw reads its Household from its Jar**, not from whatever the app is showing. A
Draw is an occasion in one specific group, and the active Household can change between
starting one and finishing it.

## What this does not do

It does not make Ratings household-aware, and nothing here should be taken as licence to.
A Rating is keyed `(userId, titleId, categoryId)` and stays that way: one score per person
per axis, the same score in every group. What varies per Household is only which axes are
*surfaced* — `household_category` — and a score on an axis a Household hasn't activated is
shown to its owner, marked as not counted there, rather than hidden or auto-activated.
