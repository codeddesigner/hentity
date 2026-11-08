/* Hentity service worker: makes the site installable and keeps recently opened pages working offline.
   build.py stamps VERSION with a hash of the build, so every deploy installs a fresh worker and drops old caches. */
const VERSION = '36bec93e4145';
const SHELL = 'shell-' + VERSION, PAGES = 'pages-' + VERSION, ASSETS = 'assets-' + VERSION, CDN = 'cdn-v1';
const OFFLINE = '/offline.html';
const PRECACHE = [OFFLINE, '/favicon.svg?v=3', '/icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [SHELL, PAGES, ASSETS, CDN];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
    await self.clients.claim();
  })());
});

// Keep caches small: drop the oldest entries past a limit
async function trim(name, max) {
  const c = await caches.open(name), keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

// Pages: always try the network first so people see this week's board; fall back to the last copy, then the offline page
async function page(e) {
  const req = e.request;
  try {
    const res = (await e.preloadResponse) || await fetch(req);
    if (res.ok && res.type === 'basic' && !/no-store/.test(res.headers.get('Cache-Control') || '')) {
      const copy = res.clone();
      e.waitUntil(caches.open(PAGES).then(c => c.put(req, copy)).then(() => trim(PAGES, 40)));
    }
    return res;
  } catch (err) {
    return (await caches.match(req, { cacheName: PAGES })) || (await caches.match(req, { cacheName: PAGES, ignoreSearch: true })) || caches.match(OFFLINE);
  }
}

// Versioned files (/assets/x.js?v=hash, icons, the pinned supabase build): the URL changes when the file does, so cache first
async function cacheFirst(e, name, max) {
  const hit = await caches.match(e.request, { cacheName: name });
  if (hit) return hit;
  const res = await fetch(e.request);
  if (res.ok || res.type === 'opaque') { const copy = res.clone(); e.waitUntil(caches.open(name).then(c => c.put(e.request, copy)).then(() => trim(name, max))); }
  return res;
}

// Font stylesheet: serve the cached copy and refresh it in the background
async function staleWhileRevalidate(e, name) {
  const c = await caches.open(name), hit = await c.match(e.request);
  const net = fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => hit);
  if (hit) { e.waitUntil(net); return hit; }
  return net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // Never touch server functions, auth callbacks, analytics or link redirects
    if (/^\/(api|v1|go|_vercel|auth|badges|sitemap)/.test(url.pathname) || url.pathname === '/sw.js') return;
    if (req.mode === 'navigate') { e.respondWith(page(e)); return; }
    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || /\.(svg|png|ico|woff2?)$/.test(url.pathname)) { e.respondWith(cacheFirst(e, ASSETS, 120)); return; }
    return;
  }
  if (url.hostname === 'fonts.gstatic.com' || (url.hostname === 'cdn.jsdelivr.net' && /@\d/.test(url.pathname))) { e.respondWith(cacheFirst(e, CDN, 30)); return; }
  if (url.hostname === 'fonts.googleapis.com') { e.respondWith(staleWhileRevalidate(e, CDN)); return; }
  // Everything else (Supabase data, storage, other sites) goes straight to the network
});

// Lets a page ask a waiting worker to take over right away
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

// ---------------------------------------------------------------- push notifications
// /api/push sends { title, body, url, tag, badge, icon }, encrypted for this device
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (er) { d = { title: 'Hentity', body: e.data ? e.data.text() : '' }; }
  const jobs = [self.registration.showNotification(d.title || 'Hentity', {
    body: d.body || '', icon: d.icon || '/icons/icon-192.png', badge: '/icons/badge-96.png',
    tag: d.tag || undefined, renotify: !!d.tag, timestamp: Date.now(), data: { url: d.url || '/notifications' } })];
  if (d.badge != null && self.navigator && self.navigator.setAppBadge) jobs.push((d.badge ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge()).catch(() => {}));
  e.waitUntil(Promise.all(jobs));
});
// Tapping a notification opens its page, reusing an open Hentity window when there is one
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/notifications', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const w = list.find(c => c.url.startsWith(self.location.origin));
    if (w) return w.focus().then(c => (c && c.navigate ? c.navigate(url) : null)).catch(() => self.clients.openWindow(url));
    return self.clients.openWindow(url);
  }));
});
