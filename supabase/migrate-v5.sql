-- Walkies v5: a place to keep a photo the app found by itself.
-- ALREADY APPLIED to the Lao-holiday project. Kept as the record.
-- Filled in from Wikipedia by supabase/functions/preview, once per idea.

-- null = never looked, '' = looked and found nothing, otherwise the image URL.
alter table ideas add column if not exists auto_photo text;
alter table ideas add column if not exists auto_credit text not null default '';

create or replace function set_auto_photo(p_idea uuid, p_url text, p_credit text) returns void
language plpgsql security definer set search_path = public as $$
declare r ideas%rowtype;
begin
  select * into r from ideas where id = p_idea;
  if not found then return; end if;
  if not is_member(r.trip_id) then raise exception 'You are not in this trip.'; end if;
  -- No activity line: the app looked something up, a person did not do anything.
  update ideas
    set auto_photo = coalesce(p_url, ''), auto_credit = coalesce(p_credit, '')
    where id = p_idea;
end $$;

grant execute on function set_auto_photo(uuid, text, text) to authenticated;
