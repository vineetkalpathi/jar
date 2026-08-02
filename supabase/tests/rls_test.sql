-- Functional RLS test: two users, two households, verifying isolation.
-- Setup runs as the migration role (bypasses RLS); assertions run as `authenticated`
-- with a forged JWT claim, which is how auth.uid() resolves.
--
-- Every fixture is namespaced and every assertion is scoped to it, because this runs
-- against a database `db reset` has already loaded supabase/seed.sql into. Counting
-- whole tables would measure the seed rather than the policies — and global Titles are
-- visible to everyone by design, so such a count would be wrong in both directions.

\set ON_ERROR_STOP on

begin;

-- Two real auth users. app_user rows are NOT inserted here: the
-- provision_app_user_on_signup trigger creates them, and asserting on that below is
-- also the test for it. Alice carries a display_name in her signup metadata; Bob does
-- not, so he exercises the email-local-part fallback.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data,
                        created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-alice@test.invalid',
   '{"display_name":"Alice"}'::jsonb, now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-bob@test.invalid',
   '{}'::jsonb, now(), now());

do $$
begin
  if (select display_name from app_user
      where id = '11111111-1111-1111-1111-111111111111') is distinct from 'Alice' then
    raise exception 'FAIL: signup trigger did not use display_name metadata';
  end if;
  if (select display_name from app_user
      where id = '22222222-2222-2222-2222-222222222222') is distinct from 'rls-bob' then
    raise exception 'FAIL: signup trigger did not fall back to the email local part';
  end if;
  raise notice 'PASS: signup provisions app_user';
end $$;

-- Alice's household and Bob's household, entirely separate.
insert into household (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Alice house'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Bob house');

insert into household_member (household_id, user_id) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222');

-- A global title, and a hand-entered one private to Alice's household.
insert into title (id, tmdb_id, name, media_type, runtime, language) values
  ('cccccccc-0000-0000-0000-000000000000', 999949, 'RLS Global Title',
   'movie', 170, 'English');
insert into title (id, name, owner_household_id) values
  ('dddddddd-0000-0000-0000-000000000000', 'RLS Private Title',
   'aaaaaaaa-0000-0000-0000-000000000000');

-- Alice's jar, tag and rating.
insert into jar (id, household_id, name) values
  ('eeeeeeee-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000',
   'Action night');
insert into tag (id, household_id, name) values
  ('ffffffff-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000',
   'dads-pick');
-- 'Plot' is one of the seeded starter Categories, so the test uses its fixed id
-- rather than coining its own — coining one would collide on lower(name).
insert into rating (user_id, title_id, category_id, value) values
  ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000000',
   '00000000-0000-4000-8000-000000000001', 9);

commit;

-- ---------------------------------------------------------------------------
-- Assertions as Bob, who shares nothing with Alice
-- ---------------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
begin
  -- Bob belongs to no household holding any of this, so household-scoped tables must
  -- come back completely empty — seed rows included.
  if (select count(*) from jar) <> 0 then
    raise exception 'FAIL: Bob can see % jars', (select count(*) from jar);
  end if;
  if (select count(*) from tag) <> 0 then
    raise exception 'FAIL: Bob can see tags belonging to others';
  end if;
  if (select count(*) from household where name = 'Alice house') <> 0 then
    raise exception 'FAIL: Bob can see Alice''s household';
  end if;
  if (select count(*) from rating) <> 0 then
    raise exception 'FAIL: Bob can see ratings belonging to others';
  end if;
  -- Hand-entered titles stay private; the global TMDB row is shared.
  if (select count(*) from title where name = 'RLS Private Title') <> 0 then
    raise exception 'FAIL: Bob can see Alice''s hand-entered title';
  end if;
  if (select count(*) from title where name = 'RLS Global Title') <> 1 then
    raise exception 'FAIL: Bob cannot see the global title';
  end if;
  raise notice 'PASS: Bob is correctly isolated from Alice';
end $$;

-- Bob must not be able to write a rating attributed to Alice.
do $$
begin
  begin
    insert into rating (user_id, title_id, category_id, value)
    values ('11111111-1111-1111-1111-111111111111',
            'cccccccc-0000-0000-0000-000000000000',
            '00000000-0000-4000-8000-000000000001', 1);
    raise exception 'FAIL: Bob forged a rating as Alice';
  exception
    when insufficient_privilege then
      raise notice 'PASS: Bob cannot forge a rating as Alice';
  end;
end $$;

-- Nor rename a global Rating Category (column grant, not policy).
do $$
begin
  begin
    update rating_category set name = 'Hijacked'
    where id = '00000000-0000-4000-8000-000000000001';
    raise exception 'FAIL: Bob renamed a global category';
  exception
    when insufficient_privilege then
      raise notice 'PASS: Bob cannot rename a global category';
  end;
end $$;

rollback;

-- ---------------------------------------------------------------------------
-- Assertions as Alice, who must see her own things
-- ---------------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
begin
  if (select count(*) from jar) <> 1 then
    raise exception 'FAIL: Alice sees % jars, expected 1', (select count(*) from jar);
  end if;
  if (select count(*) from tag) <> 1 then
    raise exception 'FAIL: Alice cannot see her own tag';
  end if;
  if (select count(*) from rating) <> 1 then
    raise exception 'FAIL: Alice cannot see her own rating';
  end if;
  -- Scoped to this test's fixtures: seeded global Titles are visible to everyone by
  -- design, so a whole-table count would prove nothing about the policy.
  if (select count(*) from title
      where name in ('RLS Global Title', 'RLS Private Title')) <> 2 then
    raise exception 'FAIL: Alice cannot see both her global and private titles';
  end if;
  raise notice 'PASS: Alice sees her own data';
end $$;

-- Archiving a category is permitted; only renaming is not.
do $$
begin
  update rating_category set archived_at = now()
  where id = '00000000-0000-4000-8000-000000000001';
  raise notice 'PASS: Alice can archive a category';
end $$;

rollback;

-- Clean up the committed setup.
begin;
delete from auth.users where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222');
delete from household where id in (
  'aaaaaaaa-0000-0000-0000-000000000000',
  'bbbbbbbb-0000-0000-0000-000000000000');
delete from title where id in (
  'cccccccc-0000-0000-0000-000000000000',
  'dddddddd-0000-0000-0000-000000000000');
-- The 'Plot' Category is seeded by a migration, not by this test. Leave it.
commit;
