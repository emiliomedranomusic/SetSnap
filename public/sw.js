const CACHE_NAME = 'setlist-v1';

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
    // Solo un service worker vacío para habilitar PWA y el botón de "Instalar"
    // Funciona como pass-through por ahora para las llamadas de la API locales y remotas
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
