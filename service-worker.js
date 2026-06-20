// Service Worker — caché offline para Red de Vida
const CACHE = 'red-de-vida-v6';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/config.js',
  './js/cloud.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estrategia:
// - API de Supabase: SIEMPRE red (nunca cachear datos dinámicos).
// - Resto (app shell, CDN): cache-first para funcionar offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // No cachear nunca las llamadas a Supabase (datos en vivo + auth)
  if (url.hostname.endsWith('supabase.co')) {
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      return (
        cached ||
        fetch(e.request)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
            return res;
          })
          .catch(() => cached)
      );
    })
  );
});
