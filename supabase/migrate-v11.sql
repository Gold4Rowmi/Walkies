-- v11: categories. Each idea gets one (food, sights, theme park...), shown as
-- a colour and an icon so a day's mix reads at a glance.
-- The app guesses it from the title and Wikipedia's one-line description; a
-- guess only fills an empty category, and choosing one by hand follows the
-- same rule as editing (your own idea, or an admin).
alter table ideas add column if not exists category text
  check (category in ('food','sights','themepark','nature','beach','shopping','nightlife','activity','travel'));

create or replace function set_category(p_idea uuid, p_cat text, p_auto boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r ideas%rowtype;
begin
  select * into r from ideas where id = p_idea;
  if not found then raise exception 'That idea is gone.'; end if;
  if not is_member(r.trip_id) then raise exception 'You are not in this trip.'; end if;
  if p_cat is not null and p_cat not in ('food','sights','themepark','nature','beach','shopping','nightlife','activity','travel') then
    raise exception 'Pick a category from the list.';
  end if;
  if p_auto then
    -- No activity line: the app guessed, a person did not do anything.
    update ideas set category = p_cat where id = p_idea and category is null;
    return;
  end if;
  if r.created_by <> auth.uid() and not can_manage(r.trip_id) then
    raise exception 'You can only change your own suggestions.';
  end if;
  update ideas set category = p_cat where id = p_idea;
end $$;
revoke all on function set_category(uuid, text, boolean) from public, anon;
grant execute on function set_category(uuid, text, boolean) to authenticated;
