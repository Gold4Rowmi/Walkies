-- v14 (ALREADY APPLIED 2026-11-08): Google Maps search links name the place in
-- their query (?api=1&query=Osaka+Castle, ?q=...). norm_link dropped every
-- query string, so all such links looked like one link and add_idea merged
-- different places into the first. Keep the query for Google Maps links;
-- every other link still ignores it (tracking junk like ?igsh= or ?g_st=).
create or replace function norm_link(u text) returns text language sql immutable set search_path = public as $$
  select lower(case
    when coalesce(u, '') ~* '^https?://((www|maps)\.)?google\.[a-z.]{2,6}/maps'
      then regexp_replace(regexp_replace(u, '^https?://(www\.)?', ''), '#.*$|/$', '', 'g')
    else regexp_replace(regexp_replace(coalesce(u, ''), '^https?://(www\.)?', ''), '[?#].*$|/$', '', 'g')
  end);
$$;
