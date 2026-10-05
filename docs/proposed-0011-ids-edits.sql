-- shelfstackd, 0011 (proposed): real ids on titles, and editing your own log.
--
-- Not run yet. Run once, after 0010, in the Supabase dashboard (SQL Editor -> New query -> paste all of this -> Run),
-- then run its test, docs/proposed-rls_phase8.sql: the last line says "ALL 0011 CHECKS PASSED". It all runs in one
-- transaction: if anything fails, nothing is changed. Once it has run and passed, both files move to supabase/
-- (migrations/0011_ids_edits.sql and tests/rls_phase8.sql) with only their headers changed.
--
-- The pages work without it and use what it adds only once it's there (they look for logs.tmdb_id, Nav.ids()): until
-- then no id is sent or asked for, titles match by kind, title and year as before, and there's no Edit.
--
-- What changes (additive: new columns are nullable, nothing existing is changed or dropped):
--   * ids: tmdb_id (a film's TMDB id) and ol_id (a book's Open Library work id, OL…W) on logs, shelf_items, watchlist
--     and recs. A film has only a tmdb_id, a book only an ol_id. The pages send the id the Worker found with every new
--     log, spine, Up next and rec. Old rows have none: when their owner opens their own log or shelf and the Worker
--     finds the title, the page fills it in. An id goes on once and then stays (it can't be changed or taken off).
--   * same_title(): two titles are the same when both have an id and the ids are the same; otherwise (an old row) when
--     their kind, title (whatever its capitals and spaces) and year are (title_key(), 0007). Logging a title takes it
--     off your watchlist, post_stats()'s "you logged it too", and a rec being watched use it.
--   * editing your own log: an update policy (only the owner, not one hidden by moderation) and update grants on
--     rating, review, spoiler, rewatch and watched_on (and the two ids, for filling them in). Nothing else in a log can
--     change: whose it is, what title it's about, when it was posted. logs.edited_at: when the rating, review, spoiler,
--     rewatch or day last changed (filling in an id isn't an edit). The review keeps the caption in step, as on posting.
--     The log keeps its id, so its likes, replies and me-toos stay on it.
--   * shelf_items: an update policy and grants for the ids only (the owner of the shelf), for filling them in.
--     save_shelf() keeps each spine's ids.
--   * post_stats() gives edited_at, tmdb_id and ol_id too.
-- Not changed: who sees what, the limits, activity(), timeline(), from_friends(), notifications, and everything else
-- from 0001 to 0010.

begin;

-- ---------- ids ----------
alter table public.logs
  add column tmdb_id integer check (tmdb_id between 1 and 999999999),
  add column ol_id text check (ol_id ~ '^OL[0-9]{1,10}W$'),
  add column edited_at timestamptz,
  add constraint logs_id_kind check ((tmdb_id is null or kind = 'movie') and (ol_id is null or kind = 'book'));
alter table public.shelf_items
  add column tmdb_id integer check (tmdb_id between 1 and 999999999),
  add column ol_id text check (ol_id ~ '^OL[0-9]{1,10}W$'),
  add constraint shelf_items_id_kind check ((tmdb_id is null or kind = 'movie') and (ol_id is null or kind = 'book'));
alter table public.watchlist
  add column tmdb_id integer check (tmdb_id between 1 and 999999999),
  add column ol_id text check (ol_id ~ '^OL[0-9]{1,10}W$'),
  add constraint watchlist_id_kind check ((tmdb_id is null or kind = 'movie') and (ol_id is null or kind = 'book'));
alter table public.recs
  add column tmdb_id integer check (tmdb_id between 1 and 999999999),
  add column ol_id text check (ol_id ~ '^OL[0-9]{1,10}W$'),
  add constraint recs_id_kind check ((tmdb_id is null or kind = 'movie') and (ol_id is null or kind = 'book'));
-- a title's page asks for its logs and spines by id
create index logs_tmdb on public.logs (tmdb_id) where tmdb_id is not null;
create index logs_ol on public.logs (ol_id) where ol_id is not null;
create index shelf_items_tmdb on public.shelf_items (tmdb_id) where tmdb_id is not null;
create index shelf_items_ol on public.shelf_items (ol_id) where ol_id is not null;
-- each title once on your Up next by its id too (as by its title since 0007): a second is 23505
create unique index watchlist_one_film on public.watchlist (owner, tmdb_id) where tmdb_id is not null;
create unique index watchlist_one_book on public.watchlist (owner, ol_id) where ol_id is not null;

-- two titles are the same: by their ids when both have one, otherwise by kind, title and year
create function public.same_title(k1 text, t1 text, y1 smallint, f1 integer, o1 text, k2 text, t2 text, y2 smallint, f2 integer, o2 text)
returns boolean
language sql immutable set search_path = '' as $$
  select k1 = k2 and case
    when k1 = 'movie' and f1 is not null and f2 is not null then f1 = f2
    when k1 = 'book' and o1 is not null and o2 is not null then o1 = o2
    else public.title_key(k1, t1, y1) = public.title_key(k2, t2, y2) end;
$$;
grant execute on function public.same_title(text, text, smallint, integer, text, text, text, smallint, integer, text) to anon, authenticated;

-- an id goes on once and stays
create function public.title_ids_once() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (old.tmdb_id is not null and new.tmdb_id is distinct from old.tmdb_id) or (old.ol_id is not null and new.ol_id is distinct from old.ol_id) then
    raise exception 'It has its id already.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.title_ids_once() from public, anon, authenticated;
create trigger shelf_items_ids_once before update on public.shelf_items
  for each row execute function public.title_ids_once();

-- ---------- editing your own log ----------
-- the ids once; the review keeps the caption in step (as logs_post_before() does on posting); the day checked as on
-- posting; edited_at moves only when what you can edit changes
create function public.logs_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'utc')::date;
begin
  if (old.tmdb_id is not null and new.tmdb_id is distinct from old.tmdb_id) or (old.ol_id is not null and new.ol_id is distinct from old.ol_id) then
    raise exception 'It has its id already.' using errcode = '23514';
  end if;
  if new.review is distinct from old.review then new.caption := left(new.review, 280); end if;
  if new.watched_on is distinct from old.watched_on and (new.watched_on > today + 1 or new.watched_on < date '1900-01-01') then
    raise exception 'That date hasn''t happened yet.' using errcode = '23514';
  end if;
  if (new.rating, new.review, new.spoiler, new.rewatch, new.watched_on) is distinct from (old.rating, old.review, old.spoiler, old.rewatch, old.watched_on) then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end $$;
revoke execute on function public.logs_before_update() from public, anon, authenticated;
create trigger logs_before_update before update on public.logs
  for each row execute function public.logs_before_update();

-- ---------- Row Level Security ----------
create policy "logs: edit own" on public.logs for update to authenticated
  using (owner = (select auth.uid()) and not hidden) with check (owner = (select auth.uid()) and not hidden);
create policy "items: fill ids on own" on public.shelf_items for update to authenticated
  using (exists (select 1 from public.shelves s where s.id = shelf_id and s.owner = (select auth.uid())))
  with check (exists (select 1 from public.shelves s where s.id = shelf_id and s.owner = (select auth.uid())));

-- what the Data API may touch (shelf_items' insert is the whole row since 0001, so its ids are in it already)
grant insert (tmdb_id, ol_id) on public.logs, public.watchlist, public.recs to authenticated;
grant update (rating, review, spoiler, rewatch, watched_on, tmdb_id, ol_id) on public.logs to authenticated;
grant update (tmdb_id, ol_id) on public.shelf_items to authenticated;

-- ---------- the triggers that match a title, matching by id too ----------
-- logging a title takes it off your watchlist (0007)
create or replace function public.logs_off_watchlist() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.watchlist w
  where w.owner = new.owner and public.same_title(w.kind, w.title, w.year, w.tmdb_id, w.ol_id, new.kind, new.title, new.year, new.tmdb_id, new.ol_id);
  return null;
end $$;

-- 0009's, with a me-too's ids copied from the log it's from, as its title is
create or replace function public.logs_post_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'utc')::date; src public.logs;
begin
  if new.review = '' then new.review := new.caption;   -- a page from before 0009: the caption, which keeps its own 280 limit
  else new.caption := left(new.review, 280); end if;
  new.watched_on := coalesce(new.watched_on, today);
  if new.watched_on > today + 1 or new.watched_on < date '1900-01-01' then
    raise exception 'That date hasn''t happened yet.' using errcode = '23514';
  end if;
  new.edited_at := null;
  if new.metoo_of is not null then
    select * into src from public.logs l where l.id = new.metoo_of;
    if src.id is null or src.owner = new.owner or not public.log_visible(new.metoo_of) then
      new.metoo_of := null;   -- not one you can see, or your own: just a log
    else
      new.kind := src.kind; new.title := src.title; new.author := src.author; new.year := src.year; new.cover_src := src.cover_src;
      new.tmdb_id := coalesce(src.tmdb_id, new.tmdb_id); new.ol_id := coalesce(src.ol_id, new.ol_id);
    end if;
  end if;
  return new;
end $$;

-- 0010's, matching by id too, and a log from a rec taking the rec's ids
create or replace function public.logs_rec_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.recs;
begin
  if new.rec is not null then
    select * into r from public.recs x where x.id = new.rec;
    if r.id is null or r.receiver <> new.owner or r.status not in ('open', 'kept') or r.hidden then
      new.rec := null;
    else
      new.kind := r.kind; new.title := r.title; new.author := r.author; new.year := r.year;
      new.cover_src := coalesce(new.cover_src, r.cover_src); new.metoo_of := null;
      new.tmdb_id := coalesce(r.tmdb_id, new.tmdb_id); new.ol_id := coalesce(r.ol_id, new.ol_id);
    end if;
  end if;
  if new.rec is null then
    select x.id into new.rec from public.recs x
    where x.receiver = new.owner and x.status in ('open', 'kept') and not x.hidden
      and public.same_title(x.kind, x.title, x.year, x.tmdb_id, x.ol_id, new.kind, new.title, new.year, new.tmdb_id, new.ol_id)
    order by x.created_at limit 1;
  end if;
  return new;
end $$;
create or replace function public.logs_rec_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in update public.recs x set status = 'watched', log = new.id, updated_at = now()
           where x.receiver = new.owner and x.status in ('open', 'kept') and not x.hidden
             and (x.id = new.rec or public.same_title(x.kind, x.title, x.year, x.tmdb_id, x.ol_id, new.kind, new.title, new.year, new.tmdb_id, new.ol_id))
           returning x.id, x.sender loop
    perform public.notify_rec(r.sender, new.owner, 'rec_watched', r.id, null);
  end loop;
  return null;
end $$;

-- Keep (0010): onto your Up next with the rec's ids
create or replace function public.rec_keep(rid uuid) returns text
language plpgsql volatile security invoker set search_path = '' as $$
declare r public.recs;
begin
  select * into r from public.recs x where x.id = rid and x.receiver = (select auth.uid()) and x.status = 'open' and not x.hidden;
  if r.id is null then raise exception 'That rec isn''t waiting any more.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.watchlist w where w.owner = r.receiver
                 and (public.title_key(w.kind, w.title, w.year) = public.title_key(r.kind, r.title, r.year)
                   or public.same_title(w.kind, w.title, w.year, w.tmdb_id, w.ol_id, r.kind, r.title, r.year, r.tmdb_id, r.ol_id))) then
    insert into public.watchlist (kind, title, author, year, cover_src, from_user, tmdb_id, ol_id)
    values (r.kind, r.title, r.author, r.year, r.cover_src, r.sender, r.tmdb_id, r.ol_id);
  end if;
  update public.recs x set status = 'kept' where x.id = rid;
  return 'kept';
end $$;

-- ---------- save a whole shelf (0002's), keeping each spine's ids ----------
create or replace function public.save_shelf(shelf jsonb, items jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare sid uuid := coalesce((shelf ->> 'id')::uuid, gen_random_uuid());
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 20 then
    raise exception 'Free shelves hold 6 spines. Pro holds 20.' using errcode = 'P0001';
  end if;
  insert into public.shelves as s (id, caption, filter, intensity, background, wood, layout, varied, is_public, preview_key, pro)
  values (sid, coalesce(shelf ->> 'caption', ''), coalesce(shelf ->> 'filter', 'clean'), coalesce((shelf ->> 'intensity')::smallint, 70),
          coalesce(shelf ->> 'background', 'paper'), coalesce((shelf ->> 'wood')::boolean, false), coalesce(shelf ->> 'layout', 'row'),
          coalesce((shelf ->> 'varied')::boolean, true), coalesce((shelf ->> 'is_public')::boolean, true), shelf ->> 'preview_key',
          coalesce(nullif(shelf -> 'pro', 'null'::jsonb), '{}'::jsonb))
  on conflict (id) do update set caption = excluded.caption, filter = excluded.filter, intensity = excluded.intensity,
    background = excluded.background, wood = excluded.wood, layout = excluded.layout, varied = excluded.varied,
    is_public = excluded.is_public, preview_key = excluded.preview_key, pro = excluded.pro;
  delete from public.shelf_items where shelf_id = sid;
  insert into public.shelf_items (shelf_id, position, item_id, kind, title, author, year, spine_src, cover_src, look, tmdb_id, ol_id)
  select sid, (ord - 1)::smallint, i ->> 'item_id', i ->> 'kind', coalesce(i ->> 'title', ''), coalesce(i ->> 'author', ''),
         nullif(i ->> 'year', '')::smallint, i ->> 'spine_src', i ->> 'cover_src', coalesce(i -> 'look', '{}'::jsonb),
         case when i ->> 'kind' = 'movie' and i ->> 'tmdb_id' ~ '^[0-9]{1,9}$' then (i ->> 'tmdb_id')::integer end,
         case when i ->> 'kind' = 'book' and i ->> 'ol_id' ~ '^OL[0-9]{1,10}W$' then i ->> 'ol_id' end
  from jsonb_array_elements(items) with ordinality as t (i, ord);
  return sid;
end $$;

-- ---------- post_stats(): 0010's, with edited_at and the ids, and "you logged it too" by id ----------
drop function public.post_stats(uuid[]);
create function public.post_stats(ids uuid[])
returns table (id uuid, rating smallint, review text, spoiler boolean, rewatch boolean, watched_on date, metoo_of uuid,
  likes int, replies int, metoos int, liked boolean, logged boolean, rec_by text, edited_at timestamptz, tmdb_id integer, ol_id text)
language sql stable security definer set search_path = '' as $$
  select l.id, l.rating, l.review, l.spoiler, l.rewatch, l.watched_on, l.metoo_of,
         (select count(*) from public.likes k join public.profiles p on p.id = k.owner where k.log = l.id and not p.hidden)::int,
         (select count(*) from public.replies r join public.profiles p on p.id = r.owner where r.log = l.id and not r.hidden and not p.hidden)::int,
         (select count(*) from public.logs m join public.profiles p on p.id = m.owner where m.metoo_of = l.id and not m.hidden and not p.hidden)::int,
         exists (select 1 from public.likes k where k.log = l.id and k.owner = (select auth.uid())),
         exists (select 1 from public.logs m where m.owner = (select auth.uid()) and m.id <> l.id
                 and public.same_title(m.kind, m.title, m.year, m.tmdb_id, m.ol_id, l.kind, l.title, l.year, l.tmdb_id, l.ol_id)),
         (select s.username from public.recs x join public.profiles s on s.id = x.sender
          where x.id = l.rec and not x.hidden and not s.hidden and public.sees_person(x.sender)),
         l.edited_at, l.tmdb_id, l.ol_id
  from public.logs l
  where l.id = any (ids[1:100]) and public.log_visible(l.id);
$$;
revoke execute on function public.post_stats(uuid[]) from public;
grant execute on function public.post_stats(uuid[]) to anon, authenticated;

commit;

-- ---------- to take it out again (only if something is wrong; the ids filled in since are lost) ----------
--   begin;
--   drop policy "logs: edit own" on public.logs;  drop policy "items: fill ids on own" on public.shelf_items;
--   revoke update on public.logs from authenticated;  revoke update on public.shelf_items from authenticated;
--   drop trigger logs_before_update on public.logs;  drop trigger shelf_items_ids_once on public.shelf_items;
--   then run 0002's save_shelf(), 0007's logs_off_watchlist(), 0009's logs_post_before() and 0010's logs_rec_before(),
--   logs_rec_after(), rec_keep() and post_stats() (drop it first) again, and drop the new columns:
--   alter table public.logs drop column tmdb_id, drop column ol_id, drop column edited_at;   (and the same ids on
--   shelf_items, watchlist and recs), drop function public.same_title(...), public.title_ids_once(), public.logs_before_update();
--   commit;
