-- Ratings gain one decimal place.
--
-- The Title-detail rating slider calibrates to a tenth; the household average has been
-- shown to one decimal all along. `smallint` cannot hold 7.4, so the column becomes
-- `numeric(3, 1)` — three digits, one after the point, which is exactly 1.0 through 10.0
-- in tenths and nothing finer. The range check is unchanged; the type now carries the
-- precision.
alter table rating
  alter column value type numeric(3, 1) using value::numeric(3, 1);

alter table rating drop constraint rating_value_range;
alter table rating add constraint rating_value_range check (value between 1 and 10);
