-- Spinestack, phase 1: checks the Row Level Security rules.
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- It makes two throwaway users inside a transaction and rolls everything back at the end: nothing is kept.
-- The last result says "ALL PHASE 1 CHECKS PASSED". Any failed check stops with an error that starts "FAIL:".

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
end $$;

select public.save_shelf(
  '{"id":"00000000-0000-4000-8000-0000000000a1","caption":"a shelf","filter":"vhs","background":"dark","layout":"row"}',
  '[{"item_id":"b0","kind":"movie","title":"Gummo","author":"Harmony Korine","year":"1997","spine_src":"a:0123abcd","look":{"style":"real"}},
    {"item_id":"b1","kind":"book","title":"The Waves","author":"Virginia Woolf","cover_src":"url:https://covers.openlibrary.org/b/id/1-L.jpg","look":{"style":"art"}}]');

do $$ begin
  if (select count(*) from public.shelves) <> 1 then raise exception 'FAIL: A does not see A''s shelf'; end if;
  if (select count(*) from public.shelf_items) <> 2 then raise exception 'FAIL: A does not see A''s 2 items'; end if;
  begin
    perform public.save_shelf('{"caption":"too many"}', (select jsonb_agg(jsonb_build_object('item_id', 'b' || g, 'kind', 'book')) from generate_series(1, 13) g));
    raise exception 'FAIL: a 13-spine shelf was saved';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.save_shelf('{"caption":"bad cover"}', '[{"item_id":"b0","kind":"book","cover_src":"url:https://evil.example/x.jpg"}]');
    raise exception 'FAIL: a cover from an unknown site was saved';
  exception when check_violation then null; end;
end $$;

-- ---------- as user B ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
insert into public.profiles (id, username) values ('00000000-0000-4000-8000-00000000000b', 'rls_tester_b');

do $$ begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'FAIL: B sees another profile'; end if;
  if (select count(*) from public.shelves) <> 0 then raise exception 'FAIL: B sees A''s shelf'; end if;
  if (select count(*) from public.shelf_items) <> 0 then raise exception 'FAIL: B sees A''s items'; end if;
  update public.shelves set caption = 'hacked' where id = '00000000-0000-4000-8000-0000000000a1';
  delete from public.shelves where id = '00000000-0000-4000-8000-0000000000a1';
  begin
    perform public.save_shelf('{"id":"00000000-0000-4000-8000-0000000000a1","caption":"taken over"}', '[]');
    raise exception 'FAIL: B overwrote A''s shelf';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.shelf_items (shelf_id, position, item_id, kind) values ('00000000-0000-4000-8000-0000000000a1', 5, 'x', 'book');
    raise exception 'FAIL: B added an item to A''s shelf';
  exception when insufficient_privilege then null; end;
  if public.username_available('rls_tester_a') then raise exception 'FAIL: a taken name shows as free'; end if;
end $$;

-- ---------- signed out ----------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  if (select count(*) from public.profiles) <> 0 then raise exception 'FAIL: a visitor sees profiles'; end if;
  begin perform count(*) from public.shelves; raise exception 'FAIL: a visitor can read shelves';
  exception when insufficient_privilege then null; end;
  begin perform public.save_shelf('{}', '[]'); raise exception 'FAIL: a visitor can save';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------- A's shelf is untouched ----------
reset role;
do $$ begin
  if (select caption from public.shelves where id = '00000000-0000-4000-8000-0000000000a1') <> 'a shelf' then raise exception 'FAIL: A''s shelf was changed by B'; end if;
end $$;

select 'ALL PHASE 1 CHECKS PASSED' as result;
rollback;
