# Walkies

Family-only trip planner. A phone-first web app (install it to the iPhone home screen), with Supabase for the database and Google sign-in.

## What's in this folder

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app. Plain JavaScript, no build step. |
| `config.js` | Your Supabase URL and anon key. The only file you edit. |
| `supabase/schema.sql` | Tables, the trip rules (clash, booking lock, archive, join approval, secret admin) and row-level security. |
| `sw.js`, `manifest.webmanifest`, `icon.svg`, `apple-touch-icon.png` | Home-screen install and offline shell. |

## One-time setup (about 20 minutes)

### 1. Create the Supabase project
1. Go to supabase.com, sign in, **New project**. Pick the free plan and any region near you.
2. When it's ready, open **SQL Editor**, paste all of `supabase/schema.sql`, and **Run**. It should finish with "Success".
3. Open **Project Settings → API**. Copy the **Project URL** and the **anon / publishable key**.
4. Paste both into `config.js`.

### 2. Google sign-in
1. In Google Cloud Console, create a project, then **APIs & Services → OAuth consent screen**. Choose External, add your own Gmail as a test user.
2. **Credentials → Create credentials → OAuth client ID → Web application**.
3. Under **Authorized redirect URIs**, add: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback` (copy the exact URL from Supabase, see below).
4. Copy the **Client ID** and **Client secret**.
5. In Supabase, open **Authentication → Providers → Google**, turn it on, paste both values, **Save**.

### 3. Tell Supabase where the app lives
In Supabase, **Authentication → URL Configuration**:
- **Site URL**: the address where you host the app (step 4).
- **Redirect URLs**: add the same address. For local testing, also add `http://localhost:8080`.

### 4. Host it (free)
Cloudflare Pages: **Workers & Pages → Create → Pages → Upload assets**, drag in the whole `Walkies` folder. You get a `*.pages.dev` address. Use that as the Site URL in step 3.

Netlify Drop (app.netlify.com/drop) also works: drag the folder in.

### 5. Put it on your iPhone
1. Open the hosted address in **Safari** (not Chrome; iPhone home-screen install needs Safari).
2. Tap **Share → Add to Home Screen**. Open it from the home screen.
3. Sign in with Google. The owner (you) creates the trip.

Web push notifications are not in this build. They need iOS 16.4+ with the home-screen install, and can be added later for free.

## Inviting people

Open **Trip** (top right). The one **invite link** is there, for as long as the trip lasts. Share it with family. When someone opens it and signs in, they appear in the **Join queue**. Approve or decline. Nobody gets in without approval, so forwarded links can't bring in outsiders.

## Secret admin

Admin is not in the app's menus. It's a flag in the database. Make someone admin once, from **SQL Editor** (replace the email):

```sql
update trip_members set is_admin = true
where user_id = (select id from auth.users where email = 'their@gmail.com')
  and trip_id = (select id from trips where deleted_at is null order by created_at limit 1);
```

Then, in the app, tap the Rommel dog five times quickly. Admin tools appear: kick a member (reason required), and remove anyone's idea (reason required, goes to the archive). The database checks these rights itself, so tapping the dog gives no extra power.

## How the rules work (all enforced in `schema.sql`, not just the page)

- **Clash**: same start time or overlap on the same day is blocked. A gap under 30 minutes gives a warning and is allowed.
- **Booking**: "Mark booked" locks an item to its time. Moving it needs "Booking cancelled" with a reason first.
- **Remove**: your own suggestions can be removed by you. Removing needs a reason and goes to the archive. Booked items also need you to tick "the real booking is cancelled". Restore puts it back at its old spot, or into the pool if that spot is taken.
- **Merge**: an idea with a link already in the pool becomes a vote (and your note goes in as a comment).
- **Links**: only Google Maps, Instagram, TikTok and airline links are accepted.
- **Pre-set slots**: only the owner can pre-set, which puts an item straight on the plan. Anyone can take a suggested slot.
- **Leave**: members can leave. Their ideas stay, marked "former member". The owner deletes the trip instead.

## Known gaps in this build

- The **trip layout is fixed** to this trip: Tokyo, Kyoto, Kawaguchiko, Hoi An, Ha Long, 18 days. Other trips need that set up in `app.js` (the `STOPS` table).
- **Nearby ideas** are a fixed list in the database (`nearby_suggestions`), not live AI. Edit or add rows in the SQL Editor. Filling them once with a cheap AI call can come later.
- **No offline writes.** The app shell opens offline, but adding or voting needs a connection.
- **Live mode, timeline and the map view** from the mockup are not built yet.
- **Not yet tested against a live Supabase project.** Run through the flow once with two Google accounts before the trip.
