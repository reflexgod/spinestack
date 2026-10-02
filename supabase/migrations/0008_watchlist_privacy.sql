-- shelfstackd, 0008: a watchlist is private until its owner makes it public.
--
-- Run once, after 0007, in the Supabase dashboard (SQL Editor -> New query -> paste all of this -> Run), then run its
-- test, supabase/tests/rls_phase5.sql. It all runs in one transaction: if anything fails, nothing is changed.
-- It was run on the live database on 2 October 2026 and its test passed. Before it, a watchlist was seen by whoever
-- could see the profile; the Watchlist tab has Make public / Make private once the database has it.
--
-- What it does:
--   * profiles.watchlist_public, false for everyone (so every watchlist turns private when this is run: tell people,
--     or set it true for the accounts that should stay as they were; see the end).
--   * The watchlist is read by its owner always; by anyone else only when its owner has made it public AND they could
--     see the profile (a public profile, or a private one they follow). A follower of a private profile no longer sees
--     a watchlist its owner hasn't made public.
--   * The owner changes it (Make public / Make private on their Watchlist tab), like is_private: their own row only.
--   * Nothing else changes: adding, removing, the cap of 6, Keep from From friends.
--
-- After it, supabase/tests/rls_phase4.sql makes D's watchlist public (watchlist_public = true) next to the line that
-- makes D private, so its follower check still sees it.
--
-- Checked on 2 October 2026 on a local Postgres 16 (a stand-in for Supabase's auth schema, then 0001 to 0007):
-- rls_phase3.sql and rls_phase4.sql passed, then this file ran with no errors and its test passed.

begin;

alter table public.profiles add column watchlist_public boolean not null default false;
grant select (watchlist_public) on public.profiles to anon, authenticated;
grant update (watchlist_public) on public.profiles to authenticated;   -- the owner only: RLS "profiles: change own" (0001)

-- whether someone's watchlist is public. Security definer, as profile_is_public() is: a private profile's row can't
-- be read by everyone who asks about it
create function public.watchlist_is_public(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.watchlist_public from public.profiles p where p.id = uid), false);
$$;
revoke execute on function public.watchlist_is_public(uuid) from public;
grant execute on function public.watchlist_is_public(uuid) to anon, authenticated;

drop policy "watchlist: read public" on public.watchlist;
drop policy "watchlist: read as follower" on public.watchlist;
create policy "watchlist: read public" on public.watchlist for select to anon, authenticated
  using (public.profile_is_public(owner) and public.watchlist_is_public(owner));
create policy "watchlist: read as follower" on public.watchlist for select to authenticated
  using (public.approved_follower_of(owner) and public.watchlist_is_public(owner));
-- "watchlist: read own" (0007) stays: the owner always sees theirs

commit;

-- To keep the watchlists that are there now as they are (seen as before) instead of turning them private:
--   update public.profiles set watchlist_public = true where id in (select distinct owner from public.watchlist);
--
-- Undo (back to 0007):
--   begin;
--   drop policy "watchlist: read public" on public.watchlist;
--   drop policy "watchlist: read as follower" on public.watchlist;
--   create policy "watchlist: read public" on public.watchlist for select to anon, authenticated using (public.profile_is_public(owner));
--   create policy "watchlist: read as follower" on public.watchlist for select to authenticated using (public.approved_follower_of(owner));
--   drop function public.watchlist_is_public(uuid);
--   alter table public.profiles drop column watchlist_public;
--   commit;
