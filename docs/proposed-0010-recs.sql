-- shelfstackd, 0010 (proposed): recs. Recommend a film or a book to someone you follow who follows you back, with a
-- short note; they keep it (it goes on their Up next), mark it watched or read, or let it go; the two of you can talk
-- about it in a private thread; and the feed can say "@a recommended Gummo to @b".
--
-- Run once, after 0009, in the Supabase dashboard (SQL Editor -> New query -> paste all of this -> Run), then run its
-- test, docs/proposed-rls_phase7.sql: the last line says "ALL 0010 CHECKS PASSED". It all runs in one transaction: if
-- anything fails, nothing is changed. Once it's run and passes, both files move to supabase/ (headers only).
--
-- The pages work without it and ask for what it adds only once it's there (they look for the recs table): until then
-- there's no Recommend, no Recs tab and no rec in the feed.
--
-- Who sees what:
--   * a rec, its note and its thread: only the two people in it (whoever sent it and whoever it's for)
--   * in the feed (only when "show in feed" was left on): "@a recommended <title> to @b", never the note or the
--     thread. Everyone sees it when both profiles are public; Friends, when you follow @a and can see @b (a public
--     profile, or one you follow). Never a hidden profile's, or one hidden by moderation.
--   * "12 sent · 7 watched" on a profile: whoever can see that profile.
--   * a log from a rec says "recommended by @a" to whoever can see the log and @a.
-- What changes:
--   * recs: from (sender), to (receiver), the title as a log keeps it, a note (140), show in feed, and how it stands:
--     open (waiting), kept (on their Up next), watched (logged), dismissed (they let it go). Only to someone you follow
--     who follows you back; not something they've logged already; once per title per person; 6 open at most waiting
--     for one person; 20 sent a day (counted as they're made, under the sender's lock, as 0009's likes).
--   * rec_replies: the thread, 280 characters each, 100 a day per person.
--   * logs.rec: the rec a log came from. Logging a title someone recommended to you marks their rec watched (each
--     one, if more than one person did), whether you logged it from the rec or not, and tells them.
--   * notifications: rec (a rec for you), rec_watched (yours was watched or read), rec_reply (a reply in a thread);
--     notifications.rec and .rec_reply point at them; notifications_list() gives the title and the reply.
--   * functions for the pages: mutuals(), recs_list(), rec_keep(), rec_thread(), rec_stats(), timeline() (the feed:
--     activity() and recs together), and post_stats() gives rec_by too.
-- Not changed: activity(), from_friends(), follows, the watchlist's own rules, and everything else from 0001 to 0009.

begin;

-- ---------- recs ----------
create table public.recs (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  receiver uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('book', 'movie')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  author text not null default '' check (char_length(author) <= 200),
  year smallint check (year between 1000 and 2100),
  cover_src text check (char_length(cover_src) <= 400 and cover_src ~ '^url:https://(image\.tmdb\.org|covers\.openlibrary\.org)/[^\s]+$'),
  note text not null default '' check (char_length(note) <= 140),
  in_feed boolean not null default true,
  status text not null default 'open' check (status in ('open', 'kept', 'watched', 'dismissed')),
  log uuid references public.logs (id) on delete set null,   -- the log that watched it
  hidden boolean not null default false,                      -- set by moderation only
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recs_not_self check (sender <> receiver)
);
alter table public.recs enable row level security;
create unique index recs_once on public.recs (sender, receiver, public.title_key(kind, title, year));   -- a second is 23505
create index recs_receiver_new on public.recs (receiver, created_at desc);
create index recs_sender_new on public.recs (sender, created_at desc);
create index recs_feed on public.recs (created_at desc, id desc) where in_feed and not hidden;

-- the thread: only the two of them
create table public.rec_replies (
  id uuid primary key default gen_random_uuid(),
  rec uuid not null references public.recs (id) on delete cascade,
  owner uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 280),
  created_at timestamptz not null default now()
);
alter table public.rec_replies enable row level security;
create index rec_replies_rec_old on public.rec_replies (rec, created_at, id);

-- the limits count recs and thread replies too
alter table public.act_counts drop constraint act_counts_what_check;
alter table public.act_counts add constraint act_counts_what_check check (what in ('like', 'reply', 'rec', 'rec_reply'));

-- ---------- who's in a rec ----------
-- you follow uid and uid follows you, and neither of you is hidden
create function public.mutual_with(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.follows a join public.follows b on b.follower = a.followee and b.followee = a.follower
                 join public.profiles p on p.id = a.followee join public.profiles q on q.id = a.follower
                 where a.follower = (select auth.uid()) and a.followee = uid and not p.hidden and not q.hidden);
$$;
-- you sent it or it's for you, and it isn't hidden
create function public.rec_party(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.recs r where r.id = rid and not r.hidden and (select auth.uid()) in (r.sender, r.receiver));
$$;
revoke execute on function public.mutual_with(uuid), public.rec_party(uuid) from public;
grant execute on function public.mutual_with(uuid), public.rec_party(uuid) to authenticated;

-- ---------- sending one ----------
create function public.recs_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who text;
begin
  new.created_at := now(); new.updated_at := now(); new.status := 'open'; new.log := null; new.hidden := false;
  new.note := btrim(new.note); new.author := btrim(new.author);
  if new.receiver = new.sender then raise exception 'That''s you.' using errcode = '23514'; end if;
  if not public.mutual_with(new.receiver) then
    raise exception 'You can recommend to someone you follow who follows you back.' using errcode = '42501';
  end if;
  select p.username into who from public.profiles p where p.id = new.receiver;
  if exists (select 1 from public.logs l where l.owner = new.receiver and not l.hidden
             and public.title_key(l.kind, l.title, l.year) = public.title_key(new.kind, new.title, new.year)) then
    raise exception '@% has logged it already.', who using errcode = '23514';
  end if;
  -- 6 waiting for one person at most, under their lock (two people sending at once can't both be the 7th)
  perform pg_advisory_xact_lock(hashtext('recs:' || new.receiver));
  if (select count(*) from public.recs r where r.receiver = new.receiver and r.status = 'open' and not r.hidden) >= 6 then
    raise exception '@% has 6 recs waiting. Try again once they''ve looked at some.', who using errcode = 'P0001';
  end if;
  perform public.count_act(new.sender, 'rec', 20, 'That''s 20 recs today, the most for one day.');
  return new;
end $$;
-- what the one it's for can do: keep it, or let it go (a kept one too). Watched comes only from a log (below).
create function public.recs_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;   -- logs_rec_after() marking it watched
  if new.status is distinct from old.status then
    if not ((old.status = 'open' and new.status in ('kept', 'dismissed')) or (old.status = 'kept' and new.status = 'dismissed')) then
      raise exception 'That rec can''t be changed that way now.' using errcode = '23514';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.recs_before_insert(), public.recs_before_update() from public, anon, authenticated;
create trigger recs_before_insert before insert on public.recs for each row execute function public.recs_before_insert();
create trigger recs_before_update before update on public.recs for each row execute function public.recs_before_update();

create function public.rec_replies_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := now();
  new.text := btrim(new.text);
  perform public.count_act(new.owner, 'rec_reply', 100, 'That''s 100 replies today, the most for one day.');
  return new;
end $$;
revoke execute on function public.rec_replies_before_insert() from public, anon, authenticated;
create trigger rec_replies_before_insert before insert on public.rec_replies for each row execute function public.rec_replies_before_insert();

-- ---------- notifications: a rec, a rec watched, a reply in a thread ----------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('like', 'reply', 'metoo', 'follow', 'rec', 'rec_watched', 'rec_reply'));
alter table public.notifications
  add column rec uuid references public.recs (id) on delete cascade on update cascade,
  add column rec_reply uuid references public.rec_replies (id) on delete cascade on update cascade;

create function public.notify_rec(who uuid, by uuid, what text, rid uuid, rrid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if who is null or who = by or exists (select 1 from public.profiles p where p.id in (who, by) and p.hidden) then return; end if;
  delete from public.notifications n where n.owner = who and n.created_at < now() - interval '90 days';
  insert into public.notifications (owner, actor, kind, rec, rec_reply) values (who, by, what, rid, rrid);
end $$;
create function public.recs_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_rec(new.receiver, new.sender, 'rec', new.id, null);
  return null;
end $$;
create function public.rec_replies_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.recs;
begin
  select * into r from public.recs x where x.id = new.rec;
  perform public.notify_rec(case when new.owner = r.sender then r.receiver else r.sender end, new.owner, 'rec_reply', new.rec, new.id);
  return null;
end $$;
revoke execute on function public.notify_rec(uuid, uuid, text, uuid, uuid), public.recs_notify(), public.rec_replies_notify() from public, anon, authenticated;
create trigger recs_notify after insert on public.recs for each row execute function public.recs_notify();
create trigger rec_replies_notify after insert on public.rec_replies for each row execute function public.rec_replies_notify();

-- ---------- a log from a rec ----------
alter table public.logs add column rec uuid references public.recs (id) on delete set null;
grant insert (rec) on public.logs to authenticated;

-- A log names the rec it came from (Mark watched on it), or the first one for that title waiting for you; it's then
-- that title, as the rec has it. A rec that isn't yours, or isn't open or kept, is left off (it's just a log).
create function public.logs_rec_before() returns trigger
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
    end if;
  end if;
  if new.rec is null then
    select x.id into new.rec from public.recs x
    where x.receiver = new.owner and x.status in ('open', 'kept') and not x.hidden
      and public.title_key(x.kind, x.title, x.year) = public.title_key(new.kind, new.title, new.year)
    order by x.created_at limit 1;
  end if;
  return new;
end $$;
-- every rec of that title waiting for you is watched now, and whoever sent it is told
create function public.logs_rec_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in update public.recs x set status = 'watched', log = new.id, updated_at = now()
           where x.receiver = new.owner and x.status in ('open', 'kept') and not x.hidden
             and (x.id = new.rec or public.title_key(x.kind, x.title, x.year) = public.title_key(new.kind, new.title, new.year))
           returning x.id, x.sender loop
    perform public.notify_rec(r.sender, new.owner, 'rec_watched', r.id, null);
  end loop;
  return null;
end $$;
revoke execute on function public.logs_rec_before(), public.logs_rec_after() from public, anon, authenticated;
-- (after logs_post_before, by name: a me-too's copy is made first, then a rec's wins)
create trigger logs_rec_before before insert on public.logs for each row execute function public.logs_rec_before();
create trigger logs_rec_after after insert on public.logs for each row execute function public.logs_rec_after();

-- ---------- Row Level Security ----------
create policy "recs: the two of them" on public.recs for select to authenticated
  using (not hidden and (select auth.uid()) in (sender, receiver));
create policy "recs: send" on public.recs for insert to authenticated with check (sender = (select auth.uid()));
create policy "recs: keep or let go" on public.recs for update to authenticated
  using (receiver = (select auth.uid()) and not hidden) with check (receiver = (select auth.uid()));

create policy "rec_replies: the two of them" on public.rec_replies for select to authenticated using (public.rec_party(rec));
create policy "rec_replies: reply" on public.rec_replies for insert to authenticated with check (owner = (select auth.uid()) and public.rec_party(rec));
create policy "rec_replies: delete own" on public.rec_replies for delete to authenticated using (owner = (select auth.uid()));

revoke all on public.recs, public.rec_replies from anon, authenticated;
grant select on public.recs, public.rec_replies to authenticated;
grant insert (receiver, kind, title, author, year, cover_src, note, in_feed) on public.recs to authenticated;   -- the sender is always the one signed in
grant update (status) on public.recs to authenticated;
grant insert (rec, text) on public.rec_replies to authenticated;
grant delete on public.rec_replies to authenticated;

-- ---------- what the pages call ----------
-- The people you can recommend to: you follow them and they follow you back. With how many recs are waiting for each
-- (6 is full).
create function public.mutuals()
returns table (id uuid, username text, display_name text, avatar_key text, waiting int)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_key,
         (select count(*) from public.recs r where r.receiver = p.id and r.status = 'open' and not r.hidden)::int
  from public.follows a
  join public.follows b on b.follower = a.followee and b.followee = a.follower
  join public.profiles p on p.id = a.followee
  where a.follower = (select auth.uid()) and not p.hidden
  order by p.username;
$$;

-- Your recs: box 'for' (to you, waiting or kept, newest first) or 'sent' (from you, all of them, newest first), with
-- the other person and the thread's length. 100 at most.
create function public.recs_list(box text default 'for')
returns table (id uuid, created_at timestamptz, status text, note text, in_feed boolean, kind text, title text, author text,
  year smallint, cover_src text, log uuid, other uuid, username text, display_name text, avatar_key text, replies int)
language sql stable security definer set search_path = '' as $$
  select r.id, r.created_at, r.status, r.note, r.in_feed, r.kind, r.title, r.author, r.year, r.cover_src, r.log,
         p.id, p.username, p.display_name, p.avatar_key,
         (select count(*) from public.rec_replies x where x.rec = r.id)::int
  from public.recs r
  join public.profiles p on p.id = case when box = 'sent' then r.receiver else r.sender end and not p.hidden
  where not r.hidden
    and ((box = 'sent' and r.sender = (select auth.uid()))
      or (box = 'for' and r.receiver = (select auth.uid()) and r.status in ('open', 'kept')))
  order by r.created_at desc, r.id desc
  limit 100;
$$;

-- Keep: onto your Up next (from whoever sent it), and the rec is kept. Up next full: nothing changes, and it says so.
-- Already on it: just kept.
create function public.rec_keep(rid uuid) returns text
language plpgsql volatile security invoker set search_path = '' as $$
declare r public.recs;
begin
  select * into r from public.recs x where x.id = rid and x.receiver = (select auth.uid()) and x.status = 'open' and not x.hidden;
  if r.id is null then raise exception 'That rec isn''t waiting any more.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.watchlist w where w.owner = r.receiver
                 and public.title_key(w.kind, w.title, w.year) = public.title_key(r.kind, r.title, r.year)) then
    insert into public.watchlist (kind, title, author, year, cover_src, from_user) values (r.kind, r.title, r.author, r.year, r.cover_src, r.sender);
  end if;
  update public.recs x set status = 'kept' where x.id = rid;
  return 'kept';
end $$;

-- A rec's thread, oldest first: only for the two of them.
create function public.rec_thread(rid uuid)
returns table (id uuid, created_at timestamptz, text text, owner uuid, username text, display_name text, avatar_key text)
language sql stable security definer set search_path = '' as $$
  select x.id, x.created_at, x.text, p.id, p.username, p.display_name, p.avatar_key
  from public.rec_replies x join public.profiles p on p.id = x.owner and not p.hidden
  where x.rec = rid and public.rec_party(rid)
  order by x.created_at, x.id
  limit 200;
$$;

-- "12 sent · 7 watched": for whoever can see that profile
create function public.rec_stats(uid uuid) returns table (sent int, watched int)
language sql stable security definer set search_path = '' as $$
  select count(*)::int, (count(*) filter (where r.status = 'watched'))::int
  from public.recs r
  where r.sender = uid and not r.hidden and public.sees_person(uid)
    and not exists (select 1 from public.profiles p where p.id = uid and p.hidden);
$$;

-- Recs for the feed (only those shown in it): "@a recommended <title> to @b", never the note. scope as activity()'s.
create function public.feed_recs(scope text default 'everyone', before timestamptz default null, before_id uuid default null, n int default 20)
returns table (id uuid, at timestamptz, owner uuid, username text, display_name text, avatar_key text,
  kind text, title text, author text, year smallint, cover_src text, to_username text, to_display_name text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.created_at, a.id, a.username, a.display_name, a.avatar_key, r.kind, r.title, r.author, r.year, r.cover_src, b.username, b.display_name
  from public.recs r
  join public.profiles a on a.id = r.sender and not a.hidden
  join public.profiles b on b.id = r.receiver and not b.hidden
  where r.in_feed and not r.hidden
    and ((scope = 'everyone' and public.profile_is_public(r.sender) and public.profile_is_public(r.receiver))
      or (scope = 'following' and public.approved_follower_of(r.sender) and public.sees_person(r.receiver))
      or (scope = 'you' and (select auth.uid()) in (r.sender, r.receiver)))
    and (before is null or (r.created_at, r.id) < (before, coalesce(before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(n, 20), 1), 50);
$$;

-- The feed: activity() (shelves and logs) and recs, together, newest first. what: 'shelf', 'log' or 'rec'; a rec has
-- to_username and to_display_name. The next ones start after the last one's at and id, as activity()'s do.
create function public.timeline(scope text default 'everyone', before timestamptz default null, before_id uuid default null, n int default 20)
returns table (what text, id uuid, at timestamptz, owner uuid, username text, display_name text, avatar_key text,
  caption text, name text, preview_key text, created_at timestamptz, updated_at timestamptz, updated boolean, is_public boolean,
  kind text, title text, author text, year smallint, cover_src text, to_username text, to_display_name text)
language sql stable security invoker set search_path = '' as $$
  select * from (
    select a.what, a.id, a.at, a.owner, a.username, a.display_name, a.avatar_key, a.caption, a.name, a.preview_key, a.created_at,
           a.updated_at, a.updated, a.is_public, a.kind, a.title, a.author, a.year, a.cover_src, null::text, null::text
    from public.activity(scope, before, before_id, n) a
    union all
    select 'rec', r.id, r.at, r.owner, r.username, r.display_name, r.avatar_key, ''::text, null::text, null::text, r.at,
           r.at, false, true, r.kind, r.title, r.author, r.year, r.cover_src, r.to_username, r.to_display_name
    from public.feed_recs(scope, before, before_id, n) r
  ) t
  order by t.at desc, t.id desc
  limit least(greatest(coalesce(n, 20), 1), 50);
$$;

-- post_stats() as 0009 has it, and rec_by: who recommended it, when the log came from a rec and you can see them
drop function public.post_stats(uuid[]);
create function public.post_stats(ids uuid[])
returns table (id uuid, rating smallint, review text, spoiler boolean, rewatch boolean, watched_on date, metoo_of uuid,
  likes int, replies int, metoos int, liked boolean, logged boolean, rec_by text)
language sql stable security definer set search_path = '' as $$
  select l.id, l.rating, l.review, l.spoiler, l.rewatch, l.watched_on, l.metoo_of,
         (select count(*) from public.likes k join public.profiles p on p.id = k.owner where k.log = l.id and not p.hidden)::int,
         (select count(*) from public.replies r join public.profiles p on p.id = r.owner where r.log = l.id and not r.hidden and not p.hidden)::int,
         (select count(*) from public.logs m join public.profiles p on p.id = m.owner where m.metoo_of = l.id and not m.hidden and not p.hidden)::int,
         exists (select 1 from public.likes k where k.log = l.id and k.owner = (select auth.uid())),
         exists (select 1 from public.logs m where m.owner = (select auth.uid()) and m.id <> l.id
                 and public.title_key(m.kind, m.title, m.year) = public.title_key(l.kind, l.title, l.year)),
         (select s.username from public.recs x join public.profiles s on s.id = x.sender
          where x.id = l.rec and not x.hidden and not s.hidden and public.sees_person(x.sender))
  from public.logs l
  where l.id = any (ids[1:100]) and public.log_visible(l.id);
$$;

-- notifications_list() as 0009 has it, and a rec's: the rec, its title and kind, and a thread reply's text
drop function public.notifications_list(timestamptz, uuid, int);
create function public.notifications_list(before timestamptz default null, before_id uuid default null, n int default 30)
returns table (id uuid, kind text, created_at timestamptz, read boolean, actor uuid, username text, display_name text, avatar_key text,
  log uuid, log_kind text, log_title text, reply_text text, rec uuid, rec_kind text, rec_title text)
language sql stable security definer set search_path = '' as $$
  select x.id, x.kind, x.created_at, x.read, a.id, a.username, a.display_name, a.avatar_key, l.id, l.kind, l.title,
         coalesce(r.text, rr.text), c.id, c.kind, c.title
  from public.notifications x
  join public.profiles a on a.id = x.actor and not a.hidden
  left join public.logs l on l.id = x.log
  left join public.replies r on r.id = x.reply
  left join public.recs c on c.id = x.rec and not c.hidden
  left join public.rec_replies rr on rr.id = x.rec_reply
  where x.owner = (select auth.uid())
    and (x.rec is null or c.id is not null)
    and (before is null or (x.created_at, x.id) < (before, coalesce(before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by x.created_at desc, x.id desc
  limit least(greatest(coalesce(n, 30), 1), 50);
$$;

revoke execute on function public.mutuals(), public.recs_list(text), public.rec_keep(uuid), public.rec_thread(uuid) from public, anon;
grant execute on function public.mutuals(), public.recs_list(text), public.rec_keep(uuid), public.rec_thread(uuid) to authenticated;
revoke execute on function public.rec_stats(uuid), public.feed_recs(text, timestamptz, uuid, int), public.timeline(text, timestamptz, uuid, int),
  public.post_stats(uuid[]) from public;
grant execute on function public.rec_stats(uuid), public.feed_recs(text, timestamptz, uuid, int), public.timeline(text, timestamptz, uuid, int),
  public.post_stats(uuid[]) to anon, authenticated;
revoke execute on function public.notifications_list(timestamptz, uuid, int) from public, anon;
grant execute on function public.notifications_list(timestamptz, uuid, int) to authenticated;

commit;
