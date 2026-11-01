# Walkies

A family trip planner. Phone first, installed to the iPhone home screen, with Supabase behind it and Google sign-in.

Live at **https://rowmi-walkies.netlify.app** · database: the `Lao-holiday` Supabase project.

## What's in here

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app. Plain JavaScript, no build step. |
| `config.js` | Supabase URL and key, the maps key, the push key, and the trip start date. |
| `sw.js` | Offline shell and push notifications. |
| `manifest.webmanifest`, `icon.svg`, `apple-touch-icon.png` | Home-screen install. |
| `supabase/schema.sql` | Everything, for a fresh database. |
| `supabase/migrate-v2.sql` | Just the v2 additions, for a database that already has v1. |
| `supabase/migrate-v3.sql` | The security advisor fixes, for a database that already has v2. |
| `supabase/tests.sql` | Checks every rule. Rolls back, so it never touches real data. |
| `supabase/functions/notify/` | Sends the push notifications. |

## Changing the trip

Two places, and nothing else:

- **Dates** — `TRIP_START` in `config.js`, as `YYYY-MM-DD`. Every day label is worked out from it.
- **Stops and days** — the `STOPS` table at the top of `app.js`: first day, last day, time zone, and the coordinates for the map pin. Change `NDAYS` to match the last day.

## The rules, and where they live

All of these are enforced in `supabase/schema.sql`, not just in the page, so nobody can get round them by editing the website.

- **Clash** — the same start time, or an overlap, on one day is blocked. A gap under 30 minutes is allowed with a warning.
- **Booking** — "Mark booked" pins it to its time. Moving it needs the booking cancelled first, with a reason.
- **Remove** — your own ideas, or anyone's if you are the owner or admin. Needs a reason, and goes to the archive rather than disappearing. A booked item also needs you to tick that the real booking is cancelled.
- **Restore** — back to its old spot, or into the pool if that spot has been taken.
- **Merge** — a link already in the pool becomes a vote on the existing idea, and your note becomes a comment.
- **Links** — Google Maps, Instagram, TikTok and the airlines only.
- **Pre-set slots** — owner only. Anyone can take a slot someone suggested.
- **Joining** — one permanent invite link, and the owner or admin approves each person.
- **Leaving** — ideas stay, marked "former member". The owner deletes the trip instead.

Run `supabase/tests.sql` in the SQL Editor after any schema change. It should print `all rule tests passed`.

## Releasing a change

1. Edit the files and commit to `main`.
2. Netlify builds from the repo and publishes within a minute.
3. **If `app.js`, `styles.css` or `index.html` changed, bump `CACHE` in `sw.js`** (`walkies-v2` → `walkies-v3`). Without that, phones keep the old version.
4. Open the site, check the version in About, and hard-reload once.
5. To undo: Netlify → Deploys → the previous deploy → **Publish deploy**.

Database changes are separate, and there is no automatic migration. Claude can apply them
straight to the project, with one catch: `drop` and `revoke` statements need a confirmation
that this setup cancels on its own, so a migration written with `create or replace`,
`add column if not exists` and `on conflict do update` goes through unattended, and one
that drops or revokes has to be pasted into the SQL Editor by hand.

## Notifications

Off until someone turns them on in **Trip → About → Turn on notifications**. iPhone only works once the app is on the home screen (iOS 16.4+).

The `notify` function is already deployed. Two things make it send:

1. **Secrets** — Supabase → Edge Functions → Secrets. Add `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT` (`mailto:` your email), `PROJECT_URL` and `SERVICE_ROLE_KEY` (the last two from Project Settings → API).
2. **Webhook** — Database → Webhooks → Create: table `activity`, event `Insert`, type Supabase Edge Functions, function `notify`. Set the `Authorization` header to `Bearer <your service role key>`.

The function keeps JWT verification on, so that header is what lets the webhook in and keeps everyone else out.

Until both are done the switch still works, but nothing is sent.

## Keeping it alive

- **The free plan pauses a project after about a week with no traffic.** Open the Supabase dashboard before the trip and check it is active.
- **There are no automatic backups on the free plan.** Before the trip, run `select * from ideas;` in the SQL Editor and download the CSV.
- Check Supabase → Advisors → Security now and then. Two warnings are expected and fine:
  the API functions (`add_idea`, `place_idea` and so on) are flagged as SECURITY DEFINER
  functions signed-in users can call — that is what they are for, and each checks membership
  itself. Leaked password protection is off because nobody has a password; sign-in is Google only.

## Secret admin

Admin is a flag in the database, never something the app can grant. Set it once per person:

```sql
update trip_members set is_admin = true
where user_id = (select id from auth.users where email = 'their@gmail.com')
  and trip_id = (select id from trips where deleted_at is null order by created_at limit 1);
```

Then tap Rommel five times quickly in the app. Admin tools appear: kick a member, and remove anyone's idea, both needing a reason. Tapping five times without the flag just gets you bubbles.

## Known limits

- **The map pins the five stops, not each idea.** Google share links don't carry coordinates, so pinning each idea would need the paid Geocoding API. Open an idea for its own link.
- **Nearby suggestions are a fixed list** in the `nearby_suggestions` table. Add rows in the SQL Editor.
- **No offline writes.** The app opens without signal, but adding and voting need a connection.
