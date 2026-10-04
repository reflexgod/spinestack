-- shelfstackd, 0009 (PROPOSED, NOT RUN): the feed as posts. A log is a post: it gets a rating, a review, a spoiler
-- mark, a rewatch mark and the day it was watched or read; posts get likes, replies and "me too"; and the people
-- they're about get notifications.
--
-- To run it: Supabase dashboard -> SQL Editor -> New query -> paste all of this -> Run. Then its test,
-- docs/proposed-rls_phase6.sql, the same way: the last line says "ALL 0009 CHECKS PASSED". It all runs in one
-- transaction: if anything fails, nothing is changed. Needs 0001 to 0008 (the live database has them).
-- Once it's run, move it to supabase/migrations/0009_social.sql and its test to supabase/tests/rls_phase6.sql.
--
-- The pages work without it and ask for what it adds only once it's there (they look for the likes table): until
-- then there's no rating, review, spoiler, rewatch or date in the composer, no likes, replies or me-too on a post,
-- no Report on a post, and no bell.
--
-- Who sees what (the same rules as a log, from 0007):
--   * a like, a reply: whoever can see the log they're on. A reply or like by a private profile shows only to its
--     followers, to them, and to the person whose log it is. Counts are of everything, as on Twitter.
--   * a notification: only the person it's for. It names who did it, even a private profile (they did it to you).
--   * a hidden profile (moderation) is in nothing: no likes, replies, me-toos or notifications from it.
-- What changes:
--   * logs: rating (1 to 10, half stars: 7 is 3.5 stars, optional), review (2,000 characters at most; the caption
--     becomes the review: what's there is copied in, and a page from before this that sends a caption has it copied
--     into the review), spoiler, rewatch, watched_on (a date, today if not given, never after tomorrow), metoo_of
--     (the log a "me too" came from: the new log is that title, copied from it, whatever the page sent). caption
--     stays, as the first 280 characters of the review, for what still reads it (activity(), and the live pages
--     until the next merge).
--   * likes (a log, a person; once each), replies (280 characters), notifications (like, reply, metoo, follow).
--   * limits: 300 likes and 100 replies a day per person, counted as they're made (act_counts), so unliking and liking
--     again doesn't make room; each under that person's lock (pg_advisory_xact_lock, as 0007's logs), so two tabs at
--     once can't both be the 301st.
--   * notifications are made by triggers: a like on your log, a reply to it, a me-too of it, a new follower. Not for
--     what you do to yourself. Unliking takes its notification away, and so does unfollowing. A like and a follow
--     notify once each, however often they're undone and done again. Kept 90 days.
--   * reports: a log and a reply can be reported too.
--   * functions for the pages: post_stats() (the counts, and what you've done, for logs on a page), replies_of()
--     (a log's replies, oldest first), notifications_list() and notifications_read().
-- Not changed: activity(), from_friends(), the watchlist, shelves, follows, and everything else from 0001 to 0008.

begin;

-- ---------- who can see what ----------
-- a log you can see: not hidden, not a hidden profile's, and yours, or a public profile's, or one you follow
create function public.log_visible(lid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.logs l join public.profiles p on p.id = l.owner
                 where l.id = lid and not l.hidden and not p.hidden
                   and (l.owner = (select auth.uid()) or not p.is_private or public.approved_follower_of(l.owner)));
$$;
create function public.log_owner(lid uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select l.owner from public.logs l where l.id = lid;
$$;
-- a person whose likes and replies you see: yourself, a public profile, or one you follow
create function public.sees_person(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select uid = (select auth.uid()) or public.profile_is_public(uid) or public.approved_follower_of(uid);
$$;
revoke execute on function public.log_visible(uuid), public.log_owner(uuid), public.sees_person(uuid) from public;
grant execute on function public.log_visible(uuid), public.log_owner(uuid), public.sees_person(uuid) to anon, authenticated;

-- ---------- logs: a rating, a review, a spoiler, a rewatch, the day ----------
alter table public.logs
  add column rating smallint check (rating between 1 and 10),
  add column review text not null default '' check (char_length(review) <= 2000),
  add column spoiler boolean not null default false,
  add column rewatch boolean not null default false,
  add column watched_on date,
  add column metoo_of uuid references public.logs (id) on delete set null;
update public.logs set review = caption where review = '' and caption <> '';
update public.logs set watched_on = (created_at at time zone 'utc')::date where watched_on is null;
alter table public.logs alter column watched_on set not null;
create index logs_metoo on public.logs (metoo_of) where metoo_of is not null and not hidden;

-- the review and the caption kept together; the day checked; a me-too made a copy of the log it's from
create function public.logs_post_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'utc')::date; src public.logs;
begin
  if new.review = '' and new.caption <> '' then new.review := new.caption; end if;   -- a page from before 0009
  new.caption := left(new.review, 280);
  new.watched_on := coalesce(new.watched_on, today);
  if new.watched_on > today + 1 or new.watched_on < date '1900-01-01' then
    raise exception 'That date hasn''t happened yet.' using errcode = '23514';
  end if;
  if new.metoo_of is not null then
    select * into src from public.logs l where l.id = new.metoo_of;
    if src.id is null or src.owner = new.owner or not public.log_visible(new.metoo_of) then
      new.metoo_of := null;   -- not one you can see, or your own: just a log
    else
      new.kind := src.kind; new.title := src.title; new.author := src.author; new.year := src.year; new.cover_src := src.cover_src;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.logs_post_before() from public, anon, authenticated;
create trigger logs_post_before before insert on public.logs
  for each row execute function public.logs_post_before();

grant insert (rating, review, spoiler, rewatch, watched_on, metoo_of) on public.logs to authenticated;

-- ---------- likes and replies ----------
create table public.likes (
  log uuid not null references public.logs (id) on delete cascade,
  owner uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (log, owner)                              -- once each: a second is 23505
);
alter table public.likes enable row level security;
create index likes_owner_new on public.likes (owner, created_at desc);

create table public.replies (
  id uuid primary key default gen_random_uuid(),
  log uuid not null references public.logs (id) on delete cascade,
  owner uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 280),
  hidden boolean not null default false,               -- set by moderation only
  created_at timestamptz not null default now()
);
alter table public.replies enable row level security;
create index replies_log_old on public.replies (log, created_at, id) where not hidden;
create index replies_owner_new on public.replies (owner, created_at desc);

-- likes and replies made, per person and day (UTC), whether or not they're still there: the limits count these.
-- Only the triggers below read or write it.
create table public.act_counts (
  owner uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  what text not null check (what in ('like', 'reply')),
  n int not null check (n >= 0),
  primary key (owner, day, what)
);
alter table public.act_counts enable row level security;   -- no policies, nothing granted

-- one more like or reply today, under this person's lock (a second tab waits here, then counts this one)
create function public.count_act(who uuid, act text, most int, msg text) returns void
language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'utc')::date; made int;
begin
  perform pg_advisory_xact_lock(hashtext(act || 's:' || who));
  insert into public.act_counts as c (owner, day, what, n) values (who, today, act, 1)
    on conflict (owner, day, what) do update set n = c.n + 1
    returning c.n into made;
  if made > most then raise exception '%', msg using errcode = 'P0001'; end if;
  delete from public.act_counts c where c.owner = who and c.what = act and c.day < today - 1;
end $$;
revoke execute on function public.count_act(uuid, text, int, text) from public, anon, authenticated;

create function public.likes_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := now();
  perform public.count_act(new.owner, 'like', 300, 'That''s 300 likes today, the most for one day.');
  return new;
end $$;
create function public.replies_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := now();
  new.text := btrim(new.text);
  perform public.count_act(new.owner, 'reply', 100, 'That''s 100 replies today, the most for one day.');
  return new;
end $$;
revoke execute on function public.likes_before_insert(), public.replies_before_insert() from public, anon, authenticated;
create trigger likes_before_insert before insert on public.likes for each row execute function public.likes_before_insert();
create trigger replies_before_insert before insert on public.replies for each row execute function public.replies_before_insert();

-- ---------- notifications ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles (id) on delete cascade,     -- who it's for
  actor uuid not null references public.profiles (id) on delete cascade,     -- who did it
  kind text not null check (kind in ('like', 'reply', 'metoo', 'follow')),
  log uuid references public.logs (id) on delete cascade,                    -- the log it's about (not for a follow)
  reply uuid references public.replies (id) on delete cascade on update cascade,              -- the reply, for a reply
  created_at timestamptz not null default now(),
  read boolean not null default false
);
alter table public.notifications enable row level security;
create index notifications_owner_new on public.notifications (owner, created_at desc, id desc);
create unique index notifications_like_once on public.notifications (owner, actor, log) where kind = 'like';
create unique index notifications_follow_once on public.notifications (owner, actor) where kind = 'follow';

-- one notification, unless it's for yourself or about a hidden profile; and the person's ones over 90 days go
create function public.notify(who uuid, by uuid, what text, lid uuid, rid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if who is null or who = by or exists (select 1 from public.profiles p where p.id in (who, by) and p.hidden) then return; end if;
  delete from public.notifications n where n.owner = who and n.created_at < now() - interval '90 days';
  if what = 'like' then
    insert into public.notifications (owner, actor, kind, log) values (who, by, 'like', lid) on conflict (owner, actor, log) where kind = 'like' do nothing;
  elsif what = 'follow' then
    insert into public.notifications (owner, actor, kind) values (who, by, 'follow') on conflict (owner, actor) where kind = 'follow' do nothing;
  else
    insert into public.notifications (owner, actor, kind, log, reply) values (who, by, what, lid, rid);
  end if;
end $$;
revoke execute on function public.notify(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;

create function public.likes_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.notifications n where n.kind = 'like' and n.actor = old.owner and n.log = old.log and not n.read;   -- unliked before it was seen
    return null;
  end if;
  perform public.notify(public.log_owner(new.log), new.owner, 'like', new.log, null);
  return null;
end $$;
create function public.replies_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify(public.log_owner(new.log), new.owner, 'reply', new.log, new.id);
  return null;
end $$;
create function public.logs_metoo_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.metoo_of is not null then perform public.notify(public.log_owner(new.metoo_of), new.owner, 'metoo', new.metoo_of, null); end if;
  return null;
end $$;
-- a new follower; accepting a request is the followee's own doing, so it doesn't notify them
create function public.follows_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.notifications n where n.kind = 'follow' and n.owner = old.followee and n.actor = old.follower and not n.read;
    return null;
  end if;
  if (select auth.uid()) is distinct from new.followee then perform public.notify(new.followee, new.follower, 'follow', null, null); end if;
  return null;
end $$;
revoke execute on function public.likes_notify(), public.replies_notify(), public.logs_metoo_notify(), public.follows_notify() from public, anon, authenticated;
create trigger likes_notify after insert or delete on public.likes for each row execute function public.likes_notify();
create trigger replies_notify after insert on public.replies for each row execute function public.replies_notify();
create trigger logs_metoo_notify after insert on public.logs for each row execute function public.logs_metoo_notify();
create trigger follows_notify after insert or delete on public.follows for each row execute function public.follows_notify();

-- ---------- Row Level Security ----------
create policy "likes: read" on public.likes for select to anon, authenticated
  using (owner = (select auth.uid()) or (public.log_visible(log) and public.sees_person(owner)));
create policy "likes: like" on public.likes for insert to authenticated with check (owner = (select auth.uid()) and public.log_visible(log));
create policy "likes: unlike" on public.likes for delete to authenticated using (owner = (select auth.uid()));

create policy "replies: read" on public.replies for select to anon, authenticated
  using (not hidden and public.log_visible(log)
         and (public.sees_person(owner) or public.log_owner(log) = (select auth.uid())));
create policy "replies: reply" on public.replies for insert to authenticated with check (owner = (select auth.uid()) and public.log_visible(log));
-- your own reply, or any reply to your log
create policy "replies: delete" on public.replies for delete to authenticated
  using (owner = (select auth.uid()) or public.log_owner(log) = (select auth.uid()));

create policy "notifications: own" on public.notifications for select to authenticated using (owner = (select auth.uid()));
create policy "notifications: mark read" on public.notifications for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

revoke all on public.likes, public.replies, public.notifications, public.act_counts from anon, authenticated;
grant select on public.likes, public.replies to anon, authenticated;
grant insert (log) on public.likes to authenticated;
grant delete on public.likes to authenticated;
grant insert (log, text) on public.replies to authenticated;
grant delete on public.replies to authenticated;
grant select on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;

-- ---------- reports: a log and a reply too ----------
alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (target_type in ('profile', 'shelf', 'log', 'reply'));
create or replace function public.reports_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := now();
  if (new.target_type = 'profile' and not exists (select 1 from public.profiles p where p.id = new.target_id))
     or (new.target_type = 'shelf' and not exists (select 1 from public.shelves s where s.id = new.target_id))
     or (new.target_type = 'log' and not public.log_visible(new.target_id))
     or (new.target_type = 'reply' and not exists (select 1 from public.replies r where r.id = new.target_id and not r.hidden and public.log_visible(r.log))) then
    raise exception 'There''s nothing there to report.' using errcode = '23514';
  end if;
  if (select count(*) from public.reports r where r.reporter = new.reporter and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'That''s a lot of reports for one day. Try again tomorrow.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create or replace function public.admin_reports() returns table (report_id uuid, reported_at timestamptz, reporter_name text,
  target_type text, target_id uuid, target_label text, target_user text, reason text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'Admins only.' using errcode = '42501'; end if;
  return query
    select r.id, r.created_at, rp.username, r.target_type, r.target_id,
           case r.target_type when 'profile' then tp.username when 'shelf' then s.caption when 'log' then l.title else left(rr.text, 120) end,
           coalesce(tp.username, so.username, lo.username, ro.username), r.reason
    from public.reports r
    left join public.profiles rp on rp.id = r.reporter
    left join public.profiles tp on r.target_type = 'profile' and tp.id = r.target_id
    left join public.shelves s on r.target_type = 'shelf' and s.id = r.target_id
    left join public.profiles so on so.id = s.owner
    left join public.logs l on r.target_type = 'log' and l.id = r.target_id
    left join public.profiles lo on lo.id = l.owner
    left join public.replies rr on r.target_type = 'reply' and rr.id = r.target_id
    left join public.profiles ro on ro.id = rr.owner
    order by r.created_at desc
    limit 200;
end $$;

-- ---------- what the pages call ----------
-- For the logs on a page (100 at most): what 0009 adds to each (rating, review, spoiler, rewatch, watched_on,
-- metoo_of), how many likes, replies and me-toos it has, and whether you liked it and have logged its title. Only
-- logs you can see; nothing for the rest.
create function public.post_stats(ids uuid[])
returns table (id uuid, rating smallint, review text, spoiler boolean, rewatch boolean, watched_on date, metoo_of uuid,
  likes int, replies int, metoos int, liked boolean, logged boolean)
language sql stable security definer set search_path = '' as $$
  select l.id, l.rating, l.review, l.spoiler, l.rewatch, l.watched_on, l.metoo_of,
         (select count(*) from public.likes k join public.profiles p on p.id = k.owner where k.log = l.id and not p.hidden)::int,
         (select count(*) from public.replies r join public.profiles p on p.id = r.owner where r.log = l.id and not r.hidden and not p.hidden)::int,
         (select count(*) from public.logs m join public.profiles p on p.id = m.owner where m.metoo_of = l.id and not m.hidden and not p.hidden)::int,
         exists (select 1 from public.likes k where k.log = l.id and k.owner = (select auth.uid())),
         exists (select 1 from public.logs m where m.owner = (select auth.uid()) and m.id <> l.id
                 and public.title_key(m.kind, m.title, m.year) = public.title_key(l.kind, l.title, l.year))
  from public.logs l
  where l.id = any (ids[1:100]) and public.log_visible(l.id);
$$;

-- A log's replies, oldest first, 50 at a time (the next start after the last one's created_at and id): only replies
-- you can see (see "Who sees what" at the top), and nothing for a log you can't see.
create function public.replies_of(lid uuid, after timestamptz default null, after_id uuid default null, n int default 50)
returns table (id uuid, created_at timestamptz, text text, owner uuid, username text, display_name text, avatar_key text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.created_at, r.text, p.id, p.username, p.display_name, p.avatar_key
  from public.replies r join public.profiles p on p.id = r.owner
  where r.log = lid and not r.hidden and not p.hidden and public.log_visible(lid)
    and (public.sees_person(r.owner) or public.log_owner(lid) = (select auth.uid()))
    and (after is null or (r.created_at, r.id) > (after, coalesce(after_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  order by r.created_at, r.id
  limit least(greatest(coalesce(n, 50), 1), 50);
$$;

-- Your notifications, newest first, 30 at a time (the next start before the last one's created_at and id), with who
-- did it and the log it's about. The page groups them ("@a and 2 others liked your log of Gummo").
create function public.notifications_list(before timestamptz default null, before_id uuid default null, n int default 30)
returns table (id uuid, kind text, created_at timestamptz, read boolean, actor uuid, username text, display_name text, avatar_key text,
  log uuid, log_kind text, log_title text, reply_text text)
language sql stable security definer set search_path = '' as $$
  select x.id, x.kind, x.created_at, x.read, a.id, a.username, a.display_name, a.avatar_key, l.id, l.kind, l.title, r.text
  from public.notifications x
  join public.profiles a on a.id = x.actor and not a.hidden
  left join public.logs l on l.id = x.log
  left join public.replies r on r.id = x.reply
  where x.owner = (select auth.uid())
    and (before is null or (x.created_at, x.id) < (before, coalesce(before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by x.created_at desc, x.id desc
  limit least(greatest(coalesce(n, 30), 1), 50);
$$;
-- all of yours read (opening /notifications/): how many that was
create function public.notifications_read() returns int
language sql volatile security invoker set search_path = '' as $$
  with done as (update public.notifications n set read = true where n.owner = (select auth.uid()) and not n.read returning 1)
  select count(*)::int from done;
$$;

revoke execute on function public.post_stats(uuid[]), public.replies_of(uuid, timestamptz, uuid, int) from public;
grant execute on function public.post_stats(uuid[]), public.replies_of(uuid, timestamptz, uuid, int) to anon, authenticated;
revoke execute on function public.notifications_list(timestamptz, uuid, int), public.notifications_read() from public, anon;
grant execute on function public.notifications_list(timestamptz, uuid, int), public.notifications_read() to authenticated;

commit;
