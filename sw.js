/* ============================================================
   Service Worker — La Primada (Primadapp)
   Estrategia: NETWORK-FIRST (red primero, caché de respaldo offline).
   ------------------------------------------------------------
   CACHE_VERSION se reemplaza automáticamente por el hash del commit
   en cada push (git hook pre-commit → scripts/stamp-sw.js). Así cada
   deploy invalida el caché viejo y el celular ve la versión nueva sin
   borrar caché a mano. El placeholder __CACHE_VERSION__ se usa cuando
   aún no se ha estampado (desarrollo local).
   ============================================================ */
'use strict';

const CACHE_VERSION = '20260601-162008-98c7980';
const CACHE_NAME = 'primadapp-' + CACHE_VERSION;

// Núcleo a precachear (todo servido por GitHub Pages, rutas relativas al scope).
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './js/config.js',
  './js/util.js',
  './js/api.js',
  './js/auth.js',
  './js/store.js',
  './js/view.js',
  './js/controller.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Install: precache del núcleo y activación inmediata del SW nuevo.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE).catch(() => {}))
  );
});

// Activate: borrar cachés de versiones viejas (otro CACHE_VERSION) y tomar control.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith('primadapp-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Fetch: NETWORK-FIRST. Intenta la red; si responde, refresca el caché y devuelve.
// Si la red falla (offline), sirve la copia cacheada; si es navegación, cae a index.html.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                 // solo GET (no POST a Supabase, etc.)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // no interceptar CDN/Supabase: que vayan directo a la red

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) =>
          hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)
        )
      )
  );
});
