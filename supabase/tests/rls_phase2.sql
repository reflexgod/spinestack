-- Spinestack, phase 2: checks the Row Level Security rules after 0002 (profiles, public and private shelves, Pro, reports).
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- It makes two throwaway users inside a transaction and rolls everything back at the end: nothing is kept.
-- The last result says "ALL PHASE 2 CHECKS PASSED". Any failed check stops with an error that starts "FAIL:".
-- (rls_phase1.sql is for a database with 0001 only: after 0002 some of its checks are wrong on purpose,
--  e.g. B can now read A's public profile and a 13-spine shelf is fine with Pro.)

begin;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-00000000000a', 'rls-a@example.invalid', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-00000000000b', 'rls-b@example.invalid', 'authenticated', 'authenticated');

-- ---------- as user A ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

do $$ begin
  if not public.username_available('rls_tester_a') then raise exception 'FAIL: a free name shows as taken'; end if;
  if public.username_available('admin') then raise exception 'FAIL: a reserved name shows as free'; end if;
  if public.username_available('Bad Name') then raise exception 'FAIL: a name breaking the rules shows as free'; end if;
end $$;

insert into public.profiles (id, username) values ('00000000-0000-4000-8000-00000000000a', 'rls_tester_a');

do $$ begin
  begin
    insert into public.profiles (id, username) values ('00000000-0000-4000-8000-00000000000b', 'rls_pretend_b');
    raise exception 'FAIL: A made a profile for B';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set username = 'admin' where id = '00000000-0000-4000-8000-00000000000a';
    raise exception 'FAIL: a reserved username was accepted';
  exception when unique_violation or raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    update public.profiles set hidden = true where id = '00000000-0000-4000-8000-00000000000a';
    raise exception 'FAIL: A changed the moderation flag';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set is_pro = true where id = '00000000-0000-4000-8000-00000000000a';
    raise exception 'FAIL: A made themselves Pro';
  exception when insufficient_privilege then null; end;
  -- the profile fields
  update public.profiles set display_name = 'Tester A', bio = repeat('b', 160),
    avatar_key = '00000000-0000-4000-8000-00000000000a/avatar/0123456789abcdef0123456789abcdef'
  where id = '00000000-0000-4000-8000-00000000000a';
  if (select display_name from public.profiles where id = '00000000-0000-4000-8000-00000000000a') <> 'Tester A' then raise exception 'FAIL: A could not set a display name'; end if;
  begin
    update public.profiles set bio = repeat('b', 161) where id = '00000000-0000-4000-8000-00000000000a';
    raise exception 'FAIL: a 161-character bio was saved';
  exception when check_violation then null; end;
  begin
    update public.profiles set display_name = repeat('n', 41) where id = '00000000-0000-4000-8000-00000000000a';
    raise exception 'FAIL: a 41-character name was saved';
  exception when check_violation then null; end;
  begin
    update public.profiles set avatar_key = '00000000-0000-4000-8000-00000000000b/avatar/0123456789abcdef0123456789abcdef' where id = '00000000-0000-4000-8000-00000000000a';
    raise exception 'FAIL: A used a photo from B''s folder';
  exception when check_violation then null; end;
  if not public.am_i_pro() then raise exception 'FAIL: A is not Pro while Pro is free for everyone'; end if;
end $$;

-- a1: public, two spines, with Pro settings
select public.save_shelf(
  '{"id":"00000000-0000-4000-8000-0000000000a1","caption":"a shelf","filter":"vhs","background":"dark","layout":"row",
    "pro":{"wall_key":"00000000-0000-4000-8000-00000000000a/wall/0123456789abcdef0123456789abcdef","shelf_colour":"#FFFFFF","plank":true,
           "wall_items":[{"key":"00000000-0000-4000-8000-00000000000a/png/0123456789abcdef0123456789abcde0","x":0.5,"y":0.3,"w":0.4}]}}',
  '[{"item_id":"b0","kind":"movie","title":"Gummo","author":"Harmony Korine","year":"1997","spine_src":"a:0123abcd","look":{"style":"real"}},
    {"item_id":"b1","kind":"book","title":"The Waves","author":"Virginia Woolf","cover_src":"url:https://covers.openlibrary.org/b/id/1-L.jpg","look":{"style":"art"}}]');
-- a2: public, 20 spines (Gummo is on this one too)
select public.save_shelf('{"id":"00000000-0000-4000-8000-0000000000a2","caption":"twenty"}',
  (select jsonb_agg(jsonb_build_object('item_id', 'b' || g, 'kind', case when g = 1 then 'movie' else 'book' end,
     'title', case when g = 1 then 'gummo ' else 'Book ' || g end)) from generate_series(1, 20) g));
-- a3: private (Gummo again: a private shelf must not count towards most shelved)
select public.save_shelf('{"id":"00000000-0000-4000-8000-0000000000a3","caption":"secret","is_public":false}',
  '[{"item_id":"b0","kind":"movie","title":"Gummo"}]');

do $$ begin
  if (select count(*) from public.shelves) <> 3 then raise exception 'FAIL: A does not see A''s 3 shelves'; end if;
  if (select count(*) from public.shelf_items) <> 23 then raise exception 'FAIL: A does not see A''s 23 items'; end if;
  if (select pro ->> 'shelf_colour' from public.shelves where id = '00000000-0000-4000-8000-0000000000a1') <> '#FFFFFF' then raise exception 'FAIL: the Pro settings were not saved'; end if;
  begin
    perform public.save_shelf('{"caption":"too many"}', (select jsonb_agg(jsonb_build_object('item_id', 'b' || g, 'kind', 'book')) from generate_series(1, 21) g));
    raise exception 'FAIL: a 21-spine shelf was saved';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.save_shelf('{"caption":"bad cover"}', '[{"item_id":"b0","kind":"book","cover_src":"url:https://evil.example/x.jpg"}]');
    raise exception 'FAIL: a cover from an unknown site was saved';
  exception when check_violation then null; end;
  -- Pro settings must be the right shape and point at A's own pictures
  begin
    perform public.save_shelf('{"caption":"x","pro":{"wall_key":"00000000-0000-4000-8000-00000000000b/wall/0123456789abcdef0123456789abcdef"}}', '[]');
    raise exception 'FAIL: A used a wall from B''s folder';
  exception when check_violation then null; end;
  begin
    perform public.save_shelf('{"caption":"x","pro":{"wall_items":[{"key":"00000000-0000-4000-8000-00000000000a/png/0123456789abcdef0123456789abcdef","x":1.5,"y":0.3,"w":0.4}]}}', '[]');
    raise exception 'FAIL: a PNG off the wall was saved';
  exception when check_violation then null; end;
  begin
    perform public.save_shelf('{"caption":"x","pro":{"wall_items":[{"key":"00000000-0000-4000-8000-00000000000a/png/0123456789abcdef0123456789abcdef","x":"0.5","y":0.3,"w":0.4}]}}', '[]');
    raise exception 'FAIL: a PNG with a text position was saved';
  exception when check_violation then null; end;
  begin
    perform public.save_shelf('{"caption":"x","pro":{"lamp":true}}', '[]');
    raise exception 'FAIL: an unknown Pro setting was saved';
  exception when check_violation then null; end;
  begin
    perform public.save_shelf('{"caption":"x","pro":{"shelf_colour":"red"}}', '[]');
    raise exception 'FAIL: a shelf colour that is not a hex colour was saved';
  exception when check_violation then null; end;
  -- which pictures are still in use (the Worker asks before deleting one)
  if not public.media_in_use('00000000-0000-4000-8000-00000000000a/wall/0123456789abcdef0123456789abcdef') then raise exception 'FAIL: A''s wall shows as unused'; end if;
  if not public.media_in_use('00000000-0000-4000-8000-00000000000a/png/0123456789abcdef0123456789abcde0') then raise exception 'FAIL: A''s PNG shows as unused'; end if;
  if not public.media_in_use('00000000-0000-4000-8000-00000000000a/avatar/0123456789abcdef0123456789abcdef') then raise exception 'FAIL: A''s photo shows as unused'; end if;
  if public.media_in_use('00000000-0000-4000-8000-00000000000a/png/ffffffffffffffffffffffffffffffff') then raise exception 'FAIL: a PNG on no shelf shows as used'; end if;
  -- pinning: A's own public shelf only
  update public.profiles set pinned_shelf_id = '00000000-0000-4000-8000-0000000000a1' where id = '00000000-0000-4000-8000-00000000000a';
  begin
    update public.profiles set pinned_shelf_id = '00000000-0000-4000-8000-0000000000a3' where id = '00000000-0000-4000-8000-00000000000a';
    raise exception 'FAIL: A pinned a private shelf';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  -- the profile page's numbers: public shelves only, even for the owner
  if (select shelf_count from public.profile_stats('00000000-0000-4000-8000-00000000000a')) <> 2 then raise exception 'FAIL: A''s shelf count is wrong'; end if;
  if (select spine_count from public.profile_stats('00000000-0000-4000-8000-00000000000a')) <> 22 then raise exception 'FAIL: A''s spine count is wrong'; end if;
  if (select title from public.most_shelved('00000000-0000-4000-8000-00000000000a') limit 1) not in ('Gummo', 'gummo ') then raise exception 'FAIL: Gummo is not A''s most shelved title'; end if;
  if (select on_shelves from public.most_shelved('00000000-0000-4000-8000-00000000000a') limit 1) <> 2 then raise exception 'FAIL: Gummo is not counted on exactly its 2 public shelves'; end if;
  if (select count(*) from public.most_shelved('00000000-0000-4000-8000-00000000000a')) <> 6 then raise exception 'FAIL: most shelved does not give 6 titles'; end if;
end $$;

-- ---------- as user B ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-00000000000b', 'rls_tester_b');

do $$
declare n int;
begin
  if (select count(*) from public.profiles) <> 2 then raise exception 'FAIL: B does not see both public profiles'; end if;
  if (select display_name from public.profiles where id = '00000000-0000-4000-8000-00000000000a') <> 'Tester A' then raise exception 'FAIL: B does not see A''s name'; end if;
  if (select count(*) from public.shelves) <> 2 then raise exception 'FAIL: B does not see exactly A''s 2 public shelves'; end if;
  if exists (select 1 from public.shelves where id = '00000000-0000-4000-8000-0000000000a3') then raise exception 'FAIL: B sees A''s private shelf'; end if;
  if (select count(*) from public.shelf_items) <> 22 then raise exception 'FAIL: B does not see exactly the 22 spines of A''s public shelves'; end if;
  begin
    perform hidden from public.profiles limit 1;
    raise exception 'FAIL: B can read the moderation flag';
  exception when insufficient_privilege then null; end;
  update public.shelves set caption = 'hacked' where id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: B changed A''s shelf'; end if;
  delete from public.shelves where id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: B deleted A''s shelf'; end if;
  update public.profiles set bio = 'hacked' where id = '00000000-0000-4000-8000-00000000000a';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: B changed A''s bio'; end if;
  begin
    perform public.save_shelf('{"id":"00000000-0000-4000-8000-0000000000a1","caption":"taken over"}', '[]');
    raise exception 'FAIL: B overwrote A''s shelf';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.shelf_items (shelf_id, position, item_id, kind) values ('00000000-0000-4000-8000-0000000000a1', 5, 'x', 'book');
    raise exception 'FAIL: B added an item to A''s shelf';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set pinned_shelf_id = '00000000-0000-4000-8000-0000000000a1' where id = '00000000-0000-4000-8000-00000000000b';
    raise exception 'FAIL: B pinned A''s shelf';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  if public.media_in_use('00000000-0000-4000-8000-00000000000a/wall/0123456789abcdef0123456789abcdef') then raise exception 'FAIL: B is told A''s wall is B''s'; end if;
  if public.username_available('rls_tester_a') then raise exception 'FAIL: a taken name shows as free'; end if;
  -- reports
  insert into public.reports (target_type, target_id, reason) values ('profile', '00000000-0000-4000-8000-00000000000a', 'test');
  insert into public.reports (target_type, target_id, reason) values ('shelf', '00000000-0000-4000-8000-0000000000a1', '');
  begin
    insert into public.reports (target_type, target_id, reason) values ('profile', '00000000-0000-4000-8000-00000000000a', 'again');
    raise exception 'FAIL: B reported the same profile twice';
  exception when unique_violation then null; end;
  begin
    insert into public.reports (target_type, target_id) values ('shelf', '00000000-0000-4000-8000-0000000000ff');
    raise exception 'FAIL: a report about nothing was saved';
  exception when check_violation then null; end;
  begin
    insert into public.reports (reporter, target_type, target_id) values ('00000000-0000-4000-8000-00000000000a', 'shelf', '00000000-0000-4000-8000-0000000000a2');
    raise exception 'FAIL: B sent a report as A';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.reports) <> 0 then raise exception 'FAIL: B can read reports'; end if;
  if public.is_admin() then raise exception 'FAIL: B is an admin'; end if;
  begin
    perform * from public.admin_reports();
    raise exception 'FAIL: B read the admin list of reports';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------- signed out ----------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  if (select count(*) from public.profiles) <> 2 then raise exception 'FAIL: a visitor does not see the 2 public profiles'; end if;
  if (select count(*) from public.shelves) <> 2 then raise exception 'FAIL: a visitor does not see exactly A''s 2 public shelves'; end if;
  if (select count(*) from public.shelf_items) <> 22 then raise exception 'FAIL: a visitor does not see exactly 22 public spines'; end if;
  if (select spine_count from public.profile_stats('00000000-0000-4000-8000-00000000000a')) <> 22 then raise exception 'FAIL: a visitor sees the wrong spine count'; end if;
  begin perform adult_confirmed_at from public.profiles limit 1; raise exception 'FAIL: a visitor can read sign-up details';
  exception when insufficient_privilege then null; end;
  begin perform public.save_shelf('{}', '[]'); raise exception 'FAIL: a visitor can save';
  exception when insufficient_privilege then null; end;
  begin insert into public.reports (target_type, target_id) values ('profile', '00000000-0000-4000-8000-00000000000a'); raise exception 'FAIL: a visitor can report';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from public.reports; raise exception 'FAIL: a visitor can read reports';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from public.app_config; raise exception 'FAIL: a visitor can read the Pro switch';
  exception when insufficient_privilege then null; end;
  begin perform public.am_i_pro(); raise exception 'FAIL: a visitor can ask am_i_pro';
  exception when insufficient_privilege then null; end;
  begin perform public.media_in_use('x'); raise exception 'FAIL: a visitor can ask media_in_use';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------- moderation (phase 4 sets these): a hidden shelf or profile shows to no one else ----------
reset role;
update public.shelves set hidden = true where id = '00000000-0000-4000-8000-0000000000a2';
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  if (select count(*) from public.shelves) <> 1 then raise exception 'FAIL: a visitor sees a hidden shelf'; end if;
  if (select count(*) from public.shelf_items) <> 2 then raise exception 'FAIL: a visitor sees a hidden shelf''s spines'; end if;
end $$;
reset role;
update public.shelves set hidden = false where id = '00000000-0000-4000-8000-0000000000a2';
update public.profiles set hidden = true where id = '00000000-0000-4000-8000-00000000000a';
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-00000000000a') then raise exception 'FAIL: a visitor sees a hidden profile'; end if;
  if (select count(*) from public.shelves) <> 0 then raise exception 'FAIL: a visitor sees the shelves of a hidden profile'; end if;
end $$;
reset role;
update public.profiles set hidden = false where id = '00000000-0000-4000-8000-00000000000a';

-- ---------- A makes a shelf private, then the whole profile ----------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
update public.shelves set is_public = false where id = '00000000-0000-4000-8000-0000000000a1';
do $$ begin
  if (select pinned_shelf_id from public.profiles where id = '00000000-0000-4000-8000-00000000000a') is not null then raise exception 'FAIL: a private shelf stayed pinned'; end if;
end $$;
update public.shelves set is_public = true where id = '00000000-0000-4000-8000-0000000000a1';
update public.profiles set is_private = true, pinned_shelf_id = '00000000-0000-4000-8000-0000000000a1' where id = '00000000-0000-4000-8000-00000000000a';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-00000000000a') then raise exception 'FAIL: B sees A''s private profile'; end if;
  if (select count(*) from public.shelves) <> 0 then raise exception 'FAIL: B sees shelves of a private profile'; end if;
  if (select count(*) from public.shelf_items) <> 0 then raise exception 'FAIL: B sees spines of a private profile'; end if;
  if (select shelf_count from public.profile_stats('00000000-0000-4000-8000-00000000000a')) <> 0 then raise exception 'FAIL: B sees a private profile''s numbers'; end if;
  if exists (select 1 from public.most_shelved('00000000-0000-4000-8000-00000000000a')) then raise exception 'FAIL: B sees a private profile''s most shelved'; end if;
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-00000000000a') then raise exception 'FAIL: a visitor sees A''s private profile'; end if;
  if (select count(*) from public.shelves) <> 0 then raise exception 'FAIL: a visitor sees shelves of a private profile'; end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$ begin
  if not exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-00000000000a') then raise exception 'FAIL: A can''t see A''s own private profile'; end if;
  if (select count(*) from public.shelves) <> 3 then raise exception 'FAIL: A can''t see A''s own shelves while private'; end if;
end $$;
update public.profiles set is_private = false where id = '00000000-0000-4000-8000-00000000000a';

-- ---------- with the paywall on ----------
reset role;
update public.app_config set pro_required = true;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$ begin
  if public.am_i_pro() then raise exception 'FAIL: A is Pro with the paywall on'; end if;
  begin
    perform public.save_shelf('{"caption":"seven"}', (select jsonb_agg(jsonb_build_object('item_id', 'b' || g, 'kind', 'book')) from generate_series(1, 7) g));
    raise exception 'FAIL: a free shelf held 7 spines';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm <> 'Free shelves hold 6 spines. Pro holds 20.' then raise exception 'FAIL: the 7th spine got the wrong message: %', sqlerrm; end if;
  end;
  perform public.save_shelf('{"id":"00000000-0000-4000-8000-0000000000a4","caption":"six"}', (select jsonb_agg(jsonb_build_object('item_id', 'b' || g, 'kind', 'book')) from generate_series(1, 6) g));
  begin
    insert into public.shelf_items (shelf_id, position, item_id, kind) values ('00000000-0000-4000-8000-0000000000a4', 6, 'b7', 'book');
    raise exception 'FAIL: a 7th spine was added to a free shelf one by one';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.save_shelf('{"caption":"wall","pro":{"wall_key":"00000000-0000-4000-8000-00000000000a/wall/0123456789abcdef0123456789abcdef"}}', '[]');
    raise exception 'FAIL: a free user saved a wall';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.save_shelf('{"caption":"plank","pro":{"plank":true}}', '[]');
    raise exception 'FAIL: a free user saved a floating shelf';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  -- a free user can still save a plain shelf, and still change the shelves they have (privacy isn't Pro)
  perform public.save_shelf('{"caption":"plain","pro":{}}', '[{"item_id":"b0","kind":"book","title":"Plain"}]');
  update public.shelves set is_public = false where id = '00000000-0000-4000-8000-0000000000a2';
end $$;

reset role;
update public.profiles set is_pro = true where id = '00000000-0000-4000-8000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$ begin
  if not public.am_i_pro() then raise exception 'FAIL: a Pro account is not Pro with the paywall on'; end if;
  perform public.save_shelf('{"id":"00000000-0000-4000-8000-0000000000a4","caption":"twenty","pro":{"plank":true}}',
    (select jsonb_agg(jsonb_build_object('item_id', 'b' || g, 'kind', 'book')) from generate_series(1, 20) g));
end $$;

-- ---------- an admin reads the reports ----------
reset role;
insert into public.admins (user_id) values ('00000000-0000-4000-8000-00000000000a');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$ begin
  if not public.is_admin() then raise exception 'FAIL: the admin is not an admin'; end if;
  if (select count(*) from public.reports) <> 2 then raise exception 'FAIL: the admin does not see the 2 reports'; end if;
  if (select count(*) from public.admin_reports()) <> 2 then raise exception 'FAIL: the admin list does not have the 2 reports'; end if;
  if (select reporter_name from public.admin_reports() limit 1) <> 'rls_tester_b' then raise exception 'FAIL: the admin list does not name the reporter'; end if;
  if (select target_user from public.admin_reports() where target_type = 'shelf') <> 'rls_tester_a' then raise exception 'FAIL: the admin list does not name the shelf''s owner'; end if;
end $$;

-- ---------- A's shelf is untouched by B ----------
reset role;
do $$ begin
  if (select caption from public.shelves where id = '00000000-0000-4000-8000-0000000000a1') <> 'a shelf' then raise exception 'FAIL: A''s shelf was changed by B'; end if;
  if (select bio from public.profiles where id = '00000000-0000-4000-8000-00000000000a') <> repeat('b', 160) then raise exception 'FAIL: A''s bio was changed by B'; end if;
end $$;

select 'ALL PHASE 2 CHECKS PASSED' as result;
rollback;
