-- shelfstackd, phase 7: checks recs after migration 0010 (supabase/migrations/0010_recs.sql): sending one (only to someone
-- who follows you back, once per title, not a title they've logged, 6 waiting each, 20 a day), who sees a rec, its note
-- and its thread, keeping one and letting it go, a log marking it watched, the notifications, the feed's line, the
-- counts and post_stats()'s rec_by. Run it in the Supabase dashboard (SQL Editor -> New query -> paste -> Run), after
-- 0010. It passed on the live database. It makes throwaway users inside a transaction and rolls everything back at the
-- end: nothing is kept.
-- The last result says "ALL 0010 CHECKS PASSED". Any failed check stops with an error that starts "FAIL:".
-- Real accounts can be in the database, so every check looks only at the test's own rows.
--
-- The people:  A public (sends recs)   B public (A and B follow each other; B logged Stalker)
--              C public (follows A; A doesn't follow C)   D private (A and D follow each other, accepted)
--              E public (an outsider: follows nobody)   H public, follows A both ways, then hidden by moderation

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000010a0', 'rls10-a@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000010b0', 'rls10-b@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000010c0', 'rls10-c@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000010d0', 'rls10-d@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000010e0', 'rls10-e@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000010f0', 'rls10-h@example.invalid', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010a0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000010a0', 'rls10_a');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010b0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000010b0', 'rls10_b');
insert into public.logs (kind, title, year) values ('movie', 'Stalker', 1979);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010c0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000010c0', 'rls10_c');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010d0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000010d0', 'rls10_d');
update public.profiles set is_private = true where id = '00000000-0000-4000-8000-0000000010d0';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010e0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000010e0', 'rls10_e');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010f0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000010f0', 'rls10_h');

-- follows: A <-> B, A <-> D (D private: A's request accepted; D follows A), A <-> H, C -> A
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010a0","role":"authenticated"}', true);
select public.follow('00000000-0000-4000-8000-0000000010b0');
select public.follow('00000000-0000-4000-8000-0000000010d0');
select public.follow('00000000-0000-4000-8000-0000000010f0');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010b0","role":"authenticated"}', true);
select public.follow('00000000-0000-4000-8000-0000000010a0');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010c0","role":"authenticated"}', true);
select public.follow('00000000-0000-4000-8000-0000000010a0');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010d0","role":"authenticated"}', true);
select public.answer_request('00000000-0000-4000-8000-0000000010a0', true);
select public.follow('00000000-0000-4000-8000-0000000010a0');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010f0","role":"authenticated"}', true);
select public.follow('00000000-0000-4000-8000-0000000010a0');

-- ---------- sending ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010a0","role":"authenticated"}', true);
do $$ begin
  if (select array_agg(username order by username) from public.mutuals()) is distinct from array['rls10_b', 'rls10_d', 'rls10_h'] then
    raise exception 'FAIL: mutuals() isn''t B, D and H (C follows A, but A doesn''t follow C)';
  end if;
end $$;
insert into public.recs (receiver, kind, title, author, year, cover_src, note) values
  ('00000000-0000-4000-8000-0000000010b0', 'movie', 'Gummo', 'Harmony Korine', 1997, 'url:https://image.tmdb.org/t/p/w500/gummo.jpg', '  the bathtub scene  ');
insert into public.recs (receiver, kind, title, year, in_feed) values ('00000000-0000-4000-8000-0000000010b0', 'book', 'The Waves', 1931, false);
insert into public.recs (receiver, kind, title, year) values ('00000000-0000-4000-8000-0000000010d0', 'movie', 'Mirror', 1975);
insert into public.recs (receiver, kind, title, year) values ('00000000-0000-4000-8000-0000000010f0', 'movie', 'Solaris', 1972);
reset role;
update public.recs set id = '00000000-0000-4000-8000-0000000010a1' where sender = '00000000-0000-4000-8000-0000000010a0' and title = 'Gummo';
update public.recs set id = '00000000-0000-4000-8000-0000000010a2' where sender = '00000000-0000-4000-8000-0000000010a0' and title = 'The Waves';
update public.recs set id = '00000000-0000-4000-8000-0000000010a3' where sender = '00000000-0000-4000-8000-0000000010a0' and title = 'Mirror';
update public.recs set id = '00000000-0000-4000-8000-0000000010a4' where sender = '00000000-0000-4000-8000-0000000010a0' and title = 'Solaris';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010a0","role":"authenticated"}', true);
do $$ begin
  if (select note from public.recs where id = '00000000-0000-4000-8000-0000000010a1') <> 'the bathtub scene' then raise exception 'FAIL: the note wasn''t trimmed'; end if;
  if (select status from public.recs where id = '00000000-0000-4000-8000-0000000010a1') <> 'open' then raise exception 'FAIL: a new rec isn''t open'; end if;
  -- not to someone who doesn't follow you back
  begin insert into public.recs (receiver, kind, title) values ('00000000-0000-4000-8000-0000000010c0', 'movie', 'Gummo'); raise exception 'FAIL: A recommended to C, who A doesn''t follow';
  exception when insufficient_privilege then null; end;
  begin insert into public.recs (receiver, kind, title) values ('00000000-0000-4000-8000-0000000010e0', 'movie', 'Gummo'); raise exception 'FAIL: A recommended to E, a stranger';
  exception when insufficient_privilege then null; end;
  -- not to yourself
  begin insert into public.recs (receiver, kind, title) values ('00000000-0000-4000-8000-0000000010a0', 'movie', 'Gummo'); raise exception 'FAIL: A recommended to A';
  exception when check_violation then null; end;
  -- once per title per person
  begin insert into public.recs (receiver, kind, title, year) values ('00000000-0000-4000-8000-0000000010b0', 'movie', 'gummo ', 1997); raise exception 'FAIL: Gummo went to B twice';
  exception when unique_violation then null; end;
  -- not what they've logged
  begin insert into public.recs (receiver, kind, title, year) values ('00000000-0000-4000-8000-0000000010b0', 'movie', 'Stalker', 1979); raise exception 'FAIL: A recommended Stalker, which B has logged';
  exception when check_violation then if sqlerrm not like '%logged it already%' then raise; end if; end;
  -- a note of 140 at most
  begin insert into public.recs (receiver, kind, title, note) values ('00000000-0000-4000-8000-0000000010b0', 'movie', 'Long Note', repeat('x', 141)); raise exception 'FAIL: a 141-character note was kept';
  exception when check_violation then null; end;
  -- the sender is always the one signed in; status, hidden and log aren't the page's
  begin insert into public.recs (sender, receiver, kind, title) values ('00000000-0000-4000-8000-0000000010b0', '00000000-0000-4000-8000-0000000010a0', 'movie', 'Forged'); raise exception 'FAIL: A sent a rec as B';
  exception when insufficient_privilege then null; end;
  begin insert into public.recs (receiver, kind, title, status) values ('00000000-0000-4000-8000-0000000010b0', 'movie', 'Pre-watched', 'watched'); raise exception 'FAIL: A sent a rec already watched';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------- who sees a rec ----------
do $$ begin
  if (select count(*) from public.recs where sender = '00000000-0000-4000-8000-0000000010a0') <> 4 then raise exception 'FAIL: A doesn''t see the recs A sent'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010b0","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.recs where receiver = '00000000-0000-4000-8000-0000000010b0') <> 2 then raise exception 'FAIL: B doesn''t see the recs for B'; end if;
  if exists (select 1 from public.recs where receiver <> '00000000-0000-4000-8000-0000000010b0') then raise exception 'FAIL: B sees recs for someone else'; end if;
  if exists (select 1 from public.notifications where owner = '00000000-0000-4000-8000-0000000010b0' and kind = 'rec' and rec = '00000000-0000-4000-8000-0000000010a1') is not true then
    raise exception 'FAIL: B wasn''t told of the rec'; end if;
  if (select rec_title from public.notifications_list() where kind = 'rec' and rec = '00000000-0000-4000-8000-0000000010a1') <> 'Gummo' then
    raise exception 'FAIL: notifications_list() doesn''t give the rec''s title'; end if;
  if (select count(*) from public.recs_list('for')) <> 2 then raise exception 'FAIL: recs_list(for) isn''t B''s two'; end if;
  if (select username from public.recs_list('for') where id = '00000000-0000-4000-8000-0000000010a1') <> 'rls10_a' then raise exception 'FAIL: recs_list(for) doesn''t name the sender'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010c0","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.recs where id in ('00000000-0000-4000-8000-0000000010a1', '00000000-0000-4000-8000-0000000010a2')) then raise exception 'FAIL: C sees a rec between A and B'; end if;
  if exists (select 1 from public.recs_list('sent')) or exists (select 1 from public.recs_list('for')) then raise exception 'FAIL: recs_list() gives C someone else''s'; end if;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin perform 1 from public.recs; raise exception 'FAIL: recs can be read signed out';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;

-- ---------- the feed: "@a recommended Gummo to @b", never the note; not one left out of the feed ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010e0","role":"authenticated"}', true);
do $$ begin
  if not exists (select 1 from public.feed_recs('everyone') where id = '00000000-0000-4000-8000-0000000010a1' and username = 'rls10_a' and to_username = 'rls10_b') then
    raise exception 'FAIL: Everyone doesn''t show A''s rec to B'; end if;
  if exists (select 1 from public.feed_recs('everyone') where id = '00000000-0000-4000-8000-0000000010a2') then raise exception 'FAIL: a rec left out of the feed is in it'; end if;
  if exists (select 1 from public.feed_recs('everyone') where id = '00000000-0000-4000-8000-0000000010a3') then raise exception 'FAIL: a rec to a private profile is on Everyone'; end if;
  if exists (select 1 from public.feed_recs('following')) then raise exception 'FAIL: E follows nobody, but Friends has recs'; end if;
  if not exists (select 1 from public.timeline('everyone') where what = 'rec' and id = '00000000-0000-4000-8000-0000000010a1' and to_display_name is not distinct from (select display_name from public.profiles where id = '00000000-0000-4000-8000-0000000010b0')) then
    raise exception 'FAIL: timeline() hasn''t the rec'; end if;
  if (select count(*) from public.timeline('everyone', null, null, 5)) > 5 then raise exception 'FAIL: timeline() gives more than asked'; end if;
end $$;
-- C follows A and sees B (public): Friends has it; D (private) is seen only by followers, so A's rec to D isn't
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010c0","role":"authenticated"}', true);
do $$ begin
  if not exists (select 1 from public.feed_recs('following') where id = '00000000-0000-4000-8000-0000000010a1') then raise exception 'FAIL: C''s Friends hasn''t A''s rec'; end if;
  if exists (select 1 from public.feed_recs('following') where id = '00000000-0000-4000-8000-0000000010a3') then raise exception 'FAIL: C sees a rec to D, who C can''t see'; end if;
end $$;

-- ---------- the thread: only the two of them ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010a0","role":"authenticated"}', true);
insert into public.rec_replies (rec, text) values ('00000000-0000-4000-8000-0000000010a1', ' watch it at night ');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010b0","role":"authenticated"}', true);
insert into public.rec_replies (rec, text) values ('00000000-0000-4000-8000-0000000010a1', 'ok');
do $$ begin
  -- (both are made in this one transaction, so at the same moment: the order can't be told here)
  if (select array_agg(text order by text) from public.rec_thread('00000000-0000-4000-8000-0000000010a1')) is distinct from array['ok', 'watch it at night'] then
    raise exception 'FAIL: the thread isn''t A''s and B''s, trimmed'; end if;
  if not exists (select 1 from public.notifications where owner = '00000000-0000-4000-8000-0000000010b0' and kind = 'rec_reply') then raise exception 'FAIL: B wasn''t told of A''s reply'; end if;
  if (select reply_text from public.notifications_list() where kind = 'rec_reply' limit 1) <> 'watch it at night' then raise exception 'FAIL: notifications_list() hasn''t the thread reply'; end if;
  if (select replies from public.recs_list('for') where id = '00000000-0000-4000-8000-0000000010a1') <> 2 then raise exception 'FAIL: recs_list() doesn''t count the thread'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010a0","role":"authenticated"}', true);
do $$ begin
  if not exists (select 1 from public.notifications where owner = '00000000-0000-4000-8000-0000000010a0' and kind = 'rec_reply') then raise exception 'FAIL: A wasn''t told of B''s reply'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010c0","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.rec_replies) or exists (select 1 from public.rec_thread('00000000-0000-4000-8000-0000000010a1')) then raise exception 'FAIL: C reads the thread'; end if;
  begin insert into public.rec_replies (rec, text) values ('00000000-0000-4000-8000-0000000010a1', 'me too'); raise exception 'FAIL: C wrote in the thread';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------- keeping, letting go, and what can't be done ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010a0","role":"authenticated"}', true);
update public.recs set status = 'kept' where id = '00000000-0000-4000-8000-0000000010a1';   -- the sender can't: no row is changed
do $$ begin
  if (select status from public.recs where id = '00000000-0000-4000-8000-0000000010a1') <> 'open' then raise exception 'FAIL: the sender kept their own rec'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010b0","role":"authenticated"}', true);
do $$ begin
  begin update public.recs set status = 'watched' where id = '00000000-0000-4000-8000-0000000010a1'; raise exception 'FAIL: B marked a rec watched without a log';
  exception when check_violation then null; end;
  begin update public.recs set note = 'changed' where id = '00000000-0000-4000-8000-0000000010a1'; raise exception 'FAIL: B changed the note';
  exception when insufficient_privilege then null; end;
  if public.rec_keep('00000000-0000-4000-8000-0000000010a1') <> 'kept' then raise exception 'FAIL: rec_keep() didn''t say kept'; end if;
  if (select status from public.recs where id = '00000000-0000-4000-8000-0000000010a1') <> 'kept' then raise exception 'FAIL: Keep didn''t keep it'; end if;
  if (select from_user from public.watchlist where owner = '00000000-0000-4000-8000-0000000010b0' and title = 'Gummo') <> '00000000-0000-4000-8000-0000000010a0' then
    raise exception 'FAIL: Keep didn''t put Gummo on B''s Up next, from A'; end if;
  begin perform public.rec_keep('00000000-0000-4000-8000-0000000010a1'); raise exception 'FAIL: a kept rec was kept again';
  exception when no_data_found then null; end;
  -- letting The Waves go; then it can't be kept
  update public.recs set status = 'dismissed' where id = '00000000-0000-4000-8000-0000000010a2';
  begin update public.recs set status = 'kept' where id = '00000000-0000-4000-8000-0000000010a2'; raise exception 'FAIL: a rec let go was kept';
  exception when check_violation then null; end;
  if exists (select 1 from public.recs_list('for') where id = '00000000-0000-4000-8000-0000000010a2') then raise exception 'FAIL: a rec let go is still in For you'; end if;
end $$;

-- ---------- a log marks it watched, says who recommended it, and tells them ----------
insert into public.logs (kind, title, year) values ('movie', 'GUMMO', 1997);
do $$ declare lid uuid; begin
  select id into lid from public.logs where owner = '00000000-0000-4000-8000-0000000010b0' and lower(title) = 'gummo';
  if (select status from public.recs where id = '00000000-0000-4000-8000-0000000010a1') <> 'watched' then raise exception 'FAIL: logging Gummo didn''t mark the rec watched'; end if;
  if (select log from public.recs where id = '00000000-0000-4000-8000-0000000010a1') is distinct from lid then raise exception 'FAIL: the rec doesn''t point at the log'; end if;
  if (select rec from public.logs where id = lid) is distinct from '00000000-0000-4000-8000-0000000010a1'::uuid then raise exception 'FAIL: the log doesn''t point at the rec'; end if;
  if exists (select 1 from public.watchlist where owner = '00000000-0000-4000-8000-0000000010b0' and title = 'Gummo') then raise exception 'FAIL: Gummo is still on B''s Up next'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010a0","role":"authenticated"}', true);
do $$ begin
  if not exists (select 1 from public.notifications where owner = '00000000-0000-4000-8000-0000000010a0' and kind = 'rec_watched' and rec = '00000000-0000-4000-8000-0000000010a1') then
    raise exception 'FAIL: A wasn''t told B watched it'; end if;
  if (select status from public.recs_list('sent') where id = '00000000-0000-4000-8000-0000000010a1') <> 'watched' then raise exception 'FAIL: Sent doesn''t say watched'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010e0","role":"authenticated"}', true);
do $$ begin
  if (select rec_by from public.post_stats(array(select id from public.logs where owner = '00000000-0000-4000-8000-0000000010b0' and lower(title) = 'gummo'))) <> 'rls10_a' then
    raise exception 'FAIL: post_stats() doesn''t say A recommended it'; end if;
  if (select sent from public.rec_stats('00000000-0000-4000-8000-0000000010a0')) <> 4 or (select watched from public.rec_stats('00000000-0000-4000-8000-0000000010a0')) <> 1 then
    raise exception 'FAIL: rec_stats() isn''t 4 sent, 1 watched'; end if;
end $$;
-- a log from a rec that isn't yours is just a log
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010c0","role":"authenticated"}', true);
insert into public.logs (kind, title, rec) values ('movie', 'Something Else', '00000000-0000-4000-8000-0000000010a3');
do $$ begin
  if (select rec from public.logs where owner = '00000000-0000-4000-8000-0000000010c0' and title = 'Something Else') is not null then raise exception 'FAIL: C''s log took D''s rec'; end if;
end $$;
-- D logs from the rec (Mark watched): the title is the rec's, whatever the page sent
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010d0","role":"authenticated"}', true);
insert into public.logs (kind, title, rec) values ('book', 'whatever', '00000000-0000-4000-8000-0000000010a3');
do $$ begin
  if not exists (select 1 from public.logs where owner = '00000000-0000-4000-8000-0000000010d0' and title = 'Mirror' and kind = 'movie' and year = 1975 and rec = '00000000-0000-4000-8000-0000000010a3') then
    raise exception 'FAIL: a log from a rec isn''t the rec''s title'; end if;
end $$;
-- a private profile's stats aren't for a stranger
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010e0","role":"authenticated"}', true);
do $$ begin
  if (select sent from public.rec_stats('00000000-0000-4000-8000-0000000010d0')) <> 0 then raise exception 'FAIL: E sees a private profile''s rec counts'; end if;
end $$;

-- ---------- 6 waiting for one person; 20 a day ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010a0","role":"authenticated"}', true);
insert into public.recs (receiver, kind, title) select '00000000-0000-4000-8000-0000000010b0', 'book', 'Book ' || i from generate_series(1, 6) i;
do $$ begin
  begin insert into public.recs (receiver, kind, title) values ('00000000-0000-4000-8000-0000000010b0', 'book', 'Book 7'); raise exception 'FAIL: a 7th rec waits for B';
  exception when raise_exception then if sqlerrm not like '%6 recs waiting%' then raise; end if; end;
end $$;
reset role;
update public.act_counts set n = 20 where owner = '00000000-0000-4000-8000-0000000010a0' and what = 'rec';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010a0","role":"authenticated"}', true);
do $$ begin
  begin insert into public.recs (receiver, kind, title) values ('00000000-0000-4000-8000-0000000010d0', 'book', 'One Too Many'); raise exception 'FAIL: a 21st rec today was sent';
  exception when raise_exception then if sqlerrm not like '%20 recs today%' then raise; end if; end;
end $$;

-- ---------- a hidden profile is in nothing ----------
reset role;
update public.profiles set hidden = true where id = '00000000-0000-4000-8000-0000000010f0';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010e0","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.feed_recs('everyone') where id = '00000000-0000-4000-8000-0000000010a4') then raise exception 'FAIL: a rec to a hidden profile is in the feed'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010a0","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.mutuals() where username = 'rls10_h') then raise exception 'FAIL: a hidden profile is in mutuals()'; end if;
  if exists (select 1 from public.recs_list('sent') where id = '00000000-0000-4000-8000-0000000010a4') then raise exception 'FAIL: a rec to a hidden profile is in Sent'; end if;
end $$;

-- ---------- what the page can't reach ----------
do $$ begin
  begin perform public.notify_rec('00000000-0000-4000-8000-0000000010b0', '00000000-0000-4000-8000-0000000010a0', 'rec', null, null); raise exception 'FAIL: notify_rec() can be called from outside';
  exception when insufficient_privilege then null; end;
  begin update public.recs set hidden = true where id = '00000000-0000-4000-8000-0000000010a1'; raise exception 'FAIL: A changed hidden';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------- deleting the log keeps the rec, watched ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010b0","role":"authenticated"}', true);
delete from public.logs where owner = '00000000-0000-4000-8000-0000000010b0' and lower(title) = 'gummo';
reset role;
do $$ begin
  if (select status from public.recs where id = '00000000-0000-4000-8000-0000000010a1') <> 'watched' or (select log from public.recs where id = '00000000-0000-4000-8000-0000000010a1') is not null then
    raise exception 'FAIL: deleting the log didn''t leave the rec watched, with no log'; end if;
end $$;

select 'ALL 0010 CHECKS PASSED' as result;
rollback;
