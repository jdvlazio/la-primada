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

const CACHE_VERSION = '20260605-164438-be1e7b7';
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

// Activate: borrar TODOS los cachés viejos y reclamar. NO navega/recarga los clientes.
// ⚠️ ANTES hacía clients.navigate(c.url) en cada activate para "desatascar" devices, pero eso RECARGABA
// la página EN PLENO ARRANQUE (evidencia: trazado de red con `GET / net::ERR_ABORTED` + un segundo boot) →
// DOBLE BOOTEO → botones muertos al primer ingreso tras un deploy (en iOS peor: a veces no completa la
// auto-recarga y hay que reabrir). Se quitó: la actualización ya está garantizada SIN recargar de más por
// (1) fetch network-first con no-store → SIEMPRE baja código fresco; (2) el chequeo de version.json
// (index.html) → recarga si el build corriendo es viejo; (3) controllerchange (no-iOS). El navigate era
// redundante con eso y el causante del doble boot.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('primadapp-') && k !== CACHE_NAME).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Fetch: NETWORK-FIRST. Para HTML y código (documento / scripts), se pide SIEMPRE con
// cache:'no-store' → así el HTTP cache del navegador (WKWebView en iOS) no devuelve una copia
// vieja: el código propaga en cada deploy igual que el HTML. Los assets estáticos (íconos,
// manifest) van network-first normal (se cachean para offline). Fallback a caché si la red falla.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                 // solo GET (no POST a Supabase, etc.)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // no interceptar CDN/Supabase: que vayan directo a la red

  // version.json → SIEMPRE desde red (no-store), nunca cacheado: es el chequeo de versión.
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(new Request(req, { cache: 'no-store' })).catch(() => caches.match(req)));
    return;
  }

  // HTML (navegación) y scripts del propio origen → red dura, nunca HTTP cache.
  const esCodigo = req.destination === 'document' || req.destination === 'script' || req.mode === 'navigate';
  const pedido = esCodigo ? new Request(req, { cache: 'no-store' }) : req;

  event.respondWith(
    fetch(pedido)
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
