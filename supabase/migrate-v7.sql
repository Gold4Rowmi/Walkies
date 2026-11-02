-- v7 (ALREADY APPLIED 2026-11-02): an idea's stop and day can't disagree.
-- update_idea checked stops against the five sample stops, so a trip with
-- its own plan (Osaka, say) could not move an idea there. It now checks the
-- trip's own stops, falling back to the samples when no plan is set.
-- Moving an idea to another stop clears its day and time, since that day
-- belongs to the old stop; a booked one has to be cancelled first.
create or replace function update_idea(p_idea uuid, p_title text, p_stop text, p_link text, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare r ideas%rowtype; who text; stops jsonb; moved boolean;
begin
  select * into r from ideas where id = p_idea;
  if not found then raise exception 'That idea is gone.'; end if;
  if r.created_by <> auth.uid() and not can_manage(r.trip_id) then
    raise exception 'You can only edit your own suggestions.';
  end if;
  if r.status = 'removed' then raise exception 'It is in the archive. Restore it first.'; end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Give it a title.'; end if;
  if not valid_link(p_link) then
    raise exception 'We can''t read that link. Use a Google Maps, Instagram, TikTok or airline link.';
  end if;
  select t.stops into stops from trips t where t.id = r.trip_id;
  if p_stop is null or not (
       (jsonb_array_length(coalesce(stops, '[]')) > 0
          and exists (select 1 from jsonb_array_elements(stops) s where s->>'name' = p_stop))
    or (jsonb_array_length(coalesce(stops, '[]')) = 0
          and p_stop in ('Tokyo','Kyoto','Kawaguchiko','Hoi An','Ha Long'))) then
    raise exception 'Pick a stop on the trip.';
  end if;
  moved := p_stop is distinct from r.stop and coalesce(r.day, 0) > 0;
  if moved and r.booked and r.kind <> 'travel' then
    raise exception 'This is booked for Day %. Cancel the booking first, then move it.', r.day;
  end if;

  update ideas
    set title = trim(p_title), stop = p_stop, link = coalesce(p_link, ''),
        note = coalesce(p_note, ''), updated_at = now(),
        day = case when moved then 0 else day end,
        start_time = case when moved then null else start_time end
    where id = p_idea;

  select display_name into who from trip_members where trip_id = r.trip_id and user_id = auth.uid();
  perform log_activity(r.trip_id, coalesce(who, 'Someone') || ' edited "' || trim(p_title) || '"');
end $$;
