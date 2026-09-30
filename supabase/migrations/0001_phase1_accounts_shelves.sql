-- Spinestack, phase 1: accounts (profiles) and saved shelves.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste all of this -> Run.
--
-- Only small text rows live here. Spine images stay in the Cloudflare Worker: a shelf item points at them
-- (a:<archive id>, u:<user id>/<sha-256>, or url:<TMDB / Open Library cover>).
--
-- Every table has Row Level Security on, and nothing is granted to the Data API roles (anon, authenticated)
-- except what is written out below. In phase 1 everything is private to its owner; public profiles and shelves
-- come in phase 2.

-- ---------- profiles: one per account ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  is_private boolean not null default false,          -- phase 2: "only me"
  hidden boolean not null default false,              -- phase 4: set by moderation only
  adult_confirmed_at timestamptz not null default now(),   -- ticked "I'm 18 or older" (the row can't exist without it)
  created_at timestamptz not null default now(),
  username_changed_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- names nobody can take
create table public.reserved_usernames (name text primary key);
alter table public.reserved_usernames enable row level security;   -- no policies: only the functions below read it
insert into public.reserved_usernames (name) values
  ('admin'), ('administrator'), ('api'), ('u'), ('www'), ('app'), ('root'), ('support'), ('help'), ('about'),
  ('privacy'), ('terms'), ('settings'), ('login'), ('logout'), ('signin'), ('signout'), ('signup'), ('auth'),
  ('feed'), ('explore'), ('search'), ('shelf'), ('shelves'), ('spinestack'), ('shelfstackd'), ('moderator'),
  ('mod'), ('mods'), ('staff'), ('official'), ('null'), ('undefined'), ('me'), ('you'), ('account'), ('delete'),
  ('report'), ('security'), ('system'), ('team'), ('owner'), ('everyone'), ('anonymous');

-- the reserved list, and a new username at most once every 30 days
create function public.check_username() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.username = old.username then return new; end if;
  if exists (select 1 from public.reserved_usernames r where r.name = new.username) then
    raise exception 'That username is taken.' using errcode = '23505';
  end if;
  if tg_op = 'UPDATE' then
    if old.username_changed_at > now() - interval '30 days' then
      raise exception 'You can change your username once every 30 days.' using errcode = 'P0001';
    end if;
    new.username_changed_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.check_username() from public, anon, authenticated;
create trigger profiles_username before insert or update of username on public.profiles
  for each row execute function public.check_username();

-- "is this name free?" for the sign-up form (true/false only)
create function public.username_available(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select name ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from public.reserved_usernames r where r.name = username_available.name)
     and not exists (select 1 from public.profiles p where p.username = username_available.name);
$$;
revoke execute on function public.username_available(text) from public, anon;
grant execute on function public.username_available(text) to authenticated;

-- ---------- shelves ----------
create table public.shelves (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  caption text not null default '' check (char_length(caption) <= 60),
  filter text not null default 'clean' check (filter in ('clean', 'faded', 'glossy', 'grain', 'vhs', 'rental', 'library',
    'secondhand', 'cloth', 'flash', 'film', 'riso', 'xerox', 'night')),
  intensity smallint not null default 70 check (intensity between 0 and 100),
  background text not null default 'paper' check (background in ('paper', 'ink', 'blush', 'shelf', 'dark', 'forest')),
  wood boolean not null default false,
  layout text not null default 'row' check (layout in ('row', 'stack', 'covers')),
  varied boolean not null default true,
  is_public boolean not null default true,             -- phase 2
  hidden boolean not null default false,               -- phase 4: set by moderation only
  preview_key text check (preview_key ~ '^[0-9a-f-]{36}/p/[0-9a-f-]{36}$'),   -- the small preview image in the Worker
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.shelves enable row level security;
create index shelves_owner_updated on public.shelves (owner, updated_at desc);
create index shelves_public_new on public.shelves (created_at desc) where is_public and not hidden;   -- phase 2-3

-- keeps the database small on the free plan: 200 shelves an account
create function public.shelves_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.shelves s where s.owner = new.owner) >= 200 then
      raise exception 'You have 200 shelves, the most an account can keep. Delete one first.' using errcode = 'P0001';
    end if;
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.shelves_before_write() from public, anon, authenticated;
create trigger shelves_before_write before insert or update on public.shelves
  for each row execute function public.shelves_before_write();

-- ---------- shelf_items: up to 12 per shelf ----------
create table public.shelf_items (
  shelf_id uuid not null references public.shelves (id) on delete cascade,
  position smallint not null check (position between 0 and 11),
  item_id text not null check (item_id ~ '^[A-Za-z0-9_-]{1,40}$'),   -- seeds the filters, so a reopened shelf wears the same
  kind text not null check (kind in ('book', 'movie')),
  title text not null default '' check (char_length(title) <= 200),
  author text not null default '' check (char_length(author) <= 200),
  year smallint check (year between 1000 and 2100),
  spine_src text check (spine_src ~ '^(a:[a-f0-9]{1,32}|u:[0-9a-f-]{36}/[0-9a-f]{64})$'),
  cover_src text check (char_length(cover_src) <= 400 and cover_src ~ '^(u:[0-9a-f-]{36}/[0-9a-f]{64}|url:https://(image\.tmdb\.org|covers\.openlibrary\.org)/[^\s]+)$'),
  look jsonb not null default '{}' check (jsonb_typeof(look) = 'object' and pg_column_size(look) <= 1024),
  primary key (shelf_id, position)
);
alter table public.shelf_items enable row level security;

-- ---------- Row Level Security: phase 1, everything is its owner's alone ----------
create policy "profiles: read own" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles: create own" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles: change own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "shelves: read own" on public.shelves for select to authenticated using (owner = (select auth.uid()));
create policy "shelves: create own" on public.shelves for insert to authenticated with check (owner = (select auth.uid()));
create policy "shelves: change own" on public.shelves for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "shelves: delete own" on public.shelves for delete to authenticated using (owner = (select auth.uid()));

create policy "items: read own" on public.shelf_items for select to authenticated
  using (exists (select 1 from public.shelves s where s.id = shelf_id and s.owner = (select auth.uid())));
create policy "items: add to own" on public.shelf_items for insert to authenticated
  with check (exists (select 1 from public.shelves s where s.id = shelf_id and s.owner = (select auth.uid())));
create policy "items: delete from own" on public.shelf_items for delete to authenticated
  using (exists (select 1 from public.shelves s where s.id = shelf_id and s.owner = (select auth.uid())));

-- ---------- what the Data API may touch (nothing else) ----------
revoke all on public.profiles, public.reserved_usernames, public.shelves, public.shelf_items from anon, authenticated;
grant select on public.profiles to anon;             -- the Worker's daily keep-alive; RLS gives anon no rows yet
grant select on public.profiles to authenticated;
grant insert (id, username) on public.profiles to authenticated;              -- hidden, dates: never from the page
grant update (username, is_private) on public.profiles to authenticated;
grant select, delete on public.shelves to authenticated;
grant insert (id, caption, filter, intensity, background, wood, layout, varied, is_public, preview_key) on public.shelves to authenticated;
grant update (caption, filter, intensity, background, wood, layout, varied, is_public, preview_key) on public.shelves to authenticated;
grant select, insert, delete on public.shelf_items to authenticated;

-- ---------- save a whole shelf in one step ----------
-- Runs as the caller (security invoker), so every rule above still applies. Creates the shelf or updates it,
-- and replaces its items. Returns the shelf's id.
create function public.save_shelf(shelf jsonb, items jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare sid uuid := coalesce((shelf ->> 'id')::uuid, gen_random_uuid());
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 12 then
    raise exception 'A shelf holds up to 12 spines.' using errcode = 'P0001';
  end if;
  insert into public.shelves as s (id, caption, filter, intensity, background, wood, layout, varied, is_public, preview_key)
  values (sid, coalesce(shelf ->> 'caption', ''), coalesce(shelf ->> 'filter', 'clean'), coalesce((shelf ->> 'intensity')::smallint, 70),
          coalesce(shelf ->> 'background', 'paper'), coalesce((shelf ->> 'wood')::boolean, false), coalesce(shelf ->> 'layout', 'row'),
          coalesce((shelf ->> 'varied')::boolean, true), coalesce((shelf ->> 'is_public')::boolean, true), shelf ->> 'preview_key')
  on conflict (id) do update set caption = excluded.caption, filter = excluded.filter, intensity = excluded.intensity,
    background = excluded.background, wood = excluded.wood, layout = excluded.layout, varied = excluded.varied,
    is_public = excluded.is_public, preview_key = excluded.preview_key;
  delete from public.shelf_items where shelf_id = sid;
  insert into public.shelf_items (shelf_id, position, item_id, kind, title, author, year, spine_src, cover_src, look)
  select sid, (ord - 1)::smallint, i ->> 'item_id', i ->> 'kind', coalesce(i ->> 'title', ''), coalesce(i ->> 'author', ''),
         nullif(i ->> 'year', '')::smallint, i ->> 'spine_src', i ->> 'cover_src', coalesce(i -> 'look', '{}'::jsonb)
  from jsonb_array_elements(items) with ordinality as t (i, ord);
  return sid;
end $$;
revoke execute on function public.save_shelf(jsonb, jsonb) from public, anon;
grant execute on function public.save_shelf(jsonb, jsonb) to authenticated;
