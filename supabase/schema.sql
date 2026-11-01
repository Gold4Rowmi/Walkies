-- Walkies: tables, row-level security, and the trip rules.
-- Paste this whole file into Supabase > SQL Editor and run it once.
-- Rules that matter (clashes, booking lock, admin, join approval) live here,
-- so they hold even if someone edits the web page.

-- ---------- Tables ----------

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  invite_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists trip_members (
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  is_admin boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  kicked_at timestamptz,
  primary key (trip_id, user_id)
);

create table if not exists join_requests (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  unique (trip_id, user_id)
);

create table if not exists ideas (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  kind text not null default 'idea' check (kind in ('idea', 'travel')),
  title text not null,
  stop text not null,
  link text not null default '',
  note text not null default '',
  scene text not null default 'walk',
  created_by uuid not null references auth.users(id),
  status text not null default 'suggested' check (status in ('suggested', 'approved', 'removed')),
  day int not null default 0,
  start_time time,
  duration_min int not null default 60,
  booked boolean not null default false,
  booking_ref text not null default '',
  archive_reason text not null default '',
  prev_status text,
  prev_day int,
  prev_start time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists votes (
  idea_id uuid not null references ideas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists activity (
  id bigint generated always as identity primary key,
  trip_id uuid not null references trips(id) on delete cascade,
  msg text not null,
  created_at timestamptz not null default now()
);

create table if not exists hidden_suggestions (
  trip_id uuid not null references trips(id) on delete cascade,
  stop text not null,
  title text not null,
  primary key (trip_id, stop, title)
);

-- Nearby ideas are filled once per stop (cheap, not live AI calls). Edit freely.
create table if not exists nearby_suggestions (
  stop text not null,
  title text not null,
  kind text not null,
  scene text not null default 'walk',
  primary key (stop, title)
);

insert into nearby_suggestions (stop, title, kind, scene) values
  ('Tokyo', 'Tsukiji outer market breakfast', 'food', 'bowl'),
  ('Tokyo', 'Asakusa rickshaw ride', 'transport', 'walk'),
  ('Kyoto', 'Kinkaku-ji golden pavilion', 'see', 'temple'),
  ('Kyoto', 'Bus to Arashiyama', 'transport', 'walk'),
  ('Kawaguchiko', 'Hoto noodles for lunch', 'food', 'bowl'),
  ('Hoi An', 'Bike ride to An Bang beach', 'transport', 'beach'),
  ('Hoi An', 'Banh mi stall near the bridge', 'food', 'bowl'),
  ('Ha Long', 'Overnight junk cruise', 'see', 'beach')
on conflict do nothing;

-- ---------- Helpers ----------

create or replace function is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trip_members m
    where m.trip_id = t and m.user_id = auth.uid()
      and m.left_at is null and m.kicked_at is null
  );
$$;

create or replace function is_owner(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trips x where x.id = t and x.owner_id = auth.uid());
$$;

-- Owner or secret admin.
create or replace function can_manage(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_owner(t) or exists (
    select 1 from trip_members m
    where m.trip_id = t and m.user_id = auth.uid() and m.is_admin
      and m.left_at is null and m.kicked_at is null
  );
$$;

create or replace function log_activity(t uuid, msg text) returns void
language sql security definer set search_path = public as $$
  insert into activity (trip_id, msg) values (t, msg);
$$;

create or replace function norm_link(u text) returns text
language sql immutable as $$
  select lower(regexp_replace(regexp_replace(coalesce(u, ''), '^https?://(www\.)?', ''), '[?#].*$|/$', '', 'g'));
$$;

create or replace function valid_link(u text) returns boolean
language sql immutable as $$
  select coalesce(u, '') = ''
      or u ~* '^https?://(www\.)?(google\.com/maps|maps\.app\.goo\.gl|goo\.gl/maps|instagram\.com|tiktok\.com|jal\.co\.jp|ana\.co\.jp|vietjetair\.com|vietnamairlines\.com)';
$$;

-- ---------- Trip actions ----------

create or replace function create_trip(p_name text, p_display text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Name the trip first.'; end if;
  insert into trips (name, owner_id) values (trim(p_name), auth.uid()) returning id into t;
  insert into trip_members (trip_id, user_id, display_name) values (t, auth.uid(), p_display);
  perform log_activity(t, p_display || ' created the trip');
  return t;
end $$;

-- Anyone with the one invite link can ask. The owner or an admin lets them in.
create or replace function request_join(p_token text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare tr trips%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into tr from trips where invite_token = p_token and deleted_at is null;
  if not found then raise exception 'This invite link is not valid any more.'; end if;
  if is_member(tr.id) then return tr.id; end if;
  insert into join_requests (trip_id, user_id, display_name, status)
    values (tr.id, auth.uid(), p_name, 'pending')
    on conflict (trip_id, user_id)
    do update set status = 'pending', display_name = excluded.display_name, created_at = now();
  return tr.id;
end $$;

create or replace function decide_join(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r join_requests%rowtype;
begin
  select * into r from join_requests where id = p_request;
  if not found then raise exception 'That request is gone.'; end if;
  if not can_manage(r.trip_id) then raise exception 'Only the owner or an admin can let people in.'; end if;
  if p_approve then
    update join_requests set status = 'approved' where id = p_request;
    insert into trip_members (trip_id, user_id, display_name) values (r.trip_id, r.user_id, r.display_name)
      on conflict (trip_id, user_id)
      do update set left_at = null, kicked_at = null, display_name = excluded.display_name;
    perform log_activity(r.trip_id, r.display_name || ' joined (approved)');
  else
    update join_requests set status = 'declined' where id = p_request;
  end if;
end $$;

create or replace function leave_trip(p_trip uuid) returns void
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if is_owner(p_trip) then raise exception 'The owner cannot leave. Delete the trip instead.'; end if;
  select display_name into who from trip_members where trip_id = p_trip and user_id = auth.uid();
  update trip_members set left_at = now() where trip_id = p_trip and user_id = auth.uid() and left_at is null;
  perform log_activity(p_trip, coalesce(who, 'Someone') || ' left the trip');
end $$;

create or replace function kick_member(p_trip uuid, p_user uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if not can_manage(p_trip) then raise exception 'Admin only.'; end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Give a reason before you kick someone.'; end if;
  if p_user = (select owner_id from trips where id = p_trip) then raise exception 'You cannot kick the owner.'; end if;
  select display_name into who from trip_members where trip_id = p_trip and user_id = p_user;
  update trip_members set kicked_at = now() where trip_id = p_trip and user_id = p_user;
  perform log_activity(p_trip, 'Admin kicked ' || coalesce(who, 'a member') || ' (' || trim(p_reason) || '). Their ideas stay as former member.');
end $$;

create or replace function delete_trip(p_trip uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner(p_trip) then raise exception 'Only the owner can delete the trip.'; end if;
  update trips set deleted_at = now() where id = p_trip;
end $$;

-- ---------- Ideas ----------

-- Adds an idea. A matching link merges into the existing idea as a vote (and note).
-- Pre-set slots are owner-only and go straight onto the plan.
create or replace function add_idea(
  p_trip uuid, p_kind text, p_title text, p_stop text, p_link text, p_note text,
  p_scene text, p_day int, p_time time, p_dur int, p_ref text, p_preset boolean
) returns jsonb
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

-- Plans an idea onto a day and time. Warns on tight gaps, blocks clashes,
-- and never moves a booked item until the booking is cancelled.
create or replace function place_idea(p_idea uuid, p_day int, p_time time, p_dur int) returns jsonb
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

-- Booking locks an item in. Cancelling needs a reason, and the log keeps it.
create or replace function set_booking(p_idea uuid, p_booked boolean, p_ref text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r ideas%rowtype; who text;
begin
  select * into r from ideas where id = p_idea;
  if not found then raise exception 'That idea is gone.'; end if;
  if not is_member(r.trip_id) then raise exception 'You are not in this trip.'; end if;
  select display_name into who from trip_members where trip_id = r.trip_id and user_id = auth.uid();
  if p_booked then
    if r.status <> 'approved' then raise exception 'Plan it onto a day first.'; end if;
    update ideas set booked = true, booking_ref = coalesce(nullif(trim(coalesce(p_ref, '')), ''), booking_ref), updated_at = now()
      where id = p_idea;
    perform log_activity(r.trip_id, coalesce(who, 'Someone') || ' marked "' || r.title || '" booked');
  else
    if length(trim(coalesce(p_reason, ''))) = 0 then
      raise exception 'Give a reason before cancelling the booking. It goes in the log.';
    end if;
    update ideas set booked = false, updated_at = now() where id = p_idea;
    perform log_activity(r.trip_id, coalesce(who, 'Someone') || ' cancelled the booking for "' || r.title || '" (' || trim(p_reason) || ')');
  end if;
end $$;

-- Remove your own idea, or (owner or admin) anyone's. Goes to the archive, never gone.
create or replace function remove_idea(p_idea uuid, p_reason text, p_cancel_confirmed boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r ideas%rowtype; who text; actor text;
begin
  select * into r from ideas where id = p_idea;
  if not found then raise exception 'That idea is gone.'; end if;
  if r.created_by <> auth.uid() and not can_manage(r.trip_id) then
    raise exception 'You can only remove your own suggestions.';
  end if;
  if r.status = 'removed' then raise exception 'Already in the archive.'; end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Give a reason. It goes in the log.'; end if;
  if r.booked and not coalesce(p_cancel_confirmed, false) then
    raise exception 'This is booked. Tick that the real booking is cancelled first.';
  end if;

  update ideas
    set prev_status = r.status, prev_day = r.day, prev_start = r.start_time,
        status = 'removed', day = 0, start_time = null, booked = false,
        archive_reason = trim(p_reason), updated_at = now()
    where id = p_idea;

  select display_name into who from trip_members where trip_id = r.trip_id and user_id = auth.uid();
  actor := case when r.created_by = auth.uid() then coalesce(who, 'Someone') else 'Admin' end;
  perform log_activity(r.trip_id, actor || ' removed "' || r.title || '" (' || trim(p_reason) || ')'
    || case when r.booked then ' [booking cancelled]' else '' end);
end $$;

-- Back to its old spot. If that spot is taken now, it goes to the pool.
create or replace function restore_idea(p_idea uuid) returns text
language plpgsql security definer set search_path = public as $$
declare r ideas%rowtype; taken boolean; who text;
begin
  select * into r from ideas where id = p_idea;
  if not found then raise exception 'That idea is gone.'; end if;
  if not is_member(r.trip_id) then raise exception 'You are not in this trip.'; end if;
  if r.status <> 'removed' then raise exception 'It is not in the archive.'; end if;
  select display_name into who from trip_members where trip_id = r.trip_id and user_id = auth.uid();

  taken := r.prev_status = 'approved' and r.prev_start is not null and exists (
    select 1 from ideas
    where trip_id = r.trip_id and id <> p_idea and status = 'approved'
      and day = r.prev_day and start_time = r.prev_start
  );

  if taken then
    update ideas set status = 'suggested', day = 0, start_time = null, archive_reason = '', updated_at = now()
      where id = p_idea;
    perform log_activity(r.trip_id, coalesce(who, 'Someone') || ' restored "' || r.title || '" to the pool (spot taken)');
    return 'Its spot is taken. Restored to the pool.';
  end if;

  update ideas
    set status = coalesce(r.prev_status, 'suggested'), day = coalesce(r.prev_day, 0),
        start_time = r.prev_start, archive_reason = '', updated_at = now()
    where id = p_idea;
  perform log_activity(r.trip_id, coalesce(who, 'Someone') || ' restored "' || r.title || '"');
  return 'Restored.';
end $$;

-- ---------- Row-level security ----------
-- Writes go through the functions above, so the table policies only allow reads,
-- plus the few direct writes that are safe (your own vote, your own comment, hiding a nearby idea).

alter table trips enable row level security;
alter table trip_members enable row level security;
alter table join_requests enable row level security;
alter table ideas enable row level security;
alter table votes enable row level security;
alter table comments enable row level security;
alter table activity enable row level security;
alter table hidden_suggestions enable row level security;
alter table nearby_suggestions enable row level security;

create policy trips_read on trips for select using (deleted_at is null and is_member(id));

create policy members_read on trip_members for select using (is_member(trip_id));

create policy requests_read on join_requests for select using (can_manage(trip_id));

create policy ideas_read on ideas for select using (is_member(trip_id));

create policy votes_read on votes for select using (
  exists (select 1 from ideas i where i.id = votes.idea_id and is_member(i.trip_id))
);
create policy votes_add on votes for insert with check (
  user_id = auth.uid()
  and exists (select 1 from ideas i where i.id = idea_id and i.status <> 'removed' and is_member(i.trip_id))
);
create policy votes_remove on votes for delete using (user_id = auth.uid());

create policy comments_read on comments for select using (
  exists (select 1 from ideas i where i.id = comments.idea_id and is_member(i.trip_id))
);
create policy comments_add on comments for insert with check (
  user_id = auth.uid()
  and exists (select 1 from ideas i where i.id = idea_id and is_member(i.trip_id))
);
create policy comments_delete on comments for delete using (
  user_id = auth.uid()
  or exists (select 1 from ideas i where i.id = comments.idea_id and can_manage(i.trip_id))
);

create policy activity_read on activity for select using (is_member(trip_id));

create policy hidden_read on hidden_suggestions for select using (is_member(trip_id));
create policy hidden_add on hidden_suggestions for insert with check (is_member(trip_id));

create policy nearby_read on nearby_suggestions for select using (auth.uid() is not null);

-- Only signed-in users can run the functions; nobody anonymous.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

-- ---------- Secret admin ----------
-- To make someone the secret admin (only you), run this once, with their Google account
-- already signed in to the app. Replace the email. Nothing in the app grants admin.
--
--   update trip_members set is_admin = true
--   where user_id = (select id from auth.users where email = 'their@gmail.com')
--     and trip_id = (select id from trips where deleted_at is null order by created_at limit 1);
