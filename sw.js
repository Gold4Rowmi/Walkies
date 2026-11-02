// Walkies service worker: keeps the app openable with no signal, and shows push notifications.
// The app's own files: network first, so the family sees the latest when there's signal.
// The Supabase library and fonts: kept and refreshed in the background.
// Photos: kept once seen, so cards and the big picture show offline.
const CACHE = 'walkies-v26';
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'cities.js', 'places.js', 'manifest.webmanifest', 'icon.svg', 'apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL).then(() => c.add(new Request(SUPABASE_JS, { mode: 'no-cors' })).catch(() => {})))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'walkies-photos').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const LIBS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const isPhoto = (u) => u.pathname.includes('/storage/v1/object/public/');

self.addEventListener('fetch', (event) => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET') return;

  if (url.origin === self.location.origin) {
    event.respondWith(
      // no-cache: always ask the server (cheap, it answers 304 when nothing changed), so a release shows on the next open
      fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }))
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
    );
    return;
  }

  if (LIBS.includes(url.hostname)) {
    event.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => {
      const live = fetch(req).then((res) => { c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || live;
    })));
    return;
  }

  // Photos keep their own cache across releases, so a new version doesn't throw them away
  if (isPhoto(url)) {
    event.respondWith(caches.open('walkies-photos').then((c) => c.match(req).then((hit) =>
      hit || fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; })
    )));
  }
});

self.addEventListener('push', (event) => {
  let title = 'Walkies', body = 'Something changed in the trip.';
  try { if (event.data) { const d = event.data.json(); body = d.body || body; title = d.title || title; } }
  catch (e) { if (event.data) body = event.data.text(); }
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: 'apple-touch-icon.png',
    badge: 'apple-touch-icon.png',
    tag: 'walkies-activity'
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return clients.openWindow('./');
  }));
});
