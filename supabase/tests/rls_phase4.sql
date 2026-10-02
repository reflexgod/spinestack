-- shelfstackd, phase 4: checks logs, the watchlist, From friends and activity() after migration 0007
-- (supabase/migrations/0007_logs_watchlist.sql). Run it in the Supabase dashboard (SQL Editor -> New query -> paste ->
-- Run). It passed on the live database on 2 October 2026.
-- It makes throwaway users inside a transaction and rolls everything back at the end: nothing is kept.
-- The last result says "ALL PHASE 4 CHECKS PASSED". Any failed check stops with an error that starts "FAIL:".
-- Real accounts can be in the database, so every check looks only at the test's own rows.
--
-- The people:  A public (follows B, then unfollows; and private D, who accepted)   B public (logs two titles, one
--              hidden later by moderation)   C public (an outsider,
--              who also logs on a new day)   D private (logs one title)   E public (hits the daily limit, then deletes
--              and tries again)   H hidden by moderation (logs one title)

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000004a0', 'rls4-a@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000004b0', 'rls4-b@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000004c0', 'rls4-c@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000004d0', 'rls4-d@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000004e0', 'rls4-e@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000004f0', 'rls4-h@example.invalid', 'authenticated', 'authenticated');
update public.app_config set pro_required = false;

-- each person makes their profile, signed in as themselves; B, D and H log something
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000004a0', 'rls4_a');
select public.save_shelf('{"id":"00000000-0000-4000-8000-0000000004a1","caption":"a private","is_public":false}', '[{"item_id":"b0","kind":"book","title":"Mine"}]');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004b0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000004b0', 'rls4_b');
select public.save_shelf('{"id":"00000000-0000-4000-8000-0000000004b1","caption":"b public"}', '[{"item_id":"b0","kind":"movie","title":"Kids"}]');
insert into public.logs (kind, title, author, year, cover_src, caption) values
  ('movie', 'Gummo', 'Harmony Korine', 1997, 'url:https://image.tmdb.org/t/p/w500/gummo.jpg', 'the bathtub scene'),
  ('book', 'The  Waves ', 'Virginia Woolf', 1931, null, '');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004c0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000004c0', 'rls4_c');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004d0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000004d0', 'rls4_d');
update public.profiles set is_private = true where id = '00000000-0000-4000-8000-0000000004d0';
insert into public.logs (kind, title, year, caption) values ('movie', 'Stalker', 1979, 'd only');
insert into public.watchlist (kind, title, year) values ('movie', 'Paris, Texas', 1984);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004e0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000004e0', 'rls4_e');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004f0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000004f0', 'rls4_h');
insert into public.logs (kind, title, year) values ('movie', 'Hidden One', 2001);

-- A follows B, and asks D, who accepts
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a0","role":"authenticated"}', true);
select public.follow('00000000-0000-4000-8000-0000000004b0'), public.follow('00000000-0000-4000-8000-0000000004d0'), public.follow('00000000-0000-4000-8000-0000000004f0');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004d0","role":"authenticated"}', true);
select public.answer_request('00000000-0000-4000-8000-0000000004a0', true);

-- moderation hides H; B's shelf and the logs get their own times, oldest first: B's shelf, B's Waves, B's Gummo, D's Stalker
reset role;
update public.profiles set hidden = true where id = '00000000-0000-4000-8000-0000000004f0';
update public.shelves set saved_at = now() - interval '4 hours' where id = '00000000-0000-4000-8000-0000000004b1';
update public.logs set created_at = now() - interval '3 hours' where owner = '00000000-0000-4000-8000-0000000004b0' and title = 'The  Waves ';
update public.logs set created_at = now() - interval '2 hours' where owner = '00000000-0000-4000-8000-0000000004b0' and title = 'Gummo';
update public.logs set created_at = now() - interval '1 hour' where owner = '00000000-0000-4000-8000-0000000004d0';

-- ---------- what a log may be ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a0","role":"authenticated"}', true);
do $$ begin
  begin
    insert into public.logs (owner, kind, title) values ('00000000-0000-4000-8000-0000000004b0', 'movie', 'For B');
    raise exception 'FAIL: A posted a log as B';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.logs (kind, title, hidden) values ('movie', 'Sneaky', false);
    raise exception 'FAIL: A set hidden on a log';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.logs (kind, title, caption) values ('movie', 'Long', repeat('x', 281));
    raise exception 'FAIL: a caption over 280 characters went in';
  exception when check_violation then null; end;
  begin
    insert into public.logs (kind, title, cover_src) values ('movie', 'Elsewhere', 'url:https://example.com/cover.jpg');
    raise exception 'FAIL: a cover from another site went in';
  exception when check_violation then null; end;
  begin
    insert into public.logs (kind, title) values ('movie', '   ');
    raise exception 'FAIL: a log with no title went in';
  exception when check_violation then null; end;
end $$;

-- ---------- who sees a log ----------
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if (select count(*) from public.logs where owner = '00000000-0000-4000-8000-0000000004b0') <> 2 then raise exception 'FAIL: a visitor doesn''t see public B''s logs'; end if;
  if exists (select 1 from public.logs where owner in ('00000000-0000-4000-8000-0000000004d0', '00000000-0000-4000-8000-0000000004f0')) then raise exception 'FAIL: a visitor sees private D''s or hidden H''s logs'; end if;
  if exists (select 1 from public.watchlist where owner = '00000000-0000-4000-8000-0000000004d0') then raise exception 'FAIL: a visitor sees private D''s watchlist'; end if;
  if exists (select 1 from public.activity('following')) then raise exception 'FAIL: FOLLOWING has something signed out'; end if;
  if exists (select 1 from public.activity('you')) then raise exception 'FAIL: YOU has something signed out'; end if;
  if (select count(*) from public.activity('everyone', null, null, 50) where owner = '00000000-0000-4000-8000-0000000004b0') <> 3 then raise exception 'FAIL: EVERYONE doesn''t have B''s shelf and two logs'; end if;
  if exists (select 1 from public.activity('everyone', null, null, 50) where owner in ('00000000-0000-4000-8000-0000000004d0', '00000000-0000-4000-8000-0000000004f0')) then raise exception 'FAIL: EVERYONE has private D or hidden H'; end if;
  if (select string_agg(title, ',' order by at desc, id desc) from public.activity('everyone', null, null, 50) where owner = '00000000-0000-4000-8000-0000000004b0' and what = 'log') <> 'Gummo,The  Waves ' then
    raise exception 'FAIL: B''s logs aren''t newest first'; end if;
  if (select caption from public.activity('everyone', null, null, 50) where what = 'log' and title = 'Gummo' and owner = '00000000-0000-4000-8000-0000000004b0') <> 'the bathtub scene' then raise exception 'FAIL: a log''s caption isn''t in the feed'; end if;
  begin
    perform public.from_friends();
    raise exception 'FAIL: a visitor could ask for From friends';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004c0","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.logs where owner = '00000000-0000-4000-8000-0000000004d0') then raise exception 'FAIL: outsider C sees private D''s logs'; end if;
  if exists (select 1 from public.from_friends()) then raise exception 'FAIL: C follows nobody and has From friends'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a0","role":"authenticated"}', true);
do $$ declare first record; n int; begin
  if (select count(*) from public.logs where owner = '00000000-0000-4000-8000-0000000004d0') <> 1 then raise exception 'FAIL: follower A doesn''t see private D''s log'; end if;
  if (select count(*) from public.watchlist where owner = '00000000-0000-4000-8000-0000000004d0') <> 1 then raise exception 'FAIL: follower A doesn''t see private D''s watchlist'; end if;
  if (select string_agg(title, ',' order by at desc, id desc) from public.activity('following', null, null, 50) where what = 'log') <> 'Stalker,Gummo,The  Waves ' then
    raise exception 'FAIL: FOLLOWING isn''t D''s and B''s logs, newest first'; end if;
  if exists (select 1 from public.activity('following', null, null, 50) where owner = '00000000-0000-4000-8000-0000000004f0') then raise exception 'FAIL: hidden H is in FOLLOWING'; end if;
  if (select count(*) from public.activity('you', null, null, 50) where what = 'shelf' and not is_public) <> 1 then raise exception 'FAIL: YOU leaves out A''s private shelf'; end if;
  -- paging: after the newest one comes the next, and nothing twice
  select * into first from public.activity('following', null, null, 1);
  select count(*) into n from public.activity('following', first.at, first.id, 50) where id = first.id;
  if n <> 0 then raise exception 'FAIL: the next page has the last one again'; end if;
  if (select title from public.activity('following', first.at, first.id, 1)) <> 'Gummo' then raise exception 'FAIL: the next page doesn''t start after the last one'; end if;
end $$;

-- ---------- From friends, Keep and Remove, and logging a title ----------
do $$ declare k text; begin
  if (select string_agg(title, ',' order by logged_at desc) from public.from_friends()) <> 'Stalker,Gummo,The  Waves ' then raise exception 'FAIL: From friends isn''t what A''s people logged, newest first'; end if;
  if exists (select 1 from public.from_friends() where from_username = 'rls4_h') then raise exception 'FAIL: hidden H is in From friends'; end if;
  -- Keep: on the watchlist, from B, and so out of From friends
  insert into public.watchlist (kind, title, author, year, cover_src, from_user)
    select kind, title, author, year, cover_src, from_id from public.from_friends() where title = 'Gummo';
  if (select from_user from public.watchlist where owner = '00000000-0000-4000-8000-0000000004a0' and title = 'Gummo') <> '00000000-0000-4000-8000-0000000004b0' then raise exception 'FAIL: Keep didn''t say it came from B'; end if;
  if exists (select 1 from public.from_friends() where title = 'Gummo') then raise exception 'FAIL: a title on the watchlist is still in From friends'; end if;
  -- from someone A doesn't follow: kept, without the name
  insert into public.watchlist (kind, title, from_user) values ('book', 'Orlando', '00000000-0000-4000-8000-0000000004c0');
  if (select from_user from public.watchlist where owner = '00000000-0000-4000-8000-0000000004a0' and title = 'Orlando') is not null then raise exception 'FAIL: from_user kept someone A doesn''t follow'; end if;
  -- Remove: gone for good
  select item_key into k from public.from_friends() where title = 'Stalker';
  insert into public.friend_hides (item_key) values (k);
  if exists (select 1 from public.from_friends() where title = 'Stalker') then raise exception 'FAIL: Remove didn''t take it out of From friends'; end if;
  -- logged it yourself: out of From friends, and off your watchlist (the same title, its spaces and case aside)
  insert into public.logs (kind, title, year) values ('book', 'the waves', 1931);
  if exists (select 1 from public.from_friends()) then raise exception 'FAIL: a title A logged is still in From friends'; end if;
  insert into public.logs (kind, title, author, year) values ('movie', 'GUMMO', 'Harmony Korine', 1997);
  if exists (select 1 from public.watchlist where owner = '00000000-0000-4000-8000-0000000004a0' and title = 'Gummo') then raise exception 'FAIL: logging Gummo left it on the watchlist'; end if;
end $$;

-- ---------- the watchlist: 6 at most, each title once, only your own ----------
do $$ declare i int; begin
  begin
    insert into public.watchlist (kind, title) values ('book', 'orlando ');
    raise exception 'FAIL: the same title went on the watchlist twice';
  exception when unique_violation then null; end;
  for i in 1..5 loop insert into public.watchlist (kind, title) values ('book', 'Book ' || i); end loop;
  begin
    insert into public.watchlist (kind, title) values ('book', 'Book 6');
    raise exception 'FAIL: a seventh title went on the watchlist';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    insert into public.watchlist (owner, kind, title) values ('00000000-0000-4000-8000-0000000004c0', 'book', 'For C');
    raise exception 'FAIL: A put a title on C''s watchlist';
  exception when insufficient_privilege then null; end;
end $$;
-- ---------- unfollowing someone takes their name off what you kept from them ----------
do $$ begin
  delete from public.watchlist where owner = '00000000-0000-4000-8000-0000000004a0' and title = 'Book 5';   -- room for one
  insert into public.watchlist (kind, title, from_user) values ('book', 'Kept from B', '00000000-0000-4000-8000-0000000004b0');
  if (select from_user from public.watchlist where title = 'Kept from B') is distinct from '00000000-0000-4000-8000-0000000004b0' then
    raise exception 'FAIL: a title kept from B doesn''t say so'; end if;
  perform public.unfollow('00000000-0000-4000-8000-0000000004b0');
  if not exists (select 1 from public.watchlist where title = 'Kept from B') then raise exception 'FAIL: unfollowing B took the title off A''s watchlist'; end if;
  if (select from_user from public.watchlist where title = 'Kept from B') is not null then raise exception 'FAIL: the title still says it came from B after A unfollowed B'; end if;
end $$;

-- ---------- From friends keeps 500 removals a person at most; ones older than 180 days go first ----------
reset role;
insert into public.friend_hides (owner, item_key)
  select '00000000-0000-4000-8000-0000000004a0', 'book:filler ' || i || ':' from generate_series(1, 498) i;   -- with Stalker's, 499
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a0","role":"authenticated"}', true);
do $$ begin
  insert into public.friend_hides (item_key) values ('book:the five hundredth:');
  begin
    insert into public.friend_hides (item_key) values ('book:one more:');
    raise exception 'FAIL: a 501st removal was kept';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  if not hashtext('hides:00000000-0000-4000-8000-0000000004a0')::bigint = any (array(select (l.classid::bigint << 32) | l.objid::bigint from pg_locks l
       where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.objsubid = 1)) then
    raise exception 'FAIL: a removal didn''t take its person''s lock'; end if;
end $$;
reset role;
update public.friend_hides set created_at = now() - interval '200 days' where owner = '00000000-0000-4000-8000-0000000004a0' and item_key = 'book:filler 1:';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a0","role":"authenticated"}', true);
insert into public.friend_hides (item_key) values ('book:after a while:');   -- the old one went, so this one fits
do $$ begin
  if exists (select 1 from public.friend_hides where item_key = 'book:filler 1:') then raise exception 'FAIL: a removal from 200 days ago is still kept'; end if;
  if (select count(*) from public.friend_hides) <> 500 then raise exception 'FAIL: A doesn''t have 500 removals'; end if;
end $$;

-- moderation hides one of B's logs: B can't delete it (it stays, for us to see)
reset role;
update public.logs set hidden = true where owner = '00000000-0000-4000-8000-0000000004b0' and title = 'The  Waves ';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004b0","role":"authenticated"}', true);
do $$ declare n int; begin
  delete from public.logs where owner = '00000000-0000-4000-8000-0000000004b0' and title = 'The  Waves ';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: B deleted a log moderation had hidden'; end if;
end $$;
do $$ declare n int; begin
  delete from public.watchlist where owner = '00000000-0000-4000-8000-0000000004a0';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: B emptied A''s watchlist'; end if;
  delete from public.logs where owner = '00000000-0000-4000-8000-0000000004a0';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: B deleted A''s logs'; end if;
  if exists (select 1 from public.friend_hides where owner = '00000000-0000-4000-8000-0000000004a0') then raise exception 'FAIL: B sees what A removed'; end if;
  delete from public.logs where owner = '00000000-0000-4000-8000-0000000004b0' and title = 'Gummo';
  get diagnostics n = row_count; if n <> 1 then raise exception 'FAIL: B couldn''t delete B''s own log'; end if;
end $$;

-- ---------- 50 logs a day, counted as they're posted ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004e0","role":"authenticated"}', true);
do $$ declare i int; n int; begin
  for i in 1..50 loop insert into public.logs (kind, title) values ('book', 'Day ' || i); end loop;
  begin
    insert into public.logs (kind, title) values ('book', 'One too many');
    raise exception 'FAIL: a 51st log went in on one day';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  -- deleting them makes no room: the day's count is of what was posted
  delete from public.logs where owner = '00000000-0000-4000-8000-0000000004e0';
  get diagnostics n = row_count; if n <> 50 then raise exception 'FAIL: E couldn''t delete E''s logs'; end if;
  begin
    insert into public.logs (kind, title) values ('book', 'Posted again');
    raise exception 'FAIL: deleting logs made room for more on the same day';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  -- the counts are the database's own: nobody reads or changes them from the page
  begin
    perform 1 from public.log_counts;
    raise exception 'FAIL: E can read the day''s counts';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.log_counts;
    raise exception 'FAIL: E can clear the day''s counts';
  exception when insufficient_privilege then null; end;
end $$;
-- a full day yesterday doesn't count today, and days before yesterday are let go
reset role;
insert into public.log_counts (owner, day, n) values
  ('00000000-0000-4000-8000-0000000004c0', (now() at time zone 'utc')::date - 1, 50),
  ('00000000-0000-4000-8000-0000000004c0', (now() at time zone 'utc')::date - 3, 9);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004c0","role":"authenticated"}', true);
insert into public.logs (kind, title) values ('book', 'A new day');
reset role;
do $$ begin
  if (select n from public.log_counts where owner = '00000000-0000-4000-8000-0000000004c0' and day = (now() at time zone 'utc')::date) <> 1 then
    raise exception 'FAIL: today''s count for C isn''t 1'; end if;
  if exists (select 1 from public.log_counts where owner = '00000000-0000-4000-8000-0000000004c0' and day < (now() at time zone 'utc')::date - 1) then
    raise exception 'FAIL: C''s count from three days ago is still kept'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004e0","role":"authenticated"}', true);

-- ---------- two adds at once can't beat a limit ----------
-- Each add takes a lock for its person before it counts, and keeps it to the end of the transaction, so a second add by
-- the same person waits, then counts the first. A real race needs two sessions at once, which the SQL Editor doesn't
-- have (docs/RUN-0007.md says how it was checked with two); here, E's adds leave E's locks taken in this one.
insert into public.watchlist (kind, title) values ('book', 'Locked in');
do $$
declare held bigint[] := array(select (l.classid::bigint << 32) | l.objid::bigint from pg_locks l
                               where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.objsubid = 1);
begin
  if not hashtext('logs:00000000-0000-4000-8000-0000000004e0')::bigint = any (held) then raise exception 'FAIL: adding a log didn''t take its person''s lock'; end if;
  if not hashtext('watch:00000000-0000-4000-8000-0000000004e0')::bigint = any (held) then raise exception 'FAIL: adding to a watchlist didn''t take its person''s lock'; end if;
end $$;

-- ---------- deleting an account takes its logs, watchlist and removals along ----------
reset role;
delete from auth.users where id = '00000000-0000-4000-8000-0000000004a0';
do $$ begin
  if exists (select 1 from public.logs where owner = '00000000-0000-4000-8000-0000000004a0') then raise exception 'FAIL: A''s logs outlived A'; end if;
  if exists (select 1 from public.watchlist where owner = '00000000-0000-4000-8000-0000000004a0') then raise exception 'FAIL: A''s watchlist outlived A'; end if;
  if exists (select 1 from public.friend_hides where owner = '00000000-0000-4000-8000-0000000004a0') then raise exception 'FAIL: A''s removals outlived A'; end if;
end $$;
delete from auth.users where id = '00000000-0000-4000-8000-0000000004e0';
do $$ begin
  if exists (select 1 from public.log_counts where owner = '00000000-0000-4000-8000-0000000004e0') then raise exception 'FAIL: E''s counts outlived E'; end if;
end $$;

select 'ALL PHASE 4 CHECKS PASSED' as result;
rollback;
