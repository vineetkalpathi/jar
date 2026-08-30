-- Cache TMDB's poster path on the Title.
--
-- Display-only enrichment, the same category as `language` and the genre/credit tables
-- (ADR-0003) — it is not something a Jar filter ever matches on. It exists so list
-- views, the Library above all, can show artwork without a live TMDB fetch per row.
--
-- Nullable, like every other cached attribute: hand-entered Titles have no poster, and
-- rows that predate this column stay null until a refresh fills them in.
alter table title add column poster_path text;
