-- Which Household a Viewing happened in.
--
-- A Viewing is user-scoped and always has been: it travels with the person, and its key
-- has no Household in it. That does not change. What changes is that the *occasion* now
-- records where it took place, which is a different fact from who owns the row.
--
-- Before this, the Log derived that attribution by joining through `library_entry`:
-- "every Viewing of a Title this Household stocks". Under one Household per user that
-- reads correctly. Under several it does not — a film watched with family, stocked by
-- two of your Households, appeared in both Logs as though it had been watched twice.
--
-- So the column is the occasion, not the ownership, and it is what the Log selects on.
-- See docs/adr/0010-viewing-records-its-household.md.
--
-- Null is a real value here, not just a backfill artefact: `on delete set null` keeps a
-- person's own history when a Household they watched in is deleted out from under it.
-- The Log renders those as unattributed rather than dropping them.

alter table viewing
  add column household_id uuid references household (id) on delete set null;

-- The Log's own read: one Household's nights, newest first.
create index viewing_household_watched_idx
  on viewing (household_id, watched_on desc)
  where household_id is not null;

-- A Viewing is now readable by anyone in the Household it happened in — including after
-- the viewer has left, which is the point: the group keeps its history. `shares_household`
-- alone stopped being sufficient the moment a departure could orphan a night.
drop policy viewing_select on viewing;
create policy viewing_select on viewing for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.shares_household(user_id))
    or household_id in (select private.my_household_ids())
  );

-- You may still only write your own Viewings, and only attribute them to a Household you
-- are actually in — nothing stops a client stamping someone else's Household otherwise.
drop policy viewing_insert on viewing;
create policy viewing_insert on viewing for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      household_id is null
      or household_id in (select private.my_household_ids())
    )
  );

drop policy viewing_update on viewing;
create policy viewing_update on viewing for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      household_id is null
      or household_id in (select private.my_household_ids())
    )
  );
