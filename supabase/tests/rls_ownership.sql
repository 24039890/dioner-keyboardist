-- RLS ownership check. Run in the Supabase SQL editor AFTER the migration.
-- It simulates two users inside a transaction and rolls everything back.
-- Every "expect" line should report the stated value; any exception means a
-- policy is wrong.

begin;

-- Two fake users.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'rls-a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'rls-b@example.test');

-- Act as user A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into public.songs (id, title, original_key, created_at, updated_at)
values ('10000000-0000-0000-0000-000000000001', 'A song', '0:major', now(), now());

select 'expect 1 (A sees own song)' as check, count(*) from public.songs;

-- Act as user B.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select 'expect 0 (B cannot see A''s song)' as check, count(*) from public.songs;

with u as (update public.songs set title = 'hacked' where id = '10000000-0000-0000-0000-000000000001' returning 1)
select 'expect 0 (B cannot update A''s song)' as check, count(*) from u;

with d as (delete from public.songs where id = '10000000-0000-0000-0000-000000000001' returning 1)
select 'expect 0 (B cannot delete A''s song)' as check, count(*) from d;

-- B cannot insert a row claiming to be A (should raise an RLS violation).
do $$
begin
  insert into public.songs (id, owner_id, title, original_key, created_at, updated_at)
  values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'spoof', '0:major', now(), now());
  raise exception 'FAIL: B inserted a row owned by A';
exception when insufficient_privilege or check_violation then
  raise notice 'ok: spoofed owner rejected';
end $$;

-- B cannot attach a section to A's song.
do $$
begin
  insert into public.song_sections (id, song_id, position, label, chords)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 0, 'V', 'C');
  raise exception 'FAIL: B attached a section to A''s song';
exception when insufficient_privilege or check_violation then
  raise notice 'ok: cross-user section rejected';
end $$;

rollback;
