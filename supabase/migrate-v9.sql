-- v9 (ALREADY APPLIED 2026-11-02): roles. The owner can make members admins,
-- take that back, and hand the trip to someone else. Handing it over keeps
-- the old owner on as an admin, so nobody is locked out of their own trip.

create or replace function set_admin(p_trip uuid, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if not is_owner(p_trip) then raise exception 'Only the owner can change who is an admin.'; end if;
  if p_user = (select owner_id from trips where id = p_trip) then raise exception 'The owner already runs the trip.'; end if;
  select display_name into who from trip_members
    where trip_id = p_trip and user_id = p_user and left_at is null and kicked_at is null;
  if who is null then raise exception 'They are not in the trip any more.'; end if;
  update trip_members set is_admin = coalesce(p_on, false) where trip_id = p_trip and user_id = p_user;
  perform log_activity(p_trip, who || case when p_on then ' is now an admin' else ' is no longer an admin' end);
end $$;

create or replace function transfer_owner(p_trip uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare who text; was uuid;
begin
  if not is_owner(p_trip) then raise exception 'Only the owner can hand the trip over.'; end if;
  select display_name into who from trip_members
    where trip_id = p_trip and user_id = p_user and left_at is null and kicked_at is null;
  if who is null then raise exception 'They are not in the trip any more.'; end if;
  was := auth.uid();
  if p_user = was then return; end if;
  update trips set owner_id = p_user where id = p_trip;
  update trip_members set is_admin = true where trip_id = p_trip and user_id = was;
  update trip_members set is_admin = false where trip_id = p_trip and user_id = p_user;
  perform log_activity(p_trip, who || ' now owns the trip');
end $$;

revoke all on function set_admin(uuid, uuid, boolean) from public, anon;
grant execute on function set_admin(uuid, uuid, boolean) to authenticated;
revoke all on function transfer_owner(uuid, uuid) from public, anon;
grant execute on function transfer_owner(uuid, uuid) to authenticated;
