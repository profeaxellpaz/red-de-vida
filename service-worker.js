// Service Worker — caché offline para Red de Vida
const CACHE = 'red-de-vida-v8';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/vendor/supabase.js',
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
// - API de Supabase: SIEMPRE red (datos en vivo + auth, nunca cachear).
// - Código propio (mismo origen): network-first → siempre la última versión,
//   y si no hay internet, usa la copia guardada (offline).
// - CDN (librería Supabase): cache-first para que la app abra sin demora.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  if (url.hostname.endsWith('supabase.co')) {
    e.respondWith(fetch(e.request));
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cross-origin (CDN): cache-first
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached ||
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
    )
  );
});
