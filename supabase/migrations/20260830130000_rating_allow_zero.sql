-- Ratings can now be 0.
--
-- The rating slider's left end is 0.0, not 1.0 — the scale is 0 through 10. The column
-- type is unchanged (`numeric(3, 1)` already covers it); only the range check moves.
alter table rating drop constraint rating_value_range;
alter table rating add constraint rating_value_range check (value between 0 and 10);
