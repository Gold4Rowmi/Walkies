-- Walkies v2: editing an idea, and push notification subscriptions.
-- Run this once in SQL Editor on a database that already has schema.sql.
-- Safe to run twice.

-- ---------- Edit an idea ----------
-- Your own idea, or any idea if you are the owner or an admin.
create or replace function update_idea(p_idea uuid, p_title text, p_stop text, p_link text, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare r ideas%rowtype; who text;
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
  if p_stop is null or not exists (select 1 from nearby_suggestions where stop = p_stop)
     and p_stop not in ('Tokyo','Kyoto','Kawaguchiko','Hoi An','Ha Long') then
    raise exception 'Pick a stop on the trip.';
  end if;

  update ideas
    set title = trim(p_title), stop = p_stop, link = coalesce(p_link, ''),
        note = coalesce(p_note, ''), updated_at = now()
    where id = p_idea;

  select display_name into who from trip_members where trip_id = r.trip_id and user_id = auth.uid();
  perform log_activity(r.trip_id, coalesce(who, 'Someone') || ' edited "' || trim(p_title) || '"');
end $$;

-- ---------- Push notifications ----------
-- One row per device per person. Deleted when the browser drops the subscription.
create table if not exists push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

drop policy if exists push_own on push_subscriptions;
create policy push_own on push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and is_member(trip_id));

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
