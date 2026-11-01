// Walkies push sender. Supabase calls this when a row lands in `activity`,
// and it pushes that line to everyone on the trip who turned notifications on.
// Deploy:  supabase functions deploy notify --no-verify-jwt
// Secrets: VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT, SERVICE_ROLE_KEY, PROJECT_URL
import webpush from 'https://esm.sh/web-push@3.6.7';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const db = createClient(Deno.env.get('PROJECT_URL')!, Deno.env.get('SERVICE_ROLE_KEY')!);

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:nobody@example.com',
  Deno.env.get('VAPID_PUBLIC')!,
  Deno.env.get('VAPID_PRIVATE')!
);

Deno.serve(async (req) => {
  const payload = await req.json().catch(() => null);
  const row = payload?.record;
  if (!row?.trip_id || !row?.msg) return new Response('ignored', { status: 200 });

  const { data: subs, error } = await db
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth')
    .eq('trip_id', row.trip_id);
  if (error) return new Response(error.message, { status: 500 });

  const body = JSON.stringify({ body: row.msg });
  const gone: string[] = [];

  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body
      );
    } catch (e) {
      // 404 and 410 mean the browser dropped it; anything else we leave alone.
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) gone.push(s.endpoint);
    }
  }));

  if (gone.length) await db.from('push_subscriptions').delete().in('endpoint', gone);
  return new Response(JSON.stringify({ sent: (subs ?? []).length - gone.length }), {
    headers: { 'content-type': 'application/json' }
  });
});
