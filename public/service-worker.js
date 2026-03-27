/**
 * LocalLedger Service Worker
 *
 * Caching strategy: Cache-first for assets, network-first for navigation.
 * User transaction data (IndexedDB) is NEVER cached here.
 */

const CACHE_NAME = 'localledger-v1';

// On install: cache the app shell (navigation fallback)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add('/')).then(() => self.skipWaiting())
  );
});

// On activate: delete old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

// On fetch: network first, fall back to cache
self.addEventListener('fetch', (event) => {
  // Only handle GET requests to our own origin
  if (
    event.request.method !== 'GET' ||
    !event.request.url.startsWith(self.location.origin)
  ) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      fetch(event.request)
        .then((response) => {
          // Cache successful responses for the app shell
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => {
          // Network unavailable: serve from cache
          return cache.match(event.request).then((cached) => {
            if (cached) return cached;
            // For navigation requests fall back to the cached root
            if (event.request.mode === 'navigate') {
              return cache.match('/');
            }
            return new Response('Offline', { status: 503 });
          });
        })
    )
  );
});
