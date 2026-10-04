-- shelfstackd, phase 6: checks the feed as posts after migration 0009 (supabase/migrations/0009_social.sql): a log's
-- rating, review, spoiler, rewatch and date; likes, replies and me-too; notifications; the daily limits; reports on
-- logs and replies; and who sees what. Run it in the Supabase dashboard (SQL Editor -> New query -> paste -> Run),
-- after 0009. It passed on the live database. It makes throwaway users inside a transaction and rolls everything back
-- at the end: nothing is kept.
-- The last result says "ALL 0009 CHECKS PASSED". Any failed check stops with an error that starts "FAIL:".
-- Real accounts can be in the database, so every check looks only at the test's own rows.
--
-- The people:  A public (likes, replies, me-too)   B public (logs Gummo)   C public (an outsider; follows B)
--              D private (logs Stalker; A follows D, accepted)   H public, then hidden by moderation

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000009a0', 'rls9-a@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000009b0', 'rls9-b@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000009c0', 'rls9-c@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000009d0', 'rls9-d@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000009f0', 'rls9-h@example.invalid', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009a0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000009a0', 'rls9_a');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009b0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000009b0', 'rls9_b');
-- B's log, as a page from after 0009 sends it: a review, 4.5 stars, a spoiler, a rewatch, a day last week
insert into public.logs (kind, title, author, year, cover_src, review, rating, spoiler, rewatch, watched_on) values
  ('movie', 'Gummo', 'Harmony Korine', 1997, 'url:https://image.tmdb.org/t/p/w500/gummo.jpg',
   repeat('the bathtub scene. ', 20), 9, true, true, (now() at time zone 'utc')::date - 7);
-- and one as a page from before 0009 sends it: a caption only
insert into public.logs (kind, title, year, caption) values ('book', 'The Waves', 1931, 'old page');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009c0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000009c0', 'rls9_c');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009d0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000009d0', 'rls9_d');
update public.profiles set is_private = true where id = '00000000-0000-4000-8000-0000000009d0';
insert into public.logs (kind, title, year) values ('movie', 'Stalker', 1979);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009f0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000009f0', 'rls9_h');
-- (a page can't choose a row's id: the test gives each its own here, as the database, to find them below)
reset role;
update public.logs set id = '00000000-0000-4000-8000-0000000009b1' where owner = '00000000-0000-4000-8000-0000000009b0' and title = 'Gummo';
update public.logs set id = '00000000-0000-4000-8000-0000000009b2' where owner = '00000000-0000-4000-8000-0000000009b0' and title = 'The Waves';
update public.logs set id = '00000000-0000-4000-8000-0000000009d1' where owner = '00000000-0000-4000-8000-0000000009d0' and title = 'Stalker';
set local role authenticated;

-- ---------- a log's new fields ----------
do $$ begin
  if (select rating from public.logs where id = '00000000-0000-4000-8000-0000000009b1') <> 9 then raise exception 'FAIL: the rating wasn''t kept'; end if;
  if (select char_length(review) from public.logs where id = '00000000-0000-4000-8000-0000000009b1') <> 380 then raise exception 'FAIL: the review was cut'; end if;
  if (select char_length(caption) from public.logs where id = '00000000-0000-4000-8000-0000000009b1') <> 280 then raise exception 'FAIL: the caption isn''t the review''s first 280'; end if;
  if (select review from public.logs where id = '00000000-0000-4000-8000-0000000009b2') <> 'old page' then raise exception 'FAIL: a caption from an old page didn''t become the review'; end if;
  if (select watched_on from public.logs where id = '00000000-0000-4000-8000-0000000009b2') <> (now() at time zone 'utc')::date then raise exception 'FAIL: watched_on isn''t today when not given'; end if;
  if not (select spoiler and rewatch from public.logs where id = '00000000-0000-4000-8000-0000000009b1') then raise exception 'FAIL: spoiler or rewatch wasn''t kept'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009b0","role":"authenticated"}', true);
do $$ begin
  begin insert into public.logs (kind, title, rating) values ('movie', 'Too Many Stars', 11); raise exception 'FAIL: a rating of 11 was kept';
  exception when check_violation then null; end;
  begin insert into public.logs (kind, title, watched_on) values ('movie', 'Tomorrow After', (now() at time zone 'utc')::date + 5); raise exception 'FAIL: a day next week was kept';
  exception when check_violation then null; end;
  begin insert into public.logs (kind, title, review) values ('movie', 'Long', repeat('x', 2001)); raise exception 'FAIL: a 2,001-character review was kept';
  exception when check_violation then null; end;
  begin update public.logs set hidden = true where id = '00000000-0000-4000-8000-0000000009b1'; raise exception 'FAIL: B could change hidden';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------- follows: C follows B; A follows D (private, accepted); notifications for both ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009c0","role":"authenticated"}', true);
select public.follow('00000000-0000-4000-8000-0000000009b0');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009a0","role":"authenticated"}', true);
select public.follow('00000000-0000-4000-8000-0000000009d0');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009d0","role":"authenticated"}', true);
select public.answer_request('00000000-0000-4000-8000-0000000009a0', true);
do $$ begin
  -- D accepted A's request: that's D's own doing, so no notification for D
  if exists (select 1 from public.notifications where owner = '00000000-0000-4000-8000-0000000009d0') then raise exception 'FAIL: D was notified of the request D accepted'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009b0","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.notifications_list() where kind = 'follow' and username = 'rls9_c') <> 1 then raise exception 'FAIL: B wasn''t told C follows them'; end if;
end $$;

-- ---------- likes ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009a0","role":"authenticated"}', true);
insert into public.likes (log) values ('00000000-0000-4000-8000-0000000009b1');
insert into public.likes (log) values ('00000000-0000-4000-8000-0000000009d1');   -- D's: A follows D
do $$ begin
  begin insert into public.likes (log) values ('00000000-0000-4000-8000-0000000009b1'); raise exception 'FAIL: A liked the same log twice';
  exception when unique_violation then null; end;
  if (select likes from public.post_stats(array['00000000-0000-4000-8000-0000000009b1'::uuid])) <> 1 then raise exception 'FAIL: the like wasn''t counted'; end if;
  if not (select liked from public.post_stats(array['00000000-0000-4000-8000-0000000009b1'::uuid])) then raise exception 'FAIL: post_stats doesn''t say A liked it'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009c0","role":"authenticated"}', true);
do $$ begin
  begin insert into public.likes (log) values ('00000000-0000-4000-8000-0000000009d1'); raise exception 'FAIL: C liked private D''s log';
  exception when insufficient_privilege then null; end;
  if exists (select 1 from public.post_stats(array['00000000-0000-4000-8000-0000000009d1'::uuid])) then raise exception 'FAIL: C sees the counts of private D''s log'; end if;
  if exists (select 1 from public.likes where log = '00000000-0000-4000-8000-0000000009d1') then raise exception 'FAIL: C sees likes on private D''s log'; end if;
  -- a like by a public profile on a public log: everyone sees it
  if not exists (select 1 from public.likes where log = '00000000-0000-4000-8000-0000000009b1' and owner = '00000000-0000-4000-8000-0000000009a0') then raise exception 'FAIL: C can''t see A''s like'; end if;
  if (select liked from public.post_stats(array['00000000-0000-4000-8000-0000000009b1'::uuid])) then raise exception 'FAIL: post_stats says C liked it'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if (select likes from public.post_stats(array['00000000-0000-4000-8000-0000000009b1'::uuid])) <> 1 then raise exception 'FAIL: a visitor doesn''t see the count'; end if;
  begin insert into public.likes (log, owner) values ('00000000-0000-4000-8000-0000000009b1', '00000000-0000-4000-8000-0000000009c0'); raise exception 'FAIL: a visitor liked something';
  exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009b0","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.notifications_list() where kind = 'like' and username = 'rls9_a' and log_title = 'Gummo') <> 1 then raise exception 'FAIL: B wasn''t told A liked Gummo'; end if;
  -- B liking their own log tells nobody
  insert into public.likes (log) values ('00000000-0000-4000-8000-0000000009b1');
  if (select count(*) from public.notifications where owner = '00000000-0000-4000-8000-0000000009b0' and kind = 'like') <> 1 then raise exception 'FAIL: B was told of their own like'; end if;
end $$;
-- A unlikes before B has looked: the notification goes; liking again notifies once more, but only once however often
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009a0","role":"authenticated"}', true);
delete from public.likes where log = '00000000-0000-4000-8000-0000000009b1';
reset role;
do $$ begin
  if exists (select 1 from public.notifications where owner = '00000000-0000-4000-8000-0000000009b0' and kind = 'like') then raise exception 'FAIL: an unlike left its notification'; end if;
  if not exists (select 1 from public.likes where log = '00000000-0000-4000-8000-0000000009b1' and owner = '00000000-0000-4000-8000-0000000009b0') then raise exception 'FAIL: A''s unlike took B''s like'; end if;
end $$;
set local role authenticated;
insert into public.likes (log) values ('00000000-0000-4000-8000-0000000009b1');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009b0","role":"authenticated"}', true);
select public.notifications_read();
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009a0","role":"authenticated"}', true);
delete from public.likes where log = '00000000-0000-4000-8000-0000000009b1';
insert into public.likes (log) values ('00000000-0000-4000-8000-0000000009b1');
reset role;
do $$ begin
  if (select count(*) from public.notifications where owner = '00000000-0000-4000-8000-0000000009b0' and kind = 'like') <> 1 then raise exception 'FAIL: liking again notified twice'; end if;
end $$;
set local role authenticated;

-- ---------- replies ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009a0","role":"authenticated"}', true);
insert into public.replies (log, text) values ('00000000-0000-4000-8000-0000000009b1', '  the rabbit boy  ');
reset role;
update public.replies set id = '00000000-0000-4000-8000-0000000009a2' where owner = '00000000-0000-4000-8000-0000000009a0';
set local role authenticated;
do $$ begin
  begin insert into public.replies (log, text) values ('00000000-0000-4000-8000-0000000009b1', repeat('y', 281)); raise exception 'FAIL: a 281-character reply was kept';
  exception when check_violation then null; end;
  begin insert into public.replies (log, text) values ('00000000-0000-4000-8000-0000000009b1', '   '); raise exception 'FAIL: an empty reply was kept';
  exception when check_violation then null; end;
  if (select text from public.replies where id = '00000000-0000-4000-8000-0000000009a2') <> 'the rabbit boy' then raise exception 'FAIL: the reply wasn''t trimmed'; end if;
end $$;
-- D (private) replies to B's public log
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009d0","role":"authenticated"}', true);
insert into public.replies (log, text) values ('00000000-0000-4000-8000-0000000009b1', 'from a private profile');
reset role;
update public.replies set id = '00000000-0000-4000-8000-0000000009d2' where owner = '00000000-0000-4000-8000-0000000009d0';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009c0","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.replies_of('00000000-0000-4000-8000-0000000009b1')) <> 1 then raise exception 'FAIL: C (who doesn''t follow D) should see A''s reply and not D''s'; end if;
  if exists (select 1 from public.replies where id = '00000000-0000-4000-8000-0000000009d2') then raise exception 'FAIL: C reads private D''s reply'; end if;
  if (select replies from public.post_stats(array['00000000-0000-4000-8000-0000000009b1'::uuid])) <> 2 then raise exception 'FAIL: the reply count isn''t 2'; end if;
  -- C can't delete A's reply
  delete from public.replies where id = '00000000-0000-4000-8000-0000000009a2';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009a0","role":"authenticated"}', true);
do $$ begin
  if not exists (select 1 from public.replies where id = '00000000-0000-4000-8000-0000000009a2') then raise exception 'FAIL: C deleted A''s reply'; end if;
  if (select count(*) from public.replies_of('00000000-0000-4000-8000-0000000009b1')) <> 2 then raise exception 'FAIL: A (who follows D) should see both replies'; end if;
  if (select string_agg(username, ',' order by created_at) from public.replies_of('00000000-0000-4000-8000-0000000009b1')) <> 'rls9_a,rls9_d' then raise exception 'FAIL: replies aren''t oldest first'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009b0","role":"authenticated"}', true);
do $$ begin
  -- B, whose log it is, sees D's reply though B doesn't follow D, and is told of both
  if (select count(*) from public.replies_of('00000000-0000-4000-8000-0000000009b1')) <> 2 then raise exception 'FAIL: B doesn''t see every reply to their log'; end if;
  if (select count(*) from public.notifications_list() where kind = 'reply') <> 2 then raise exception 'FAIL: B wasn''t told of both replies'; end if;
  if (select reply_text from public.notifications_list() where kind = 'reply' and username = 'rls9_d') <> 'from a private profile' then raise exception 'FAIL: the reply notification has no text'; end if;
  -- B deletes D's reply to B's log
  delete from public.replies where id = '00000000-0000-4000-8000-0000000009d2';
  if exists (select 1 from public.replies_of('00000000-0000-4000-8000-0000000009b1') where username = 'rls9_d') then raise exception 'FAIL: B couldn''t delete a reply to their log'; end if;
  if exists (select 1 from public.notifications_list() where kind = 'reply' and username = 'rls9_d') then raise exception 'FAIL: a deleted reply''s notification stayed'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if (select count(*) from public.replies_of('00000000-0000-4000-8000-0000000009b1')) <> 1 then raise exception 'FAIL: a visitor doesn''t see the public reply'; end if;
  if exists (select 1 from public.replies_of('00000000-0000-4000-8000-0000000009d1')) then raise exception 'FAIL: a visitor sees replies on a private log'; end if;
end $$;
set local role authenticated;

-- ---------- me too ----------
-- C logs "me too" on B's Gummo, sending a different title: the log is Gummo all the same
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009c0","role":"authenticated"}', true);
insert into public.logs (kind, title, metoo_of) values ('book', 'Something Else', '00000000-0000-4000-8000-0000000009b1');
-- and on private D's Stalker, which C can't see: just a log of what C sent
insert into public.logs (kind, title, metoo_of) values ('movie', 'My Own', '00000000-0000-4000-8000-0000000009d1');
reset role;
update public.logs set id = '00000000-0000-4000-8000-0000000009c1' where owner = '00000000-0000-4000-8000-0000000009c0' and title = 'Gummo';
update public.logs set id = '00000000-0000-4000-8000-0000000009c2' where owner = '00000000-0000-4000-8000-0000000009c0' and title = 'My Own';
set local role authenticated;
do $$ begin
  if (select title || '|' || kind || '|' || year from public.logs where id = '00000000-0000-4000-8000-0000000009c1') <> 'Gummo|movie|1997' then raise exception 'FAIL: a me-too isn''t a copy of the log it''s from'; end if;
  if (select metoo_of from public.logs where id = '00000000-0000-4000-8000-0000000009c2') is not null then raise exception 'FAIL: a me-too of a log C can''t see was kept'; end if;
  if (select title from public.logs where id = '00000000-0000-4000-8000-0000000009c2') <> 'My Own' then raise exception 'FAIL: the log was changed'; end if;
  if (select metoos from public.post_stats(array['00000000-0000-4000-8000-0000000009b1'::uuid])) <> 1 then raise exception 'FAIL: the me-too wasn''t counted'; end if;
  if not (select logged from public.post_stats(array['00000000-0000-4000-8000-0000000009b1'::uuid])) then raise exception 'FAIL: post_stats doesn''t say C has logged Gummo'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009b0","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.notifications_list() where kind = 'metoo' and username = 'rls9_c' and log_title = 'Gummo') <> 1 then raise exception 'FAIL: B wasn''t told C logged Gummo too'; end if;
end $$;

-- ---------- notifications are each person's own ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009c0","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.notifications where owner = '00000000-0000-4000-8000-0000000009b0') then raise exception 'FAIL: C reads B''s notifications'; end if;
  if exists (select 1 from public.notifications_list() where username = 'rls9_a') then raise exception 'FAIL: C''s list has B''s'; end if;
  update public.notifications set read = false where owner = '00000000-0000-4000-8000-0000000009b0';
  begin insert into public.notifications (owner, actor, kind) values ('00000000-0000-4000-8000-0000000009b0', '00000000-0000-4000-8000-0000000009c0', 'follow'); raise exception 'FAIL: C made a notification';
  exception when insufficient_privilege then null; end;
  begin update public.notifications set kind = 'reply' where owner = '00000000-0000-4000-8000-0000000009c0'; raise exception 'FAIL: C changed what a notification is';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009b0","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.notifications where owner = '00000000-0000-4000-8000-0000000009b0' and not read) = 0 then raise exception 'FAIL: B has nothing unread'; end if;
  if public.notifications_read() = 0 then raise exception 'FAIL: notifications_read() marked nothing'; end if;
  if exists (select 1 from public.notifications where owner = '00000000-0000-4000-8000-0000000009b0' and not read) then raise exception 'FAIL: some are still unread'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin perform public.notifications_list(); raise exception 'FAIL: a visitor called notifications_list()';
  exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;

-- ---------- a hidden profile is in nothing ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009f0","role":"authenticated"}', true);
insert into public.likes (log) values ('00000000-0000-4000-8000-0000000009b2');
insert into public.replies (log, text) values ('00000000-0000-4000-8000-0000000009b2', 'before moderation');
reset role;
update public.profiles set hidden = true where id = '00000000-0000-4000-8000-0000000009f0';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009b0","role":"authenticated"}', true);
do $$ begin
  if (select likes + replies from public.post_stats(array['00000000-0000-4000-8000-0000000009b2'::uuid])) <> 0 then raise exception 'FAIL: a hidden profile''s like or reply is counted'; end if;
  if exists (select 1 from public.replies_of('00000000-0000-4000-8000-0000000009b2')) then raise exception 'FAIL: a hidden profile''s reply shows'; end if;
  if exists (select 1 from public.notifications_list() where username = 'rls9_h') then raise exception 'FAIL: a hidden profile''s notification shows'; end if;
end $$;

-- ---------- reports on a log and a reply ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009c0","role":"authenticated"}', true);
insert into public.reports (target_type, target_id) values ('log', '00000000-0000-4000-8000-0000000009b1'), ('reply', '00000000-0000-4000-8000-0000000009a2');
do $$ begin
  begin insert into public.reports (target_type, target_id) values ('log', '00000000-0000-4000-8000-0000000009d1'); raise exception 'FAIL: C reported a log C can''t see';
  exception when check_violation then null; end;
end $$;

-- ---------- the daily limits ----------
-- (the counts are set by hand, as the database itself: making 300 likes needs 300 logs)
reset role;
insert into public.act_counts (owner, day, what, n) values
  ('00000000-0000-4000-8000-0000000009a0', (now() at time zone 'utc')::date, 'reply', 100),
  ('00000000-0000-4000-8000-0000000009c0', (now() at time zone 'utc')::date, 'like', 300)
  on conflict (owner, day, what) do update set n = excluded.n;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009a0","role":"authenticated"}', true);
do $$ begin
  begin insert into public.replies (log, text) values ('00000000-0000-4000-8000-0000000009b1', 'the 101st'); raise exception 'FAIL: a 101st reply in a day was kept';
  exception when raise_exception then if sqlerrm not like '%100 replies today%' then raise; end if; end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009c0","role":"authenticated"}', true);
do $$ begin
  begin insert into public.likes (log) values ('00000000-0000-4000-8000-0000000009b2'); raise exception 'FAIL: a 301st like in a day was kept';
  exception when raise_exception then if sqlerrm not like '%300 likes today%' then raise; end if; end;
  -- unliking doesn't make room
  delete from public.likes where owner = '00000000-0000-4000-8000-0000000009c0';
  begin insert into public.likes (log) values ('00000000-0000-4000-8000-0000000009b2'); raise exception 'FAIL: unliking made room for another like';
  exception when raise_exception then null; end;
  begin perform public.count_act('00000000-0000-4000-8000-0000000009c0', 'like', 999, 'x'); raise exception 'FAIL: count_act() can be called from outside';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.act_counts; raise exception 'FAIL: act_counts can be read from outside';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  -- each limit is counted under that person's lock, as 0007's logs are
  if (select prosrc from pg_proc where proname = 'count_act') not like '%pg_advisory_xact_lock%' then raise exception 'FAIL: count_act() takes no lock'; end if;
end $$;

-- ---------- deleting a log takes its likes, replies and notifications with it ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009b0","role":"authenticated"}', true);
delete from public.logs where id = '00000000-0000-4000-8000-0000000009b1';
reset role;
do $$ begin
  if exists (select 1 from public.likes where log = '00000000-0000-4000-8000-0000000009b1')
     or exists (select 1 from public.replies where log = '00000000-0000-4000-8000-0000000009b1')
     or exists (select 1 from public.notifications where log = '00000000-0000-4000-8000-0000000009b1') then raise exception 'FAIL: a deleted log left likes, replies or notifications'; end if;
  if (select metoo_of from public.logs where id = '00000000-0000-4000-8000-0000000009c1') is not null then raise exception 'FAIL: a me-too still points at a deleted log'; end if;
end $$;

select 'ALL 0009 CHECKS PASSED' as result;
rollback;
