-- Development seed. Runs after migrations on every `npx supabase db reset`.
--
-- Purpose is to make the local database worth looking at: two Households that must not
-- see each other, enough Library and opinion data for a Filter to have something to
-- match, and one Jar carrying a real ADR-0009 filter tree.
--
-- Never loaded against a deployed environment — `db reset` is a local command and this
-- file is not a migration.
--
-- Sign in as any of these with password `jarjarjar`.
--
--   alice@example.com  ┐
--   bob@example.com    ┘ The Sofa
--   cara@example.com     Film Club   (shares nothing with the other two)

-- ---------------------------------------------------------------------------
-- Users
--
-- app_user rows are NOT inserted here. The provision_app_user_on_signup trigger
-- creates them from raw_user_meta_data, which is also a live check that it works.
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a11ce000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alice@example.com',
   extensions.crypt('jarjarjar', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Alice"}',
   now(), now()),
  ('b0b00000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bob@example.com',
   extensions.crypt('jarjarjar', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Bob"}',
   now(), now()),
  ('ca2a0000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cara@example.com',
   extensions.crypt('jarjarjar', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Cara"}',
   now(), now());

-- Password grant needs a matching identity row, or sign-in fails with
-- "Invalid login credentials" despite the password being right.
insert into auth.identities (id, user_id, provider_id, provider, identity_data,
                             last_sign_in_at, created_at, updated_at)
select
  extensions.uuid_generate_v4(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u;

-- ---------------------------------------------------------------------------
-- Households
-- ---------------------------------------------------------------------------

insert into household (id, name, rating_coverage, rating_aggregator) values
  ('50fa0000-0000-4000-8000-000000000001', 'The Sofa',   'any', 'avg'),
  ('c1bb0000-0000-4000-8000-000000000002', 'Film Club',  'all', 'min');

insert into household_member (household_id, user_id) values
  ('50fa0000-0000-4000-8000-000000000001', 'a11ce000-0000-4000-8000-000000000001'),
  ('50fa0000-0000-4000-8000-000000000001', 'b0b00000-0000-4000-8000-000000000002'),
  ('c1bb0000-0000-4000-8000-000000000002', 'ca2a0000-0000-4000-8000-000000000003');

-- Both households activate the starter set, exactly as the client will on creation.
insert into household_category (household_id, category_id)
select h.id, c.id
from household h
cross join rating_category c;

-- ---------------------------------------------------------------------------
-- Catalogue (global) — plausible TMDB-shaped rows
-- ---------------------------------------------------------------------------

insert into title (id, tmdb_id, name, media_type, release_year, runtime, language,
                   attributes_refreshed_at) values
  ('7171e000-0000-4000-8000-000000000001',    949, 'Heat',            'movie', 1995, 170, 'English', now()),
  ('7171e000-0000-4000-8000-000000000002',    550, 'Fight Club',      'movie', 1999, 139, 'English', now()),
  ('7171e000-0000-4000-8000-000000000003',    496, 'Before Sunrise',  'movie', 1995, 101, 'English', now()),
  ('7171e000-0000-4000-8000-000000000004',  10681, 'WALL·E',          'movie', 2008,  98, 'English', now()),
  ('7171e000-0000-4000-8000-000000000005',    129, 'Spirited Away',   'movie', 2001, 125, 'Japanese', now()),
  ('7171e000-0000-4000-8000-000000000006',   1396, 'Breaking Bad',    'tv',    2008,  49, 'English', now()),
  ('7171e000-0000-4000-8000-000000000007',   1668, 'Friends',         'tv',    1994,  22, 'English', now());

-- A Title with no TMDB link: unknown attributes, and private to The Sofa. It reaches a
-- Jar only by being Pinned — an attribute Filter can never match it (ADR-0006).
insert into title (id, name, owner_household_id) values
  ('7171e000-0000-4000-8000-00000000000f', 'Grandma''s 80th',
   '50fa0000-0000-4000-8000-000000000001');

insert into title_genre (title_id, genre) values
  ('7171e000-0000-4000-8000-000000000001', 'Action'),
  ('7171e000-0000-4000-8000-000000000001', 'Crime'),
  ('7171e000-0000-4000-8000-000000000001', 'Thriller'),
  ('7171e000-0000-4000-8000-000000000002', 'Drama'),
  ('7171e000-0000-4000-8000-000000000002', 'Thriller'),
  ('7171e000-0000-4000-8000-000000000003', 'Drama'),
  ('7171e000-0000-4000-8000-000000000003', 'Romance'),
  ('7171e000-0000-4000-8000-000000000004', 'Animation'),
  ('7171e000-0000-4000-8000-000000000004', 'Family'),
  ('7171e000-0000-4000-8000-000000000005', 'Animation'),
  ('7171e000-0000-4000-8000-000000000005', 'Family'),
  ('7171e000-0000-4000-8000-000000000005', 'Fantasy'),
  ('7171e000-0000-4000-8000-000000000006', 'Drama'),
  ('7171e000-0000-4000-8000-000000000006', 'Crime'),
  ('7171e000-0000-4000-8000-000000000007', 'Comedy');

insert into person (id, tmdb_person_id, name) values
  ('9e250000-0000-4000-8000-000000000001',  1158, 'Al Pacino'),
  ('9e250000-0000-4000-8000-000000000002',  1100, 'Michael Mann'),
  ('9e250000-0000-4000-8000-000000000003',   287, 'Brad Pitt'),
  ('9e250000-0000-4000-8000-000000000004',  7467, 'David Fincher'),
  ('9e250000-0000-4000-8000-000000000005',  8416, 'Ethan Hawke'),
  ('9e250000-0000-4000-8000-000000000006',  8429, 'Hayao Miyazaki');

insert into title_credit (title_id, person_id, role) values
  ('7171e000-0000-4000-8000-000000000001', '9e250000-0000-4000-8000-000000000001', 'cast'),
  ('7171e000-0000-4000-8000-000000000001', '9e250000-0000-4000-8000-000000000002', 'director'),
  ('7171e000-0000-4000-8000-000000000002', '9e250000-0000-4000-8000-000000000003', 'cast'),
  ('7171e000-0000-4000-8000-000000000002', '9e250000-0000-4000-8000-000000000004', 'director'),
  ('7171e000-0000-4000-8000-000000000003', '9e250000-0000-4000-8000-000000000005', 'cast'),
  ('7171e000-0000-4000-8000-000000000005', '9e250000-0000-4000-8000-000000000006', 'director');

-- ---------------------------------------------------------------------------
-- The Sofa's Library, vocabulary and opinions
-- ---------------------------------------------------------------------------

insert into library_entry (household_id, title_id, added_by_user_id, added_at) values
  ('50fa0000-0000-4000-8000-000000000001', '7171e000-0000-4000-8000-000000000001', 'a11ce000-0000-4000-8000-000000000001', now() - interval '8 months'),
  ('50fa0000-0000-4000-8000-000000000001', '7171e000-0000-4000-8000-000000000003', 'a11ce000-0000-4000-8000-000000000001', now() - interval '5 months'),
  ('50fa0000-0000-4000-8000-000000000001', '7171e000-0000-4000-8000-000000000004', 'b0b00000-0000-4000-8000-000000000002', now() - interval '3 weeks'),
  ('50fa0000-0000-4000-8000-000000000001', '7171e000-0000-4000-8000-000000000005', 'b0b00000-0000-4000-8000-000000000002', now() - interval '10 days'),
  ('50fa0000-0000-4000-8000-000000000001', '7171e000-0000-4000-8000-000000000007', 'a11ce000-0000-4000-8000-000000000001', now() - interval '2 days'),
  ('50fa0000-0000-4000-8000-000000000001', '7171e000-0000-4000-8000-00000000000f', 'a11ce000-0000-4000-8000-000000000001', now() - interval '1 year');

-- Film Club overlaps on two Titles, which is the point: Titles are global, Libraries
-- are not.
insert into library_entry (household_id, title_id, added_by_user_id) values
  ('c1bb0000-0000-4000-8000-000000000002', '7171e000-0000-4000-8000-000000000002', 'ca2a0000-0000-4000-8000-000000000003'),
  ('c1bb0000-0000-4000-8000-000000000002', '7171e000-0000-4000-8000-000000000005', 'ca2a0000-0000-4000-8000-000000000003'),
  ('c1bb0000-0000-4000-8000-000000000002', '7171e000-0000-4000-8000-000000000006', 'ca2a0000-0000-4000-8000-000000000003');

insert into tag (id, household_id, name) values
  ('7a600000-0000-4000-8000-000000000001', '50fa0000-0000-4000-8000-000000000001', 'cozy'),
  ('7a600000-0000-4000-8000-000000000002', '50fa0000-0000-4000-8000-000000000001', 'date-night'),
  ('7a600000-0000-4000-8000-000000000003', '50fa0000-0000-4000-8000-000000000001', 'dads-pick'),
  -- Same word, different Household, deliberately a different row.
  ('7a600000-0000-4000-8000-000000000004', 'c1bb0000-0000-4000-8000-000000000002', 'cozy');

insert into title_tag (household_id, title_id, tag_id) values
  ('50fa0000-0000-4000-8000-000000000001', '7171e000-0000-4000-8000-000000000004', '7a600000-0000-4000-8000-000000000001'),
  ('50fa0000-0000-4000-8000-000000000001', '7171e000-0000-4000-8000-000000000005', '7a600000-0000-4000-8000-000000000001'),
  ('50fa0000-0000-4000-8000-000000000001', '7171e000-0000-4000-8000-000000000003', '7a600000-0000-4000-8000-000000000002'),
  ('50fa0000-0000-4000-8000-000000000001', '7171e000-0000-4000-8000-000000000001', '7a600000-0000-4000-8000-000000000003');

-- Ratings are user-scoped: Cara's travel with her, and hers on Spirited Away sit
-- alongside Bob's on the same Title without either belonging to a Household.
-- Categories: ...001 Plot, ...002 Acting, ...003 Cinematography, ...005 Rewatchability.
insert into rating (user_id, title_id, category_id, value) values
  ('a11ce000-0000-4000-8000-000000000001', '7171e000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 8),
  ('a11ce000-0000-4000-8000-000000000001', '7171e000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005', 7),
  ('a11ce000-0000-4000-8000-000000000001', '7171e000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 9),
  ('a11ce000-0000-4000-8000-000000000001', '7171e000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000005', 9),
  ('b0b00000-0000-4000-8000-000000000002', '7171e000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 6),
  ('b0b00000-0000-4000-8000-000000000002', '7171e000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000005', 10),
  ('b0b00000-0000-4000-8000-000000000002', '7171e000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000003', 10),
  ('ca2a0000-0000-4000-8000-000000000003', '7171e000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000003', 9),
  ('ca2a0000-0000-4000-8000-000000000003', '7171e000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 8);

-- Rewatches are separate rows, which is what makes watchCount and lastWatched derivable.
insert into viewing (title_id, user_id, watched_on) values
  ('7171e000-0000-4000-8000-000000000001', 'a11ce000-0000-4000-8000-000000000001', current_date - 400),
  ('7171e000-0000-4000-8000-000000000001', 'a11ce000-0000-4000-8000-000000000001', current_date - 700),
  ('7171e000-0000-4000-8000-000000000001', 'b0b00000-0000-4000-8000-000000000002', current_date - 400),
  ('7171e000-0000-4000-8000-000000000004', 'a11ce000-0000-4000-8000-000000000001', current_date - 30),
  ('7171e000-0000-4000-8000-000000000004', 'a11ce000-0000-4000-8000-000000000001', current_date - 200),
  ('7171e000-0000-4000-8000-000000000004', 'a11ce000-0000-4000-8000-000000000001', current_date - 500),
  ('7171e000-0000-4000-8000-000000000004', 'b0b00000-0000-4000-8000-000000000002', current_date - 30),
  ('7171e000-0000-4000-8000-000000000003', 'b0b00000-0000-4000-8000-000000000002', current_date - 12);

-- ---------------------------------------------------------------------------
-- Jars
--
-- Filters are ADR-0009 trees and should round-trip through
-- src/lib/filter/validate.ts unchanged.
-- ---------------------------------------------------------------------------

insert into jar (id, household_id, name, filter) values
  ('7a120000-0000-4000-8000-000000000001', '50fa0000-0000-4000-8000-000000000001',
   'Short weeknight pick',
   '{"version":1,"root":{"kind":"group","op":"and","children":[
      {"kind":"predicate","leaf":"runtime","op":"lte","value":110},
      {"kind":"predicate","leaf":"watched","op":"not_by_any"}
    ]}}'::jsonb),

  -- The ANY-group escape hatch from ADR-0006: "not horror, unknowns welcome" would
  -- exclude unlinked Titles without the explicit is_null row beside it.
  ('7a120000-0000-4000-8000-000000000002', '50fa0000-0000-4000-8000-000000000001',
   'Cozy night in',
   '{"version":1,"root":{"kind":"group","op":"and","children":[
      {"kind":"predicate","leaf":"tag","op":"has","tagId":"7a600000-0000-4000-8000-000000000001"},
      {"kind":"group","op":"or","children":[
        {"kind":"predicate","leaf":"genre","op":"not_contains","value":"Horror"},
        {"kind":"predicate","leaf":"genre","op":"is_null"}
      ]}
    ]}}'::jsonb),

  -- Exercises every modifier: an explicit rater list, and coverage/aggregator
  -- overriding the Household's policy.
  ('7a120000-0000-4000-8000-000000000003', '50fa0000-0000-4000-8000-000000000001',
   'Comfort rewatch',
   '{"version":1,"root":{"kind":"group","op":"and","children":[
      {"kind":"predicate","leaf":"watchCount","op":"gte","value":2},
      {"kind":"predicate","leaf":"lastWatched","op":"older_than",
       "duration":{"amount":6,"unit":"month"},
       "population":["a11ce000-0000-4000-8000-000000000001"]},
      {"kind":"predicate","leaf":"rating","categoryId":"00000000-0000-4000-8000-000000000005",
       "op":"gte","value":7,"coverage":"all","aggregator":"min"}
    ]}}'::jsonb),

  -- No Filter at all: contents are its Pins alone, which is how an unlinked Title
  -- reaches a Jar.
  ('7a120000-0000-4000-8000-000000000004', '50fa0000-0000-4000-8000-000000000001',
   'Family archive', null),

  ('7a120000-0000-4000-8000-000000000005', 'c1bb0000-0000-4000-8000-000000000002',
   'Club picks',
   '{"version":1,"root":{"kind":"group","op":"and","children":[
      {"kind":"predicate","leaf":"mediaType","op":"is","value":"movie"}
    ]}}'::jsonb);

insert into jar_override (jar_id, title_id, kind) values
  ('7a120000-0000-4000-8000-000000000004', '7171e000-0000-4000-8000-00000000000f', 'pin'),
  -- Excluded despite matching, rather than mis-tagging it to keep it out.
  ('7a120000-0000-4000-8000-000000000002', '7171e000-0000-4000-8000-000000000005', 'exclusion');

-- ---------------------------------------------------------------------------
-- A finished Draw, and one still in progress
-- ---------------------------------------------------------------------------

insert into draw (id, jar_id, drawn_at, n, outcome, result_title_id) values
  ('d2a70000-0000-4000-8000-000000000001', '7a120000-0000-4000-8000-000000000001',
   now() - interval '12 days', 3, 'watched', '7171e000-0000-4000-8000-000000000003'),
  ('d2a70000-0000-4000-8000-000000000002', '7a120000-0000-4000-8000-000000000002',
   now() - interval '1 hour', 2, 'in_progress', null);

insert into draw_participant (draw_id, user_id) values
  ('d2a70000-0000-4000-8000-000000000001', 'a11ce000-0000-4000-8000-000000000001'),
  ('d2a70000-0000-4000-8000-000000000001', 'b0b00000-0000-4000-8000-000000000002'),
  -- Cara is not in The Sofa. A participant who isn't a member is a Guest.
  ('d2a70000-0000-4000-8000-000000000001', 'ca2a0000-0000-4000-8000-000000000003'),
  ('d2a70000-0000-4000-8000-000000000002', 'a11ce000-0000-4000-8000-000000000001'),
  ('d2a70000-0000-4000-8000-000000000002', 'b0b00000-0000-4000-8000-000000000002');

insert into draw_candidate (draw_id, title_id, knocked_out_at) values
  ('d2a70000-0000-4000-8000-000000000001', '7171e000-0000-4000-8000-000000000003', null),
  ('d2a70000-0000-4000-8000-000000000001', '7171e000-0000-4000-8000-000000000005', now() - interval '12 days'),
  ('d2a70000-0000-4000-8000-000000000001', '7171e000-0000-4000-8000-000000000007', now() - interval '12 days'),
  ('d2a70000-0000-4000-8000-000000000002', '7171e000-0000-4000-8000-000000000004', null),
  ('d2a70000-0000-4000-8000-000000000002', '7171e000-0000-4000-8000-000000000005', null);
