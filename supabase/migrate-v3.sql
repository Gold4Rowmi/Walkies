-- Walkies v3: two findings from the Supabase security advisor.
-- Run once in SQL Editor. Safe to run twice.

-- 1. Pin the search path on the two pure helpers, so nothing can be
--    shadowed out from under them.
create or replace function norm_link(u text) returns text
language sql immutable set search_path = public as $$
  select lower(regexp_replace(regexp_replace(coalesce(u, ''), '^https?://(www\.)?', ''), '[?#].*$|/$', '', 'g'));
$$;

create or replace function valid_link(u text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(u, '') = ''
      or u ~* '^https?://(www\.)?(google\.com/maps|maps\.app\.goo\.gl|goo\.gl/maps|instagram\.com|tiktok\.com|jal\.co\.jp|ana\.co\.jp|vietjetair\.com|vietnamairlines\.com)';
$$;

-- 2. log_activity writes the trip log and checks nothing, because the
--    functions that call it have already checked. Signed-in users were able
--    to call it straight from the API and forge entries in any trip.
--    The calling functions are SECURITY DEFINER, so they still reach it.
--    is_member, is_owner and can_manage keep EXECUTE: the row-level
--    policies call them as the signed-in user, and lose access without it.
revoke execute on function log_activity(uuid, text) from authenticated, anon, public;
