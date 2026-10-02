-- shelfstackd, phase 3: follow people (a request, for a private profile), and a feed of shelves.
-- Run once, after 0005, in the Supabase dashboard: SQL Editor -> New query -> paste all of this -> Run.
-- Then run supabase/tests/rls_phase3.sql; its last line says "ALL PHASE 3 CHECKS PASSED".
-- It all runs in one transaction: if anything fails, nothing is changed.
--
-- Who sees what:
--   * a public profile and its public shelves: everyone (as before)
--   * a private profile: its followers see it all (its bio, lists and public shelves, also in their FOLLOWING feed).
--     Its followers are the people it accepted, and anyone who already followed it before it went private.
--     Everyone else sees its photo, display name and username only (profile_card), never its bio or shelves.
--     To follow it you send a request; it answers on its own profile.
--   * a shelf marked private, a hidden shelf and a hidden profile: nobody but the owner, and never in the feed
-- What changes:
--   * follows (who follows whom) and follow_requests (waiting for a private profile to answer). You can't follow
--     yourself or a hidden profile; only you add or remove your own follows and requests; 100 follows, unfollows,
--     requests and cancels an hour per person at most (follow_log). Accepting or declining isn't counted.
--   * shelves.saved_at: when the shelf's spines were last saved in the builder. The feed is ordered by it, so
--     renaming a shelf, making it main, private or public, or moderation never move it up the feed.
--   * policies: a follower can read the private profile they follow, its public shelves and their spines
--   * functions for the pages, each keeping privacy itself: feed(), follow(), unfollow(), answer_request(),
--     profile_card(), find_people(), follow_list(), follow_stats(), request_list()

begin;

-- ---------- follows, and requests to private profiles ----------
create table public.follows (
  follower uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  followee uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  constraint follows_not_self check (follower <> followee)
);
alter table public.follows enable row level security;
create index follows_followee on public.follows (followee, created_at desc);   -- someone's followers, newest first
create index follows_follower on public.follows (follower, created_at desc);   -- who someone follows, newest first

create table public.follow_requests (
  requester uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (requester, target),
  constraint follow_requests_not_self check (requester <> target)
);
alter table public.follow_requests enable row level security;
create index follow_requests_target on public.follow_requests (target, created_at desc);

-- every follow, unfollow, request and cancel, kept an hour, to hold each person to 100 an hour (only the triggers use it)
create table public.follow_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  at timestamptz not null default now()
);
alter table public.follow_log enable row level security;   -- no policies
create index follow_log_user_at on public.follow_log (user_id, at);

-- counts one action by `who`, or stops them at 100 in the last hour. Only for someone acting for themselves:
-- not a private profile accepting or declining (that acts on the other person's row), and not an account being
-- deleted taking its rows with it (a trigger inside a trigger).
create function public.follow_action(who uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 or (select auth.uid()) is distinct from who then return; end if;
  delete from public.follow_log l where l.user_id = who and l.at < now() - interval '1 hour';
  if (select count(*) from public.follow_log l where l.user_id = who) >= 100 then
    raise exception 'That''s a lot of following and unfollowing for one hour. Try again a little later.' using errcode = 'P0001';
  end if;
  insert into public.follow_log (user_id) values (who);
end $$;
revoke execute on function public.follow_action(uuid) from public, anon, authenticated;

create function public.follows_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then perform public.follow_action(old.follower); return old; end if;
  if pg_trigger_depth() = 1 then
    if exists (select 1 from public.profiles p where p.id = new.followee and p.hidden) then
      raise exception 'You can''t follow this profile.' using errcode = 'P0001';
    end if;
    -- a private profile: only by its own "accept" (answer_request), which acts as that profile
    if exists (select 1 from public.profiles p where p.id = new.followee and p.is_private) and (select auth.uid()) is distinct from new.followee then
      raise exception 'This profile is private. Send a request instead.' using errcode = 'P0001';
    end if;
  end if;
  perform public.follow_action(new.follower);
  new.created_at := now();
  return new;
end $$;
revoke execute on function public.follows_before() from public, anon, authenticated;
create trigger follows_before before insert or delete on public.follows
  for each row execute function public.follows_before();

create function public.follow_requests_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then perform public.follow_action(old.requester); return old; end if;
  if exists (select 1 from public.profiles p where p.id = new.target and p.hidden) then
    raise exception 'You can''t follow this profile.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p where p.id = new.target and p.is_private) then
    raise exception 'This profile is public: follow it instead.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.follows f where f.follower = new.requester and f.followee = new.target) then
    raise exception 'You already follow them.' using errcode = 'P0001';
  end if;
  perform public.follow_action(new.requester);
  new.created_at := now();
  return new;
end $$;
revoke execute on function public.follow_requests_before() from public, anon, authenticated;
create trigger follow_requests_before before insert or delete on public.follow_requests
  for each row execute function public.follow_requests_before();

-- a follow shows when either person has a public profile (a private one still shows in a public one's lists, as
-- photo and name); your own always show to you
create policy "follows: read" on public.follows for select to anon, authenticated
  using (public.profile_is_public(follower) or public.profile_is_public(followee) or (select auth.uid()) in (follower, followee));
create policy "follows: follow" on public.follows for insert to authenticated with check (follower = (select auth.uid()));
create policy "follows: unfollow" on public.follows for delete to authenticated using (follower = (select auth.uid()));
-- a request is seen by the two people in it; the one who sent it can cancel it, the one it's for can decline it
create policy "requests: read own" on public.follow_requests for select to authenticated using ((select auth.uid()) in (requester, target));
create policy "requests: send" on public.follow_requests for insert to authenticated with check (requester = (select auth.uid()));
create policy "requests: cancel or decline" on public.follow_requests for delete to authenticated using ((select auth.uid()) in (requester, target));

revoke all on public.follows, public.follow_requests, public.follow_log from anon, authenticated;
grant select on public.follows to anon, authenticated;
grant insert (followee) on public.follows to authenticated;       -- the follower is always the one signed in
grant delete on public.follows to authenticated;
grant select, delete on public.follow_requests to authenticated;
grant insert (target) on public.follow_requests to authenticated; -- the requester is always the one signed in

-- ---------- a follower sees the private profile they follow ----------
-- true when the one asking follows uid and uid isn't hidden
create function public.approved_follower_of(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.follows f join public.profiles p on p.id = f.followee
                 where f.follower = (select auth.uid()) and f.followee = uid and not p.hidden);
$$;
create function public.shelf_seen_by_follower(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shelves s where s.id = sid and s.is_public and not s.hidden and public.approved_follower_of(s.owner));
$$;
revoke execute on function public.approved_follower_of(uuid), public.shelf_seen_by_follower(uuid) from public;
grant execute on function public.approved_follower_of(uuid), public.shelf_seen_by_follower(uuid) to anon, authenticated;

create policy "profiles: read as follower" on public.profiles for select to authenticated using (public.approved_follower_of(id));
create policy "shelves: read as follower" on public.shelves for select to authenticated using (is_public and not hidden and public.approved_follower_of(owner));
create policy "items: read as follower" on public.shelf_items for select to authenticated using (public.shelf_seen_by_follower(shelf_id));

-- ---------- shelves.saved_at: when the spines were last saved ----------
alter table public.shelves add column saved_at timestamptz;
-- shelves saved before this: the nearest thing to it (the date trigger stays off for these rows, so their dates stay)
alter table public.shelves disable trigger shelves_before_write;
update public.shelves set saved_at = updated_at;
alter table public.shelves enable trigger shelves_before_write;
alter table public.shelves alter column saved_at set default now(), alter column saved_at set not null;

-- the builder saves a shelf by writing its spines again (save_shelf): that, and only that, moves saved_at
create function public.shelf_items_saved() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.shelves s set saved_at = now() where s.id in (select distinct i.shelf_id from new_items i);
  return null;
end $$;
revoke execute on function public.shelf_items_saved() from public, anon, authenticated;
create trigger shelf_items_saved after insert on public.shelf_items
  referencing new table as new_items for each statement execute function public.shelf_items_saved();

create index shelves_feed on public.shelves (saved_at desc, id desc) where is_public and not hidden;
create index shelves_owner_saved on public.shelves (owner, saved_at desc) where is_public and not hidden;

-- ---------- what the pages call ----------
-- the feed: 'everyone' (public profiles) or 'following' (people you follow, a private one too once you follow it;
-- nothing when signed out). 20 at a time, newest saved first; the next 20 start after the last one's saved_at and id.
-- Never a shelf marked private or hidden, or a hidden profile's. updated: saved again after it was first shelved.
-- Security invoker, so Row Level Security applies too, on top of the checks written here.
create function public.feed(scope text default 'everyone', before timestamptz default null, before_id uuid default null, n int default 20)
returns table (shelf_id uuid, caption text, name text, preview_key text, saved_at timestamptz, created_at timestamptz, updated_at timestamptz,
  owner uuid, username text, display_name text, avatar_key text, updated boolean)
language sql stable security invoker set search_path = '' as $$
  select s.id, s.caption, s.name, s.preview_key, s.saved_at, s.created_at, s.updated_at, p.id, p.username, p.display_name, p.avatar_key,
         s.saved_at > s.created_at + interval '1 minute'
  from public.shelves s join public.profiles p on p.id = s.owner
  where s.is_public and not s.hidden
    and ((scope = 'everyone' and public.profile_is_public(s.owner)) or (scope = 'following' and public.approved_follower_of(s.owner)))
    and (before is null or (s.saved_at, s.id) < (before, coalesce(before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by s.saved_at desc, s.id desc
  limit least(greatest(coalesce(n, 20), 1), 50);
$$;

-- FOLLOW: a public profile is followed at once, a private one gets a request. Returns 'following' or 'requested'.
create function public.follow(target uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); t record;
begin
  if me is null then raise exception 'Sign in to follow people.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles p where p.id = me) then raise exception 'Pick a username first.' using errcode = 'P0001'; end if;
  if follow.target = me then raise exception 'You can''t follow yourself.' using errcode = 'P0001'; end if;
  select p.is_private, p.hidden into t from public.profiles p where p.id = follow.target;
  if not found or t.hidden then raise exception 'You can''t follow this profile.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.follows f where f.follower = me and f.followee = follow.target) then return 'following'; end if;
  if t.is_private then
    if not exists (select 1 from public.follow_requests r where r.requester = me and r.target = follow.target) then
      insert into public.follow_requests (requester, target) values (me, follow.target);
    end if;
    return 'requested';
  end if;
  delete from public.follow_requests r where r.requester = me and r.target = follow.target;   -- one left from when it was private
  insert into public.follows (follower, followee) values (me, follow.target);
  return 'following';
end $$;

-- UNFOLLOW, or cancel a request. Returns 'none'.
create function public.unfollow(target uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in to follow people.' using errcode = '42501'; end if;
  delete from public.follows f where f.follower = me and f.followee = unfollow.target;
  delete from public.follow_requests r where r.requester = me and r.target = unfollow.target;
  return 'none';
end $$;

-- ACCEPT or DECLINE a request sent to you. Returns 'accepted' or 'declined'.
create function public.answer_request(requester uuid, accept boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not exists (select 1 from public.follow_requests r where r.requester = answer_request.requester and r.target = me) then
    raise exception 'That request isn''t there any more.' using errcode = 'P0001';
  end if;
  if accept then
    insert into public.follows (follower, followee) values (answer_request.requester, me) on conflict do nothing;
  end if;
  delete from public.follow_requests r where r.requester = answer_request.requester and r.target = me;
  return case when accept then 'accepted' else 'declined' end;
end $$;

-- a person, as lists, search and a private profile's page show them: nothing more than this
-- (i_follow, i_requested: the one asking follows them, or has asked to)
create function public.profile_card(p_username text)
returns table (id uuid, username text, display_name text, avatar_key text, is_private boolean, i_follow boolean, i_requested boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_key, p.is_private,
         exists (select 1 from public.follows f where f.follower = (select auth.uid()) and f.followee = p.id),
         exists (select 1 from public.follow_requests r where r.requester = (select auth.uid()) and r.target = p.id)
  from public.profiles p where p.username = p_username and not p.hidden;
$$;

-- people by the start of their username (an @ in front is fine) or display name: up to 10, exact username first
create function public.find_people(q text)
returns table (id uuid, username text, display_name text, avatar_key text, is_private boolean, i_follow boolean, i_requested boolean)
language sql stable security definer set search_path = '' as $$
  with t as (select lower(btrim(ltrim(btrim(coalesce(q, '')), '@'))) as w),
       pat as (select w, replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%' as l from t)
  select p.id, p.username, p.display_name, p.avatar_key, p.is_private,
         exists (select 1 from public.follows f where f.follower = (select auth.uid()) and f.followee = p.id),
         exists (select 1 from public.follow_requests r where r.requester = (select auth.uid()) and r.target = p.id)
  from public.profiles p, pat
  where char_length(pat.w) between 1 and 40 and not p.hidden and (p.username like pat.l or lower(p.display_name) like pat.l)
  order by p.username = pat.w desc, p.username
  limit 10;
$$;

-- someone's followers ('followers') or who they follow ('following'), 30 at a time, newest first: for a public
-- profile, your own, or a private one you follow. The people in it can be private: photo, name and username only.
create function public.follow_list(uid uuid, kind text, before timestamptz default null, before_id uuid default null, n int default 30)
returns table (id uuid, username text, display_name text, avatar_key text, is_private boolean, followed_at timestamptz, i_follow boolean, i_requested boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_key, p.is_private, f.created_at,
         exists (select 1 from public.follows m where m.follower = (select auth.uid()) and m.followee = p.id),
         exists (select 1 from public.follow_requests r where r.requester = (select auth.uid()) and r.target = p.id)
  from public.follows f join public.profiles p on p.id = case when kind = 'followers' then f.follower else f.followee end
  where kind in ('followers', 'following')
    and (public.profile_is_public(uid) or uid = (select auth.uid()) or public.approved_follower_of(uid))
    and case when kind = 'followers' then f.followee = uid else f.follower = uid end
    and not p.hidden
    and (before is null or (f.created_at, p.id) < (before, coalesce(before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by f.created_at desc, p.id desc
  limit least(greatest(coalesce(n, 30), 1), 50);
$$;

-- FOLLOWERS and FOLLOWING for a public profile, your own, or a private one you follow
create function public.follow_stats(uid uuid) returns table (followers bigint, following bigint)
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.follows f join public.profiles p on p.id = f.follower where f.followee = uid and not p.hidden),
         (select count(*) from public.follows f join public.profiles p on p.id = f.followee where f.follower = uid and not p.hidden)
  where public.profile_is_public(uid) or uid = (select auth.uid()) or public.approved_follower_of(uid);
$$;

-- the requests waiting for you, 30 at a time, newest first
create function public.request_list(before timestamptz default null, before_id uuid default null, n int default 30)
returns table (id uuid, username text, display_name text, avatar_key text, is_private boolean, requested_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_key, p.is_private, r.created_at
  from public.follow_requests r join public.profiles p on p.id = r.requester
  where r.target = (select auth.uid()) and not p.hidden
    and (before is null or (r.created_at, p.id) < (before, coalesce(before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by r.created_at desc, p.id desc
  limit least(greatest(coalesce(n, 30), 1), 50);
$$;

revoke execute on function public.feed(text, timestamptz, uuid, int), public.profile_card(text), public.find_people(text),
  public.follow_list(uuid, text, timestamptz, uuid, int), public.follow_stats(uuid) from public;
grant execute on function public.feed(text, timestamptz, uuid, int), public.profile_card(text), public.find_people(text),
  public.follow_list(uuid, text, timestamptz, uuid, int), public.follow_stats(uuid) to anon, authenticated;
revoke execute on function public.follow(uuid), public.unfollow(uuid), public.answer_request(uuid, boolean),
  public.request_list(timestamptz, uuid, int) from public, anon;
grant execute on function public.follow(uuid), public.unfollow(uuid), public.answer_request(uuid, boolean),
  public.request_list(timestamptz, uuid, int) to authenticated;

-- search by the start of a name
create index profiles_username_prefix on public.profiles (username text_pattern_ops);
create index profiles_display_name_prefix on public.profiles (lower(display_name) text_pattern_ops);

commit;
