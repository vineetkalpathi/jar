# The JSON encoding of a Filter

`jar.filter` is `jsonb` and opaque to Postgres, so the encoding is entirely a client
concern. It is defined in [`src/lib/filter/types.ts`](../../src/lib/filter/types.ts)
and enforced by [`validate.ts`](../../src/lib/filter/validate.ts) beside it; this
records the decisions that shape it. The leaf catalogue it must express is
[filter-leaves.md](../filter-leaves.md), and the semantics it must preserve are
[ADR-0006](./0006-filter-evaluation-semantics.md).

A Filter is `{ version, root }`. A node is either a group — `and` or `or` over one or
more children — or a predicate naming one leaf from the closed catalogue. A Jar with no
Filter stores SQL `NULL`, never an empty tree.

```jsonc
{
  "version": 1,
  "root": {
    "kind": "group",
    "op": "and",
    "children": [
      { "kind": "predicate", "leaf": "mediaType", "op": "is", "value": "movie" },
      { "kind": "group", "op": "or", "children": [
        { "kind": "predicate", "leaf": "genre", "op": "not_contains", "value": "Horror" },
        { "kind": "predicate", "leaf": "genre", "op": "is_null" }
      ]}
    ]
  }
}
```

## There is no NOT node

Negation lives in each leaf's operators — `is_not`, `not_contains`, `not_has`,
`not_by_any` — and the catalogue in filter-leaves.md already names them that way.

This is the load-bearing decision. [ADR-0006](./0006-filter-evaluation-semantics.md)
requires that unknown never matches and that negation does not rescue it: a Title with
no TMDB link fails both `genre = horror` and `NOT genre = horror`. That is a property of
the SQL each operator emits, not of the tree. A generic NOT node invites a compiler to
wrap a subtree in `NOT (...)`, which turns unknown into true and silently reverses the
rule for every leaf underneath it. Making negation unrepresentable except per-operator
means the rule cannot be broken by accident.

The cost is that a leaf without a negative operator cannot be negated. That is the
catalogue's business rather than the encoding's: today only `lastWatched`,
`addedToLibrary` and `lastDrawn` lack one, and each has an operator pair that already
covers both directions.

## Operand shape follows the operator

`between` carries `min`/`max`, comparisons carry `value`, `is_null` carries nothing, and
the relative time operators carry a `duration` while the absolute ones carry a `date`.
So a `between` with one bound, or an `is_null` with a value, is unrepresentable rather
than merely rejected — the discriminated union does the work the validator would
otherwise have to.

`between` alone is ambiguous about its operand: it spans numbers on `runtime` and dates
on `lastWatched`. `LEAF_SPECS` therefore records an operand *family* per leaf, which is
what the validator and, later, the SQL compiler switch on.

## Omitting a modifier means inherit, not "the default written down"

`coverage` and `aggregator` are absent from a predicate unless it overrides them, and
absence resolves against the Household's Rating Policy at evaluation time. Changing a
Household's policy therefore changes what its existing Jars mean, which is the entire
reason for having a Household-level policy.

`raters` and `population` work the other way when present: naming people freezes them.
The builder's "my ratings" resolves to a concrete user id when the Jar is saved, so a Jar
means the same thing on every device — consistent with
[ADR-0006](./0006-filter-evaluation-semantics.md).

An empty `raters` array is rejected. Omit the field to mean the Household; an empty list
would mean nobody, which is unsatisfiable and never what anyone chose.

## References are bare ids

`categoryId`, `tagId`, `personId`, `userId` — no denormalised display name alongside.

The temptation is real, because the sync rules narrow `person` to those credited on
Titles in your own Libraries, so a Filter naming an actor can outlive the local row that
would render their name. Storing the name anyway would be a second source of truth for
something already stored once, against the grain of the "derived, never stored" rule in
[data-model.md](../data-model.md). An unresolvable reference renders as unknown and the
builder can offer to drop the row.

## Unknown fields and future versions are refused, not ignored

A client meeting `version` greater than its own rejects the whole Filter, and any
unrecognised field is an error. Both are cases where the tolerant reading is worse: a
partly-understood Filter evaluates to a Jar that quietly serves the wrong Titles, and
nothing in the UI would suggest anything was wrong. Refusing is visible.

`version` is currently `1`. It exists so that a future encoding change has somewhere to
announce itself — the alternative, inferring the shape, is how tolerant readers become
permanent.

## Two questions this settles that filter-leaves.md left open

**`lastDrawn` needed a scope.** "Titles this Jar has never picked" is the documented
use, but Draw history is household-wide and the leaf did not say which it meant. It
takes an optional `scope` of `this_jar` (the default) or `household`.

**A Title with no Viewings fails every `lastWatched` operator**, in both directions,
rather than being treated as infinitely long ago. "Never watched" already has a leaf —
`watched not_by_any` — and giving `lastWatched` a second way to say it invites Filters
that mean subtly different things depending on which one the user picked. This is why
`lastDrawn` has an `is_null` and `lastWatched` does not: never-drawn has no other
expression, never-watched does.

## Consequences

**The validator is not optional.** A Filter arrives from the builder, from the local
SQLite replica, and from other devices via sync, and only the first is under this
client's control. Nothing should compile a Filter to SQL without parsing it first.

**Filters are parsed from text as well as objects.** The column is `jsonb` in Postgres
but lands in the local SQLite replica as text, so `parseFilter` accepts both.

**Adding a leaf is a three-place change**: the union in `types.ts`, its entry in
`LEAF_SPECS`, and the catalogue in filter-leaves.md. `LEAF_SPECS` is typed as a total
`Record<LeafKind, LeafSpec>`, so forgetting the second fails to compile.

**Depth is capped at 8.** The v1 builder produces two levels
([ADR-0002](./0002-filter-stored-as-tree-ui-limited-to-two-levels.md)); the cap exists
so a malformed or hostile tree cannot exhaust the stack, not to constrain the builder.
