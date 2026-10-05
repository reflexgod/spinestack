-- shelfstackd, phase 8 (proposed): checks real ids and editing your own log after migration 0011
-- (docs/proposed-0011-ids-edits.sql): the ids a log, a spine, an Up next and a rec keep (and the ones they refuse),
-- filling an id in once, matching by id (logging takes it off Up next, "you logged it too", a second Up next refused,
-- a me-too and a kept rec carrying the id), editing your own log (what changes, edited_at, the caption, the likes and
-- replies staying), and what nobody else can do: edit your log, change whose it is, its kind or its title, or fill in
-- an id on your spine. Run it in the Supabase dashboard (SQL Editor -> New query -> paste -> Run), after 0011. It
-- makes throwaway users inside a transaction and rolls everything back at the end: nothing is kept.
-- The last result says "ALL 0011 CHECKS PASSED". Any failed check stops with an error that starts "FAIL:".
-- Real accounts can be in the database, so every check looks only at the test's own rows.
--
-- The people:  A public (logs, a shelf, Up next)   B public (A and B follow each other)   E public (an outsider)

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000011a0', 'rls11-a@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000011b0', 'rls11-b@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000011e0', 'rls11-e@example.invalid', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000011a0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000011a0', 'rls11_a');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000011b0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000011b0', 'rls11_b');
select public.follow('00000000-0000-4000-8000-0000000011a0');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000011e0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000011e0', 'rls11_e');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000011a0","role":"authenticated"}', true);
select public.follow('00000000-0000-4000-8000-0000000011b0');

-- ---------- the ids saved ----------
-- A: Gummo with its TMDB id; The Waves with its Open Library work id; Kids with no id (as a log from before 0011)
insert into public.logs (kind, title, year, tmdb_id, rating, review) values ('movie', 'Gummo', 1997, 18415, 8, 'The bathtub scene.');
insert into public.logs (kind, title, year, ol_id) values ('book', 'The Waves', 1931, 'OL123W');
insert into public.logs (kind, title, year) values ('movie', 'Kids', 1995);
reset role;
update public.logs set id = '00000000-0000-4000-8000-0000000011a1' where owner = '00000000-0000-4000-8000-0000000011a0' and title = 'Gummo';
update public.logs set id = '00000000-0000-4000-8000-0000000011a2' where owner = '00000000-0000-4000-8000-0000000011a0' and title = 'The Waves';
update public.logs set id = '00000000-0000-4000-8000-0000000011a3' where owner = '00000000-0000-4000-8000-0000000011a0' and title = 'Kids';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000011a0","role":"authenticated"}', true);
do $$ begin
  if (select tmdb_id from public.logs where id = '00000000-0000-4000-8000-0000000011a1') is distinct from 18415 then raise exception 'FAIL: the film''s TMDB id wasn''t kept'; end if;
  if (select ol_id from public.logs where id = '00000000-0000-4000-8000-0000000011a2') is distinct from 'OL123W' then raise exception 'FAIL: the book''s Open Library id wasn''t kept'; end if;
  if (select edited_at from public.logs where id = '00000000-0000-4000-8000-0000000011a1') is not null then raise exception 'FAIL: a new log says it was edited'; end if;
  -- a film has only a TMDB id, a book only an Open Library work id, in their own shapes
  begin insert into public.logs (kind, title, ol_id) values ('movie', 'Mirror', 'OL9W'); raise exception 'FAIL: a film kept an Open Library id';
  exception when check_violation then null; end;
  begin insert into public.logs (kind, title, tmdb_id) values ('book', 'Bluets', 5); raise exception 'FAIL: a book kept a TMDB id';
  exception when check_violation then null; end;
  begin insert into public.logs (kind, title, ol_id) values ('book', 'Bluets', 'OL9M'); raise exception 'FAIL: an edition id (OL…M) was kept as a work id';
  exception when check_violation then null; end;
  begin insert into public.logs (kind, title, tmdb_id) values ('movie', 'Mirror', 0); raise exception 'FAIL: a TMDB id of 0 was kept';
  exception when check_violation then null; end;
end $$;

-- a shelf: save_shelf() keeps each spine's id, and leaves out one that isn't an id or is the other kind's
select public.save_shelf('{"id":"00000000-0000-4000-8000-0000000011c1","caption":"rls11"}'::jsonb,
  '[{"item_id":"b0","kind":"movie","title":"Gummo","year":"1997","tmdb_id":"18415"},
    {"item_id":"b1","kind":"book","title":"The Waves","year":"1931","ol_id":"OL123W"},
    {"item_id":"b2","kind":"movie","title":"Kids","year":"1995"},
    {"item_id":"b3","kind":"book","title":"Orlando","year":"1928","tmdb_id":"77","ol_id":"nope"}]'::jsonb);
do $$ begin
  if (select array_agg(coalesce(tmdb_id::text, ol_id, '-') order by position) from public.shelf_items where shelf_id = '00000000-0000-4000-8000-0000000011c1')
     is distinct from array['18415', 'OL123W', '-', '-'] then raise exception 'FAIL: save_shelf() didn''t keep the ids as they should be'; end if;
end $$;

-- Up next: by its id too, so the same film spelled another way is refused as a second
insert into public.watchlist (kind, title, year, tmdb_id) values ('movie', 'Julien Donkey-Boy', 1999, 26290);
do $$ begin
  if (select tmdb_id from public.watchlist where owner = '00000000-0000-4000-8000-0000000011a0' and title = 'Julien Donkey-Boy') is distinct from 26290 then
    raise exception 'FAIL: Up next didn''t keep the id'; end if;
  begin insert into public.watchlist (kind, title, year, tmdb_id) values ('movie', 'julien donkey boy', 1999, 26290); raise exception 'FAIL: the same film went on Up next twice under two spellings';
  exception when unique_violation then null; end;
end $$;
-- logging it by its id, spelled another way, takes it off Up next
insert into public.logs (kind, title, year, tmdb_id) values ('movie', 'julien donkey boy', 1999, 26290);
do $$ begin
  if exists (select 1 from public.watchlist where owner = '00000000-0000-4000-8000-0000000011a0' and tmdb_id = 26290) then
    raise exception 'FAIL: logging the film by its id didn''t take it off Up next'; end if;
end $$;

-- a rec keeps its id; Keep puts it on Up next with it; a log from it takes it
insert into public.recs (receiver, kind, title, year, tmdb_id) values ('00000000-0000-4000-8000-0000000011b0', 'movie', 'Mister Lonely', 2007, 9999);
reset role;
update public.recs set id = '00000000-0000-4000-8000-0000000011d1' where sender = '00000000-0000-4000-8000-0000000011a0' and title = 'Mister Lonely';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000011b0","role":"authenticated"}', true);
select public.rec_keep('00000000-0000-4000-8000-0000000011d1');
do $$ begin
  if (select tmdb_id from public.recs where id = '00000000-0000-4000-8000-0000000011d1') is distinct from 9999 then raise exception 'FAIL: the rec didn''t keep its id'; end if;
  if (select tmdb_id from public.watchlist where owner = '00000000-0000-4000-8000-0000000011b0' and title = 'Mister Lonely') is distinct from 9999 then
    raise exception 'FAIL: Keep put the rec on Up next without its id'; end if;
end $$;
insert into public.logs (kind, title, rec) values ('movie', 'whatever the page sent', '00000000-0000-4000-8000-0000000011d1');
do $$ begin
  if (select tmdb_id from public.logs where owner = '00000000-0000-4000-8000-0000000011b0' and rec = '00000000-0000-4000-8000-0000000011d1') is distinct from 9999 then
    raise exception 'FAIL: a log from a rec didn''t take the rec''s id'; end if;
  if exists (select 1 from public.watchlist where owner = '00000000-0000-4000-8000-0000000011b0' and tmdb_id = 9999) then raise exception 'FAIL: the rec''s log didn''t take it off Up next'; end if;
end $$;

-- B: a like and a reply on A's Gummo, and Same on it (a me-too takes its id); post_stats() says B logged Gummo too,
-- by its id, though B's has another spelling
insert into public.likes (log) values ('00000000-0000-4000-8000-0000000011a1');
insert into public.replies (log, text) values ('00000000-0000-4000-8000-0000000011a1', 'Seen it twice.');
insert into public.logs (kind, title, metoo_of) values ('movie', 'anything', '00000000-0000-4000-8000-0000000011a1');
do $$ begin
  if (select tmdb_id from public.logs where owner = '00000000-0000-4000-8000-0000000011b0' and metoo_of = '00000000-0000-4000-8000-0000000011a1') is distinct from 18415 then
    raise exception 'FAIL: a me-too didn''t take the id of the log it''s from'; end if;
end $$;
reset role;
update public.logs set title = 'GUMMO (1997)', year = null where owner = '00000000-0000-4000-8000-0000000011b0' and metoo_of = '00000000-0000-4000-8000-0000000011a1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000011b0","role":"authenticated"}', true);
do $$ begin
  if not (select logged from public.post_stats(array['00000000-0000-4000-8000-0000000011a1'::uuid])) then
    raise exception 'FAIL: post_stats() didn''t see B''s log of Gummo by its id, spelled another way'; end if;
end $$;

-- ---------- editing: not someone else's ----------
do $$ declare n int; begin
  update public.logs set rating = 1, review = 'B was here' where id = '00000000-0000-4000-8000-0000000011a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B edited A''s log'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000011e0","role":"authenticated"}', true);
do $$ declare n int; begin
  update public.logs set review = 'E was here' where id = '00000000-0000-4000-8000-0000000011a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: E edited A''s log'; end if;
  update public.logs set tmdb_id = 1 where id = '00000000-0000-4000-8000-0000000011a3';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: E filled in an id on A''s log'; end if;
  update public.shelf_items set tmdb_id = 1 where shelf_id = '00000000-0000-4000-8000-0000000011c1' and item_id = 'b2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: E filled in an id on A''s spine'; end if;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin update public.logs set review = 'a visitor' where id = '00000000-0000-4000-8000-0000000011a1'; raise exception 'FAIL: a visitor could edit a log';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select review from public.logs where id = '00000000-0000-4000-8000-0000000011a1') <> 'The bathtub scene.' then raise exception 'FAIL: someone else changed A''s review'; end if;
  if (select tmdb_id from public.logs where id = '00000000-0000-4000-8000-0000000011a3') is not null then raise exception 'FAIL: someone else filled in A''s id'; end if;
end $$;

-- ---------- editing your own: only what can be edited ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000011a0","role":"authenticated"}', true);
do $$ begin
  begin update public.logs set owner = '00000000-0000-4000-8000-0000000011b0' where id = '00000000-0000-4000-8000-0000000011a1'; raise exception 'FAIL: A gave the log to B';
  exception when insufficient_privilege then null; end;
  begin update public.logs set kind = 'book' where id = '00000000-0000-4000-8000-0000000011a1'; raise exception 'FAIL: A changed the log''s kind';
  exception when insufficient_privilege then null; end;
  begin update public.logs set title = 'Kids' where id = '00000000-0000-4000-8000-0000000011a1'; raise exception 'FAIL: A changed the log''s title';
  exception when insufficient_privilege then null; end;
  begin update public.logs set year = 2000 where id = '00000000-0000-4000-8000-0000000011a1'; raise exception 'FAIL: A changed the log''s year';
  exception when insufficient_privilege then null; end;
  begin update public.logs set created_at = now() - interval '1 year' where id = '00000000-0000-4000-8000-0000000011a1'; raise exception 'FAIL: A changed when the log was posted';
  exception when insufficient_privilege then null; end;
  begin update public.logs set edited_at = null where id = '00000000-0000-4000-8000-0000000011a1'; raise exception 'FAIL: A set edited_at';
  exception when insufficient_privilege then null; end;
  begin update public.logs set hidden = false where id = '00000000-0000-4000-8000-0000000011a1'; raise exception 'FAIL: A changed hidden';
  exception when insufficient_privilege then null; end;
  begin update public.logs set metoo_of = null, rec = null where id = '00000000-0000-4000-8000-0000000011a1'; raise exception 'FAIL: A changed metoo_of or rec';
  exception when insufficient_privilege then null; end;
  begin update public.shelf_items set title = 'Kids' where shelf_id = '00000000-0000-4000-8000-0000000011c1' and item_id = 'b0'; raise exception 'FAIL: A changed a spine''s title in place';
  exception when insufficient_privilege then null; end;
  -- not a day that hasn't happened
  begin update public.logs set watched_on = current_date + 30 where id = '00000000-0000-4000-8000-0000000011a1'; raise exception 'FAIL: a log was moved to next month';
  exception when check_violation then null; end;
  begin update public.logs set rating = 11 where id = '00000000-0000-4000-8000-0000000011a1'; raise exception 'FAIL: a rating of 11 was kept';
  exception when check_violation then null; end;
end $$;

-- the edit: rating, review, spoiler, rewatch and the day
update public.logs set rating = 9, review = 'Second time: the bathtub scene, and the rabbit boy.', spoiler = true, rewatch = true, watched_on = current_date - 1
where id = '00000000-0000-4000-8000-0000000011a1';
do $$ declare l public.logs; s record; begin
  select * into l from public.logs where id = '00000000-0000-4000-8000-0000000011a1';
  if l.rating <> 9 or not l.spoiler or not l.rewatch or l.watched_on <> current_date - 1 then raise exception 'FAIL: the edit wasn''t kept'; end if;
  if l.edited_at is null then raise exception 'FAIL: an edited log has no edited_at'; end if;
  if l.caption <> left(l.review, 280) then raise exception 'FAIL: the caption didn''t follow the review'; end if;
  if l.title <> 'Gummo' or l.kind <> 'movie' or l.year <> 1997 or l.tmdb_id <> 18415 or l.owner <> '00000000-0000-4000-8000-0000000011a0' then raise exception 'FAIL: the edit changed what the log is about'; end if;
  -- its likes, replies and me-toos stay on it
  select * into s from public.post_stats(array['00000000-0000-4000-8000-0000000011a1'::uuid]);
  if s.likes <> 1 or s.replies <> 1 or s.metoos <> 1 then raise exception 'FAIL: the edit lost its likes, replies or me-toos (% % %)', s.likes, s.replies, s.metoos; end if;
  if s.edited_at is null or s.tmdb_id <> 18415 or s.review <> l.review then raise exception 'FAIL: post_stats() doesn''t give edited_at, the id and the new review'; end if;
end $$;
-- rating first, the review later: a log rated with no review takes one
update public.logs set rating = 6 where id = '00000000-0000-4000-8000-0000000011a2';
update public.logs set review = 'Six voices.' where id = '00000000-0000-4000-8000-0000000011a2';
do $$ begin
  if (select (rating, review) from public.logs where id = '00000000-0000-4000-8000-0000000011a2') is distinct from (6::smallint, 'Six voices.'::text) then
    raise exception 'FAIL: a rating then a review didn''t both stay'; end if;
end $$;

-- ---------- filling in an id: once, by the owner, and it isn't an edit ----------
update public.logs set tmdb_id = 9344 where id = '00000000-0000-4000-8000-0000000011a3';
update public.shelf_items set tmdb_id = 9344 where shelf_id = '00000000-0000-4000-8000-0000000011c1' and item_id = 'b2';
do $$ begin
  if (select tmdb_id from public.logs where id = '00000000-0000-4000-8000-0000000011a3') is distinct from 9344 then raise exception 'FAIL: A couldn''t fill in the id on an old log'; end if;
  if (select edited_at from public.logs where id = '00000000-0000-4000-8000-0000000011a3') is not null then raise exception 'FAIL: filling in an id marked the log edited'; end if;
  if (select tmdb_id from public.shelf_items where shelf_id = '00000000-0000-4000-8000-0000000011c1' and item_id = 'b2') is distinct from 9344 then raise exception 'FAIL: A couldn''t fill in the id on a spine'; end if;
  begin update public.logs set tmdb_id = 1 where id = '00000000-0000-4000-8000-0000000011a3'; raise exception 'FAIL: a log''s id was changed';
  exception when check_violation then null; end;
  begin update public.logs set tmdb_id = null where id = '00000000-0000-4000-8000-0000000011a3'; raise exception 'FAIL: a log''s id was taken off';
  exception when check_violation then null; end;
  begin update public.shelf_items set tmdb_id = 1 where shelf_id = '00000000-0000-4000-8000-0000000011c1' and item_id = 'b2'; raise exception 'FAIL: a spine''s id was changed';
  exception when check_violation then null; end;
  begin update public.logs set ol_id = 'OL1W' where id = '00000000-0000-4000-8000-0000000011a3'; raise exception 'FAIL: a film took an Open Library id';
  exception when check_violation then null; end;
end $$;

-- ---------- a log hidden by moderation can't be edited ----------
reset role;
update public.logs set hidden = true where id = '00000000-0000-4000-8000-0000000011a2';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000011a0","role":"authenticated"}', true);
do $$ declare n int; begin
  update public.logs set review = 'back' where id = '00000000-0000-4000-8000-0000000011a2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A edited a log hidden by moderation'; end if;
end $$;
reset role;

select 'ALL 0011 CHECKS PASSED' as result;
rollback;
