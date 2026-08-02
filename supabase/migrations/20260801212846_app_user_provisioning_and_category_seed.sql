-- app_user provisioning, and the starter Rating Category catalogue.
--
-- Two gaps the initial schema left open:
--
--   1. app_user.id references auth.users, but nothing created the row. Signing up
--      produced an auth identity with no domain User, so the first household_member
--      insert failed on its foreign key.
--   2. docs/data-model.md marked the starter set of Rating Categories "TBD".

-- ---------------------------------------------------------------------------
-- app_user provisioning
--
-- A trigger rather than a client insert. Writes from the app go through PowerSync's
-- upload queue, so a client-side "insert my app_user row" would race the first
-- household_member write and can be arbitrarily delayed offline — while the FK it
-- satisfies is checked the moment that write lands. Provisioning at the source of
-- identity removes the ordering problem entirely.
--
-- display_name is resolved once, at signup, and never touched again: it is
-- user-editable through app_user_update, and re-syncing it from auth metadata would
-- silently revert a rename.
-- ---------------------------------------------------------------------------

create or replace function private.provision_app_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.app_user (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Someone'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Not reachable through the Data API: `private` is granted to authenticated for the
-- policy helpers, so revoke execute on this one explicitly.
revoke execute on function private.provision_app_user() from public, authenticated;

create trigger provision_app_user_on_signup
  after insert on auth.users
  for each row
  execute function private.provision_app_user();

-- Backfill. A no-op on a fresh database, but `db reset` is not the only way this
-- migration runs — anyone who signed up before it existed has no app_user row.
insert into public.app_user (id, display_name)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Someone'
  )
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Starter Rating Categories
--
-- The five axes CONTEXT.md names when it defines the concept. Deliberately small:
-- Categories are a global find-or-create catalogue, so a household wanting "Cosiness"
-- coins it in one step, whereas a long starter list is clutter every household has to
-- prune. "Overall" is deliberately absent — a single undifferentiated score is what
-- Rating Categories exist to replace.
--
-- The ids are fixed constants rather than gen_random_uuid(), and are mirrored in
-- src/lib/rating-categories.ts. Creating a household seeds household_category, and
-- that write happens on the device, possibly before the categories sync stream has
-- delivered anything. Fixed ids let the client reference them without a lookup.
--
-- Seeding the *global* rows here is right; activating them per household is a client
-- write, because household creation must work offline.
-- ---------------------------------------------------------------------------

insert into rating_category (id, name) values
  ('00000000-0000-4000-8000-000000000001', 'Plot'),
  ('00000000-0000-4000-8000-000000000002', 'Acting'),
  ('00000000-0000-4000-8000-000000000003', 'Cinematography'),
  ('00000000-0000-4000-8000-000000000004', 'Soundtrack'),
  ('00000000-0000-4000-8000-000000000005', 'Rewatchability')
on conflict do nothing;
