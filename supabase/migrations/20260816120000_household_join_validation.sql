-- ---------------------------------------------------------------------------
-- Join-code validation
--
-- The join code is a Household's raw id (a stopgap ahead of real invites — see
-- `joinHousehold` in src/lib/db/repositories/households.ts). `household_select`
-- requires an existing membership, so a bad code and a real one look identical to the
-- client: neither is readable before you join. Without this, the only way to find out
-- was to write the membership row optimistically and wait for sync to either deliver
-- the Household or never do so.
--
-- This answers just true/false via a security-definer function, so a bad code fails in
-- one network round trip instead of a guessed timeout, without exposing the Household
-- itself to someone who isn't a member yet.
-- ---------------------------------------------------------------------------

create or replace function public.household_id_exists(check_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.household where id = check_id);
$$;

-- Reachable through the Data API (unlike the `private` schema helpers), but only for a
-- signed-in caller — same rule as everything else in this app.
revoke all on function public.household_id_exists(uuid) from public, anon;
grant execute on function public.household_id_exists(uuid) to authenticated;
