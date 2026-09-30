-- shelfstackd, phase 3: checks follows, follow requests, the feed and finding people after 0006.
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run (after 0006 is in).
-- It makes throwaway users inside a transaction and rolls everything back at the end: nothing is kept.
-- The last result says "ALL PHASE 3 CHECKS PASSED". Any failed check stops with an error that starts "FAIL:".
-- Real accounts can be in the database, so every check looks only at the test's own rows.
--
-- The people:  A public (follows B, asks to follow D)   B public (has shelves)   C public (an outsider)
--              D private (has shelves and a bio)      E public (hits the hourly limit)   H hidden by moderation
--              F signed in but hasn't picked a username

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000003a0', 'rls3-a@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000003b0', 'rls3-b@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000003c0', 'rls3-c@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000003d0', 'rls3-d@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000003e0', 'rls3-e@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000003f0', 'rls3-h@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000003f1', 'rls3-f@example.invalid', 'authenticated', 'authenticated');
update public.app_config set pro_required = false;

-- each person makes their profile and shelves, signed in as themselves
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000003a0', 'rls3_a');
update public.profiles set display_name = 'Aaron Tester' where id = '00000000-0000-4000-8000-0000000003a0';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003b0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000003b0', 'rls3_b');
select public.save_shelf('{"id":"00000000-0000-4000-8000-0000000003b1","caption":"b public"}', '[{"item_id":"b0","kind":"book","title":"One"}]');
select public.save_shelf('{"id":"00000000-0000-4000-8000-0000000003b2","caption":"b private","is_public":false}', '[{"item_id":"b0","kind":"book","title":"Two"}]');
select public.save_shelf('{"id":"00000000-0000-4000-8000-0000000003b3","caption":"b hidden"}', '[{"item_id":"b0","kind":"book","title":"Three"}]');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003c0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000003c0', 'rls3_c');
select public.save_shelf('{"id":"00000000-0000-4000-8000-0000000003c1","caption":"c public"}', '[{"item_id":"b0","kind":"book","title":"Four"}]');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003d0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000003d0', 'rls3_d');
update public.profiles set display_name = 'Dee Private', bio = 'a secret bio', avatar_key = '00000000-0000-4000-8000-0000000003d0/avatar/0123456789abcdef0123456789abcdef'
  where id = '00000000-0000-4000-8000-0000000003d0';
select public.save_shelf('{"id":"00000000-0000-4000-8000-0000000003d1","caption":"d public"}', '[{"item_id":"b0","kind":"book","title":"Five"}]');
select public.save_shelf('{"id":"00000000-0000-4000-8000-0000000003d2","caption":"d private","is_public":false}', '[{"item_id":"b0","kind":"book","title":"Six"}]');
update public.profiles set is_private = true where id = '00000000-0000-4000-8000-0000000003d0';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003e0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000003e0', 'rls3_e');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003f0","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-0000000003f0', 'rls3_h');
select public.save_shelf('{"id":"00000000-0000-4000-8000-0000000003f2","caption":"h public"}', '[{"item_id":"b0","kind":"book","title":"Seven"}]');

-- moderation hides a shelf and a profile; the shelves get their own times, oldest first: b1, c1, d1
reset role;
update public.shelves set hidden = true where id = '00000000-0000-4000-8000-0000000003b3';
update public.profiles set hidden = true where id = '00000000-0000-4000-8000-0000000003f0';
update public.shelves set created_at = now() - interval '2 days', saved_at = now() - interval '3 hours' where id = '00000000-0000-4000-8000-0000000003b1';
update public.shelves set created_at = now() - interval '2 hours', saved_at = now() - interval '2 hours' where id = '00000000-0000-4000-8000-0000000003c1';
update public.shelves set created_at = now() - interval '1 hour', saved_at = now() - interval '1 hour' where id = '00000000-0000-4000-8000-0000000003d1';

-- ---------- A: follow, and a request to a private profile ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a0","role":"authenticated"}', true);
do $$ begin
  if public.follow('00000000-0000-4000-8000-0000000003b0') <> 'following' then raise exception 'FAIL: following a public profile didn''t say following'; end if;
  if not exists (select 1 from public.follows where follower = '00000000-0000-4000-8000-0000000003a0' and followee = '00000000-0000-4000-8000-0000000003b0') then raise exception 'FAIL: A doesn''t follow B'; end if;
  if public.follow('00000000-0000-4000-8000-0000000003b0') <> 'following' then raise exception 'FAIL: following again isn''t harmless'; end if;
  begin
    perform public.follow('00000000-0000-4000-8000-0000000003a0');
    raise exception 'FAIL: A followed A';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    insert into public.follows (followee) values ('00000000-0000-4000-8000-0000000003a0');
    raise exception 'FAIL: A followed A by writing the row';
  exception when check_violation then null; end;
  -- a private profile: a request, not a follow
  if public.follow('00000000-0000-4000-8000-0000000003d0') <> 'requested' then raise exception 'FAIL: following a private profile didn''t send a request'; end if;
  if exists (select 1 from public.follows where follower = '00000000-0000-4000-8000-0000000003a0' and followee = '00000000-0000-4000-8000-0000000003d0') then raise exception 'FAIL: A follows private D before D accepted'; end if;
  begin
    insert into public.follows (followee) values ('00000000-0000-4000-8000-0000000003d0');
    raise exception 'FAIL: A followed private D by writing the row';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.follow('00000000-0000-4000-8000-0000000003f0');
    raise exception 'FAIL: A followed a hidden profile';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    insert into public.follow_requests (target) values ('00000000-0000-4000-8000-0000000003c0');
    raise exception 'FAIL: a request went to a public profile';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    insert into public.follows (follower, followee) values ('00000000-0000-4000-8000-0000000003b0', '00000000-0000-4000-8000-0000000003c0');
    raise exception 'FAIL: A wrote a follow for B';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------- B can't touch A's follow or A's request ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003b0","role":"authenticated"}', true);
do $$
declare n int;
begin
  delete from public.follows where follower = '00000000-0000-4000-8000-0000000003a0';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: B deleted A''s follow'; end if;
  if exists (select 1 from public.follow_requests where requester = '00000000-0000-4000-8000-0000000003a0') then raise exception 'FAIL: B sees A''s request to D'; end if;
  delete from public.follow_requests where requester = '00000000-0000-4000-8000-0000000003a0';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: B deleted A''s request'; end if;
  begin
    perform public.answer_request('00000000-0000-4000-8000-0000000003a0', true);
    raise exception 'FAIL: B answered a request meant for D';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;

-- ---------- a private profile, to someone who doesn't follow it: photo, display name and username only ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003c0","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-0000000003d0') then raise exception 'FAIL: C reads private D''s profile row (bio, pinned shelf, dates)'; end if;
  if exists (select 1 from public.shelves where owner = '00000000-0000-4000-8000-0000000003d0') then raise exception 'FAIL: C sees private D''s shelves'; end if;
  if exists (select 1 from public.shelf_items where shelf_id in ('00000000-0000-4000-8000-0000000003d1', '00000000-0000-4000-8000-0000000003d2')) then raise exception 'FAIL: C sees private D''s spines'; end if;
  if (select count(*) from public.profile_card('rls3_d') where display_name = 'Dee Private' and is_private and avatar_key is not null) <> 1 then raise exception 'FAIL: C doesn''t get D''s photo and name'; end if;
  if (select count(*) from public.find_people('dee') where username = 'rls3_d') <> 1 then raise exception 'FAIL: private D can''t be found by display name'; end if;
  if exists (select 1 from public.follow_stats('00000000-0000-4000-8000-0000000003d0')) then raise exception 'FAIL: C sees private D''s numbers'; end if;
  if exists (select 1 from public.follow_list('00000000-0000-4000-8000-0000000003d0', 'following')) then raise exception 'FAIL: C sees who private D follows'; end if;
  if exists (select 1 from public.feed('everyone') where owner = '00000000-0000-4000-8000-0000000003d0') then raise exception 'FAIL: private D''s shelves are in EVERYONE'; end if;
  if (select count(*) from public.profile_stats('00000000-0000-4000-8000-0000000003d0') where shelf_count > 0) <> 0 then raise exception 'FAIL: C counts private D''s shelves'; end if;
end $$;
-- what each function can hand out, column by column: never a bio, a pinned shelf, a date of the person, or a shelf
do $$ begin
  if pg_get_function_result('public.profile_card(text)'::regprocedure) <> 'TABLE(id uuid, username text, display_name text, avatar_key text, is_private boolean, i_follow boolean, i_requested boolean)'
  then raise exception 'FAIL: profile_card gives more than photo, name and username: %', pg_get_function_result('public.profile_card(text)'::regprocedure); end if;
  if pg_get_function_result('public.find_people(text)'::regprocedure) <> 'TABLE(id uuid, username text, display_name text, avatar_key text, is_private boolean, i_follow boolean, i_requested boolean)'
  then raise exception 'FAIL: find_people gives more than photo, name and username: %', pg_get_function_result('public.find_people(text)'::regprocedure); end if;
  if pg_get_function_result('public.follow_list(uuid, text, timestamptz, uuid, int)'::regprocedure) <> 'TABLE(id uuid, username text, display_name text, avatar_key text, is_private boolean, followed_at timestamp with time zone, i_follow boolean, i_requested boolean)'
  then raise exception 'FAIL: follow_list gives more than photo, name and username: %', pg_get_function_result('public.follow_list(uuid, text, timestamptz, uuid, int)'::regprocedure); end if;
  if pg_get_function_result('public.request_list(timestamptz, uuid, int)'::regprocedure) <> 'TABLE(id uuid, username text, display_name text, avatar_key text, is_private boolean, requested_at timestamp with time zone)'
  then raise exception 'FAIL: request_list gives more than photo, name and username: %', pg_get_function_result('public.request_list(timestamptz, uuid, int)'::regprocedure); end if;
end $$;

-- ---------- D answers: A is accepted ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003d0","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.request_list() where username = 'rls3_a') <> 1 then raise exception 'FAIL: D doesn''t see A''s request'; end if;
  if public.answer_request('00000000-0000-4000-8000-0000000003a0', true) <> 'accepted' then raise exception 'FAIL: D couldn''t accept A'; end if;
  if exists (select 1 from public.request_list() where username = 'rls3_a') then raise exception 'FAIL: an accepted request is still waiting'; end if;
  if exists (select 1 from public.feed('everyone') where owner = '00000000-0000-4000-8000-0000000003d0') then raise exception 'FAIL: private D sees D''s own shelves in EVERYONE'; end if;
  if exists (select 1 from public.feed('following') where owner = '00000000-0000-4000-8000-0000000003d0') then raise exception 'FAIL: D''s own shelves are in D''s FOLLOWING'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.follow_log where user_id = '00000000-0000-4000-8000-0000000003d0') <> 0 then raise exception 'FAIL: accepting counted against D''s hourly limit'; end if;
end $$;

-- ---------- A, now a follower of private D, sees D; its shelf marked private stays D's alone ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a0","role":"authenticated"}', true);
do $$ begin
  if (select bio from public.profiles where id = '00000000-0000-4000-8000-0000000003d0') is distinct from 'a secret bio' then raise exception 'FAIL: A, now D''s follower, doesn''t see D''s profile'; end if;
  if not exists (select 1 from public.shelves where id = '00000000-0000-4000-8000-0000000003d1') then raise exception 'FAIL: A, D''s follower, doesn''t see D''s public shelf'; end if;
  if exists (select 1 from public.shelves where id = '00000000-0000-4000-8000-0000000003d2') then raise exception 'FAIL: A sees the shelf D marked private'; end if;
  if (select count(*) from public.shelf_items where shelf_id = '00000000-0000-4000-8000-0000000003d1') <> 1 then raise exception 'FAIL: A doesn''t see D''s public spines'; end if;
  if exists (select 1 from public.shelf_items where shelf_id = '00000000-0000-4000-8000-0000000003d2') then raise exception 'FAIL: A sees the spines of D''s private shelf'; end if;
  if (select followers from public.follow_stats('00000000-0000-4000-8000-0000000003d0')) <> 1 then raise exception 'FAIL: A doesn''t see D''s numbers'; end if;
  if (select count(*) from public.profile_card('rls3_d') where i_follow and not i_requested) <> 1 then raise exception 'FAIL: D''s card doesn''t say A follows'; end if;
end $$;

-- ---------- the feed ----------
do $$
declare got uuid[];
begin
  -- FOLLOWING, as A (follows B and D): newest saved first; never a shelf marked private or hidden, or anyone not followed
  got := array(select shelf_id from public.feed('following') where owner in ('00000000-0000-4000-8000-0000000003b0', '00000000-0000-4000-8000-0000000003c0', '00000000-0000-4000-8000-0000000003d0'));
  if got <> array['00000000-0000-4000-8000-0000000003d1', '00000000-0000-4000-8000-0000000003b1']::uuid[] then raise exception 'FAIL: A''s FOLLOWING should be d1 then b1: %', got; end if;
  -- EVERYONE: public profiles only
  got := array(select shelf_id from public.feed('everyone') where owner in ('00000000-0000-4000-8000-0000000003b0', '00000000-0000-4000-8000-0000000003c0', '00000000-0000-4000-8000-0000000003d0', '00000000-0000-4000-8000-0000000003f0'));
  if got <> array['00000000-0000-4000-8000-0000000003c1', '00000000-0000-4000-8000-0000000003b1']::uuid[] then raise exception 'FAIL: EVERYONE should be c1 then b1: %', got; end if;
  -- "updated" only when saved again after it was first shelved
  if not (select updated from public.feed('following') where shelf_id = '00000000-0000-4000-8000-0000000003b1') then raise exception 'FAIL: b1, saved after it was shelved, isn''t "updated"'; end if;
  if (select updated from public.feed('everyone') where shelf_id = '00000000-0000-4000-8000-0000000003c1') then raise exception 'FAIL: c1, only shelved, is "updated"'; end if;
  -- the next page starts after the last one's saved_at and id
  if (select shelf_id from public.feed('following', null, null, 1)) <> '00000000-0000-4000-8000-0000000003d1' then raise exception 'FAIL: the first page of one isn''t d1'; end if;
  if (select shelf_id from public.feed('following', (select saved_at from public.feed('following', null, null, 1)), '00000000-0000-4000-8000-0000000003d1', 1)) <> '00000000-0000-4000-8000-0000000003b1'
  then raise exception 'FAIL: the next page after d1 isn''t b1'; end if;
end $$;

-- ---------- signed out ----------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  if exists (select 1 from public.feed('following')) then raise exception 'FAIL: a visitor has a FOLLOWING feed'; end if;
  if (select count(*) from public.feed('everyone') where shelf_id in ('00000000-0000-4000-8000-0000000003b1', '00000000-0000-4000-8000-0000000003c1')) <> 2 then raise exception 'FAIL: a visitor''s EVERYONE doesn''t have b1 and c1'; end if;
  if exists (select 1 from public.feed('everyone') where shelf_id in ('00000000-0000-4000-8000-0000000003b2', '00000000-0000-4000-8000-0000000003b3', '00000000-0000-4000-8000-0000000003d1', '00000000-0000-4000-8000-0000000003d2', '00000000-0000-4000-8000-0000000003f2'))
  then raise exception 'FAIL: a visitor''s EVERYONE has a private, hidden or private-profile shelf'; end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-0000000003d0') then raise exception 'FAIL: a visitor reads private D''s profile row'; end if;
  if (select count(*) from public.profile_card('rls3_d')) <> 1 then raise exception 'FAIL: a visitor doesn''t get private D''s card'; end if;
  if exists (select 1 from public.profile_card('rls3_h')) or exists (select 1 from public.find_people('rls3_h')) then raise exception 'FAIL: a hidden profile can be found'; end if;
  if (select count(*) from public.follows where follower = '00000000-0000-4000-8000-0000000003a0' and followee = '00000000-0000-4000-8000-0000000003b0') <> 1 then raise exception 'FAIL: a visitor can''t see that A follows B'; end if;
  if (select count(*) from public.follow_list('00000000-0000-4000-8000-0000000003b0', 'followers') where username = 'rls3_a') <> 1 then raise exception 'FAIL: B''s followers don''t list A'; end if;
  if (select count(*) from public.follow_list('00000000-0000-4000-8000-0000000003a0', 'following') where username = 'rls3_d' and is_private) <> 1 then raise exception 'FAIL: A''s following doesn''t list private D (photo and name)'; end if;
  if exists (select 1 from public.find_people('%')) or exists (select 1 from public.find_people('')) then raise exception 'FAIL: find_people treats %% or nothing as "everyone"'; end if;
  if (select username from public.find_people('@RLS3_B') limit 1) <> 'rls3_b' then raise exception 'FAIL: find_people(@RLS3_B) doesn''t put rls3_b first'; end if;
  if (select count(*) from public.find_people('rls3_') where username like 'rls3\_%') <> 5 then raise exception 'FAIL: find_people(rls3_) should find A, B, C, D and E'; end if;
  begin perform public.follow('00000000-0000-4000-8000-0000000003b0'); raise exception 'FAIL: a visitor can follow';
  exception when insufficient_privilege then null; end;
  begin perform public.request_list(); raise exception 'FAIL: a visitor can ask for requests';
  exception when insufficient_privilege then null; end;
  begin insert into public.follows (followee) values ('00000000-0000-4000-8000-0000000003b0'); raise exception 'FAIL: a visitor can write a follow';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------- only saving in the builder moves a shelf up the feed ----------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003b0","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.feed('everyone') where shelf_id in ('00000000-0000-4000-8000-0000000003b2', '00000000-0000-4000-8000-0000000003b3'))
     or exists (select 1 from public.feed('following') where shelf_id in ('00000000-0000-4000-8000-0000000003b2', '00000000-0000-4000-8000-0000000003b3'))
  then raise exception 'FAIL: B''s own private or hidden shelf is in B''s feed'; end if;
end $$;
update public.shelves set name = 'renamed' where id = '00000000-0000-4000-8000-0000000003b1';
update public.profiles set pinned_shelf_id = '00000000-0000-4000-8000-0000000003b1' where id = '00000000-0000-4000-8000-0000000003b0';
update public.shelves set is_public = false where id = '00000000-0000-4000-8000-0000000003b1';
update public.shelves set is_public = true where id = '00000000-0000-4000-8000-0000000003b1';
reset role;
update public.shelves set hidden = true where id = '00000000-0000-4000-8000-0000000003b1';
update public.shelves set hidden = false where id = '00000000-0000-4000-8000-0000000003b1';
do $$ begin
  if (select saved_at from public.shelves where id = '00000000-0000-4000-8000-0000000003b1') <> now() - interval '3 hours' then raise exception 'FAIL: renaming, main, private/public or moderation moved b1 in the feed'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003b0","role":"authenticated"}', true);
select public.save_shelf('{"id":"00000000-0000-4000-8000-0000000003b1","caption":"b public, saved again"}', '[{"item_id":"b0","kind":"book","title":"One"},{"item_id":"b1","kind":"book","title":"Eight"}]');
do $$ begin
  if (select shelf_id from public.feed('everyone') where owner in ('00000000-0000-4000-8000-0000000003b0', '00000000-0000-4000-8000-0000000003c0') limit 1) <> '00000000-0000-4000-8000-0000000003b1'
  then raise exception 'FAIL: saving b1 in the builder didn''t move it to the top'; end if;
  if not (select updated from public.feed('everyone') where shelf_id = '00000000-0000-4000-8000-0000000003b1') then raise exception 'FAIL: b1 saved again isn''t "updated"'; end if;
end $$;

-- ---------- requests: cancel, decline; a profile going private keeps its followers (and they keep seeing it) ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003c0","role":"authenticated"}', true);
do $$ begin
  if public.follow('00000000-0000-4000-8000-0000000003d0') <> 'requested' then raise exception 'FAIL: C''s request to D wasn''t sent'; end if;
  if public.unfollow('00000000-0000-4000-8000-0000000003d0') <> 'none' then raise exception 'FAIL: taking back the request didn''t say none'; end if;
  if exists (select 1 from public.follow_requests where requester = '00000000-0000-4000-8000-0000000003c0') then raise exception 'FAIL: C couldn''t take back the request'; end if;
  perform public.follow('00000000-0000-4000-8000-0000000003d0');
  perform public.follow('00000000-0000-4000-8000-0000000003b0');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003d0","role":"authenticated"}', true);
do $$ begin
  if public.answer_request('00000000-0000-4000-8000-0000000003c0', false) <> 'declined' then raise exception 'FAIL: D couldn''t decline C'; end if;
  if exists (select 1 from public.follows where follower = '00000000-0000-4000-8000-0000000003c0' and followee = '00000000-0000-4000-8000-0000000003d0') then raise exception 'FAIL: declined C follows D'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003b0","role":"authenticated"}', true);
update public.profiles set is_private = true where id = '00000000-0000-4000-8000-0000000003b0';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003c0","role":"authenticated"}', true);
do $$ begin
  if not exists (select 1 from public.shelves where id = '00000000-0000-4000-8000-0000000003b1') then raise exception 'FAIL: C, following B before B went private, lost B''s shelves'; end if;
  if not exists (select 1 from public.feed('following') where shelf_id = '00000000-0000-4000-8000-0000000003b1') then raise exception 'FAIL: B''s shelf left C''s FOLLOWING when B went private'; end if;
  if exists (select 1 from public.feed('everyone') where owner = '00000000-0000-4000-8000-0000000003b0') then raise exception 'FAIL: private B is still in EVERYONE'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003e0","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.shelves where owner = '00000000-0000-4000-8000-0000000003b0') then raise exception 'FAIL: E, not a follower, sees private B''s shelves'; end if;
end $$;

-- ---------- someone without a username can't follow yet ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003f1","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.follow('00000000-0000-4000-8000-0000000003c0');
    raise exception 'FAIL: someone without a username followed';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;

-- ---------- 100 follows and unfollows an hour ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003e0","role":"authenticated"}', true);
do $$ begin
  for i in 1..50 loop
    perform public.follow('00000000-0000-4000-8000-0000000003c0');
    perform public.unfollow('00000000-0000-4000-8000-0000000003c0');
  end loop;
  begin
    perform public.follow('00000000-0000-4000-8000-0000000003c0');
    raise exception 'FAIL: the 101st follow or unfollow in an hour went through';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like 'That''s a lot of following%' then raise exception 'FAIL: the 101st got the wrong message: %', sqlerrm; end if;
  end;
  begin
    perform public.follow('00000000-0000-4000-8000-0000000003d0');
    raise exception 'FAIL: a request went through past the limit';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;

-- ---------- deleting an account takes its follows along, limit or not ----------
reset role;
delete from auth.users where id in ('00000000-0000-4000-8000-0000000003e0', '00000000-0000-4000-8000-0000000003a0');
do $$ begin
  if exists (select 1 from public.follows where '00000000-0000-4000-8000-0000000003a0' in (follower, followee)) then raise exception 'FAIL: A''s follows outlived A'; end if;
  if exists (select 1 from public.follow_log where user_id = '00000000-0000-4000-8000-0000000003e0') then raise exception 'FAIL: E''s log outlived E'; end if;
end $$;

select 'ALL PHASE 3 CHECKS PASSED' as result;
rollback;
