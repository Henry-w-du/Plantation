'use strict';

const CACHE_NAME = 'plantation-v2.3.0';
const CACHE_PREFIX = 'plantation-v';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/js/storage.js',
  './assets/js/schedule.js',
  './assets/js/calendar.js',
  './assets/js/backup.js',
  './assets/js/ui.js',
  './assets/js/app.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-192.png',
  './assets/icons/maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './sample/Plantation-朋友学期计划.json'
];

const absolute = (relativePath) => new URL(relativePath, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL.map(absolute))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestURL = new URL(event.request.url);
  const scopeURL = new URL(self.registration.scope);
  if (requestURL.origin !== scopeURL.origin || !requestURL.pathname.startsWith(scopeURL.pathname)) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(caches.match(absolute('./index.html')).then((cached) => cached || fetch(event.request)));
    return;
  }

  const shellURLs = new Set(APP_SHELL.map(absolute));
  const cleanURL = new URL(event.request.url);
  cleanURL.search = '';
  cleanURL.hash = '';
  if (!shellURLs.has(cleanURL.href)) return;
  event.respondWith(caches.match(cleanURL.href).then((cached) => cached || fetch(event.request)));
});
