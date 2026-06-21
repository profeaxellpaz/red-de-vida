// Service Worker "kill switch" — se autodestruye.
// Antes la app cacheaba archivos para offline, pero eso causaba que el
// navegador se quedara con versiones viejas. Como la app necesita internet
// (datos en la nube), eliminamos la caché por completo: este SW borra todo,
// se desregistra y recarga la página para cargar siempre el código fresco.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => c.navigate(c.url));
    } catch (e) { /* nada */ }
  })());
});

// Mientras exista, no interferir: todo va directo a la red.
self.addEventListener('fetch', () => {});
