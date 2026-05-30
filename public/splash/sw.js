'use strict';

const CACHE_NAME = 'pool-calculator-shell-v1-6-6';
const APP_SHELL = [
  './',
  './index.htm',
  './help.htm',
  './appendices.htm',
  './manifest.webmanifest',
  './icons/pool-icon-192.svg',
  './icons/pool-icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key !== CACHE_NAME)
      .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const acceptHeader = event.request.headers.get('accept') || '';
  const isHtmlRequest =
    event.request.mode === 'navigate' ||
    event.request.destination === 'document' ||
    acceptHeader.includes('text/html');
  const isVersionRequest = url.pathname.endsWith('/splash/version.json');

  if (isHtmlRequest || isVersionRequest) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          if (!response || !response.ok) return response;
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
          );
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || !response.ok) {
          return response;
        }
        const copy = response.clone();
        event.waitUntil(
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy))
        );
        return response;
      });
    })
  );
});
