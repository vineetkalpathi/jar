# Jar filters are stored as a boolean tree, but the UI builds only two levels

A jar's filter is persisted as an arbitrarily nested boolean tree (AND/OR/NOT over
predicate leaves), while the v1 filter builder only lets the user construct one
shape: a set of ANY-groups combined with AND, with per-predicate negation. A general
tree costs nothing extra to store, so committing to it now means added expressiveness
later is a UI change with no data migration.

## Consequences

The storage type will look over-engineered relative to the UI that writes it. This is
deliberate — do not "simplify" the persisted filter into a flat predicate list to
match the builder. The two-level shape was chosen because it expresses essentially
every real jar (including `(movie OR tv) AND cast has Rob Lowe`) with a UI that is a
stack of cards rather than a drag-and-drop query builder, which is effort better spent
on the draw experience.
