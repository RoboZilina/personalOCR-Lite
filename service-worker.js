// === VERSION — Update CACHE_NAME on every release ===
// This is the ONLY version string in the project.
// Serve this file with Cache-Control: no-cache in production.
const CACHE_NAME = 'vn-ocr-cache-v3.1.1-GOLD-CF';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './settings.js',
    './manifest.json',
    './js/paddle/paddle_core.js',
    './js/paddle/paddle_engine.js',
    './js/onnx/ort.min.js'
];
const MODEL_CACHE_NAME = 'vn-ocr-models-v1';

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
            Promise.all(keys
                .filter(k => k !== CACHE_NAME && k !== MODEL_CACHE_NAME)
                .map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. CDN / GitHub Releases: network-only
    if (url.origin !== location.origin) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 3. ONNX Runtime files (small scripts/wasms) - Cache-First
    if (url.pathname.includes('/js/onnx/')) {
        event.respondWith(
            caches.open(MODEL_CACHE_NAME).then(cache =>
                cache.match(event.request).then(cached => {
                    if (cached) return cached;
                    return fetch(event.request).then(response => {
                        if (response.ok) cache.put(event.request, response.clone()).catch(() => {});
                        return response;
                    });
                })
            )
        );
        return;
    }

    // 4. Local assets: stale-while-revalidate (excludes massive models)
    if (url.pathname.endsWith('.onnx') || url.pathname.endsWith('.traineddata')) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        caches.open(CACHE_NAME).then(cache =>
            cache.match(event.request).then(cached => {
                const fetched = fetch(event.request).then(response => {
                    if (response.ok) {
                        cache.put(event.request, response.clone()).catch(() => {});
                    }
                    return response;
                }).catch(() => cached);
                
                return cached || fetched || new Response('Offline', { status: 503 });
            })
        )
    );
});
