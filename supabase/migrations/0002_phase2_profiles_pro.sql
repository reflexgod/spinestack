-- Spinestack, phase 2: profiles, public shelves, Pro, reports.
-- Run once, after 0001, in the Supabase dashboard: SQL Editor -> New query -> paste all of this -> Run.
-- Then run supabase/tests/rls_phase2.sql; its last line says "ALL PHASE 2 CHECKS PASSED".
-- It all runs in one transaction: if anything fails, nothing is changed.
--
-- What changes:
--   * a profile gets a display name, a bio, a photo and a pinned shelf, and anyone can read it unless it's private
--   * anyone can read a shelf and its spines when the shelf is public (the default) and its profile isn't private
--   * a shelf holds 6 spines, or 20 with Pro; a Pro shelf keeps its wall, PNGs, floating shelf and shelf colour in `pro`
--   * reports, which only admins can read
-- Pictures (profile photos, walls, PNGs) are in the Worker's R2 bucket. Rows only point at them, with keys like
-- <user id>/avatar/<32 hex>, <user id>/wall/<32 hex>, <user id>/png/<32 hex>.

begin;

-- ---------- Pro ----------
-- The paywall switch. Its twin is SHELFSTACKD_PRO_REQUIRED in index.html: flip both together.
-- While it's false, everyone gets Pro.
create table public.app_config (
  id boolean primary key default true check (id),     -- one row only
  pro_required boolean not null default false
);
alter table public.app_config enable row level security;   -- no policies: read only through is_pro()
insert into public.app_config (id) values (true);

alter table public.profiles add column is_pro boolean not null default false;   -- for payments later; never set from the page

create function public.is_pro(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not coalesce((select c.pro_required from public.app_config c), false)
      or coalesce((select p.is_pro from public.profiles p where p.id = uid), false);
$$;
revoke execute on function public.is_pro(uuid) from public, anon, authenticated;

-- "am I Pro?" for the page and the Worker
create function public.am_i_pro() returns boolean
language sql stable security definer set search_path = '' as $$ select public.is_pro(auth.uid()); $$;
revoke execute on function public.am_i_pro() from public, anon;
grant execute on function public.am_i_pro() to authenticated;

-- ---------- profiles: name, bio, photo, pinned shelf ----------
alter table public.profiles
  add column display_name text not null default '' check (char_length(display_name) <= 40),
  add column bio text not null default '' check (char_length(bio) <= 160),
  add column avatar_key text check (avatar_key ~ '^[0-9a-f-]{36}/avatar/[0-9a-f]{32}$' and starts_with(avatar_key, id::text || '/')),
  add column pinned_shelf_id uuid references public.shelves (id) on delete set null;

-- only one of your own public shelves can be pinned
create function public.check_pin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.pinned_shelf_id is not null and not exists (
    select 1 from public.shelves s where s.id = new.pinned_shelf_id and s.owner = new.id and s.is_public) then
    raise exception 'Pin one of your own public shelves.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.check_pin() from public, anon, authenticated;
create trigger profiles_pin before insert or update of pinned_shelf_id on public.profiles
  for each row execute function public.check_pin();

-- ---------- shelves: Pro settings ----------
-- {wall_key, shelf_colour, plank, wall_items: [{key, x, y, w}]}: x and y are the middle of the PNG and w its width,
-- as fractions of the 1080 x 1920 story. No limit on how many PNGs; 32 KB of settings is room for a few hundred.
alter table public.shelves add column pro jsonb not null default '{}'::jsonb
  check (jsonb_typeof(pro) = 'object' and pg_column_size(pro) <= 32768);

create function public.check_shelf_pro() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p jsonb := new.pro;
  own text := new.owner::text || '/';
  it jsonb;
  bad text := 'Those shelf settings aren''t valid.';
begin
  if exists (select 1 from jsonb_object_keys(p) k where k not in ('wall_key', 'shelf_colour', 'plank', 'wall_items')) then
    raise exception '%', bad using errcode = '23514';
  end if;
  if coalesce(jsonb_typeof(p -> 'wall_key'), 'null') <> 'null'
     and (jsonb_typeof(p -> 'wall_key') <> 'string' or not starts_with(p ->> 'wall_key', own) or p ->> 'wall_key' !~ '^[0-9a-f-]{36}/wall/[0-9a-f]{32}$') then
    raise exception '%', bad using errcode = '23514';
  end if;
  if coalesce(jsonb_typeof(p -> 'shelf_colour'), 'null') <> 'null'
     and (jsonb_typeof(p -> 'shelf_colour') <> 'string' or p ->> 'shelf_colour' !~ '^#[0-9A-Fa-f]{6}$') then
    raise exception '%', bad using errcode = '23514';
  end if;
  if coalesce(jsonb_typeof(p -> 'plank'), 'null') not in ('null', 'boolean') then
    raise exception '%', bad using errcode = '23514';
  end if;
  if coalesce(jsonb_typeof(p -> 'wall_items'), 'null') not in ('null', 'array') then
    raise exception '%', bad using errcode = '23514';
  end if;
  for it in select e from jsonb_array_elements(coalesce(nullif(p -> 'wall_items', 'null'::jsonb), '[]'::jsonb)) e loop
    -- each PNG is exactly {key, x, y, w}, all four of the right kind (checked one by one, so nothing is cast before it's known to be a number)
    if jsonb_typeof(it) <> 'object' or (select count(*) from jsonb_object_keys(it)) <> 4
       or jsonb_typeof(it -> 'key') is distinct from 'string' or jsonb_typeof(it -> 'x') is distinct from 'number'
       or jsonb_typeof(it -> 'y') is distinct from 'number' or jsonb_typeof(it -> 'w') is distinct from 'number' then
      raise exception '%', bad using errcode = '23514';
    end if;
    if not starts_with(it ->> 'key', own) or it ->> 'key' !~ '^[0-9a-f-]{36}/png/[0-9a-f]{32}$'
       or (it ->> 'x')::numeric not between 0 and 1 or (it ->> 'y')::numeric not between 0 and 1
       or (it ->> 'w')::numeric not between 0.02 and 2 then
      raise exception '%', bad using errcode = '23514';
    end if;
  end loop;
  -- walls, PNGs, the floating shelf and its colour are Pro
  if not public.is_pro(new.owner) and (
       coalesce(jsonb_typeof(p -> 'wall_key'), 'null') <> 'null'
    or jsonb_array_length(coalesce(nullif(p -> 'wall_items', 'null'::jsonb), '[]'::jsonb)) > 0
    or coalesce((p ->> 'plank')::boolean, false)
    or coalesce(jsonb_typeof(p -> 'shelf_colour'), 'null') <> 'null') then
    raise exception 'Your own wall, PNGs and the floating shelf come with Pro.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.check_shelf_pro() from public, anon, authenticated;
create trigger shelves_pro before insert or update of pro on public.shelves
  for each row execute function public.check_shelf_pro();

-- a shelf made private can't stay pinned
create function public.shelves_unpin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set pinned_shelf_id = null where id = new.owner and pinned_shelf_id = new.id;
  return null;
end $$;
revoke execute on function public.shelves_unpin() from public, anon, authenticated;
create trigger shelves_unpin after update of is_public on public.shelves
  for each row when (old.is_public and not new.is_public) execute function public.shelves_unpin();

-- ---------- shelf_items: 6 spines, or 20 with Pro ----------
alter table public.shelf_items drop constraint shelf_items_position_check;
alter table public.shelf_items add constraint shelf_items_position_check check (position between 0 and 19);

create function public.shelf_items_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.position >= (select case when public.is_pro(s.owner) then 20 else 6 end from public.shelves s where s.id = new.shelf_id) then
    raise exception 'Free shelves hold 6 spines. Pro holds 20.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.shelf_items_limit() from public, anon, authenticated;
create trigger shelf_items_limit before insert or update on public.shelf_items
  for each row execute function public.shelf_items_limit();

-- save a whole shelf in one step (as in 0001, now with the Pro settings; the 6 / 20 limit is the trigger above)
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
  insert into public.shelf_items (shelf_id, position, item_id, kind, title, author, year, spine_src, cover_src, look)
  select sid, (ord - 1)::smallint, i ->> 'item_id', i ->> 'kind', coalesce(i ->> 'title', ''), coalesce(i ->> 'author', ''),
         nullif(i ->> 'year', '')::smallint, i ->> 'spine_src', i ->> 'cover_src', coalesce(i -> 'look', '{}'::jsonb)
  from jsonb_array_elements(items) with ordinality as t (i, ord);
  return sid;
end $$;
revoke execute on function public.save_shelf(jsonb, jsonb) from public, anon;
grant execute on function public.save_shelf(jsonb, jsonb) to authenticated;

-- ---------- who can see what ----------
-- A profile is public unless it's private (or hidden by moderation). A shelf is public when it's marked public
-- and its profile is public. Private shelves show to their owner only: never on a profile, a feed or to anyone else.
create function public.profile_is_public(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = uid and not p.hidden and not p.is_private);
$$;
create function public.shelf_is_public(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shelves s where s.id = sid and s.is_public and not s.hidden and public.profile_is_public(s.owner));
$$;
revoke execute on function public.profile_is_public(uuid), public.shelf_is_public(uuid) from public;
grant execute on function public.profile_is_public(uuid), public.shelf_is_public(uuid) to anon, authenticated;

create policy "profiles: read public" on public.profiles for select to anon, authenticated using (not hidden and not is_private);
create policy "shelves: read public" on public.shelves for select to anon, authenticated using (is_public and not hidden and public.profile_is_public(owner));
create policy "items: read public" on public.shelf_items for select to anon, authenticated using (public.shelf_is_public(shelf_id));

-- visitors see these profile columns only (not the moderation flag, Pro, or the dates behind sign-up)
revoke select on public.profiles from anon, authenticated;
grant select (id, username, display_name, bio, avatar_key, pinned_shelf_id, is_private, created_at) on public.profiles to anon, authenticated;
grant update (display_name, bio, avatar_key, pinned_shelf_id) on public.profiles to authenticated;   -- username, is_private: since 0001
grant select on public.shelves, public.shelf_items to anon;
grant insert (pro) on public.shelves to authenticated;
grant update (pro) on public.shelves to authenticated;

-- ---------- what a profile page shows ----------
-- the SHELVES and SPINES numbers: public shelves only, the same for the owner as for visitors
create function public.profile_stats(uid uuid) returns table (shelf_count bigint, spine_count bigint)
language sql stable security invoker set search_path = '' as $$
  select count(distinct s.id), count(i.shelf_id)
  from public.shelves s left join public.shelf_items i on i.shelf_id = s.id
  where s.owner = uid and s.is_public and not s.hidden;
$$;
-- MOST SHELVED: the 6 titles on most of this person's public shelves, each with one of its spines to draw
create function public.most_shelved(uid uuid) returns table (item_id text, kind text, title text, author text, year smallint,
  spine_src text, cover_src text, look jsonb, on_shelves bigint)
language sql stable security invoker set search_path = '' as $$
  with v as (
    select i.item_id, i.kind, i.title, i.author, i.year, i.spine_src, i.cover_src, i.look, i.shelf_id, s.updated_at,
           i.kind || ':' || lower(btrim(regexp_replace(i.title, '\s+', ' ', 'g'))) as k
    from public.shelf_items i join public.shelves s on s.id = i.shelf_id
    where s.owner = uid and s.is_public and not s.hidden and btrim(i.title) <> ''
  ), n as (select v.k, count(distinct v.shelf_id) as on_shelves, max(v.updated_at) as last from v group by v.k),
  one as (select distinct on (v.k) v.* from v order by v.k, v.updated_at desc)
  select one.item_id, one.kind, one.title, one.author, one.year, one.spine_src, one.cover_src, one.look, n.on_shelves
  from one join n on n.k = one.k
  order by n.on_shelves desc, n.last desc, one.title
  limit 6;
$$;
revoke execute on function public.profile_stats(uuid), public.most_shelved(uuid) from public;
grant execute on function public.profile_stats(uuid), public.most_shelved(uuid) to anon, authenticated;

-- for the Worker, before it deletes a picture: is it still the caller's photo, or on one of their shelves?
create function public.media_in_use(k text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.shelves s where s.owner = (select auth.uid())
                   and (s.pro ->> 'wall_key' = k or coalesce(s.pro -> 'wall_items', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('key', k))))
      or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.avatar_key = k);
$$;
revoke execute on function public.media_in_use(text) from public, anon;
grant execute on function public.media_in_use(text) to authenticated;

-- ---------- reports: anyone signed in can send one, only admins read them ----------
create table public.admins (user_id uuid primary key references auth.users (id) on delete cascade);
alter table public.admins enable row level security;   -- no policies: only is_admin() reads it
-- add yourself once, in the SQL Editor:  insert into public.admins (user_id) select id from auth.users where email = '<your sign-in email>';

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid default auth.uid() references public.profiles (id) on delete set null,
  target_type text not null check (target_type in ('profile', 'shelf')),
  target_id uuid not null,
  reason text not null default '' check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  unique (reporter, target_type, target_id)              -- one report per person per profile or shelf
);
alter table public.reports enable row level security;
create index reports_new on public.reports (created_at desc);

-- the thing reported must exist, and 20 reports a day per person is plenty
create function public.reports_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := now();
  if (new.target_type = 'profile' and not exists (select 1 from public.profiles p where p.id = new.target_id))
     or (new.target_type = 'shelf' and not exists (select 1 from public.shelves s where s.id = new.target_id)) then
    raise exception 'There''s nothing there to report.' using errcode = '23514';
  end if;
  if (select count(*) from public.reports r where r.reporter = new.reporter and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'That''s a lot of reports for one day. Try again tomorrow.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.reports_before_insert() from public, anon, authenticated;
create trigger reports_before_insert before insert on public.reports
  for each row execute function public.reports_before_insert();

create policy "reports: send own" on public.reports for insert to authenticated with check (reporter = (select auth.uid()));
create policy "reports: admins read" on public.reports for select to authenticated using ((select public.is_admin()));

-- the list for admin.html, with names instead of ids
create function public.admin_reports() returns table (report_id uuid, reported_at timestamptz, reporter_name text,
  target_type text, target_id uuid, target_label text, target_user text, reason text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'Admins only.' using errcode = '42501'; end if;
  return query
    select r.id, r.created_at, rp.username, r.target_type, r.target_id,
           case when r.target_type = 'profile' then tp.username else s.caption end,
           coalesce(tp.username, so.username), r.reason
    from public.reports r
    left join public.profiles rp on rp.id = r.reporter
    left join public.profiles tp on r.target_type = 'profile' and tp.id = r.target_id
    left join public.shelves s on r.target_type = 'shelf' and s.id = r.target_id
    left join public.profiles so on so.id = s.owner
    order by r.created_at desc
    limit 200;
end $$;
revoke execute on function public.admin_reports() from public, anon;
grant execute on function public.admin_reports() to authenticated;

-- ---------- what the Data API may touch in the new tables (nothing else) ----------
revoke all on public.app_config, public.admins, public.reports from anon, authenticated;
grant insert (target_type, target_id, reason) on public.reports to authenticated;
grant select on public.reports to authenticated;       -- rows: admins only (policy above)

commit;
