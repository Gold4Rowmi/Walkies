-- Walkies rule tests. Paste into SQL Editor and Run.
-- Everything happens inside a transaction that rolls back, so the live trip is untouched.
-- Expected output: one row saying "all rule tests passed".

begin;

do $$
declare
  owner_id uuid := gen_random_uuid();
  mate_id  uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  trip uuid; a uuid; b uuid; c uuid; req uuid; msg text; r jsonb;
  failed text := '';

begin
  -- Stand-in accounts. Rolled back with everything else.
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.invalid', now(), now()),
         (mate_id,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mate@test.invalid',  now(), now()),
         (outsider, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'out@test.invalid',   now(), now());

  perform set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true);
  trip := create_trip('Test trip', 'Owner');

  -- 1. A link we cannot read is refused.
  begin
    perform add_idea(trip,'idea','Bad link','Tokyo','https://example.com/x','', 'walk',0,null,60,'',false);
    failed := failed || E'\n1 bad link was accepted';
  exception when others then null;
  end;

  -- 2. A good idea goes in, and the person who added it has voted for it.
  r := add_idea(trip,'idea','Senso-ji','Tokyo','https://maps.app.goo.gl/senso','Early','temple',0,null,60,'',false);
  a := (r->>'id')::uuid;
  if not exists (select 1 from votes where idea_id = a and user_id = owner_id) then
    failed := failed || E'\n2 adding an idea did not record a vote';
  end if;

  -- 3. The same link again merges instead of making a second idea.
  r := add_idea(trip,'idea','Senso-ji again','Tokyo','https://maps.app.goo.gl/senso/','Same place','temple',0,null,60,'',false);
  if (r->>'merged') <> 'true' then failed := failed || E'\n3 duplicate link did not merge'; end if;
  if (select count(*) from ideas where trip_id = trip) <> 1 then
    failed := failed || E'\n3 duplicate link created a second idea';
  end if;

  -- 4. Planning it onto a day and time works.
  perform place_idea(a, 1, '09:00', 60);
  if (select status from ideas where id = a) <> 'approved' then failed := failed || E'\n4 place did not approve'; end if;

  -- 5. Same start time on the same day is blocked.
  r := add_idea(trip,'idea','Clasher','Tokyo','https://maps.app.goo.gl/clash','','walk',0,null,60,'',false);
  b := (r->>'id')::uuid;
  begin
    perform place_idea(b, 1, '09:00', 60);
    failed := failed || E'\n5 same start time was allowed';
  exception when others then null;
  end;

  -- 6. An overlap is blocked too.
  begin
    perform place_idea(b, 1, '09:30', 60);
    failed := failed || E'\n6 overlap was allowed';
  exception when others then null;
  end;

  -- 7. A gap under 30 minutes is allowed, with a warning.
  r := place_idea(b, 1, '10:15', 60);
  if r->>'warn' is null then failed := failed || E'\n7 tight gap gave no warning'; end if;
  if (select day from ideas where id = b) <> 1 then failed := failed || E'\n7 tight gap was not saved'; end if;

  -- 8. A clear gap gives no warning.
  r := add_idea(trip,'idea','Later','Tokyo','https://maps.app.goo.gl/later','','walk',0,null,60,'',false);
  c := (r->>'id')::uuid;
  r := place_idea(c, 1, '14:00', 60);
  if r->>'warn' is not null then failed := failed || E'\n8 a clear gap warned anyway'; end if;

  -- 9. Booking locks it in place.
  perform set_booking(a, true, 'REF-1', '');
  begin
    perform place_idea(a, 2, '09:00', 60);
    failed := failed || E'\n9 a booked item was moved';
  exception when others then null;
  end;

  -- 10. Cancelling a booking needs a reason.
  begin
    perform set_booking(a, false, '', '   ');
    failed := failed || E'\n10 booking was cancelled with no reason';
  exception when others then null;
  end;

  -- 11. Removing a booked item needs the real booking confirmed cancelled.
  begin
    perform remove_idea(a, 'changed our minds', false);
    failed := failed || E'\n11 booked item removed without confirming';
  exception when others then null;
  end;

  -- 12. Removing needs a reason.
  begin
    perform remove_idea(c, '  ', false);
    failed := failed || E'\n12 removed with no reason';
  exception when others then null;
  end;

  -- 13. Remove, then restore to the same spot.
  perform remove_idea(c, 'too far', false);
  if (select status from ideas where id = c) <> 'removed' then failed := failed || E'\n13 remove did not archive'; end if;
  perform restore_idea(c);
  if (select status from ideas where id = c) <> 'approved' or (select start_time from ideas where id = c) <> '14:00' then
    failed := failed || E'\n13 restore did not return it to its spot';
  end if;

  -- 14. If the old spot is taken, it comes back to the pool instead.
  perform remove_idea(c, 'again', false);
  perform place_idea(b, 1, '14:00', 30);
  msg := restore_idea(c);
  if (select status from ideas where id = c) <> 'suggested' or (select day from ideas where id = c) <> 0 then
    failed := failed || E'\n14 taken spot did not send it to the pool';
  end if;

  -- 15. Someone who is not in the trip cannot add to it.
  perform set_config('request.jwt.claims', json_build_object('sub', outsider)::text, true);
  begin
    perform add_idea(trip,'idea','Sneaky','Tokyo','https://maps.app.goo.gl/sneak','','walk',0,null,60,'',false);
    failed := failed || E'\n15 an outsider added an idea';
  exception when others then null;
  end;

  -- 16. The invite link only asks; it does not join.
  perform request_join((select invite_token from trips where id = trip), 'Outsider');
  if is_member(trip) then failed := failed || E'\n16 the invite link let someone straight in'; end if;

  -- 17. Only the owner or an admin decides.
  perform set_config('request.jwt.claims', json_build_object('sub', mate_id)::text, true);
  perform request_join((select invite_token from trips where id = trip), 'Mate');
  select id into req from join_requests where trip_id = trip and user_id = outsider;
  begin
    perform decide_join(req, true);
    failed := failed || E'\n17 a non-member approved a join request';
  exception when others then null;
  end;

  -- 18. The owner approves, and then they are in.
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true);
  perform decide_join((select id from join_requests where trip_id = trip and user_id = mate_id), true);
  perform set_config('request.jwt.claims', json_build_object('sub', mate_id)::text, true);
  if not is_member(trip) then failed := failed || E'\n18 approval did not add the member'; end if;

  -- 19. Only the owner pre-sets slots.
  begin
    perform add_idea(trip,'idea','Preset','Tokyo','https://maps.app.goo.gl/pre','','walk',3,'08:00',60,'',true);
    failed := failed || E'\n19 a member pre-set a slot';
  exception when others then null;
  end;

  -- 20. You can only remove your own suggestions.
  begin
    perform remove_idea(b, 'not mine', false);
    failed := failed || E'\n20 a member removed someone else''s idea';
  exception when others then null;
  end;

  -- 21. Editing follows the same rule, and the owner can edit anything.
  begin
    perform update_idea(b, 'Hijacked', 'Tokyo', 'https://maps.app.goo.gl/clash', '');
    failed := failed || E'\n21 a member edited someone else''s idea';
  exception when others then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true);
  perform update_idea(b, 'Renamed', 'Kyoto', 'https://maps.app.goo.gl/clash', 'new note');
  if (select title from ideas where id = b) <> 'Renamed' then failed := failed || E'\n21 the owner could not edit'; end if;

  -- 22. Kicking needs a reason, and the owner cannot be kicked.
  begin
    perform kick_member(trip, mate_id, '');
    failed := failed || E'\n22 kicked with no reason';
  exception when others then null;
  end;
  begin
    perform kick_member(trip, owner_id, 'because');
    failed := failed || E'\n22 the owner was kicked';
  exception when others then null;
  end;

  -- 23. Leaving keeps the person's ideas, and the owner cannot leave.
  begin
    perform leave_trip(trip);
    failed := failed || E'\n23 the owner left the trip';
  exception when others then null;
  end;

  -- 25. A day belongs to one stop: a Tokyo idea can't be hoped for, or planned, on a Kyoto day.
  --     (No plan set, so the sample plan applies: Tokyo days 1-4, Kyoto 5-7.)
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true);
  r := add_idea(trip,'idea','Tokyo idea','Tokyo','','','walk',0,null,60,'',false);
  req := (r->>'id')::uuid;
  perform set_maybe_day(req, 3);   -- its own stop's day: fine
  if (select day from ideas where id = req) <> 3 then failed := failed || E'\n25 maybe day on its own stop failed'; end if;
  begin
    perform set_maybe_day(req, 5);
    failed := failed || E'\n25 maybe day on another stop was allowed';
  exception when others then null;
  end;
  begin
    perform place_idea(req, 6, null, 60);
    failed := failed || E'\n25 planned onto another stop''s day';
  exception when others then null;
  end;
  begin
    perform add_idea(trip,'idea','Wrong day','Kyoto','','','walk',2,null,60,'',false);
    failed := failed || E'\n25 added onto another stop''s day';
  exception when others then null;
  end;

  -- 26. Roles: only the owner makes admins or hands the trip over; the old owner stays an admin.
  perform set_config('request.jwt.claims', json_build_object('sub', mate_id)::text, true);
  begin
    perform set_admin(trip, mate_id, true);
    failed := failed || E'\n26 a member made themselves admin';
  exception when others then null;
  end;
  begin
    perform transfer_owner(trip, mate_id);
    failed := failed || E'\n26 a member took the trip';
  exception when others then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true);
  perform set_admin(trip, mate_id, true);
  if not (select is_admin from trip_members where trip_id = trip and user_id = mate_id) then failed := failed || E'\n26 owner could not make an admin'; end if;
  perform set_admin(trip, mate_id, false);
  perform transfer_owner(trip, mate_id);
  if (select owner_id from trips where id = trip) <> mate_id then failed := failed || E'\n26 handover did not move the trip'; end if;
  if not (select is_admin from trip_members where trip_id = trip and user_id = owner_id) then failed := failed || E'\n26 old owner lost admin'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', mate_id)::text, true);
  perform transfer_owner(trip, owner_id);   -- hand it back so test 24 runs as written

  -- 27. Categories: a guess only fills an empty one; choosing one by hand follows the edit rule.
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true);
  perform set_admin(trip, mate_id, false);   -- handing the trip back in 26 left Mate an admin
  perform set_category(b, 'food', true);
  if (select category from ideas where id = b) <> 'food' then failed := failed || E'\n27 a guess did not fill an empty category'; end if;
  perform set_category(b, 'sights', true);
  if (select category from ideas where id = b) <> 'food' then failed := failed || E'\n27 a guess replaced a category'; end if;
  perform set_category(b, 'nature', false);
  if (select category from ideas where id = b) <> 'nature' then failed := failed || E'\n27 the owner could not choose one'; end if;
  begin
    perform set_category(b, 'castles', false);
    failed := failed || E'\n27 a made-up category was accepted';
  exception when others then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', mate_id)::text, true);
  begin
    perform set_category(b, 'beach', false);
    failed := failed || E'\n27 a member changed someone else''s category';
  exception when others then null;
  end;

  -- 24. Only the owner deletes the trip.
  perform set_config('request.jwt.claims', json_build_object('sub', mate_id)::text, true);
  begin
    perform delete_trip(trip);
    failed := failed || E'\n24 a member deleted the trip';
  exception when others then null;
  end;

  if failed <> '' then
    raise exception 'RULE TESTS FAILED:%', failed;
  end if;
end $$;

-- 28. Ideas follow their stop when the plan changes; Back to ideas.
do $$
declare
  owner_id uuid := gen_random_uuid(); trip uuid; a uuid; b uuid; c uuid; d uuid; r jsonb; failed text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'o13@test.invalid', now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true);
  trip := create_trip('Test trip', 'Owner');
  perform set_trip_plan(trip, '2027-04-12', '[{"name":"Tokyo","days":4,"lat":35.68,"lng":139.65},{"name":"Kyoto","days":3,"lat":35.01,"lng":135.77},{"name":"Osaka","days":2,"lat":34.69,"lng":135.50}]');
  r := add_idea(trip,'idea','USJ','Kyoto','','','walk',0,null,60,'',false); a := (r->>'id')::uuid;
  update ideas set lat = 34.665, lng = 135.432 where id = a;
  perform place_idea(a, 6, '10:00', 60);                      -- Kyoto's 2nd day
  r := add_idea(trip,'idea','Tokyo thing','Tokyo','','','walk',0,null,60,'',false); b := (r->>'id')::uuid;
  perform place_idea(b, 2, '09:00', 60);                      -- Tokyo's 2nd day
  r := add_idea(trip,'idea','Kyoto no pin','Kyoto','','','walk',5,null,60,'',false); c := (r->>'id')::uuid;   -- maybe Day 5
  r := add_idea(trip,'idea','Osaka thing','Osaka','','','walk',0,null,60,'',false); d := (r->>'id')::uuid;
  perform place_idea(d, 8, null, 60);                         -- Osaka's 1st day

  -- remove Kyoto
  perform set_trip_plan(trip, '2027-04-12', '[{"name":"Tokyo","days":4,"lat":35.68,"lng":139.65},{"name":"Osaka","days":2,"lat":34.69,"lng":135.50}]');
  if (select stop || ':' || day from ideas where id = a) <> 'Osaka:6' then failed := failed || ' usj=' || (select stop || ':' || day from ideas where id = a); end if;
  if (select stop || ':' || day from ideas where id = b) <> 'Tokyo:2' then failed := failed || ' tokyo=' || (select stop || ':' || day from ideas where id = b); end if;
  if (select stop || ':' || day from ideas where id = c) <> 'Kyoto:0' then failed := failed || ' nopin=' || (select stop || ':' || day from ideas where id = c); end if;
  if (select stop || ':' || day from ideas where id = d) <> 'Osaka:5' then failed := failed || ' osaka=' || (select stop || ':' || day from ideas where id = d); end if;
  if (select status from ideas where id = a) <> 'approved' then failed := failed || ' usj-unplanned'; end if;

  -- swap the order: Osaka first
  perform set_trip_plan(trip, '2027-04-12', '[{"name":"Osaka","days":2,"lat":34.69,"lng":135.50},{"name":"Tokyo","days":4,"lat":35.68,"lng":139.65}]');
  if (select day from ideas where id = b) <> 4 then failed := failed || ' swap-tokyo=' || (select day from ideas where id = b); end if;
  if (select day from ideas where id = d) <> 1 then failed := failed || ' swap-osaka=' || (select day from ideas where id = d); end if;
  -- shrink Tokyo to 1 day: its 2nd-day plan comes off the day but stays planned
  perform set_trip_plan(trip, '2027-04-12', '[{"name":"Osaka","days":2,"lat":34.69,"lng":135.50},{"name":"Tokyo","days":1,"lat":35.68,"lng":139.65}]');
  if (select status || ':' || day from ideas where id = b) <> 'approved:0' then failed := failed || ' shrink=' || (select status || ':' || day from ideas where id = b); end if;

  -- back to ideas
  perform unplan_idea(d);
  if (select status || ':' || day from ideas where id = d) <> 'suggested:0' then failed := failed || ' unplan'; end if;
  perform set_booking(a, true, 'R1', '');
  begin perform unplan_idea(a); failed := failed || ' booked-unplanned'; exception when others then null; end;

  if failed <> '' then raise exception 'FAILED:%', failed; end if;
end $$;

select 'all rule tests passed' as result;

rollback;
