-- The Library Jar (ADR-0011).
--
-- A Jar with no Filter now holds the whole Library, and every Household has exactly one
-- flagged Library Jar: created with the Household (client-side, so it works offline),
-- never filtered, never deleted while its Household exists.

alter table jar add column is_library boolean not null default false;

-- Filtering the Library Jar would silently demote it to an ordinary Jar.
alter table jar add constraint jar_library_has_no_filter
  check (not is_library or filter is null);

-- At most one per Household. Partial, so ordinary Jars are unaffected.
create unique index jar_one_library_per_household on jar (household_id) where is_library;

-- Delete and un-flagging are refused. A Household delete still cascades: the cascade
-- runs after the household row is gone, so the existence check lets it through.
create function private.guard_library_jar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_library
       and exists (select 1 from public.household h where h.id = old.household_id) then
      raise exception 'The library jar cannot be deleted'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if old.is_library is distinct from new.is_library then
    raise exception 'A jar cannot become or stop being the library jar'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger jar_guard_library
  before update of is_library or delete on jar
  for each row execute function private.guard_library_jar();

-- Backfill: every existing Household gets its Library Jar.
insert into jar (household_id, name, is_library)
select h.id, 'Everything', true
from household h
where not exists (
  select 1 from jar j where j.household_id = h.id and j.is_library
);
