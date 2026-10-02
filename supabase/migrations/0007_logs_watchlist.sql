-- shelfstackd, 0007: logs on the feed, the watchlist, and From friends.
--
-- Run once, after 0006, in the Supabase dashboard (SQL Editor -> New query -> paste all of this -> Run), then run its
-- test, supabase/tests/rls_phase4.sql. It all runs in one transaction: if anything fails, nothing is changed.
-- It was run on the live database on 2 October 2026; docs/RUN-0007.md has the steps, the checks and a way to take it
-- out again.
--
-- The pages use what this adds, and do without it on a database that hasn't got it: + ADD's Log it and Watchlist say
-- they aren't open yet, the feed shows shelves only (feed() from 0006), and a profile has no Watchlist and no From
-- friends. Nothing in the pages changes when this is run. docs/proposed-0007.md says what each page asks.
--
-- Who sees what (the same rules as a shelf, from 0002 and 0006):
--   * a log, and a watchlist: everyone when the profile is public; its followers when it's private; always its owner.
--     Never a hidden profile's, and never a hidden log (moderation).
--   * From friends: only you. It's read from the logs of the people you follow, so it shows nothing you couldn't see.
--   * the titles you removed from From friends: only you.
-- What changes:
--   * logs: a film or a book you watched or read, with a caption if you want one (280 characters at most). The feed
--     shows it as "@you watched Gummo · today" with its cover. 50 a day per person at most, counted as they're posted
--     (log_counts), so deleting one doesn't make room for another. You can delete your own.
--   * watchlist: up to 6 titles, each title once. Logging a title takes it off your watchlist. A title kept from
--     someone's log says whose it was until you unfollow them; then it's just yours.
--   * friend_hides: the titles you pressed Remove on in From friends, so they don't come back (kept 180 days, as long
--     as From friends looks back; 500 at most).
--   * title_key(): one key per title (film or book, its title in lower case with its spaces tidied, its year), so the
--     same title is the same title in logs, the watchlist and From friends.
--   * functions for the pages: activity() (the feed: shelves and logs together, newest first) and from_friends().
-- The limits hold when the same person adds from two tabs at once: each one takes a lock for that person first
-- (pg_advisory_xact_lock, kept to the end of the transaction), so a second add waits, then counts the first.
-- Not changed: feed(), shelves, shelf_items and everything else from 0001 to 0006.

begin;

-- ---------- one key per title ----------
create function public.title_key(kind text, title text, year smallint) returns text
language sql immutable set search_path = '' as $$
  select kind || ':' || lower(btrim(regexp_replace(coalesce(title, ''), '\s+', ' ', 'g'))) || ':' || coalesce(year::text, '');
$$;
grant execute on function public.title_key(text, text, smallint) to anon, authenticated;   -- the indexes and from_friends() use it

-- ---------- logs: a film or a book watched or read ----------
-- A title is kept as a shelf's spine is (shelf_items, 0001), except that the cover can only be TMDB's or Open
-- Library's: a log has no pictures of its own.
create table public.logs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('book', 'movie')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  author text not null default '' check (char_length(author) <= 200),
  year smallint check (year between 1000 and 2100),
  cover_src text check (char_length(cover_src) <= 400 and cover_src ~ '^url:https://(image\.tmdb\.org|covers\.openlibrary\.org)/[^\s]+$'),
  caption text not null default '' check (char_length(caption) <= 280),
  hidden boolean not null default false,               -- set by moderation only
  created_at timestamptz not null default now()        -- when it was logged: the cover's wear on the feed is worked out from it
);
alter table public.logs enable row level security;
create index logs_new on public.logs (created_at desc, id desc) where not hidden;                       -- the feed
create index logs_owner_new on public.logs (owner, created_at desc, id desc) where not hidden;          -- a profile's Activity, From friends
create index logs_owner_title on public.logs (owner, public.title_key(kind, title, year));             -- "have I logged this?"

-- how many logs each person has posted each day (UTC), whether or not they're still there: the 50-a-day limit counts
-- these, so deleting a log and posting it again can't fill the feed. Only the trigger below reads or writes it, and it
-- lets a person's days before yesterday go as they post.
create table public.log_counts (
  owner uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  n int not null check (n >= 0),
  primary key (owner, day)
);
alter table public.log_counts enable row level security;   -- no policies, and nothing granted: only logs_before_insert()

-- its date is the database's, and 50 a day per person is plenty. The lock is this person's alone: another add of
-- theirs waits here until this one is done, then counts it, so two at once can't both be the 50th. A post the limit
-- refuses isn't counted (the refusal undoes its count), but it can't go in either.
create function public.logs_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'utc')::date; posted int;
begin
  perform pg_advisory_xact_lock(hashtext('logs:' || new.owner));
  new.created_at := now();
  insert into public.log_counts as c (owner, day, n) values (new.owner, today, 1)
    on conflict (owner, day) do update set n = c.n + 1
    returning c.n into posted;
  if posted > 50 then
    raise exception 'That''s 50 logs today, the most for one day. Log the rest tomorrow.' using errcode = 'P0001';
  end if;
  delete from public.log_counts c where c.owner = new.owner and c.day < today - 1;
  return new;
end $$;
revoke execute on function public.logs_before_insert() from public, anon, authenticated;
create trigger logs_before_insert before insert on public.logs
  for each row execute function public.logs_before_insert();

-- ---------- the watchlist: up to 6 titles ----------
create table public.watchlist (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('book', 'movie')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  author text not null default '' check (char_length(author) <= 200),
  year smallint check (year between 1000 and 2100),
  cover_src text check (char_length(cover_src) <= 400 and cover_src ~ '^url:https://(image\.tmdb\.org|covers\.openlibrary\.org)/[^\s]+$'),
  from_user uuid references public.profiles (id) on delete set null,   -- kept from From friends: whose log it came from
  created_at timestamptz not null default now()
);
alter table public.watchlist enable row level security;
create unique index watchlist_one_each on public.watchlist (owner, public.title_key(kind, title, year));   -- a second one is 23505
create index watchlist_owner_new on public.watchlist (owner, created_at desc);

-- 6 at most (under this person's lock, as logs are); from_user only when it's someone you follow (otherwise it's left
-- empty, not refused)
create function public.watchlist_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('watch:' || new.owner));
  new.created_at := now();
  if (select count(*) from public.watchlist w where w.owner = new.owner) >= 6 then
    raise exception 'Your watchlist holds 6. Log one or remove one first.' using errcode = 'P0001';
  end if;
  if new.from_user is not null and not exists (select 1 from public.follows f where f.follower = new.owner and f.followee = new.from_user) then
    new.from_user := null;
  end if;
  return new;
end $$;
revoke execute on function public.watchlist_before_insert() from public, anon, authenticated;
create trigger watchlist_before_insert before insert on public.watchlist
  for each row execute function public.watchlist_before_insert();

-- logging a title takes it off your watchlist
create function public.logs_off_watchlist() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.watchlist w
  where w.owner = new.owner and public.title_key(w.kind, w.title, w.year) = public.title_key(new.kind, new.title, new.year);
  return null;
end $$;
revoke execute on function public.logs_off_watchlist() from public, anon, authenticated;
create trigger logs_off_watchlist after insert on public.logs
  for each row execute function public.logs_off_watchlist();

-- unfollowing someone takes their name off what you kept from their logs (the titles stay on your watchlist)
create function public.follows_unkeep() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.watchlist w set from_user = null where w.owner = old.follower and w.from_user = old.followee;
  return null;
end $$;
revoke execute on function public.follows_unkeep() from public, anon, authenticated;
create trigger follows_unkeep after delete on public.follows
  for each row execute function public.follows_unkeep();

-- ---------- From friends: the titles you removed ----------
create table public.friend_hides (
  owner uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  item_key text not null check (char_length(item_key) between 1 and 420),   -- a title_key(), as from_friends() gives it
  created_at timestamptz not null default now(),
  primary key (owner, item_key)
);
alter table public.friend_hides enable row level security;

-- From friends looks back 180 days, so a removal is kept that long, and 500 at most a person (under their lock, as
-- logs are, so two at once can't both be the 500th)
create function public.friend_hides_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('hides:' || new.owner));
  new.created_at := now();
  delete from public.friend_hides h where h.owner = new.owner and h.created_at < now() - interval '180 days';
  if (select count(*) from public.friend_hides h where h.owner = new.owner) >= 500 then
    raise exception 'That''s 500 titles removed from From friends, the most it keeps. They come off after 180 days.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.friend_hides_before_insert() from public, anon, authenticated;
create trigger friend_hides_before_insert before insert on public.friend_hides
  for each row execute function public.friend_hides_before_insert();

-- ---------- Row Level Security ----------
create policy "logs: read public" on public.logs for select to anon, authenticated using (not hidden and public.profile_is_public(owner));
create policy "logs: read as follower" on public.logs for select to authenticated using (not hidden and public.approved_follower_of(owner));
create policy "logs: read own" on public.logs for select to authenticated using (owner = (select auth.uid()));
create policy "logs: post own" on public.logs for insert to authenticated with check (owner = (select auth.uid()));
create policy "logs: delete own" on public.logs for delete to authenticated using (owner = (select auth.uid()) and not hidden);   -- one hidden by moderation stays, for us to see

create policy "watchlist: read public" on public.watchlist for select to anon, authenticated using (public.profile_is_public(owner));
create policy "watchlist: read as follower" on public.watchlist for select to authenticated using (public.approved_follower_of(owner));
create policy "watchlist: read own" on public.watchlist for select to authenticated using (owner = (select auth.uid()));
create policy "watchlist: add own" on public.watchlist for insert to authenticated with check (owner = (select auth.uid()));
create policy "watchlist: remove own" on public.watchlist for delete to authenticated using (owner = (select auth.uid()));

create policy "friend hides: own" on public.friend_hides for select to authenticated using (owner = (select auth.uid()));
create policy "friend hides: add own" on public.friend_hides for insert to authenticated with check (owner = (select auth.uid()));
create policy "friend hides: remove own" on public.friend_hides for delete to authenticated using (owner = (select auth.uid()));

-- what the Data API may touch in the new tables (nothing else)
revoke all on public.logs, public.watchlist, public.friend_hides, public.log_counts from anon, authenticated;
grant select on public.logs, public.watchlist to anon, authenticated;
grant insert (kind, title, author, year, cover_src, caption) on public.logs to authenticated;          -- owner, hidden, dates: never from the page
grant delete on public.logs to authenticated;
grant insert (kind, title, author, year, cover_src, from_user) on public.watchlist to authenticated;
grant delete on public.watchlist to authenticated;
grant select, delete on public.friend_hides to authenticated;
grant insert (item_key) on public.friend_hides to authenticated;

-- ---------- what the pages call ----------
-- The feed: shelves saved (as feed() in 0006 has them) and logs, together, newest first, 20 at a time. scope:
-- 'everyone' (public profiles), 'following' (people you follow, a private one too once you follow it; nothing when
-- signed out) or 'you' (your own, private shelves too). The next 20 start after the last one's `at` and id.
-- what: 'shelf' or 'log'. A shelf has caption, name, preview_key, created_at, updated_at, updated, is_public; a log has
-- caption (its own), kind, title, author, year, cover_src, and created_at (when it was logged, which is `at` too).
-- Security invoker, so Row Level Security applies too, on top of the checks written here.
create function public.activity(scope text default 'everyone', before timestamptz default null, before_id uuid default null, n int default 20)
returns table (what text, id uuid, at timestamptz, owner uuid, username text, display_name text, avatar_key text,
  caption text, name text, preview_key text, created_at timestamptz, updated_at timestamptz, updated boolean, is_public boolean,
  kind text, title text, author text, year smallint, cover_src text)
language sql stable security invoker set search_path = '' as $$
  with me as (select (select auth.uid()) as uid),
  b as (select before as at, coalesce(before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid) as id),
  got as (
    select 'shelf'::text as what, s.id, s.saved_at as at, s.owner, s.caption, s.name, s.preview_key, s.created_at, s.updated_at,
           s.saved_at > s.created_at + interval '1 minute' as updated, s.is_public,
           null::text as kind, null::text as title, null::text as author, null::smallint as year, null::text as cover_src
    from public.shelves s, me, b
    where not s.hidden
      and ((scope = 'everyone' and s.is_public and public.profile_is_public(s.owner))
        or (scope = 'following' and s.is_public and public.approved_follower_of(s.owner))
        or (scope = 'you' and s.owner = me.uid))
      and (b.at is null or (s.saved_at, s.id) < (b.at, b.id))
    union all
    select 'log', l.id, l.created_at, l.owner, l.caption, null, null, l.created_at, l.created_at, false, true,
           l.kind, l.title, l.author, l.year, l.cover_src
    from public.logs l, me, b
    where not l.hidden
      and ((scope = 'everyone' and public.profile_is_public(l.owner))
        or (scope = 'following' and public.approved_follower_of(l.owner))
        or (scope = 'you' and l.owner = me.uid))
      and (b.at is null or (l.created_at, l.id) < (b.at, b.id))
  )
  select r.what, r.id, r.at, p.id, p.username, p.display_name, p.avatar_key, r.caption, r.name, r.preview_key, r.created_at, r.updated_at,
         r.updated, r.is_public, r.kind, r.title, r.author, r.year, r.cover_src
  from got r join public.profiles p on p.id = r.owner   -- a hidden profile's rows are already out: profile_is_public() and approved_follower_of() see to it
  order by r.at desc, r.id desc
  limit least(greatest(coalesce(n, 20), 1), 50);
$$;

-- From friends: up to 6 titles the people you follow logged in the last 180 days, newest first, each title once
-- (with the newest log of it), leaving out what you've logged yourself, what's on your watchlist and what you
-- removed. item_key is what Remove keeps in friend_hides. Nothing when signed out.
create function public.from_friends(n int default 6)
returns table (item_key text, kind text, title text, author text, year smallint, cover_src text, log_id uuid, logged_at timestamptz,
  from_id uuid, from_username text, from_display_name text)
language sql stable security invoker set search_path = '' as $$
  with me as (select (select auth.uid()) as uid),
  theirs as (
    select distinct on (public.title_key(l.kind, l.title, l.year))
           public.title_key(l.kind, l.title, l.year) as k, l.kind, l.title, l.author, l.year, l.cover_src, l.id, l.created_at, l.owner,
           p.username, p.display_name
    from public.logs l
    join me on true
    join public.follows f on f.followee = l.owner and f.follower = me.uid
    join public.profiles p on p.id = l.owner
    where not l.hidden and public.approved_follower_of(l.owner) and l.created_at > now() - interval '180 days'   -- not a hidden profile's
    order by public.title_key(l.kind, l.title, l.year), l.created_at desc
  )
  select t.k, t.kind, t.title, t.author, t.year, t.cover_src, t.id, t.created_at, t.owner, t.username, t.display_name
  from theirs t, me
  where me.uid is not null
    and not exists (select 1 from public.logs m where m.owner = me.uid and public.title_key(m.kind, m.title, m.year) = t.k)
    and not exists (select 1 from public.watchlist w where w.owner = me.uid and public.title_key(w.kind, w.title, w.year) = t.k)
    and not exists (select 1 from public.friend_hides h where h.owner = me.uid and h.item_key = t.k)
  order by t.created_at desc
  limit least(greatest(coalesce(n, 6), 1), 6);
$$;

revoke execute on function public.activity(text, timestamptz, uuid, int) from public;
grant execute on function public.activity(text, timestamptz, uuid, int) to anon, authenticated;
revoke execute on function public.from_friends(int) from public, anon;
grant execute on function public.from_friends(int) to authenticated;

commit;

-- ---------- optional, and not needed by the pages: one shelf per account in the database too ----------
-- The pages now show one shelf per person: the main one (profiles.pinned_shelf_id) when it's set, otherwise the one
-- saved last, and the builder always saves over it. Accounts that made more than one shelf before keep the others in
-- the database; nothing on the site lists them any more, and their old links still open them.
-- To make it a rule in the database as well, first see who has more than one:
--   select p.username, count(*) from public.shelves s join public.profiles p on p.id = s.owner group by p.username having count(*) > 1;
-- decide what happens to their other shelves (keep only the main or newest one, or leave this rule out), and only then:
--   create unique index shelves_one_per_owner on public.shelves (owner);
