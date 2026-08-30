-- How precise viewing.watched_on actually is.
--
-- Two ways a Viewing gets made now. From a list row it is just "seen" — the date
-- defaults to today and carries no real claim about the day. On the Title screen a User
-- can log a rough date instead: a year, or a month, without pinning the day.
--
-- `watched_on` stays a real `date` either way — the omitted parts fall back to the 1st —
-- so recency filters (`filter/recency.ts`) keep working unchanged. This column just
-- records how much of that date to trust, and how to render it back.
--
-- Null means 'day': every row that predates this, and every exact date.
alter table viewing add column watched_precision text
  check (watched_precision in ('year', 'month', 'day'));
