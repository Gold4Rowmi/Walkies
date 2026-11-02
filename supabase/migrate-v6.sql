-- Walkies v6: the trip's dates and stops live in the trip, not in the code.
-- ALREADY APPLIED to the Lao-holiday project. Kept as the record.
--
-- stops: [{name, days, zone, lat, lng}] in order. Day 1 is start_date.
-- A trip with no stops set falls back to the built-in list in app.js.

alter table trips add column if not exists start_date date;
alter table trips add column if not exists stops jsonb not null default '[]'::jsonb;

create or replace function set_trip_plan(p_trip uuid, p_start date, p_stops jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare total int; s jsonb; who text;
begin
  if not is_owner(p_trip) then raise exception 'Only the owner sets the dates and stops.'; end if;
  if p_start is null then raise exception 'Pick the first day of the trip.'; end if;
  if jsonb_typeof(p_stops) <> 'array' or jsonb_array_length(p_stops) = 0 then
    raise exception 'Add at least one stop.';
  end if;
  if jsonb_array_length(p_stops) > 30 then raise exception 'That is more stops than this handles.'; end if;

  total := 0;
  for s in select * from jsonb_array_elements(p_stops) loop
    if coalesce(trim(s->>'name'), '') = '' then raise exception 'Every stop needs a name.'; end if;
    if coalesce((s->>'days')::int, 0) < 1 then raise exception 'Every stop needs at least one day.'; end if;
    total := total + (s->>'days')::int;
  end loop;
  if total > 365 then raise exception 'That is a longer trip than this handles.'; end if;

  update trips set start_date = p_start, stops = p_stops where id = p_trip;

  select display_name into who from trip_members where trip_id = p_trip and user_id = auth.uid();
  perform log_activity(p_trip, coalesce(who, 'Someone') || ' set the trip to '
    || total || ' days from ' || to_char(p_start, 'DD Mon YYYY'));
end $$;

grant execute on function set_trip_plan(uuid, date, jsonb) to authenticated;
