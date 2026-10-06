-- shelfstackd, 0012: profile badges.
--
-- Run once, after 0011, in the Supabase dashboard (SQL Editor -> New query -> paste all of this -> Run), then run its
-- test, supabase/tests/rls_phase9.sql: the last line says "ALL 0012 CHECKS PASSED". It all runs in one transaction: if
-- anything fails, nothing is changed. It was run on the live database by the owner and its test passed.
--
-- The pages work without it: badges.js knows the Founder (@viraaj) and, for Early 100, the usernames of the people on
-- the live site when it was written (EARLY in badges.js). Deciding the first 100 by signup order needs the database,
-- because a private profile can't be read from a page (and its created_at isn't on its card).
--
-- What changes (additive: one new table, one index, one function; nothing existing is changed or dropped):
--   * badges: a badge given to a profile by hand (owner, badge id such as 'founder'). Nobody can read or write the
--     table from a page; badges are given here, in the SQL Editor, and read through badges_of().
--   * badges_of(names): for up to 200 usernames, each one's badges, the given ones and 'early-100' for the first 100
--     profiles by signup order (created_at, then id), most important first (founder, then early-100, then the rest by
--     name). Anyone may call it, signed in or not; a profile hidden by moderation has none. A private profile's badges
--     show on its card, as its name and photo do.
--   * an index on profiles (created_at, id), so the first 100 are read in order without a scan.
--   * @viraaj is given 'founder'.

begin;

create table public.badges (
  owner uuid not null references public.profiles (id) on delete cascade,
  badge text not null check (badge ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  created_at timestamptz not null default now(),
  primary key (owner, badge)
);
alter table public.badges enable row level security;   -- no policies: only badges_of() reads it, only the SQL Editor writes it
revoke all on public.badges from anon, authenticated;

create index if not exists profiles_signup_order on public.profiles (created_at, id);

create or replace function public.badges_of(names text[])
returns table (username text, badges text[])
language sql stable security definer set search_path = '' as $$
  with asked as (
    select distinct lower(n) as n from (select unnest(coalesce(names, '{}'::text[])) as n limit 200) a
  ), first100 as (
    select p.id from public.profiles p order by p.created_at, p.id limit 100
  )
  select p.username,
    array(
      select x.badge from (
        select b.badge, case b.badge when 'founder' then 0 else 2 end as o from public.badges b where b.owner = p.id and b.badge <> 'early-100'
        union all
        select 'early-100', 1 where p.id in (select id from first100)
      ) x order by x.o, x.badge
    )
  from public.profiles p join asked on p.username = asked.n
  where not p.hidden;
$$;
revoke all on function public.badges_of(text[]) from public;
grant execute on function public.badges_of(text[]) to anon, authenticated;

insert into public.badges (owner, badge) select id, 'founder' from public.profiles where username = 'viraaj' on conflict do nothing;

commit;
