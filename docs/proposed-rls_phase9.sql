-- shelfstackd, phase 9: checks the badges after the proposed migration 0012 (docs/proposed-0012-badges.sql): who is
-- in the first 100 by signup order (the 100th is, the 101st isn't), a badge given by hand and the order they come in
-- (founder first), what anyone may ask (badges_of(), signed in or not) and what nobody can do from a page (read or
-- write the badges table, give themselves one), a profile hidden by moderation having none, and a private profile's
-- badges showing as its card does. Run it in the Supabase dashboard (SQL Editor -> New query -> paste -> Run), after
-- 0012. It makes throwaway users inside a transaction and rolls everything back at the end: nothing is kept.
-- The last result says "ALL 0012 CHECKS PASSED". Any failed check stops with an error that starts "FAIL:".
-- Real accounts can be in the database: the test's 101 people signed up in the year 2000, before anyone real, so
-- they are the first 101 whatever else is there.

begin;

-- 101 people, one a day from 1 January 2000, in signup order: rls12_000 is the first, rls12_100 the 101st
insert into auth.users (id, email, aud, role)
  select ('00000000-0000-4000-8000-' || lpad(to_hex(4096 + i), 12, '0'))::uuid, 'rls12-' || i || '@example.invalid', 'authenticated', 'authenticated'
  from generate_series(0, 100) i;
insert into public.profiles (id, username, created_at)
  select ('00000000-0000-4000-8000-' || lpad(to_hex(4096 + i), 12, '0'))::uuid, 'rls12_' || lpad(i::text, 3, '0'), timestamptz '2000-01-01 00:00+00' + i * interval '1 day'
  from generate_series(0, 100) i;
-- the first is given the founder badge by hand, and one more made up for later; the 50th is private; the 60th hidden
insert into public.badges (owner, badge) values ('00000000-0000-4000-8000-000000001000', 'founder'), ('00000000-0000-4000-8000-000000001000', 'zine-maker');
update public.profiles set is_private = true where username = 'rls12_050';
update public.profiles set hidden = true where username = 'rls12_060';

-- ---------- as anyone (signed out) ----------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ declare b text[]; begin
  select badges into b from public.badges_of(array['rls12_000']);
  if b is distinct from array['founder', 'early-100', 'zine-maker'] then raise exception 'FAIL: the first person''s badges were %, not founder, early-100, zine-maker in that order', b; end if;
  select badges into b from public.badges_of(array['RLS12_099']);
  if b is distinct from array['early-100'] then raise exception 'FAIL: the 100th by signup isn''t in the first 100 (%)', b; end if;
  select badges into b from public.badges_of(array['rls12_100']);
  if b is distinct from array[]::text[] then raise exception 'FAIL: the 101st by signup has badges (%)', b; end if;
  select badges into b from public.badges_of(array['rls12_050']);
  if b is distinct from array['early-100'] then raise exception 'FAIL: a private profile''s badges don''t show (%)', b; end if;
  if exists (select 1 from public.badges_of(array['rls12_060'])) then raise exception 'FAIL: a profile hidden by moderation has badges'; end if;
  if exists (select 1 from public.badges_of(array['rls12_nobody'])) then raise exception 'FAIL: a name nobody has came back'; end if;
  if (select count(*) from public.badges_of(array['rls12_001', 'rls12_002', 'rls12_001', null])) <> 2 then raise exception 'FAIL: each name asked for once wasn''t answered once'; end if;
  if (select count(*) from public.badges_of(null)) <> 0 then raise exception 'FAIL: no names gave answers'; end if;
  begin perform 1 from public.badges limit 1; raise exception 'FAIL: anyone could read the badges table';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------- signed in: still only badges_of(); nobody gives themselves a badge ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001064","role":"authenticated"}', true);
do $$ begin
  if (select badges from public.badges_of(array['rls12_100'])) is distinct from array[]::text[] then raise exception 'FAIL: signed in, the 101st had badges'; end if;
  begin insert into public.badges (owner, badge) values ('00000000-0000-4000-8000-000000001064', 'founder'); raise exception 'FAIL: someone gave themselves a badge';
  exception when insufficient_privilege then null; end;
  begin update public.badges set badge = 'founder' where owner = '00000000-0000-4000-8000-000000001000'; raise exception 'FAIL: someone changed a badge';
  exception when insufficient_privilege then null; end;
  begin delete from public.badges where owner = '00000000-0000-4000-8000-000000001000'; raise exception 'FAIL: someone took a badge away';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- a profile deleted takes its badges with it
delete from auth.users where id = '00000000-0000-4000-8000-000000001000';
do $$ begin
  if exists (select 1 from public.badges where owner = '00000000-0000-4000-8000-000000001000') then raise exception 'FAIL: a deleted profile''s badges stayed'; end if;
  -- and the next one up is now in the first 100: rls12_100 is the 100th
  if (select badges from public.badges_of(array['rls12_100'])) is distinct from array['early-100'] then raise exception 'FAIL: with the first one gone, the next wasn''t moved up into the first 100'; end if;
end $$;

select 'ALL 0012 CHECKS PASSED' as result;
rollback;
