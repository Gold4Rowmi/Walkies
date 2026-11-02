-- v8 (ALREADY APPLIED 2026-11-02): a day belongs to one stop, and the
-- database holds everyone to it, not just the app's drop-downs.
--
-- stop_of_day mirrors plan() in app.js: stops run in order, each for its
-- number of days (at least 1), from Day 1. With no plan set, the sample
-- plan the app falls back to. Travel (flights, transfers) is exempt,
-- because a travel day sits between two stops by nature.

create or replace function stop_of_day(p_trip uuid, p_day int) returns text
language sql stable security definer set search_path = public as $$
  with s as (
    select coalesce(nullif(t.stops, '[]'::jsonb),
      '[{"name":"Tokyo","days":4},{"name":"Kyoto","days":3},{"name":"Kawaguchiko","days":2},
        {"name":"Hoi An","days":5},{"name":"Ha Long","days":4}]'::jsonb) as j
    from trips t where t.id = p_trip
  ), e as (
    select x->>'name' as name,
           sum(greatest(1, coalesce((x->>'days')::int, 1))) over (order by o) as upto
    from s, jsonb_array_elements(s.j) with ordinality as a(x, o)
  )
  select name from e where p_day >= 1 and upto >= p_day order by upto limit 1;
$$;

create or replace function check_day(p_trip uuid, p_kind text, p_stop text, p_day int) returns void
language plpgsql stable security definer set search_path = public as $$
declare at text;
begin
  if coalesce(p_day, 0) = 0 or p_kind = 'travel' then return; end if;
  at := stop_of_day(p_trip, p_day);
  if at is null then raise exception 'Day % is not on the trip.', p_day; end if;
  if at is distinct from p_stop then
    raise exception 'Day % is in %, and this is in %. Pick a % day, or change its stop.', p_day, at, p_stop, p_stop;
  end if;
end $$;

-- A suggestion's hoped-for day, changed on its own without planning it.
create or replace function set_maybe_day(p_idea uuid, p_day int) returns void
language plpgsql security definer set search_path = public as $$
declare r ideas%rowtype; who text;
begin
  select * into r from ideas where id = p_idea;
  if not found then raise exception 'That idea is gone.'; end if;
  if not is_member(r.trip_id) then raise exception 'You are not in this trip.'; end if;
  if r.status <> 'suggested' then raise exception 'That is already planned. Use Save to move it.'; end if;
  perform check_day(r.trip_id, r.kind, r.stop, coalesce(p_day, 0));
  update ideas set day = coalesce(p_day, 0), updated_at = now() where id = p_idea;
  select display_name into who from trip_members where trip_id = r.trip_id and user_id = auth.uid();
  perform log_activity(r.trip_id, coalesce(who, 'Someone') || ' moved "' || r.title || '" to '
    || case when coalesce(p_day, 0) > 0 then 'maybe Day ' || p_day else 'any day' end);
end $$;
revoke all on function set_maybe_day(uuid, int) from public, anon;
grant execute on function set_maybe_day(uuid, int) to authenticated;
revoke all on function check_day(uuid, text, text, int) from public, anon, authenticated;
revoke all on function stop_of_day(uuid, int) from public, anon, authenticated;

-- Planning and adding go through the same check. Bodies as before (v1),
-- plus the one check_day line each.
create or replace function place_idea(p_idea uuid, p_day integer, p_time time, p_dur integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r ideas%rowtype; x ideas%rowtype; who text;
  s int; e int; xs int; xe int; warn text := null;
begin
  select * into r from ideas where id = p_idea;
  if not found then raise exception 'That idea is gone.'; end if;
  if not is_member(r.trip_id) then raise exception 'You are not in this trip.'; end if;
  if r.status = 'removed' then raise exception 'It is in the archive. Restore it first.'; end if;
  if r.status = 'approved' and r.booked and (r.day <> p_day or r.start_time is distinct from p_time) then
    raise exception 'This is booked. Cancel the booking first, then move it.';
  end if;
  perform check_day(r.trip_id, r.kind, r.stop, coalesce(p_day, 0));

  if coalesce(p_day, 0) > 0 and p_time is not null then
    s := extract(hour from p_time)::int * 60 + extract(minute from p_time)::int;
    e := s + coalesce(p_dur, 60);
    for x in
      select * from ideas
      where trip_id = r.trip_id and id <> p_idea and status = 'approved'
        and day = p_day and start_time is not null
    loop
      xs := extract(hour from x.start_time)::int * 60 + extract(minute from x.start_time)::int;
      xe := xs + x.duration_min;
      if s = xs or (s < xe and xs < e) then
        raise exception 'Clashes with "%" at %. Move one of them.', x.title, to_char(x.start_time, 'HH24:MI');
      end if;
      if warn is null then
        if s >= xe and s - xe < 30 then
          warn := 'Only ' || (s - xe) || ' min after "' || x.title || '". Tight, but allowed.';
        elsif xs >= e and xs - e < 30 then
          warn := 'Only ' || (xs - e) || ' min before "' || x.title || '". Tight, but allowed.';
        end if;
      end if;
    end loop;
  end if;

  update ideas
    set status = 'approved', day = coalesce(p_day, 0), start_time = p_time,
        duration_min = coalesce(p_dur, 60), updated_at = now()
    where id = p_idea;

  select display_name into who from trip_members where trip_id = r.trip_id and user_id = auth.uid();
  perform log_activity(r.trip_id, coalesce(who, 'Someone') || ' placed "' || r.title || '"'
    || case when coalesce(p_day, 0) > 0 then ' on Day ' || p_day else ' (unscheduled)' end);
  return jsonb_build_object('warn', warn);
end $$;

create or replace function add_idea(p_trip uuid, p_kind text, p_title text, p_stop text, p_link text, p_note text,
  p_scene text, p_day integer, p_time time, p_dur integer, p_ref text, p_preset boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare dupe uuid; new_id uuid; who text; kind text := coalesce(p_kind, 'idea');
begin
  if not is_member(p_trip) then raise exception 'You are not in this trip.'; end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Give it a title.'; end if;
  if not valid_link(p_link) then
    raise exception 'We can''t read that link. Use a Google Maps, Instagram, TikTok or airline link.';
  end if;
  if coalesce(p_preset, false) and not is_owner(p_trip) then raise exception 'Only the owner can pre-set slots.'; end if;
  if coalesce(p_preset, false) and coalesce(p_day, 0) < 1 then raise exception 'Pick a day for the slot.'; end if;
  perform check_day(p_trip, kind, p_stop, coalesce(p_day, 0));

  if coalesce(p_link, '') <> '' and not coalesce(p_preset, false) then
    select id into dupe from ideas
      where trip_id = p_trip and status <> 'removed' and norm_link(link) = norm_link(p_link)
      limit 1;
    if dupe is not null then
      insert into votes (idea_id, user_id) values (dupe, auth.uid()) on conflict do nothing;
      if length(trim(coalesce(p_note, ''))) > 0 then
        insert into comments (idea_id, user_id, body) values (dupe, auth.uid(), trim(p_note));
      end if;
      return jsonb_build_object('id', dupe, 'merged', true);
    end if;
  end if;

  insert into ideas (trip_id, kind, title, stop, link, note, scene, created_by, day, booked, booking_ref)
    values (p_trip, kind, trim(p_title), p_stop, coalesce(p_link, ''), coalesce(p_note, ''),
            coalesce(p_scene, 'walk'), auth.uid(), coalesce(p_day, 0), kind = 'travel', coalesce(p_ref, ''))
    returning id into new_id;
  insert into votes (idea_id, user_id) values (new_id, auth.uid());

  select display_name into who from trip_members where trip_id = p_trip and user_id = auth.uid();
  perform log_activity(p_trip, coalesce(who, 'Someone') || ' suggested "' || trim(p_title) || '"');

  if coalesce(p_preset, false) then
    perform place_idea(new_id, p_day, p_time, p_dur);
  end if;
  return jsonb_build_object('id', new_id, 'merged', false);
end $$;
