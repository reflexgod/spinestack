-- Spinestack: a shelf's own name, apart from the caption drawn on its story.
-- Run once, after 0004, in the Supabase dashboard: SQL Editor -> New query -> paste all of this -> Run.
-- Then run supabase/tests/rls_phase2.sql again; its last line says "ALL PHASE 2 CHECKS PASSED".
-- It all runs in one transaction: if anything fails, nothing is changed.
--
-- What changes:
--   * shelves.name: null until the shelf is renamed on the profile, and the name shown is then its caption (or
--     "untitled shelf" while the caption is still the builder's first one); '' means renamed to nothing, shown as
--     "untitled shelf". Up to 60 characters. Saving the shelf in the builder leaves it as it is.
--   * renaming a shelf doesn't count as changing it: its date (updated_at) stays, so it keeps its place in the lists.
--     That's the trigger from 0001, replaced here with the same thing plus that one case.

begin;

alter table public.shelves add column name text check (name is null or char_length(name) <= 60);
grant update (name) on public.shelves to authenticated;   -- the owner only: RLS "shelves: change own" (0001)

create or replace function public.shelves_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.shelves s where s.owner = new.owner) >= 200 then
      raise exception 'You have 200 shelves, the most an account can keep. Delete one first.' using errcode = 'P0001';
    end if;
    new.created_at := now();
  end if;
  -- only the name changed: a rename, which keeps the shelf's date
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'name' - 'updated_at') = (to_jsonb(old) - 'name' - 'updated_at') then
    new.updated_at := old.updated_at;
    return new;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.shelves_before_write() from public, anon, authenticated;

commit;
