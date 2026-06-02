/* ============================================================
   CONFIG — constantes y valores por defecto (esquema v4)
   Se carga PRIMERO. Expone window.CONFIG (browser) y module.exports (Node/tests).
   ============================================================ */
(function (root) {
  'use strict';

  const CONFIG = {
    storageKey: 'laPrimada',
    schemaVersion: 5,
    locale: 'es-CO',

    // Backend Supabase. URL + anon key son PÚBLICAS por diseño (van en el bundle, como las fuentes):
    // RLS es la frontera real de seguridad. NUNCA poner aquí la service_role key.
    // Sin SDK/credenciales utilizables, el adaptador (js/api.js) cae a modo 'local' (offline/tests).
    supabase: {
      url: 'https://iaxlefbmtgowtusghwkz.supabase.co',
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlheGxlZmJtdGdvd3R1c2dod2t6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyOTU2NDgsImV4cCI6MjA5NTg3MTY0OH0.grK-ZTUCTQbo9GMUo1o6U2y6FDODcpwtfjK_7tct95c',
    },

    // Interruptor del backend en la nube. FALSE (temporal) → la app NO inicializa Supabase:
    // corre 100% sobre localStorage (modo 'local' del adaptador), sin auth gate ni RLS, totalmente
    // usable en producción. Poner en TRUE cuando el admin esté sembrado y el auth magic link activo.
    // (No borra nada: enciende Supabase + login con solo cambiar este flag.)
    backendEnabled: false,

    // Cover "fijo": un único valor VIGENTE (editable hacia adelante). Sugerido SOLO para instalación nueva;
    // las primadas viejas conservan su propio snapshot y NO se reescriben.
    defaultCover: { ahorrador: 15000, invitado: 10000 },

    // Catálogo base de productos (dos precios). Se copia (snapshot) al crear una primada.
    // La rifa se modela como producto normal con costoNeto 0 (ganancia bruta); el premio de costo fijo
    // lo manejará el módulo de tesorería futuro (ver CLAUDE.md).
    defaultProducts: [
      { id: 'cerveza', nombre: 'Costeñita',       emoji: '🍺',  costoNeto: 2500, precioVenta: 3500, aportadoPor: null },
      { id: 'brownie', nombre: 'Brownie',         emoji: '🍫',  costoNeto: 6000, precioVenta: 9000, aportadoPor: null },
      { id: 'rollo',   nombre: 'Rollo de canela', emoji: '🌀',  costoNeto: 6000, precioVenta: 9000, aportadoPor: null },
      { id: 'rifa',    nombre: 'Boleta de rifa',  emoji: '🎟️', costoNeto: 0,    precioVenta: 5000, aportadoPor: null },
    ],
  };

  root.CONFIG = CONFIG;
  if (typeof module !== 'undefined' && module.exports) module.exports = { CONFIG };
})(typeof window !== 'undefined' ? window : globalThis);
