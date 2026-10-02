-- shelfstackd, PROPOSED 0008's checks: a watchlist is private until its owner makes it public
-- (docs/proposed-0008-watchlist-privacy.sql). Run it after that file, in the Supabase dashboard (SQL Editor -> New
-- query -> paste -> Run). It makes throwaway users inside a transaction and rolls everything back: nothing is kept.
-- The last result says "ALL 0008 CHECKS PASSED". A failed check stops with an error that starts "FAIL:".
--
-- The people:  A public (keeps a watchlist)   B public (a visitor who follows no one)   C public (follows D, accepted)
--              D private (keeps a watchlist)

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000008a0', 'rls8-a@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000008b0', 'rls8-b@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000008c0', 'rls8-c@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000008d0', 'rls8-d@example.invalid', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008a0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000008a0', 'rls8_a');
insert into public.watchlist (kind, title, year) values ('movie', 'Gummo', 1997), ('book', 'The Waves', 1931);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008b0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000008b0', 'rls8_b');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008c0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000008c0', 'rls8_c');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008d0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000008d0', 'rls8_d');
update public.profiles set is_private = true where id = '00000000-0000-4000-8000-0000000008d0';
insert into public.watchlist (kind, title, year) values ('movie', 'Stalker', 1979);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008c0","role":"authenticated"}', true);
select public.follow('00000000-0000-4000-8000-0000000008d0');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008d0","role":"authenticated"}', true);
select public.answer_request('00000000-0000-4000-8000-0000000008c0', true);

-- ---------- private by default: only the owner sees it ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008a0","role":"authenticated"}', true);
do $$ begin
  if (select watchlist_public from public.profiles where id = '00000000-0000-4000-8000-0000000008a0') then raise exception 'FAIL: a new watchlist is public'; end if;
  if (select count(*) from public.watchlist where owner = '00000000-0000-4000-8000-0000000008a0') <> 2 then raise exception 'FAIL: A doesn''t see their own watchlist'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008b0","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.watchlist where owner = '00000000-0000-4000-8000-0000000008a0') then raise exception 'FAIL: B sees A''s private watchlist'; end if;
  -- and B can't make it public for A
  update public.profiles set watchlist_public = true where id = '00000000-0000-4000-8000-0000000008a0';
end $$;
reset role;
do $$ begin
  if (select watchlist_public from public.profiles where id = '00000000-0000-4000-8000-0000000008a0') then raise exception 'FAIL: B made A''s watchlist public'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if exists (select 1 from public.watchlist where owner = '00000000-0000-4000-8000-0000000008a0') then raise exception 'FAIL: a visitor sees A''s private watchlist'; end if;
  perform watchlist_public from public.profiles where id = '00000000-0000-4000-8000-0000000008a0';   -- the page asks it
end $$;

-- ---------- made public by its owner: seen by whoever sees the profile ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008a0","role":"authenticated"}', true);
update public.profiles set watchlist_public = true where id = '00000000-0000-4000-8000-0000000008a0';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008b0","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.watchlist where owner = '00000000-0000-4000-8000-0000000008a0') <> 2 then raise exception 'FAIL: B doesn''t see A''s public watchlist'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if (select count(*) from public.watchlist where owner = '00000000-0000-4000-8000-0000000008a0') <> 2 then raise exception 'FAIL: a visitor doesn''t see A''s public watchlist'; end if;
  if not (select watchlist_public from public.profiles where id = '00000000-0000-4000-8000-0000000008a0') then raise exception 'FAIL: a visitor can''t tell A''s watchlist is public'; end if;
end $$;

-- ---------- a private profile: its followers, and only once it's made public ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008c0","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.watchlist where owner = '00000000-0000-4000-8000-0000000008d0') then raise exception 'FAIL: follower C sees private D''s watchlist before D made it public'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008d0","role":"authenticated"}', true);
update public.profiles set watchlist_public = true where id = '00000000-0000-4000-8000-0000000008d0';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008c0","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.watchlist where owner = '00000000-0000-4000-8000-0000000008d0') <> 1 then raise exception 'FAIL: follower C doesn''t see D''s public watchlist'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008b0","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.watchlist where owner = '00000000-0000-4000-8000-0000000008d0') then raise exception 'FAIL: B, who doesn''t follow D, sees private D''s watchlist'; end if;
end $$;

-- ---------- made private again ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008a0","role":"authenticated"}', true);
update public.profiles set watchlist_public = false where id = '00000000-0000-4000-8000-0000000008a0';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008b0","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.watchlist where owner = '00000000-0000-4000-8000-0000000008a0') then raise exception 'FAIL: B still sees A''s watchlist once A made it private'; end if;
end $$;

reset role;
select 'ALL 0008 CHECKS PASSED' as result;
rollback;
