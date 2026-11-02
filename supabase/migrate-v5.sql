-- Walkies v5: a place to keep a photo the app found by itself.
-- ALREADY APPLIED to the Lao-holiday project. Kept as the record.
-- Nothing fills this in yet; see supabase/functions/preview for why.

-- null = never looked, '' = looked and found nothing, otherwise the image URL.
alter table ideas add column if not exists auto_photo text;

create or replace function set_auto_photo(p_idea uuid, p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare r ideas%rowtype;
begin
  select * into r from ideas where id = p_idea;
  if not found then return; end if;
  if not is_member(r.trip_id) then raise exception 'You are not in this trip.'; end if;
  -- No activity line: this is the app tidying up, not a person doing something.
  update ideas set auto_photo = coalesce(p_url, '') where id = p_idea;
end $$;

grant execute on function set_auto_photo(uuid, text) to authenticated;
