-- Walkies v4: a photo on an idea, uploaded by whoever added it.
-- ALREADY APPLIED to the Lao-holiday project. Kept as the record, and for a
-- fresh database. The `drop policy` lines are only needed on a re-run.

alter table ideas add column if not exists photo_path text not null default '';

-- Photos live in their own bucket. Public to read, so the app can show them
-- without a signed URL; 5 MB and images only, so nobody can park a file here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('idea-photos', 'idea-photos', true, 5242880,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists idea_photos_read on storage.objects;
create policy idea_photos_read on storage.objects for select
  using (bucket_id = 'idea-photos');

drop policy if exists idea_photos_write on storage.objects;
create policy idea_photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'idea-photos');

drop policy if exists idea_photos_replace on storage.objects;
create policy idea_photos_replace on storage.objects for update to authenticated
  using (bucket_id = 'idea-photos' and owner = auth.uid());

drop policy if exists idea_photos_delete on storage.objects;
create policy idea_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'idea-photos' and owner = auth.uid());

-- Same rule as editing: your own idea, or anyone's if you run the trip.
create or replace function set_idea_photo(p_idea uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare r ideas%rowtype; who text;
begin
  select * into r from ideas where id = p_idea;
  if not found then raise exception 'That idea is gone.'; end if;
  if r.created_by <> auth.uid() and not can_manage(r.trip_id) then
    raise exception 'You can only add a photo to your own suggestions.';
  end if;
  update ideas set photo_path = coalesce(p_path, ''), updated_at = now() where id = p_idea;
  select display_name into who from trip_members where trip_id = r.trip_id and user_id = auth.uid();
  perform log_activity(r.trip_id, coalesce(who, 'Someone')
    || (case when coalesce(p_path, '') = '' then ' removed the photo on "' else ' added a photo to "' end)
    || r.title || '"');
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function log_activity(uuid, text) from authenticated, anon, public;

-- Share links arrive on all sorts of subdomains (vt.tiktok.com, vm.tiktok.com,
-- google.com.au/maps). Accept any subdomain on the hosts we know.
create or replace function valid_link(u text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(u, '') = ''
      or u ~* '^https?://([a-z0-9-]+\.)*(tiktok\.com|instagram\.com|instagr\.am|jal\.co\.jp|ana\.co\.jp|vietjetair\.com|vietnamairlines\.com)(/|$)'
      or u ~* '^https?://(maps\.app\.goo\.gl|goo\.gl/maps|([a-z0-9-]+\.)*google\.[a-z.]{2,6}/maps|maps\.google\.[a-z.]{2,6})';
$$;
