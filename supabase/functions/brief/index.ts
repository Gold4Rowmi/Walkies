// Walkies morning brief. Called once an hour (pg_cron, see migrate-v10.sql).
// For every trip, it finds the trip day whose stop has just reached 7am local
// time, and pushes that day to everyone on the trip who turned notifications
// on: "Day 3 · Kyoto. 3 plans, first Fushimi Inari at 09:00. Rain, 22° / 15°."
//
// Safe to call any number of times: brief_log records each trip day once, so
// a repeat call (or a stranger's) sends nothing new. That is why the hourly
// call can use the public anon key, and nobody has to paste the service key
// anywhere: this function reads Supabase's own built-in one.
//
// { test: true, trip_id }, sent by a signed-in member from Settings, sends
// that member alone a brief for today (or Day 1 before the trip starts).
//
// Secret needed: VAPID_PRIVATE (the pair of VAPID_PUBLIC in config.js).
import webpush from 'https://esm.sh/web-push@3.6.7';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const VAPID_PUBLIC = 'BPhZZusCDsdc-951elHkX1hGtZYksmwN0SlkSXUOtp51HC5SXKVYxfz3tyTNr3NOQdGja19rjWgHc1-gDUz0AwE';
const BRIEF_HOUR = 7;
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'content-type': 'application/json' } });

// The plan a trip falls back to with no stops set: the same as app.js.
const DEFAULT_START = '2027-04-12';
const DEFAULT_STOPS = [
  { name: 'Tokyo', days: 4, zone: 'Asia/Tokyo', lat: 35.6762, lng: 139.6503 },
  { name: 'Kyoto', days: 3, zone: 'Asia/Tokyo', lat: 35.0116, lng: 135.7681 },
  { name: 'Kawaguchiko', days: 2, zone: 'Asia/Tokyo', lat: 35.5104, lng: 138.7689 },
  { name: 'Hoi An', days: 5, zone: 'Asia/Ho_Chi_Minh', lat: 15.8801, lng: 108.3380 },
  { name: 'Ha Long', days: 4, zone: 'Asia/Ho_Chi_Minh', lat: 20.9101, lng: 107.1839 },
];
type Stop = { name: string; days: number; zone: string; lat?: number; lng?: number };

// Day n's date, its stop, from the trip's own plan (mirrors plan() in app.js)
function days(trip: { start_date: string | null; stops: Stop[] | null }) {
  const stops = trip.stops && trip.stops.length ? trip.stops : DEFAULT_STOPS;
  const start = new Date((trip.start_date || DEFAULT_START) + 'T00:00:00Z');
  const out: { n: number; date: string; stop: Stop }[] = [];
  let n = 1;
  for (const st of stops) {
    for (let i = 0; i < Math.max(1, Number(st.days) || 1); i++, n++) {
      const d = new Date(start); d.setUTCDate(d.getUTCDate() + n - 1);
      out.push({ n, date: d.toISOString().slice(0, 10), stop: st });
    }
  }
  return out;
}
function localNow(zone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

const WORD: Record<string, string> = { sun: 'Clear', part: 'Some cloud', cloud: 'Cloudy', fog: 'Fog', storm: 'Storms', snow: 'Snow', rain: 'Rain' };
function wx(code: number) {
  return code === 0 ? 'sun' : code <= 2 ? 'part' : code === 3 ? 'cloud' : code <= 48 ? 'fog'
    : code >= 95 ? 'storm' : (code >= 71 && code <= 77) || code === 85 || code === 86 ? 'snow' : 'rain';
}
async function weather(st: Stop, date: string) {
  if (st.lat == null || st.lng == null) return '';
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${st.lat}&longitude=${st.lng}&timezone=auto&start_date=${date}&end_date=${date}`
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
    const d = (await r.json()).daily;
    const rain = d.precipitation_probability_max[0];
    return ` ${WORD[wx(d.weather_code[0])]}, ${Math.round(d.temperature_2m_max[0])}° / ${Math.round(d.temperature_2m_min[0])}°`
      + (rain >= 30 ? `, rain ${rain}%.` : '.');
  } catch { return ''; }
}

async function briefFor(tripId: string, day: { n: number; date: string; stop: Stop }) {
  const { data: ideas } = await db.from('ideas').select('title,start_time,kind')
    .eq('trip_id', tripId).eq('status', 'approved').eq('day', day.n);
  const timed = (ideas ?? []).filter((i) => i.start_time).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
  const count = (ideas ?? []).length;
  const first = timed[0] ? ` First: ${timed[0].title} at ${String(timed[0].start_time).slice(0, 5)}.` : '';
  const plans = count ? `${count} ${count === 1 ? 'plan' : 'plans'}.${first}` : 'Nothing planned yet.';
  return { title: `Day ${day.n} · ${day.stop.name}`, body: plans + await weather(day.stop, day.date) };
}

async function push(subs: { endpoint: string; p256dh: string; auth: string }[], msg: { title: string; body: string }) {
  const gone: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg)); }
    catch (e) { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) gone.push(s.endpoint); }
  }));
  if (gone.length) await db.from('push_subscriptions').delete().in('endpoint', gone);
  return subs.length - gone.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const priv = Deno.env.get('VAPID_PRIVATE');
  if (!priv) return json({ error: 'Notifications are not set up yet: the VAPID_PRIVATE secret is missing.' }, 503);
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:walkies@rowmi.app', VAPID_PUBLIC, priv);
  const body = await req.json().catch(() => ({}));

  // A member asking for a test brief, to see what the mornings will look like
  if (body?.test) {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: who } = await db.auth.getUser(token);
    const uid = who?.user?.id;
    if (!uid) return json({ error: 'Sign in first.' }, 401);
    const { data: m } = await db.from('trip_members').select('user_id').eq('trip_id', body.trip_id).eq('user_id', uid)
      .is('left_at', null).is('kicked_at', null).maybeSingle();
    if (!m) return json({ error: 'You are not in this trip.' }, 403);
    const { data: trip } = await db.from('trips').select('id,start_date,stops').eq('id', body.trip_id).single();
    const all = days(trip!), today = all.find((d) => d.date === localNow(d.stop.zone).date) ?? all[0];
    const { data: subs } = await db.from('push_subscriptions').select('endpoint,p256dh,auth').eq('trip_id', body.trip_id).eq('user_id', uid);
    if (!subs?.length) return json({ error: 'Turn on notifications on this phone first.' }, 400);
    const sent = await push(subs, await briefFor(body.trip_id, today));
    return json({ sent });
  }

  // The hourly round: each trip day, once, at 7am where the family is that day
  const { data: trips } = await db.from('trips').select('id,start_date,stops');
  let sent = 0;
  for (const trip of trips ?? []) {
    const due = days(trip).find((d) => { const t = localNow(d.stop.zone); return t.date === d.date && t.hour === BRIEF_HOUR; });
    if (!due) continue;
    const { data: subs } = await db.from('push_subscriptions').select('endpoint,p256dh,auth').eq('trip_id', trip.id);
    if (!subs?.length) continue;
    const { data: fresh } = await db.from('brief_log').insert({ trip_id: trip.id, day: due.n }).select().maybeSingle();
    if (!fresh) continue;   // already sent this one
    sent += await push(subs, await briefFor(trip.id, due));
  }
  return json({ sent });
});
