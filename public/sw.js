/**
 * Service worker de SetSnap:
 * - Guarda la app (HTML/CSS/JS) para que abra rápido y sin conexión.
 * - Recibe "Compartir → SetSnap" (Web Share Target) desde WhatsApp, Fotos, etc.
 * Nunca intercepta llamadas a /api ni a Spotify/Google.
 */
const VERSION = 'setsnap-v5';
const SHARE_CACHE = 'setsnap-share';
const SHELL = [
    '/',
    '/css/tailwind.css',
    '/js/app.js',
    '/js/parser.js',
    '/js/scoring.js',
    '/js/search.js',
    '/js/spotify.js',
    '/js/guest.js',
    '/js/i18n.js',
    '/js/ocr.js',
    '/js/share.js',
    '/manifest.json',
    '/icons/icon.svg',
    '/icons/icon-192.png',
];

self.addEventListener('install', (event) => {
    // No se activa solo: la app muestra "Hay una versión nueva" y el usuario decide.
    event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== SHARE_CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

async function handleShare(request) {
    try {
        const form = await request.formData();
        const cache = await caches.open(SHARE_CACHE);
        const text = ['title', 'text', 'url'].map((k) => form.get(k)).filter((v) => typeof v === 'string' && v.trim()).join('\n');
        if (text) await cache.put('/shared-text', new Response(text));
        const image = form.getAll('image').find((f) => f && typeof f === 'object' && f.size > 0);
        if (image) await cache.put('/shared-image', new Response(image, { headers: { 'Content-Type': image.type || 'image/jpeg' } }));
    } catch (err) {
        console.warn('share target', err);
    }
    return Response.redirect('/?shared=1', 303);
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.method === 'POST' && url.pathname === '/share-target') {
        event.respondWith(handleShare(request));
        return;
    }
    if (request.method !== 'GET' || url.pathname.startsWith('/api/')) return;

    // Red primero (para recibir actualizaciones), caché si no hay conexión.
    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response.ok && SHELL.includes(url.pathname)) {
                    const copy = response.clone();
                    caches.open(VERSION).then((cache) => cache.put(request, copy));
                }
                return response;
            })
            .catch(async () => (await caches.match(request)) || (request.mode === 'navigate' ? caches.match('/') : Response.error()))
    );
});
