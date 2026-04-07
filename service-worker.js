// === VERSION — Update CACHE_NAME on every release ===
// This is the ONLY version string in the project.
// Serve this file with Cache-Control: no-cache in production.
const CACHE_NAME = 'vn-ocr-cache-v1.1.0';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .catch(err => {
                // Self-destruct: prevent half-cached SW from serving broken content
                self.registration.unregister();
                throw err;
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // CDN requests: network-only (no caching — avoids freezing versions, conflicts with SRI)
    if (url.origin !== location.origin) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Local assets: stale-while-revalidate
    event.respondWith(
        caches.open(CACHE_NAME).then(cache =>
            cache.match(event.request).then(cached => {
                const fetched = fetch(event.request).then(response => {
                    if (response.ok) cache.put(event.request, response.clone());
                    return response;
                }).catch(() => cached); // Offline fallback to cache
                return cached || fetched;
            })
        )
    );
});
