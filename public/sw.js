// Builder Guardian: lets the app open with no signal. Data is never cached here (it lives in the phone's database and syncs itself).
const CACHE = 'bg-shell-v2';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const res = await fetch('/index.html', { cache: 'reload' });
    const html = await res.clone().text();
    await cache.put('/index.html', res);
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1]);
    await Promise.all([...new Set([...assets, '/manifest.json', '/icon-192.png', '/icon-512.png', '/favicon.svg'])].map(u => cache.add(u).catch(() => undefined)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase and everything else: straight to the network
  if (req.mode === 'navigate') {
    // Always open the app shell; the router takes it from there. Try the network first so updates arrive.
    e.respondWith((async () => {
      try { const r = await fetch(req); if (r.ok && !/^\/portal\//.test(url.pathname)) { const c = await caches.open(CACHE); c.put('/index.html', r.clone()); } return r; }
      catch { return (await caches.match('/index.html')) || Response.error(); }
    })());
    return;
  }
  if (url.pathname.startsWith('/assets/') || /\.(png|svg|json|ico)$/.test(url.pathname)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE); const hit = await c.match(req); if (hit) return hit;
      try { const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; } catch { return Response.error(); }
    })());
  }
});
