-- Surrogate `id` columns on the join tables, for PowerSync.
--
-- PowerSync requires every synced table to have "a single text-type primary key column
-- called id" and does not support composite keys. Ten of our tables were keyed on the
-- columns that carry their meaning instead, so none of them could sync.
--
-- The alternative is concatenating the composite key into an id inside the sync rules
-- (`select *, household_id || '.' || title_id as id from library_entry`). That leaves
-- the Postgres schema alone, but the id then exists only on the device: every write to
-- those ten tables becomes a special case in the upload connector, which has to drop
-- the synthetic id and upsert on the real key instead. Those ten tables are where
-- almost all of the app's writes land — ratings, viewings, library entries, tags, jar
-- overrides — so that cost would be paid constantly.
--
-- A surrogate id makes every table uniform: the client generates a UUID, writes are
-- plain inserts, and the sync rules stay `select *`.
--
-- The old primary keys become UNIQUE constraints, so every constraint that carries
-- meaning in docs/data-model.md still holds structurally — including "a Title may not
-- be both Pinned and Excluded in the same Jar", which is jar_override's key.
--
-- One consequence, handled in the connector rather than here: two devices doing the
-- same thing offline now generate two rows with different ids, and the second upload
-- hits the unique constraint. A unique violation on these tables means "already
-- applied" and the operation can be dropped. Under the concatenation approach those
-- ids would have converged instead — that is the one thing this trades away.

-- Membership and library ----------------------------------------------------

alter table household_member
  add column id uuid not null default gen_random_uuid();
alter table household_member drop constraint household_member_pkey;
alter table household_member add primary key (id);
alter table household_member
  add constraint household_member_household_user_key unique (household_id, user_id);

alter table library_entry
  add column id uuid not null default gen_random_uuid();
alter table library_entry drop constraint library_entry_pkey;
alter table library_entry add primary key (id);
alter table library_entry
  add constraint library_entry_household_title_key unique (household_id, title_id);

-- Catalogue -----------------------------------------------------------------

alter table title_credit
  add column id uuid not null default gen_random_uuid();
alter table title_credit drop constraint title_credit_pkey;
alter table title_credit add primary key (id);
alter table title_credit
  add constraint title_credit_title_person_role_key unique (title_id, person_id, role);

alter table title_genre
  add column id uuid not null default gen_random_uuid();
alter table title_genre drop constraint title_genre_pkey;
alter table title_genre add primary key (id);
alter table title_genre
  add constraint title_genre_title_genre_key unique (title_id, genre);

-- Annotations ---------------------------------------------------------------

alter table title_tag
  add column id uuid not null default gen_random_uuid();
alter table title_tag drop constraint title_tag_pkey;
alter table title_tag add primary key (id);
alter table title_tag
  add constraint title_tag_household_title_tag_key unique (household_id, title_id, tag_id);

alter table household_category
  add column id uuid not null default gen_random_uuid();
alter table household_category drop constraint household_category_pkey;
alter table household_category add primary key (id);
alter table household_category
  add constraint household_category_household_category_key unique (household_id, category_id);

-- One score per person per axis, with no Household in it, so opinions travel.
alter table rating
  add column id uuid not null default gen_random_uuid();
alter table rating drop constraint rating_pkey;
alter table rating add primary key (id);
alter table rating
  add constraint rating_user_title_category_key unique (user_id, title_id, category_id);

-- Jars and draws ------------------------------------------------------------

-- Pins and Exclusions share one table so that "a Title may not be both Pinned and
-- Excluded in the same Jar" is structural. That now rests on the unique constraint.
alter table jar_override
  add column id uuid not null default gen_random_uuid();
alter table jar_override drop constraint jar_override_pkey;
alter table jar_override add primary key (id);
alter table jar_override
  add constraint jar_override_jar_title_key unique (jar_id, title_id);

alter table draw_participant
  add column id uuid not null default gen_random_uuid();
alter table draw_participant drop constraint draw_participant_pkey;
alter table draw_participant add primary key (id);
alter table draw_participant
  add constraint draw_participant_draw_user_key unique (draw_id, user_id);

alter table draw_candidate
  add column id uuid not null default gen_random_uuid();
alter table draw_candidate drop constraint draw_candidate_pkey;
alter table draw_candidate add primary key (id);
alter table draw_candidate
  add constraint draw_candidate_draw_title_key unique (draw_id, title_id);
