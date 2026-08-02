# Store genre and language as names, not TMDB ids

`TitleGenre.genre` and `Title.language` hold human-readable values ("Action",
"English") rather than TMDB's numeric genre ids or ISO language codes. A reasonable
reader would assume the opposite, so: this is deliberate, and it exists so that
displaying or filtering a Title never requires a second lookup to resolve an id into
something a person can read.

## Consequences

**TMDB must be queried in a fixed locale.** TMDB localizes both genre names and
language names, so requests must pin `language=en-US`. Without that, the same film
yields "Science Fiction" for one user and "Ciencia ficción" for another, saved Filters
silently stop matching, and the same genre accumulates several spellings.

**A TMDB rename is a data migration.** If TMDB renames a genre, existing rows hold the
old value and any saved Filter referencing it drifts. This is rare and the fix is a
bulk update, which was judged cheaper than resolving ids on every render.

**Values are compared as text.** Genre and language predicates are string matches, so
writes should normalise consistently — trimmed, and stored exactly as TMDB returns
them in `en-US`.
