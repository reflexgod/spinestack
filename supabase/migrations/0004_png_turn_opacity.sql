-- Spinestack: a PNG on the wall can be turned and made see-through.
-- Run once, after 0002, in the Supabase dashboard: SQL Editor -> New query -> paste all of this -> Run.
-- Then run supabase/tests/rls_phase2.sql again; its last line says "ALL PHASE 2 CHECKS PASSED".
-- It all runs in one transaction: if anything fails, nothing is changed.
--
-- What changes: each PNG in shelves.pro.wall_items may also carry
--   rot      its turn in degrees, clockwise, -180 to 180 (left out when it's straight)
--   opacity  0.1 to 1 (left out when it's 1)
-- so an item is {key, x, y, w} as before, or {key, x, y, w, rot, opacity}. Shelves saved before this stay valid.
-- Only check_shelf_pro() is replaced; the rest of it is as in 0002, and its trigger and grants stay as they are.

begin;

create or replace function public.check_shelf_pro() returns trigger
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
    -- each PNG is {key, x, y, w}, and rot and opacity when it has them, all of the right kind (checked one by one,
    -- so nothing is cast before it's known to be a number)
    if jsonb_typeof(it) <> 'object'
       or exists (select 1 from jsonb_object_keys(it) k where k not in ('key', 'x', 'y', 'w', 'rot', 'opacity'))
       or jsonb_typeof(it -> 'key') is distinct from 'string' or jsonb_typeof(it -> 'x') is distinct from 'number'
       or jsonb_typeof(it -> 'y') is distinct from 'number' or jsonb_typeof(it -> 'w') is distinct from 'number'
       or (it ? 'rot' and jsonb_typeof(it -> 'rot') <> 'number')
       or (it ? 'opacity' and jsonb_typeof(it -> 'opacity') <> 'number') then
      raise exception '%', bad using errcode = '23514';
    end if;
    if not starts_with(it ->> 'key', own) or it ->> 'key' !~ '^[0-9a-f-]{36}/png/[0-9a-f]{32}$'
       or (it ->> 'x')::numeric not between 0 and 1 or (it ->> 'y')::numeric not between 0 and 1
       or (it ->> 'w')::numeric not between 0.02 and 2
       or coalesce((it ->> 'rot')::numeric, 0) not between -180 and 180
       or coalesce((it ->> 'opacity')::numeric, 1) not between 0.1 and 1 then
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

commit;
