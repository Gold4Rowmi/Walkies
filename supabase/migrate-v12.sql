-- v12 (ALREADY APPLIED 2026-11-03): where each idea is, for its pin on the map.
-- The app fills it from the idea's Google Maps link, or Wikipedia near the
-- stop; a lookup only fills an empty spot, and a new link or stop clears it.
alter table ideas add column if not exists lat double precision, add column if not exists lng double precision;

create or replace function set_place(p_idea uuid, p_lat double precision, p_lng double precision) returns void
language plpgsql security definer set search_path = public as $$
declare r ideas%rowtype;
begin
  select * into r from ideas where id = p_idea;
  if not found then return; end if;
  if not is_member(r.trip_id) then raise exception 'You are not in this trip.'; end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then raise exception 'That is not a place on the map.'; end if;
  update ideas set lat = p_lat, lng = p_lng where id = p_idea and lat is null;
end $$;
revoke all on function set_place(uuid, double precision, double precision) from public, anon;
grant execute on function set_place(uuid, double precision, double precision) to authenticated;

create or replace function ideas_link_moves_pin() returns trigger language plpgsql set search_path = public as $$
begin
  if new.link is distinct from old.link or new.stop is distinct from old.stop then new.lat := null; new.lng := null; end if;
  return new;
end $$;
drop trigger if exists ideas_link_moves_pin on ideas;
create trigger ideas_link_moves_pin before update of link, stop on ideas for each row execute function ideas_link_moves_pin();
