-- v10 (ALREADY APPLIED 2026-11-02): the morning brief.
-- brief_log remembers which trip days have had their brief, so each goes out
-- once however often the function is called. Only the function (with the
-- service role) touches it, so RLS is on with no policies.
create table if not exists brief_log (
  trip_id uuid not null references trips(id) on delete cascade,
  day int not null,
  sent_at timestamptz not null default now(),
  primary key (trip_id, day)
);
alter table brief_log enable row level security;

-- Once an hour, at five past, ask the brief function to send whatever is due.
-- The public anon key is enough: the function only ever sends what's due, once.
create extension if not exists pg_cron;
select cron.schedule('walkies-morning-brief', '5 * * * *', $$
  select net.http_post(
    url := 'https://dialionwiwgjyiiuldtg.supabase.co/functions/v1/brief',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpYWxpb253aXdnanlpaXVsZHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1MjYxMzYsImV4cCI6MjEwOTEwMjEzNn0.lrXuyinCptflJI3U5IoxqxdDOoXr-4rHwGWOuxkgScw"}'::jsonb,
    body := '{}'::jsonb)
$$);
