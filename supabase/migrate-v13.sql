-- v13: ideas follow their stop when the plan changes, and "Back to ideas".
--
-- Removing or reordering stops renumbers every later day, and the ideas kept
-- their old numbers: a Kyoto idea ended up on an Osaka day, and one at a
-- removed stop vanished from Ideas (grouped by stop) while still showing on
-- its old day. Now set_trip_plan moves each idea with its stop:
--   * the same day of the same stop (the 2nd Tokyo day stays the 2nd Tokyo day);
--   * a removed stop's ideas go to the nearest remaining stop within 150 km,
--     when the idea has a pin; otherwise they keep their stop name and the app
--     shows them under "No stop";
--   * anything that no longer fits comes off its day (plans stay planned, with
--     no day) rather than sitting on the wrong city's day.

-- Every stop's first day and length, from a plan (the sample plan when empty)
create or replace function plan_ranges(p_stops jsonb)
returns table(name text, first_day int, days int, lat float8, lng float8)
language sql immutable set search_path = public as $$
  with s as (
    select coalesce(nullif(p_stops, '[]'::jsonb),
      '[{"name":"Tokyo","days":4},{"name":"Kyoto","days":3},{"name":"Kawaguchiko","days":2},
        {"name":"Hoi An","days":5},{"name":"Ha Long","days":4}]'::jsonb) as j
  ), e as (
    select x->>'name' as name, greatest(1, coalesce((x->>'days')::int, 1)) as days,
           nullif(x->>'lat', '')::float8 as lat, nullif(x->>'lng', '')::float8 as lng, o
    from s, jsonb_array_elements(s.j) with ordinality as a(x, o)
  )
  select name, (sum(days) over (order by o) - days + 1)::int, days, lat, lng from e order by o;
$$;

create or replace function rehome_ideas(p_trip uuid, p_old jsonb, p_new jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r ideas%rowtype; idx int; ns text; nd int; o record; n record; moved int := 0;
begin
  for r in select * from ideas where trip_id = p_trip and status <> 'removed' loop
    -- where it sat in its old stop (0 = its stop's first day)
    select * into o from plan_ranges(p_old) where name = r.stop limit 1;
    idx := case when r.day > 0 and o.name is not null and r.day between o.first_day and o.first_day + o.days - 1
                then r.day - o.first_day end;
    -- its stop now: the same name, else the nearest stop with a pin, within 150 km
    ns := r.stop;
    if not exists (select 1 from plan_ranges(p_new) where name = r.stop) and r.lat is not null then
      select q.name into ns from plan_ranges(p_new) q
        where q.lat is not null
          and 6371 * sqrt(power(radians(q.lat - r.lat), 2) + power(radians(q.lng - r.lng) * cos(radians((q.lat + r.lat) / 2)), 2)) <= 150
        order by power(q.lat - r.lat, 2) + power((q.lng - r.lng) * cos(radians((q.lat + r.lat) / 2)), 2) limit 1;
      ns := coalesce(ns, r.stop);
    end if;
    select * into n from plan_ranges(p_new) where name = ns limit 1;
    nd := case when idx is not null and n.name is not null and idx < n.days then n.first_day + idx else 0 end;
    if nd = 0 and r.day > 0 and idx is null and n.name is not null
       and r.day between n.first_day and n.first_day + n.days - 1 then nd := r.day; end if;   -- already on one of its days
    if ns is distinct from r.stop or nd <> r.day then
      update ideas set stop = ns, day = nd, updated_at = now() where id = r.id;
      moved := moved + 1;
    end if;
  end loop;
  return moved;
end $$;
revoke all on function rehome_ideas(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function plan_ranges(jsonb) from public, anon;

create or replace function set_trip_plan(p_trip uuid, p_start date, p_stops jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare total int; s jsonb; who text; old jsonb; moved int;
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

  select stops into old from trips where id = p_trip;
  update trips set start_date = p_start, stops = p_stops where id = p_trip;
  moved := rehome_ideas(p_trip, old, p_stops);

  select display_name into who from trip_members where trip_id = p_trip and user_id = auth.uid();
  perform log_activity(p_trip, coalesce(who, 'Someone') || ' set the trip to '
    || total || ' days from ' || to_char(p_start, 'DD Mon YYYY')
    || case when moved > 0 then '; ' || moved || case when moved = 1 then ' idea moved' else ' ideas moved' end || ' with its stop' else '' end);
end $$;

-- Back to ideas: a planned idea returns to the pool, unplanned, no day.
create or replace function unplan_idea(p_idea uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r ideas%rowtype; who text;
begin
  select * into r from ideas where id = p_idea;
  if not found then raise exception 'That idea is gone.'; end if;
  if not is_member(r.trip_id) then raise exception 'You are not in this trip.'; end if;
  if r.status <> 'approved' then raise exception 'It is not planned.'; end if;
  if r.booked then raise exception 'This is booked. Cancel the booking first, then move it.'; end if;
  update ideas set status = 'suggested', day = 0, start_time = null, updated_at = now() where id = p_idea;
  select display_name into who from trip_members where trip_id = r.trip_id and user_id = auth.uid();
  perform log_activity(r.trip_id, coalesce(who, 'Someone') || ' moved "' || r.title || '" back to ideas');
end $$;
revoke all on function unplan_idea(uuid) from public, anon;
grant execute on function unplan_idea(uuid) to authenticated;
