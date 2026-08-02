-- Jar — initial schema
--
-- Implements docs/data-model.md. Terms match CONTEXT.md.
--
-- Three scopes, per ADR-0007:
--   global     facts and axes meaning the same thing everywhere
--   household  vocabulary and curation belonging to one watch group
--   user       irreducibly personal, travelling with the person between households
--
-- Nothing is scoped to one household but readable by another, which is what keeps
-- these policies simple enough to stay in agreement with the PowerSync sync rules.
--
-- Every table has a single `id` primary key, including the join tables whose natural
-- key is the columns carrying their meaning. PowerSync requires exactly that and does
-- not support composite keys, so those tables would otherwise not sync at all; their
-- natural keys are UNIQUE constraints instead, which preserves the meaning. See
-- docs/powersync.md.

-- Helper functions live here so they are not reachable through the Data API.
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type media_type        as enum ('movie', 'tv');
create type credit_role       as enum ('cast', 'director');
create type rating_coverage   as enum ('any', 'all');
create type rating_aggregator as enum ('avg', 'min', 'max');
create type draw_outcome      as enum ('in_progress', 'watched', 'abandoned', 'no_pick');
create type jar_override_kind as enum ('pin', 'exclusion');

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

-- Named app_user rather than "user" to avoid ambiguity with auth.users, which owns
-- authentication. This table owns the domain's User.
create table app_user (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);

create table household (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  -- Rating Policy: how several members' Ratings resolve to one answer in a Filter.
  -- Defaults are lenient, so jars stay useful while ratings are sparse.
  rating_coverage   rating_coverage   not null default 'any',
  rating_aggregator rating_aggregator not null default 'avg',
  created_at        timestamptz not null default now()
);

create table household_member (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references household (id) on delete cascade,
  user_id      uuid not null references app_user (id) on delete cascade,
  joined_at    timestamptz not null default now(),

  constraint household_member_household_user_key unique (household_id, user_id)
);

create index household_member_user_idx on household_member (user_id);

-- ---------------------------------------------------------------------------
-- Catalogue (global)
-- ---------------------------------------------------------------------------

-- One row per film or series app-wide. A series is one Title regardless of seasons.
-- Attribute columns are cached from TMDB and all nullable, because a Title need not be
-- linked to TMDB at all (ADR-0003).
create table title (
  id                      uuid primary key default gen_random_uuid(),
  tmdb_id                 integer,
  name                    text not null,
  media_type              media_type,
  release_year            integer,
  runtime                 integer,          -- minutes
  -- TMDB's en-US display name ("English"), not an ISO code — ADR-0008.
  language                text,
  attributes_refreshed_at timestamptz,
  -- Set ONLY for hand-entered titles, keeping them private to their creator.
  -- Null means globally visible.
  owner_household_id      uuid references household (id) on delete cascade,
  created_at              timestamptz not null default now(),

  constraint title_runtime_positive check (runtime is null or runtime > 0),
  -- A hand-entered title has no TMDB identity, and vice versa.
  constraint title_unlinked_has_owner check (tmdb_id is not null or owner_household_id is not null)
);

-- Two households adding the same film must converge on one row.
create unique index title_tmdb_id_key on title (tmdb_id) where tmdb_id is not null;
create index title_owner_household_idx on title (owner_household_id) where owner_household_id is not null;
-- Drives the 6-month TMDB cache obligation (ADR-0003): find rows due for refresh.
create index title_refresh_due_idx on title (attributes_refreshed_at) where tmdb_id is not null;

create table person (
  id             uuid primary key default gen_random_uuid(),
  tmdb_person_id integer not null unique,
  name           text not null
);

-- Normalised rather than a JSON array so `castMember contains` is an indexed lookup.
create table title_credit (
  id        uuid primary key default gen_random_uuid(),
  title_id  uuid not null references title (id) on delete cascade,
  person_id uuid not null references person (id) on delete cascade,
  role      credit_role not null,

  constraint title_credit_title_person_role_key unique (title_id, person_id, role)
);

create index title_credit_person_idx on title_credit (person_id);

-- `genre` is TMDB's en-US display name ("Action"), not its numeric id — ADR-0008.
-- TMDB must always be queried with language=en-US or spellings diverge and saved
-- Filters stop matching.
create table title_genre (
  id       uuid primary key default gen_random_uuid(),
  title_id uuid not null references title (id) on delete cascade,
  genre    text not null,

  constraint title_genre_title_genre_key unique (title_id, genre)
);

create index title_genre_genre_idx on title_genre (genre);

-- ---------------------------------------------------------------------------
-- Library (household)
-- ---------------------------------------------------------------------------

-- "This Household has this Title." The Library is this join, and it is also the
-- Household's curated set — a group wanting a hand-picked jar curates here.
create table library_entry (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references household (id) on delete cascade,
  title_id         uuid not null references title (id) on delete cascade,
  added_by_user_id uuid references app_user (id) on delete set null,
  added_at         timestamptz not null default now(),

  constraint library_entry_household_title_key unique (household_id, title_id)
);

create index library_entry_title_idx on library_entry (title_id);
create index library_entry_added_by_idx on library_entry (added_by_user_id);

-- ---------------------------------------------------------------------------
-- Annotations
-- ---------------------------------------------------------------------------

-- Household vocabulary: a Tag says how *this group* thinks about a Title.
create table tag (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references household (id) on delete cascade,
  name         text not null
);

create unique index tag_household_name_key on tag (household_id, lower(name));

-- Carries household_id explicitly because title_id is global.
create table title_tag (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references household (id) on delete cascade,
  title_id     uuid not null references title (id) on delete cascade,
  tag_id       uuid not null references tag (id) on delete cascade,

  constraint title_tag_household_title_tag_key unique (household_id, title_id, tag_id)
);

create index title_tag_tag_idx on title_tag (tag_id);
create index title_tag_title_idx on title_tag (title_id);

-- A global catalogue. Coining a Category is find-or-create by name, so two people
-- scoring "Cosiness" are scoring the same axis — comparability depends on it (ADR-0007).
create table rating_category (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- Archived, never deleted, so existing Ratings and Filters keep their meaning.
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

create unique index rating_category_name_key on rating_category (lower(name));

-- Which Categories a Household surfaces in its rating UI and filter builder.
-- Seeded on household creation from the starter set in src/lib/rating-categories.ts.
create table household_category (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references household (id) on delete cascade,
  category_id  uuid not null references rating_category (id) on delete restrict,

  constraint household_category_household_category_key unique (household_id, category_id)
);

create index household_category_category_idx on household_category (category_id);

-- No household appears in the natural key: that is what lets a Rating travel with its
-- User into every group they join (ADR-0007).
create table rating (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_user (id) on delete cascade,
  title_id    uuid not null references title (id) on delete cascade,
  category_id uuid not null references rating_category (id) on delete restrict,
  value       smallint not null,
  updated_at  timestamptz not null default now(),

  constraint rating_user_title_category_key unique (user_id, title_id, category_id),
  constraint rating_value_range check (value between 1 and 10)
);

create index rating_title_category_idx on rating (title_id, category_id);
create index rating_category_idx on rating (category_id);

-- Deliberately NOT unique per (title_id, user_id): rewatches are the point. Watched-ness,
-- rewatch count and recency are all derived from these rows.
create table viewing (
  id         uuid primary key default gen_random_uuid(),
  title_id   uuid not null references title (id) on delete cascade,
  user_id    uuid not null references app_user (id) on delete cascade,
  -- For a series, a single sitting rather than finishing the show.
  watched_on date not null,
  created_at timestamptz not null default now()
);

create index viewing_user_title_idx on viewing (user_id, title_id);
create index viewing_title_watched_idx on viewing (title_id, watched_on desc);

-- ---------------------------------------------------------------------------
-- Jars
-- ---------------------------------------------------------------------------

create table jar (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references household (id) on delete cascade,
  name         text not null,
  -- A general boolean tree, even though the v1 builder produces only ANY-groups
  -- ANDed together (ADR-0002). The encoding is ADR-0009 and stays opaque to the
  -- database: validation is the client's job, in src/lib/filter/.
  filter       jsonb,
  created_at   timestamptz not null default now()
);

create index jar_household_idx on jar (household_id);

-- Pins and Exclusions share one table so that "a Title may not be both Pinned and
-- Excluded in the same Jar" is enforced by a constraint rather than by a trigger.
create table jar_override (
  id       uuid primary key default gen_random_uuid(),
  jar_id   uuid not null references jar (id) on delete cascade,
  title_id uuid not null references title (id) on delete cascade,
  kind     jar_override_kind not null,

  constraint jar_override_jar_title_key unique (jar_id, title_id)
);

create index jar_override_kind_idx on jar_override (jar_id, kind);
create index jar_override_title_idx on jar_override (title_id);

-- Jar contents = (Library ∩ filter) ∪ pins − exclusions.

-- ---------------------------------------------------------------------------
-- Draws
-- ---------------------------------------------------------------------------

create table draw (
  id              uuid primary key default gen_random_uuid(),
  jar_id          uuid not null references jar (id) on delete cascade,
  drawn_at        timestamptz not null default now(),
  -- Candidates served. n = 1 is "I'm feelin' saucy" — the same mechanism, not a mode.
  n               smallint not null,
  outcome         draw_outcome not null default 'in_progress',
  result_title_id uuid references title (id) on delete set null,

  constraint draw_n_positive check (n > 0),
  constraint draw_result_requires_finish check (
    result_title_id is null or outcome <> 'in_progress'
  )
);

create index draw_jar_drawn_idx on draw (jar_id, drawn_at desc);
create index draw_result_title_idx on draw (result_title_id);

-- user_id MAY reference someone who is not a household_member: that is a Guest. They
-- take part in the knock-outs and get a Viewing recorded, while the Household's Filters
-- and rater populations are untouched. Deliberately unconstrained.
create table draw_participant (
  id      uuid primary key default gen_random_uuid(),
  draw_id uuid not null references draw (id) on delete cascade,
  user_id uuid not null references app_user (id) on delete cascade,

  constraint draw_participant_draw_user_key unique (draw_id, user_id)
);

create index draw_participant_user_idx on draw_participant (user_id);

-- Written when the Draw begins, which freezes the slate against mid-Draw Library
-- changes. Rows are immutable once written apart from knocked_out_at; enforced in the
-- application, not here.
create table draw_candidate (
  id             uuid primary key default gen_random_uuid(),
  draw_id        uuid not null references draw (id) on delete cascade,
  title_id       uuid not null references title (id) on delete cascade,
  knocked_out_at timestamptz,     -- null means still in play

  constraint draw_candidate_draw_title_key unique (draw_id, title_id)
);

-- Cooldown is derived from these rows plus viewings; nothing about it is stored.
create index draw_candidate_title_idx on draw_candidate (title_id);

-- ---------------------------------------------------------------------------
-- Provisioning
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

-- Anyone who already signed up before this schema existed has no app_user row.
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

-- ---------------------------------------------------------------------------
-- Authorisation helpers
--
-- In the `private` schema so they are not reachable through the Data API, SECURITY
-- DEFINER so that policies consulting household_member do not recurse through its own
-- RLS, and each checks auth.uid() internally so it can only ever answer about its
-- caller. search_path is pinned empty; every reference is schema-qualified.
--
-- Returning a set lets policies say `x in (select ...)`, which Postgres evaluates once
-- as an InitPlan rather than once per row.
-- ---------------------------------------------------------------------------

create or replace function private.my_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id
  from public.household_member
  where user_id = (select auth.uid());
$$;

create or replace function private.my_jar_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select j.id
  from public.jar j
  where j.household_id in (
    select hm.household_id
    from public.household_member hm
    where hm.user_id = (select auth.uid())
  );
$$;

create or replace function private.my_draw_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id
  from public.draw d
  where d.jar_id in (
    select j.id
    from public.jar j
    join public.household_member hm on hm.household_id = j.household_id
    where hm.user_id = (select auth.uid())
  );
$$;

-- True when the given user shares at least one household with the caller.
create or replace function private.shares_household(u uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_member a
    join public.household_member b on a.household_id = b.household_id
    where a.user_id = (select auth.uid()) and b.user_id = u
  );
$$;

-- Not callable by anon or by anything reaching in through the Data API.
revoke execute on all functions in schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.my_household_ids()   to authenticated;
grant execute on function private.my_jar_ids()         to authenticated;
grant execute on function private.my_draw_ids()        to authenticated;
grant execute on function private.shares_household(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Table privileges
--
-- Separate from RLS and required in addition to it: RLS decides which *rows* a role
-- may see once it can reach the table, while these grants decide whether it can reach
-- the table at all. Without them every query fails with "permission denied", policies
-- notwithstanding.
--
-- `anon` is granted nothing. There are no policies for it, and Jar has no public
-- surface — everything requires a signed-in user.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Every policy names `to authenticated`: without it a policy also applies to `anon`,
-- and anonymous sign-ins would satisfy a bare role check.
-- ---------------------------------------------------------------------------

alter table app_user           enable row level security;
alter table household          enable row level security;
alter table household_member   enable row level security;
alter table title              enable row level security;
alter table person             enable row level security;
alter table title_credit       enable row level security;
alter table title_genre        enable row level security;
alter table library_entry      enable row level security;
alter table tag                enable row level security;
alter table title_tag          enable row level security;
alter table rating_category    enable row level security;
alter table household_category enable row level security;
alter table rating             enable row level security;
alter table viewing            enable row level security;
alter table jar                enable row level security;
alter table jar_override       enable row level security;
alter table draw               enable row level security;
alter table draw_participant   enable row level security;
alter table draw_candidate     enable row level security;

-- People -------------------------------------------------------------------

create policy app_user_select on app_user for select to authenticated
  using (id = (select auth.uid()) or (select private.shares_household(id)));
create policy app_user_insert on app_user for insert to authenticated
  with check (id = (select auth.uid()));
create policy app_user_update on app_user for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy household_select on household for select to authenticated
  using (id in (select private.my_household_ids()));
-- Anyone signed in may create a household; they add their own membership immediately
-- after, which is what makes it theirs.
--
-- One consequence worth knowing: because the select policy requires a membership that
-- does not exist yet at that instant, the insert cannot use RETURNING. Generate the id
-- client-side. See docs/database.md.
create policy household_insert on household for insert to authenticated
  with check (true);
create policy household_update on household for update to authenticated
  using (id in (select private.my_household_ids()))
  with check (id in (select private.my_household_ids()));
create policy household_delete on household for delete to authenticated
  using (id in (select private.my_household_ids()));

create policy household_member_select on household_member for select to authenticated
  using (household_id in (select private.my_household_ids()));
-- Either you are joining a household yourself, or an existing member is adding you.
create policy household_member_insert on household_member for insert to authenticated
  with check (
    user_id = (select auth.uid())
    or household_id in (select private.my_household_ids())
  );
create policy household_member_delete on household_member for delete to authenticated
  using (
    user_id = (select auth.uid())
    or household_id in (select private.my_household_ids())
  );

-- Global catalogue ---------------------------------------------------------
-- Titles carry only cached TMDB facts, so they are readable by any signed-in user
-- unless hand-entered, in which case they stay private to their creating household.

create policy title_select on title for select to authenticated
  using (
    owner_household_id is null
    or owner_household_id in (select private.my_household_ids())
  );
create policy title_insert on title for insert to authenticated
  with check (
    owner_household_id is null
    or owner_household_id in (select private.my_household_ids())
  );
create policy title_update on title for update to authenticated
  using (
    owner_household_id is null
    or owner_household_id in (select private.my_household_ids())
  )
  with check (
    owner_household_id is null
    or owner_household_id in (select private.my_household_ids())
  );

-- Cached public facts, shared by everyone. Writable by any signed-in user because a
-- TMDB refresh replaces a Title's credits and genres wholesale, and refresh currently
-- runs on the client — the app has no server component (ADR-0004).
--
-- ACCEPTED RISK: `supabase db advisors` flags these three as unrestricted writes, and
-- it is right. Any authenticated user can alter or delete cached catalogue rows that
-- every Household reads. The blast radius is cached TMDB data, which is re-fetchable,
-- and no personal data is exposed. The proper fix is to move TMDB sync server-side into
-- an Edge Function holding the service role, at which point these become select-only.
create policy person_all       on person       for all to authenticated using (true) with check (true);
create policy title_credit_all on title_credit for all to authenticated using (true) with check (true);
create policy title_genre_all  on title_genre  for all to authenticated using (true) with check (true);

-- Coining a Category is find-or-create by name; archiving needs update. No delete
-- policy: Categories are archived, never deleted, while Ratings reference them.
create policy rating_category_select on rating_category for select to authenticated
  using (true);
create policy rating_category_insert on rating_category for insert to authenticated
  with check (true);
create policy rating_category_update on rating_category for update to authenticated
  using (true) with check (true);

-- The policy above permits UPDATE, but a column grant narrows it to archiving only.
-- Renaming a Category would silently change the meaning of every Rating and Filter
-- referencing it across every Household, so `name` is not writable from the client.
revoke update on rating_category from authenticated;
grant update (archived_at) on rating_category to authenticated;

-- Household-scoped ---------------------------------------------------------

create policy library_entry_all on library_entry for all to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

create policy tag_all on tag for all to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

create policy title_tag_all on title_tag for all to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

create policy household_category_all on household_category for all to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

create policy jar_all on jar for all to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

create policy jar_override_all on jar_override for all to authenticated
  using (jar_id in (select private.my_jar_ids()))
  with check (jar_id in (select private.my_jar_ids()));

create policy draw_all on draw for all to authenticated
  using (jar_id in (select private.my_jar_ids()))
  with check (jar_id in (select private.my_jar_ids()));

create policy draw_participant_all on draw_participant for all to authenticated
  using (draw_id in (select private.my_draw_ids()))
  with check (draw_id in (select private.my_draw_ids()));

create policy draw_candidate_all on draw_candidate for all to authenticated
  using (draw_id in (select private.my_draw_ids()))
  with check (draw_id in (select private.my_draw_ids()));

-- User-scoped --------------------------------------------------------------
-- Readable by anyone sharing a household, because Filters aggregate members' Ratings.
-- Writable only by their owner: both USING and WITH CHECK, so a row cannot be
-- reassigned to another user.

-- Write policies are split per command rather than using FOR ALL: a FOR ALL policy
-- also applies to SELECT, which would leave two permissive policies to evaluate on
-- every read.

create policy rating_select on rating for select to authenticated
  using (user_id = (select auth.uid()) or (select private.shares_household(user_id)));
create policy rating_insert on rating for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy rating_update on rating for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy rating_delete on rating for delete to authenticated
  using (user_id = (select auth.uid()));

create policy viewing_select on viewing for select to authenticated
  using (user_id = (select auth.uid()) or (select private.shares_household(user_id)));
create policy viewing_insert on viewing for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy viewing_update on viewing for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy viewing_delete on viewing for delete to authenticated
  using (user_id = (select auth.uid()));
