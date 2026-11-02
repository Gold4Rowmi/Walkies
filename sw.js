// Walkies service worker: keeps the app shell openable, and shows push notifications.
// Network first, so the family always sees the live plan when they have signal.
const CACHE = 'walkies-v13';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'cities.js', 'places.js', 'manifest.webmanifest', 'icon.svg', 'apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match('index.html')))
  );
});

self.addEventListener('push', (event) => {
  let body = 'Something changed in the trip.';
  try { if (event.data) body = event.data.json().body || body; } catch (e) { if (event.data) body = event.data.text(); }
  event.waitUntil(self.registration.showNotification('Walkies', {
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
